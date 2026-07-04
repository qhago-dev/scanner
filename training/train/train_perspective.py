"""
Train Perspective Corner Detector.
Dataset: Synthetic barcodes with known corner positions.
License: MIT
"""

import argparse
import os

import torch
import torch.optim as optim
from torch.utils.data import DataLoader
from torch.cuda.amp import autocast, GradScaler

from data.synthetic_barcodes import PerspectiveDataset
from models.perspective_cnn import PerspectiveCornerDetector, CornerLoss


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    model = PerspectiveCornerDetector().to(device)
    print(
        f"Model parameters: {sum(p.numel() for p in model.parameters()) / 1e6:.2f}M"
    )

    train_dataset = PerspectiveDataset(
        num_samples=args.num_samples,
        image_size=(128, 128),
        augment=True,
    )
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=True,
    )

    val_dataset = PerspectiveDataset(
        num_samples=args.num_val,
        image_size=(128, 128),
        augment=False,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=True,
    )

    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs, eta_min=1e-6
    )
    criterion = CornerLoss(omega=10.0, epsilon=2.0)
    scaler = GradScaler() if args.amp else None

    best_loss = float("inf")
    os.makedirs(args.output_dir, exist_ok=True)

    for epoch in range(args.epochs):
        model.train()
        train_loss = 0.0

        for batch_idx, (images, corners) in enumerate(train_loader):
            images = images.to(device)
            corners = corners.to(device)

            optimizer.zero_grad()

            if args.amp and scaler is not None:
                with autocast():
                    pred = model(images)
                    loss = criterion(pred, corners)
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
            else:
                pred = model(images)
                loss = criterion(pred, corners)
                loss.backward()
                optimizer.step()

            train_loss += loss.item()

            if batch_idx % args.log_interval == 0:
                print(
                    f"Epoch {epoch:3d} [{batch_idx:4d}/{len(train_loader):4d}] "
                    f"Loss: {loss.item():.6f}"
                )

        scheduler.step()
        avg_train_loss = train_loss / len(train_loader)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for images, corners in val_loader:
                images = images.to(device)
                corners = corners.to(device)
                pred = model(images)
                loss = criterion(pred, corners)
                val_loss += loss.item()

        avg_val_loss = val_loss / len(val_loader)

        print(
            f"Epoch {epoch:3d} | Train Loss: {avg_train_loss:.6f} | "
            f"Val Loss: {avg_val_loss:.6f}"
        )

        if avg_val_loss < best_loss:
            best_loss = avg_val_loss
            torch.save(
                model.state_dict(),
                os.path.join(args.output_dir, "perspective_best.pth"),
            )

        if (epoch + 1) % args.save_interval == 0:
            torch.save(
                model.state_dict(),
                os.path.join(
                    args.output_dir, f"perspective_{epoch:04d}.pth"
                ),
            )

    model.load_state_dict(
        torch.load(
            os.path.join(args.output_dir, "perspective_best.pth"),
            map_location=device,
        )
    )

    onnx_path = os.path.join(args.output_dir, "perspective_corners.onnx")
    model.export_onnx(onnx_path)
    print(f"Exported ONNX to {onnx_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train Perspective Corner Detector"
    )
    parser.add_argument("--num-samples", type=int, default=60000)
    parser.add_argument("--num-val", type=int, default=5000)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--amp", action="store_true", default=True)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--log-interval", type=int, default=100)
    parser.add_argument("--save-interval", type=int, default=10)
    parser.add_argument(
        "--output-dir", type=str, default="./checkpoints/perspective"
    )
    args = parser.parse_args()
    train(args)

"""
Train Autofocus Classifier.
Dataset: Synthetic focused/blurred pairs of barcode images.
License: MIT
"""

import argparse
import os

import torch
import torch.optim as optim
from torch.utils.data import DataLoader

from data.synthetic_barcodes import AutoFocusDataset
from models.autofocus_classifier import AutoFocusClassifier


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    model = AutoFocusClassifier().to(device)
    print(
        f"Model parameters: {sum(p.numel() for p in model.parameters()) / 1e6:.2f}M"
    )

    train_dataset = AutoFocusDataset(
        num_samples=args.num_samples,
        image_size=(128, 128),
    )
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=True,
    )

    val_dataset = AutoFocusDataset(
        num_samples=args.num_val,
        image_size=(128, 128),
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
    criterion = torch.nn.BCELoss()

    best_acc = 0.0
    os.makedirs(args.output_dir, exist_ok=True)

    for epoch in range(args.epochs):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for batch_idx, (images, labels) in enumerate(train_loader):
            images = images.to(device)
            labels = labels.to(device).float()

            optimizer.zero_grad()
            outputs = model(images).squeeze()
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            predicted = (outputs >= 0.5).float()
            train_correct += (predicted == labels).sum().item()
            train_total += labels.size(0)

            if batch_idx % args.log_interval == 0:
                print(
                    f"Epoch {epoch:3d} [{batch_idx:4d}/{len(train_loader):4d}] "
                    f"Loss: {loss.item():.4f}"
                )

        scheduler.step()

        train_acc = train_correct / train_total

        model.eval()
        val_correct = 0
        val_total = 0
        with torch.no_grad():
            for images, labels in val_loader:
                images = images.to(device)
                labels = labels.to(device).float()
                outputs = model(images).squeeze()
                predicted = (outputs >= 0.5).float()
                val_correct += (predicted == labels).sum().item()
                val_total += labels.size(0)

        val_acc = val_correct / val_total

        print(
            f"Epoch {epoch:3d} | Train Acc: {train_acc:.4f} | "
            f"Val Acc: {val_acc:.4f} | LR: {scheduler.get_last_lr()[0]:.2e}"
        )

        if val_acc > best_acc:
            best_acc = val_acc
            torch.save(
                model.state_dict(),
                os.path.join(args.output_dir, "autofocus_best.pth"),
            )

    model.load_state_dict(
        torch.load(
            os.path.join(args.output_dir, "autofocus_best.pth"),
            map_location=device,
        )
    )

    onnx_path = os.path.join(args.output_dir, "autofocus.onnx")
    model.export_onnx(onnx_path)
    print(f"Exported ONNX to {onnx_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train Autofocus Classifier"
    )
    parser.add_argument("--num-samples", type=int, default=40000)
    parser.add_argument("--num-val", type=int, default=5000)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--log-interval", type=int, default=100)
    parser.add_argument(
        "--output-dir", type=str, default="./checkpoints/autofocus"
    )
    args = parser.parse_args()
    train(args)

"""
Train Deblur CNN for barcode deblurring.
Dataset: Synthetic sharp/blur pairs of barcodes.
License: MIT
"""

import argparse
import os

import torch
import torch.optim as optim
from torch.utils.data import DataLoader

from data.synthetic_barcodes import DeblurDataset
from models.deblur_cnn import DeblurCNN, BlurLoss


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    model = DeblurCNN(in_channels=3, base_channels=32).to(device)
    print(
        f"Model parameters: {sum(p.numel() for p in model.parameters()) / 1e6:.2f}M"
    )

    train_dataset = DeblurDataset(
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

    val_dataset = DeblurDataset(
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
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = BlurLoss(alpha_l1=0.6, alpha_edge=0.4)

    best_loss = float("inf")
    os.makedirs(args.output_dir, exist_ok=True)

    for epoch in range(args.epochs):
        model.train()
        train_loss = 0.0

        for batch_idx, (blurred, sharp) in enumerate(train_loader):
            blurred = blurred.to(device)
            sharp = sharp.to(device)

            optimizer.zero_grad()
            output = model(blurred)
            loss = criterion(output, sharp)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            train_loss += loss.item()

            if batch_idx % args.log_interval == 0:
                print(
                    f"Epoch {epoch:3d} [{batch_idx:4d}/{len(train_loader):4d}] "
                    f"Loss: {loss.item():.4f}"
                )

        scheduler.step()
        avg_train_loss = train_loss / len(train_loader)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for blurred, sharp in val_loader:
                blurred = blurred.to(device)
                sharp = sharp.to(device)
                output = model(blurred)
                loss = criterion(output, sharp)
                val_loss += loss.item()

        avg_val_loss = val_loss / len(val_loader)

        if args.metric is not None:
            psnr_val = compute_psnr_on_loader(
                model, val_loader, device
            )
            print(
                f"Epoch {epoch:3d} | Train Loss: {avg_train_loss:.4f} | "
                f"Val Loss: {avg_val_loss:.4f} | PSNR: {psnr_val:.2f}dB"
            )
        else:
            print(
                f"Epoch {epoch:3d} | Train Loss: {avg_train_loss:.4f} | "
                f"Val Loss: {avg_val_loss:.4f}"
            )

        if avg_val_loss < best_loss:
            best_loss = avg_val_loss
            torch.save(
                model.state_dict(),
                os.path.join(args.output_dir, "deblur_best.pth"),
            )

        if (epoch + 1) % args.save_interval == 0:
            torch.save(
                model.state_dict(),
                os.path.join(args.output_dir, f"deblur_{epoch:04d}.pth"),
            )

    model.load_state_dict(
        torch.load(
            os.path.join(args.output_dir, "deblur_best.pth"),
            map_location=device,
        )
    )

    onnx_path = os.path.join(args.output_dir, "deblur_unet.onnx")
    model.export_onnx(onnx_path)
    print(f"Exported ONNX to {onnx_path}")


def compute_psnr_on_loader(model, loader, device):
    model.eval()
    psnr_sum = 0.0
    count = 0
    with torch.no_grad():
        for blurred, sharp in loader:
            blurred = blurred.to(device)
            sharp = sharp.to(device)
            output = model(blurred)
            mse = torch.nn.functional.mse_loss(output, sharp)
            psnr = 20 * torch.log10(1.0 / torch.sqrt(mse))
            psnr_sum += psnr.item()
            count += 1
    return psnr_sum / max(count, 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Deblur CNN")
    parser.add_argument("--num-samples", type=int, default=80000)
    parser.add_argument("--num-val", type=int, default=5000)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--metric", action="store_true", default=True)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--log-interval", type=int, default=100)
    parser.add_argument("--save-interval", type=int, default=10)
    parser.add_argument(
        "--output-dir", type=str, default="./checkpoints/deblur"
    )
    args = parser.parse_args()
    train(args)

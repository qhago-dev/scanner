"""
Train ESRGAN Tiny for barcode super-resolution.
Dataset: Synthetic low-res/high-res pairs of barcodes.
License: MIT
"""

import argparse
import os

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader

from data.synthetic_barcodes import SuperResolutionDataset
from models.esrgan_tiny import ESRGANTiny, ESRGANDiscriminator


class VGGLoss(nn.Module):
    def __init__(self):
        super().__init__()
        vgg = torch.hub.load(
            "pytorch/vision:v0.10.0", "vgg19", pretrained=True
        )
        self.features = nn.Sequential(
            *list(vgg.features.children())[:35]
        ).eval()
        for p in self.features.parameters():
            p.requires_grad = False

        self.register_buffer(
            "mean", torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
        )
        self.register_buffer(
            "std", torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
        )

    def forward(self, sr: torch.Tensor, hr: torch.Tensor):
        sr = (sr - self.mean) / self.std
        hr = (hr - self.mean) / self.std
        return nn.functional.l1_loss(
            self.features(sr), self.features(hr)
        )


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    generator = ESRGANTiny(
        in_channels=3,
        out_channels=3,
        num_features=32,
        num_rrdb=3,
        scale=2,
    ).to(device)
    discriminator = ESRGANDiscriminator(
        in_channels=3, num_features=32
    ).to(device)

    print(
        f"Generator params: {sum(p.numel() for p in generator.parameters()) / 1e6:.2f}M"
    )
    print(
        f"Discriminator params: {sum(p.numel() for p in discriminator.parameters()) / 1e6:.2f}M"
    )

    dataset = SuperResolutionDataset(
        num_samples=args.num_samples,
        hr_size=128,
        scale=2,
        augment=True,
    )
    loader = DataLoader(
        dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=True,
    )

    opt_g = optim.Adam(generator.parameters(), lr=args.lr_g, betas=(0.9, 0.99))
    opt_d = optim.Adam(discriminator.parameters(), lr=args.lr_d, betas=(0.9, 0.99))

    sched_g = optim.lr_scheduler.CosineAnnealingLR(opt_g, T_max=args.epochs)
    sched_d = optim.lr_scheduler.CosineAnnealingLR(opt_d, T_max=args.epochs)

    vgg_loss = VGGLoss().to(device)
    l1_loss = nn.L1Loss()
    adversarial_loss = nn.BCEWithLogitsLoss()

    os.makedirs(args.output_dir, exist_ok=True)

    for epoch in range(args.epochs):
        for batch_idx, (lr_img, hr_img) in enumerate(loader):
            lr_img = lr_img.to(device)
            hr_img = hr_img.to(device)
            batch_size = lr_img.size(0)

            valid = torch.ones(batch_size, 1, device=device) * 0.9
            fake = torch.zeros(batch_size, 1, device=device) * 0.1

            for _ in range(args.d_updates):
                opt_d.zero_grad()

                with torch.no_grad():
                    sr = generator(lr_img)

                loss_real = adversarial_loss(
                    discriminator(hr_img), valid
                )
                loss_fake = adversarial_loss(
                    discriminator(sr.detach()), fake
                )
                loss_d = (loss_real + loss_fake) / 2
                loss_d.backward()
                opt_d.step()

            opt_g.zero_grad()

            sr = generator(lr_img)
            loss_pixel = l1_loss(sr, hr_img)
            loss_perceptual = vgg_loss(sr, hr_img)
            loss_adv = adversarial_loss(discriminator(sr), valid)

            loss_g = (
                0.01 * loss_pixel
                + 1.0 * loss_perceptual
                + args.adv_weight * loss_adv
            )
            loss_g.backward()
            opt_g.step()

            if batch_idx % args.log_interval == 0:
                print(
                    f"Epoch {epoch:3d} [{batch_idx:4d}/{len(loader):4d}] "
                    f"G: {loss_g.item():.4f} (L1={loss_pixel.item():.4f}, "
                    f"VGG={loss_perceptual.item():.4f}, "
                    f"Adv={loss_adv.item():.4f}) "
                    f"D: {loss_d.item():.4f}"
                )

        sched_g.step()
        sched_d.step()

        if (epoch + 1) % args.save_interval == 0:
            gen_path = os.path.join(
                args.output_dir, f"esrgan_tiny_{epoch:04d}.pth"
            )
            torch.save(generator.state_dict(), gen_path)
            print(f"Saved checkpoint to {gen_path}")

    final_path = os.path.join(args.output_dir, "esrgan_tiny_final.pth")
    torch.save(generator.state_dict(), final_path)

    onnx_path = os.path.join(args.output_dir, "esrgan_tiny.onnx")
    generator.export_onnx(onnx_path)
    print(f"Exported ONNX to {onnx_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train ESRGAN Tiny")
    parser.add_argument("--num-samples", type=int, default=50000)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--lr-g", type=float, default=1e-4)
    parser.add_argument("--lr-d", type=float, default=1e-4)
    parser.add_argument("--adv-weight", type=float, default=0.005)
    parser.add_argument("--d-updates", type=int, default=1)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--log-interval", type=int, default=50)
    parser.add_argument("--save-interval", type=int, default=10)
    parser.add_argument(
        "--output-dir", type=str, default="./checkpoints/esrgan"
    )
    args = parser.parse_args()
    train(args)

#!/usr/bin/env python3
"""
Create macOS app icons with proper squircle shape and transparency.
"""

import subprocess
import sys
from pathlib import Path

# macOS squircle approximation using rounded corners with high radius
# The standard macOS icon corner radius is approximately 22.37% of the icon size

ICONS_DIR = Path(__file__).parent.parent / "src-tauri" / "icons"
SOURCE_ICON = ICONS_DIR / "app-icon-new.jpg"

# Required icon sizes for Tauri/macOS
ICON_SIZES = [
    ("32x32.png", 32),
    ("128x128.png", 128),
    ("128x128@2x.png", 256),
    ("256x256.png", 256),
    ("256x256@2x.png", 512),
    ("512x512.png", 512),
    ("512x512@2x.png", 1024),
    ("icon.png", 1024),
]

def create_squircle_mask(size: int, output_path: Path) -> Path:
    """Create a squircle mask using ImageMagick."""
    # macOS uses ~22.37% corner radius
    corner_radius = int(size * 0.2237)
    mask_path = output_path.parent / f"_mask_{size}.png"
    
    # Create a white rounded rectangle on black background
    subprocess.run([
        "magick", "-size", f"{size}x{size}", "xc:none",
        "-fill", "white",
        "-draw", f"roundrectangle 0,0,{size-1},{size-1},{corner_radius},{corner_radius}",
        str(mask_path)
    ], check=True)
    
    return mask_path

def create_icon(source: Path, output: Path, size: int):
    """Create a single icon with squircle mask."""
    print(f"Creating {output.name} ({size}x{size})...")
    
    # Create mask
    mask_path = create_squircle_mask(size, output)
    
    try:
        # Resize source and apply mask
        # First resize, then composite with mask for alpha
        subprocess.run([
            "magick", str(source),
            "-resize", f"{size}x{size}",
            "-gravity", "center",
            "-extent", f"{size}x{size}",
            str(mask_path),
            "-alpha", "off",
            "-compose", "CopyOpacity",
            "-composite",
            "-define", "png:color-type=6",  # Force RGBA
            str(output)
        ], check=True)
    finally:
        # Clean up mask
        mask_path.unlink(missing_ok=True)

def create_icns(icons_dir: Path):
    """Create icon.icns from the PNG icons."""
    print("Creating icon.icns...")
    
    # Create iconset directory
    iconset_dir = icons_dir / "Ideate.iconset"
    iconset_dir.mkdir(exist_ok=True)
    
    # Copy icons with correct names for iconutil
    icon_mappings = [
        ("32x32.png", "icon_16x16@2x.png"),
        ("32x32.png", "icon_32x32.png"),
        ("128x128.png", "icon_64x64@2x.png"),
        ("128x128.png", "icon_128x128.png"),
        ("256x256.png", "icon_128x128@2x.png"),
        ("256x256.png", "icon_256x256.png"),
        ("512x512.png", "icon_256x256@2x.png"),
        ("512x512.png", "icon_512x512.png"),
        ("512x512@2x.png", "icon_512x512@2x.png"),
    ]
    
    # We also need 16x16 icon
    create_icon(SOURCE_ICON, iconset_dir / "icon_16x16.png", 16)
    
    for src_name, dst_name in icon_mappings:
        src = icons_dir / src_name
        dst = iconset_dir / dst_name
        if src.exists():
            subprocess.run(["cp", str(src), str(dst)], check=True)
    
    # Run iconutil
    icns_path = icons_dir / "icon.icns"
    subprocess.run([
        "iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)
    ], check=True)
    
    # Clean up iconset
    subprocess.run(["rm", "-rf", str(iconset_dir)], check=True)
    
    print(f"Created {icns_path}")

def main():
    if not SOURCE_ICON.exists():
        print(f"Error: Source icon not found at {SOURCE_ICON}")
        sys.exit(1)
    
    print(f"Creating icons from {SOURCE_ICON}...")
    
    # Create all PNG icons
    for filename, size in ICON_SIZES:
        output_path = ICONS_DIR / filename
        create_icon(SOURCE_ICON, output_path, size)
    
    # Create icns
    create_icns(ICONS_DIR)
    
    # Verify icons are RGBA
    print("\nVerifying icon formats...")
    for filename, _ in ICON_SIZES:
        result = subprocess.run(
            ["file", str(ICONS_DIR / filename)],
            capture_output=True, text=True
        )
        print(f"  {filename}: {'RGBA' if 'RGBA' in result.stdout else 'CHECK FORMAT'}")
    
    print("\nDone! All icons created successfully.")

if __name__ == "__main__":
    main()

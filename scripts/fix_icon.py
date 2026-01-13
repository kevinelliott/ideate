#!/usr/bin/env python3
"""
Fix the app icon by making it a full-bleed square (no pre-baked squircle).
macOS will apply its own squircle mask.
"""

import subprocess
from pathlib import Path

ICONS_DIR = Path(__file__).parent.parent / "src-tauri" / "icons"

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

def create_clean_icon(size: int, output_path: Path):
    """Create a clean square icon without pre-baked squircle."""
    print(f"Creating {output_path.name} ({size}x{size})...")
    
    # Take the current icon, flatten it onto a dark background,
    # crop to just the center (removing shadow), then extend to full square
    source = ICONS_DIR / "icon.png"
    
    # The source has a squircle with shadow. We need to:
    # 1. Create a dark background
    # 2. Composite the center content (without the transparent edges)
    # 3. Ensure it fills the entire square
    
    subprocess.run([
        "magick",
        str(source),
        # Flatten transparency onto dark background
        "-background", "#0f0f0f",
        "-flatten",
        # Resize to target
        "-resize", f"{size}x{size}",
        # Ensure RGBA
        "-define", "png:color-type=6",
        str(output_path)
    ], check=True)

def create_icns(icons_dir: Path):
    """Create icon.icns from the PNG icons."""
    print("Creating icon.icns...")
    
    iconset_dir = icons_dir / "Ideate.iconset"
    iconset_dir.mkdir(exist_ok=True)
    
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
    
    # Create 16x16 icon
    subprocess.run([
        "magick",
        str(icons_dir / "32x32.png"),
        "-resize", "16x16",
        "-define", "png:color-type=6",
        str(iconset_dir / "icon_16x16.png")
    ], check=True)
    
    for src_name, dst_name in icon_mappings:
        src = icons_dir / src_name
        dst = iconset_dir / dst_name
        if src.exists():
            subprocess.run(["cp", str(src), str(dst)], check=True)
    
    icns_path = icons_dir / "icon.icns"
    subprocess.run([
        "iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)
    ], check=True)
    
    subprocess.run(["rm", "-rf", str(iconset_dir)], check=True)
    print(f"Created {icns_path}")

def main():
    print("Fixing icons to be full-bleed squares...")
    
    for filename, size in ICON_SIZES:
        output_path = ICONS_DIR / filename
        create_clean_icon(size, output_path)
    
    # Update app-icon.png
    subprocess.run(["cp", str(ICONS_DIR / "icon.png"), str(ICONS_DIR / "app-icon.png")], check=True)
    
    create_icns(ICONS_DIR)
    
    print("\nVerifying icon formats...")
    for filename, _ in ICON_SIZES:
        result = subprocess.run(
            ["file", str(ICONS_DIR / filename)],
            capture_output=True, text=True
        )
        print(f"  {filename}: {'RGBA' if 'RGBA' in result.stdout else result.stdout.strip()}")
    
    print("\nDone! Icons are now full-bleed squares.")

if __name__ == "__main__":
    main()

#!/bin/bash
# Build OutRay CLI as standalone binaries for Tauri sidecar
# These binaries are bundled with the app and don't require Node.js

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BINARIES_DIR="$PROJECT_ROOT/src-tauri/binaries"
OUTRAY_DIR="$PROJECT_ROOT/node_modules/outray"

echo "Building OutRay binaries..."

# Ensure binaries directory exists
mkdir -p "$BINARIES_DIR"

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo "Bun not found. Please install Bun: https://bun.sh"
    exit 1
fi

echo "Using Bun to compile OutRay..."

OS=$(uname -s | tr '[:upper:]' '[:lower:]')

build_for_target() {
    local BUN_TARGET="$1"
    local TAURI_TRIPLE="$2"
    
    OUTPUT_NAME="outray-$TAURI_TRIPLE"
    OUTPUT_PATH="$BINARIES_DIR/$OUTPUT_NAME"
    
    echo "Building for $TAURI_TRIPLE..."
    
    cd "$OUTRAY_DIR"
    bun build ./dist/index.js --compile --target="$BUN_TARGET" --outfile "$OUTPUT_PATH"
    
    # Make executable
    chmod +x "$OUTPUT_PATH"
    
    echo "  ✓ Built: $OUTPUT_PATH ($(du -h "$OUTPUT_PATH" | cut -f1))"
}

case "$OS" in
    darwin)
        echo "Building for macOS (both architectures)..."
        
        # Build for Apple Silicon
        build_for_target "bun-darwin-arm64" "aarch64-apple-darwin"
        
        # Build for Intel
        build_for_target "bun-darwin-x64" "x86_64-apple-darwin"
        
        echo ""
        echo "macOS binaries built successfully!"
        ;;
    linux)
        ARCH=$(uname -m)
        echo "Building for Linux ($ARCH)..."
        
        if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
            build_for_target "bun-linux-arm64" "aarch64-unknown-linux-gnu"
        else
            build_for_target "bun-linux-x64" "x86_64-unknown-linux-gnu"
        fi
        ;;
    *)
        echo "Unsupported OS: $OS"
        echo "Please build manually for your platform."
        exit 1
        ;;
esac

echo ""
echo "OutRay binaries ready for Tauri sidecar:"
ls -la "$BINARIES_DIR"/outray-*

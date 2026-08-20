#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GOLDMAPPER_DIR="$ROOT_DIR/GoldMapper"
BUILD_DIR="$GOLDMAPPER_DIR/build"
RESOURCES_DIR="$ROOT_DIR/src-tauri/resources"

if ! command -v xwin &> /dev/null; then
  echo "Installing xwin..."
  cargo install xwin
fi

if [ ! -d "$HOME/.cache/xwin/splat" ]; then
  echo "Downloading Windows SDK and CRT..."
  xwin --accept-license 16299.309000601.3633040603 splat --output "$HOME/.cache/xwin/splat"
fi

if [ ! -f "$GOLDMAPPER_DIR/third_party/minhook/include/MinHook.h" ]; then
  echo "Initializing minhook submodule..."
  git -C "$GOLDMAPPER_DIR" submodule update --init --recursive
fi

echo "Configuring GoldMapper..."
cmake -B "$BUILD_DIR" \
  -DCMAKE_TOOLCHAIN_FILE="$GOLDMAPPER_DIR/toolchain-xwin.cmake" \
  -DCMAKE_BUILD_TYPE=Release \
  "$GOLDMAPPER_DIR"

echo "Building GoldMapper..."
cmake --build "$BUILD_DIR" --config Release

echo "Copying binaries to resources..."
mkdir -p "$RESOURCES_DIR"
cp "$BUILD_DIR/GoldMapperLib.dll" "$RESOURCES_DIR/"
cp "$BUILD_DIR/GoldMapperLauncher.exe" "$RESOURCES_DIR/"

echo "GoldMapper build complete."

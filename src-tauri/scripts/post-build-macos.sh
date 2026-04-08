#!/bin/bash

# Post-build script for macOS to fix quarantine issues (thank u apple...)
# This script runs automatically after Tauri build on macOS

set -e

APP_NAME="Emerald Legacy Launcher"
BUNDLE_ID="com.emerald.legacy"
BASE_DIR="src-tauri/target"

echo "Running macOS post-build fixes"

# Find the correct target directory (handles both native and cross-compilation)
TARGET_DIR=$(find "$BASE_DIR" -path "*/release/bundle/macos" -type d | head -n 1)

if [ -z "$TARGET_DIR" ]; then
    echo "❌ No macOS bundle directory found in $BASE_DIR"
    exit 1
fi

echo "Using target directory: $TARGET_DIR"

APP_PATH=$(find "$TARGET_DIR" -name "*.app" -type d | head -n 1)

if [ -z "$APP_PATH" ]; then
    echo "❌ No .app bundle found in $TARGET_DIR"
    exit 1
fi

echo "Found app: $APP_PATH"

echo "Removing quarantine attributes..."
xattr -cr "$APP_PATH"

echo "Applying ad-hoc signature..."
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || {
    echo "⚠️  Code signing failed, but quarantine removal should work"
}

echo "Verifying app signature..."
codesign -v "$APP_PATH" 2>/dev/null && echo "✅ App signature verified" || echo "⚠️  App signature verification failed"

echo "✅ macOS post-build fixes completed!"
echo "The app should now launch without 'damaged' error on macOS ARM"

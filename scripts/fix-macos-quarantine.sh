#!/bin/bash

# Fix macOS quarantine issue for ARM builds fuck apple man
# This script removes quarantine attributes from the built app

set -e

APP_PATH="$1"
BUNDLE_ID="com.emerald.legacy"

if [ -z "$APP_PATH" ]; then
    echo "Usage: $0 <path-to-app-bundle>"
    exit 1
fi

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App bundle not found at $APP_PATH"
    exit 1
fi

echo "Fixing macOS quarantine for: $APP_PATH"

# Remove quarantine attributes
xattr -cr "$APP_PATH"

# Add basic code signing (ad-hoc signature)
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || {
    echo "Warning: Code signing failed, but quarantine removal should work"
}

echo "✅ macOS quarantine fix completed"
echo "The app should now launch without 'damaged' error"

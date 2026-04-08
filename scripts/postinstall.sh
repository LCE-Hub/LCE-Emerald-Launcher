#!/bin/bash

# Post-install script for PKG installer
# Automatically removes quarantine attributes from the installed app

APP_PATH="$2/Applications/Emerald Legacy Launcher.app"

echo "Removing quarantine attributes from Emerald Legacy Launcher..."

if [ -d "$APP_PATH" ]; then
    xattr -cr "$APP_PATH"
    echo "Quarantine attributes removed successfully."
    exit 0
else
    echo "Warning: App not found at expected location: $APP_PATH"
    exit 1
fi

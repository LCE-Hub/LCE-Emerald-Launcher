# Building Emerald Launcher
## Requirements

- Node.js (and NPM)
- Rust
- WebKit2GTK-4.1 (GNU/Linux only)
- WebKit (macOS only, preinstalled)
- Microsoft Edge WebView2 Runtime (Windows only)
- PNPM (optional, but recommended)
- Windows, GNU/Linux or a macOS system.

## Building

```sh
pnpm install  # or npm
pnpm tauri build  # or npm
```

## macOS ARM Fix

If you encounter "application is damaged" error on macOS ARM, the build process now includes automatic fixes. If manual intervention is needed:

```sh
# Remove quarantine attributes
xattr -cr /path/to/Emerald\ Legacy\ Launcher.app

# Apply ad-hoc signature
codesign --force --deep --sign - "/path/to/Emerald\ Legacy\ Launcher.app"
```

## Flatpak

```sh
pnpm flatpak  # or npm
```

## Gentoo

A Portage overlay lives in [`gentoo/`](gentoo/). See the GNU/Linux installation section in [README.md](README.md).

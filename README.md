<div align="center">
  <img height="150" src="https://raw.githubusercontent.com/LCE-Hub/LCE-Emerald-Launcher/refs/heads/main/public/images/icon.png" alt="LCE Emerald Launcher Logo">
  <h1>LCE Emerald Launcher</h1>
  <p><strong>FOSS cross-platform launcher for Minecraft Legacy Console Edition</strong></p>
  <p>
    <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version">
    <img src="https://img.shields.io/badge/license-GPL--3.0-green?style=flat-square" alt="License">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20GNU/Linux-lightgrey?style=flat-square" alt="Platforms">
  </p>
</div>

<p align="center">
  <a href="https://ko-fi.com/kayjann">
    <img src="https://img.shields.io/badge/ko--fi-Donate%20to%20the%20Project-grey?style=for-the-badge&logo=kofi&logoColor=white&labelColor=FF5E5B" alt="Donate to the Project">
  </a>
  <a href="https://discord.gg/NPMp9JhGYH">
    <img src="https://img.shields.io/badge/discord-Join%20the%20Community-grey?style=for-the-badge&logo=discord&logoColor=white&labelColor=5865F2" alt="Join the Community">
  </a>
</p>

---

| Main Screen | Versions Menu | Workshop |
|-------------|---------------|----------|
| <img width="1388" height="918" alt="image" src="https://github.com/user-attachments/assets/28269ade-db3b-4bff-ac15-e8a6eb53a69e" /> | <img width="1551" height="997" alt="image" src="https://github.com/user-attachments/assets/dca543ab-94cf-48ce-8e61-dfe92fe278a7" /> | <img width="1551" height="997" alt="image" src="https://github.com/user-attachments/assets/d7bc0ed2-3bf4-4704-83c3-75c716d13a65" /> |


---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
  - [Windows](#windows)
  - [macOS](#macos)
  - [GNU/Linux](#gnulinux)
- [Game Versions & Partnerships](#game-versions--partnerships)
- [Building from Source](#building-from-source)
- [Troubleshooting](#troubleshooting)
- [Acknowledgments](#acknowledgments)
- [License](#license)

---

## Overview

LCE Emerald Launcher is the easiest way to play Minecraft Legacy Console Edition on PC. Install community builds, manage versions, customize skins, and launch instantly from one lightweight hub.

**Why Emerald?** Traditional launchers often rely on bloated frameworks, consuming excessive resources. Emerald utilizes a modern **Tauri** architecture, using only a low amount of RAM, leaving your PC's resources dedicated to the game itself.

---

## Features

| Feature | Description |
|---------|-------------|
| **Automated Setup** | One-click installation for neoLegacy, Revelations, 360 Revived, and Hellish Ends |
| **Cross-Platform** | Native support for Windows, macOS (Intel & Apple Silicon), and Linux (Steam Deck is supported !) |
| **Lightweight** | Very light RAM usage thanks to Rust backend and Tauri framework |
| **Easy Configuration** | Built-in settings for username, game parameters, and profiles |
| **Skin Viewer** | Interactive skin preview using Three.js with layer support |
| **Custom Skins** | Import and manage your own skins with local storage |
| **Controller Support** | Full gamepad navigation support (keyboard support included) |
| **Discord Rich Presence** | Show your current activity and game status on Discord |
| **Workshop** | Community content |

---

## Game Versions & Partnerships

LCE Emerald Launcher integrates multiple community-driven builds of Minecraft Legacy Console Edition. Each build brings unique features and improvements to the classic LCE experience.

### Available Builds

| Build | Developer | Platform | Description |
|-------|-----------|----------|-------------|
| **[neoLegacy](https://github.com/pieeebot/neoLegacy)** | [@pieeebot](https://github.com/pieeebot) | GitHub | Backports newer title updates to LCE TU19 base. And Minigames |
| **[Revelations](https://github.com/itsRevela/MinecraftConsoles)** | [@itsRevela](https://github.com/itsRevela) | GitHub | Enhanced LCE with uncapped FPS, graphics fixes, hardcore hearts, and dedicated server security. Features LAN multiplayer, split-screen, and keyboard & mouse support |
| **[360 Revived](https://github.com/BluTac10/360Revived)** | [@BluTac10](https://github.com/BluTac10) | GitHub | PC port of Xbox 360 Edition TU19 with desktop optimizations. Features keyboard & mouse, fullscreen, LAN multiplayer, dedicated server, and split-screen support |
| **[Hellish Ends](https://github.com/deadvoxelx/HellishEnds)** | [DeadVoxelx](https://github.com/deadvoxelx) | GitHub | Modded build that overhauls Nether and End |

---

## Installation

[![](https://raw.githubusercontent.com/rubenpgrady/get-it-on-github/refs/heads/main/get-it-on-github.png)](https://github.com/LCE-Hub/LCE-Emerald-Launcher/releases)

### Windows

| Format | Best For |
|--------|----------|
| `.exe` (NSIS) | Standard installation with uninstaller |
| `.msi` | A fallback option in case the `.exe` does not work |

**⚠️ Windows SmartScreen Warning:**
> Since the launcher is unsigned, Windows may show a "Windows protected your PC" warning. To proceed:
> 1. Click **"More info"**
> 2. Click **"Run anyway"**

### macOS

| Format | Architecture |
|--------|-------------|
| `.dmg` (x64) | Intel Macs |
| `.dmg` (aarch64) | Apple Silicon (M-series and A-series) |

**Installation Steps:**
1. Download the appropriate DMG for your Mac
2. Open the DMG and drag the app to Applications
3. If you see "app is damaged" error:
   - Right-click the app → **Open** → confirm **Open**
   - Or run: `xattr -cr "/Applications/Emerald Legacy Launcher.app"`

### GNU/Linux

Multiple distribution formats available:

| Format | Distribution |
|--------|------------|
| `.deb` | Debian, Ubuntu, Linux Mint |
| `.rpm` | RHEL, Fedora, openSUSE |
| `.AppImage` | Universal (no installation required) |
| `.flatpak` | Universal with sandboxing (recommended over AppImage) |

**Flatpak Installation:**
```bash
flatpak install emerald.flatpak
```

**Dependencies (if building from source):**
```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libudev-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel patchelf systemd-devel
```

---

## Building from Source

Refer to [BUILDING.md](BUILDING.md).

---

## Troubleshooting

### macOS "App is Damaged" Error

```bash
# Remove quarantine attributes
xattr -cr /path/to/Emerald\ Legacy\ Launcher.app
```

### Linux WebView Issues

Ensure WebKit2GTK-4.1 is installed:
```bash
# Check installation
pkg-config --modversion webkit2gtk-4.1

# Reinstall if needed
sudo apt install --reinstall libwebkit2gtk-4.1-0
```

### Game Not Launching

1. Verify game files are properly installed via the launcher
2. Check that Wine/Proton is installed (Linux only)
3. Check that Wine/GPTK3 are installed (macOS only)
4. Ensure your GPU drivers are up to date

### Controller Not Detected

- Connect controller before launching the launcher
- PlayStation controllers are not supported in-game but work in launcher. Use Steam Input.

---

## Acknowledgments

- **The Emerald Team** - Technical development and maintenance
- **4J Studios & Mojang** - Original creators of Legacy Console Edition
- **The LCE Community** - Research and foundations for LCE on PC

---

## License

This project is licensed under the **[GNU GPL v3 License](LICENSE)**.

<div align="center">
  <img height="150" src="https://raw.githubusercontent.com/Emerald-Legacy-Launcher/Emerald-Legacy-Launcher/refs/heads/main/public/images/icon.png" alt="Emerald Legacy Launcher Logo">
  <h1>Emerald Legacy Launcher</h1>
  <p><strong>FOSS cross-platform launcher for Minecraft Legacy Console Edition</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version">
    <img src="https://img.shields.io/badge/license-GPL--3.0-green?style=flat-square" alt="License">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platforms">
  </p>
</div>

<p align="center">
  <a href="https://ko-fi.com/kayjann">
    <img src="https://img.shields.io/badge/ko--fi-Donate%20to%20the%20Project-grey?style=for-the-badge&logo=kofi&logoColor=white&labelColor=FF5E5B" alt="Donate to the Project">
  </a>
  <a href="https://discord.gg/ycYvGjWmhu">
    <img src="https://img.shields.io/badge/discord-Join%20the%20Community-grey?style=for-the-badge&logo=discord&logoColor=white&labelColor=5865F2" alt="Join the Community">
  </a>
</p>

---

> [!IMPORTANT]
> **Emerald Legacy Launcher is currently in Beta.**
> Expect minor bugs, frequent updates, and features that are still being polished as we work toward a stable release.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Screenshots](#screenshots)
- [Installation](#installation)
  - [Windows](#windows)
  - [macOS](#macos)
  - [Linux](#linux)
- [Game Versions & Partnerships](#game-versions--partnerships)
- [Building from Source](#building-from-source)
- [Development](#development)
  - [Project Structure](#project-structure)
  - [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Acknowledgments](#acknowledgments)
- [License](#license)

---

## Overview

Emerald Legacy Launcher is a **high-performance, open-source launcher** for Minecraft Legacy Console Edition (LCE). Built to centralize the fragmented LCE scene, it provides a lightweight, unified hub for playing your favorite console versions of Minecraft on PC.

**Why Emerald?** Traditional launchers often rely on bloated frameworks, consuming excessive resources. Emerald utilizes a modern **Rust/Tauri** architecture, using only **~15MB of RAM** — leaving your PC's resources dedicated to the game itself.

The project started as a solo effort and has grown into a collaborative community project, bringing together expertise from various LCE preservation initiatives.

---

## Features

### Core Features

| Feature | Description |
|---------|-------------|
| **Automated Setup** | One-click installation for TU19, Legacy Evolved, Revelations, and 360Revived versions |
| **Cross-Platform** | Native support for Windows, macOS (Intel & Apple Silicon), and Linux |
| **Lightweight** | Very light RAM usage thanks to Rust backend and Tauri framework |
| **Easy Configuration** | Built-in settings for username, game parameters, and profiles |

### Advanced Features

| Feature | Description |
|---------|-------------|
| **3D Skin Viewer** | Interactive skin preview using Three.js with layer support |
| **Custom Skins** | Import and manage your own skins with local storage |
| **Controller Support** | Full gamepad navigation support (keyboard fallback included) |
| **Discord Rich Presence** | Show your current activity and game status on Discord |
| **Workshop and modloader** | *(Coming Soon)* Community content and mod browser |

---

## Game Versions & Partnerships

Emerald Legacy Launcher integrates multiple community-driven builds of Minecraft Legacy Console Edition. Each build brings unique features and improvements to the classic LCE experience.

### Available Builds

| Build | Developer | Platform | Description |
|-------|-----------|----------|-------------|
| **[Revelations](https://github.com/itsRevela/MinecraftConsoles)** | [@itsRevela](https://github.com/itsRevela) | GitHub | Enhanced LCE with uncapped FPS, graphics fixes, hardcore hearts, and dedicated server security. Features LAN multiplayer, split-screen, and keyboard & mouse support. |
| **[360 Revived](https://github.com/BluTac10/360Revived)** | [@BluTac10](https://github.com/BluTac10) | GitHub | PC port of Xbox 360 Edition TU19 with desktop optimizations. Features keyboard & mouse, fullscreen, LAN multiplayer, dedicated server, and split-screen support. |
| **[Legacy Evolved](https://codeberg.org/piebot/LegacyEvolved)** | [@piebot](https://codeberg.org/piebot) | Codeberg | Backports newer title updates to LCE TU19 base. Currently porting TU25 (~98% complete) and TU31 (~76% complete). |
| **[Title Update 19](https://github.com/smartcmd/MinecraftConsoles)** | [@smartcmd](https://github.com/smartcmd) | GitHub | Minecraft LCE v1.6.0560.0 with compilation fixes. Base version for modding with keyboard & mouse, fullscreen, LAN multiplayer, and dedicated server support. |

### Coming Soon: Legacy Minecraft Restoration Project (LMRP)

**LMRP** will be our **first major collaboration** to bring fully functional **online mini-games** back to Legacy Console Edition. This groundbreaking project aims to:

- Restore classic LCE mini-games (Battle, Tumble, Glide)
- Preserve the authentic mini-game mechanics and maps

Stay tuned for updates on this exciting partnership! :)

---

## Screenshots

<img width="1680" alt="Emerald Legacy Launcher Screenshot" src="https://github.com/user-attachments/assets/a5dd6aa1-2200-4f08-84e5-e75a8052ba79" />

---

## Installation

### Windows

Download the latest release from [GitHub Releases](https://github.com/Emerald-Legacy-Launcher/Emerald-Legacy-Launcher/releases):

| Format | Best For |
|--------|----------|
| `.exe` (NSIS) | Standard installation with uninstaller |
| `.msi` | Enterprise/IT deployment |

**⚠️ Windows SmartScreen Warning:**
> Since the launcher is unsigned, Windows may show a "Windows protected your PC" warning. To proceed:
> 1. Click **"More info"**
> 2. Click **"Run anyway"**

### macOS

| Format | Architecture |
|--------|-------------|
| `.dmg` (x64) | Intel Macs |
| `.dmg` (aarch64) | Apple Silicon (M1/M2/M3) |

**Installation Steps:**
1. Download the appropriate DMG for your Mac
2. Open the DMG and drag the app to Applications
3. If you see "app is damaged" error:
   - Right-click the app → **Open** → confirm **Open**
   - Or run: `xattr -cr "/Applications/Emerald Legacy Launcher.app"`

### Linux

Multiple distribution formats available:

| Format | Distribution |
|--------|------------|
| `.deb` | Debian, Ubuntu, Linux Mint |
| `.rpm` | RHEL, Fedora, openSUSE |
| `.AppImage` | Universal (no installation required) |
| `Flatpak` | Universal with sandboxing |

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

### Requirements

- **Node.js** (LTS recommended)
- **Rust** (latest stable)
- **PNPM** (recommended) or NPM
- Platform-specific dependencies:
  - Linux: `WebKit2GTK-4.1`
  - macOS: WebKit (pre-installed)
  - Windows: Edge WebView2 Runtime (usually pre-installed)

### Build Steps

```bash
# Clone the repository
git clone https://github.com/Emerald-Legacy-Launcher/Emerald-Legacy-Launcher.git
cd Emerald-Legacy-Launcher

# Install dependencies
pnpm install

# Development mode
pnpm tauri dev

# Production build
pnpm tauri build
```

**Flatpak Build:**
```bash
pnpm flatpak
```

---

## Development

### Project Structure

```
Emerald-Legacy-Launcher/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── context/            # React context providers
│   ├── hooks/              # Custom React hooks
│   ├── pages/              # Page components
│   ├── services/           # API/services layer
│   └── css/                # Global styles
├── src-tauri/              # Rust backend
│   ├── src/                # Rust source code
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── public/                 # Static assets
├── flatpak/                # Flatpak build config
└── scripts/                # Build scripts
```

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend** | Rust | 2021 Edition |
| **Framework** | Tauri | v2 |
| **Frontend** | React | ^19.1.0 |
| **Language** | TypeScript | ~5.8.3 |
| **Styling** | TailwindCSS | v4 |
| **Animations** | Framer Motion | ^12.36.0 |
| **3D Rendering** | Three.js | ^0.183.2 |
| **Build Tool** | Vite | ^7.0.4 |

### Key Dependencies

**Rust Crates:**
- `tauri` — Cross-platform app framework
- `serde` — Serialization
- `reqwest` — HTTP client
- `tokio` — Async runtime
- `rfd` — Native file dialogs

**Frontend Packages:**
- `@tauri-apps/api` — Tauri JS API
- `tauri-plugin-drpc` — Discord Rich Presence
- `tauri-plugin-gamepad-api` — Controller support

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
- Xbox and PlayStation controllers are best supported

---

## Roadmap

Track our progress and upcoming features on the [Development Roadmap](https://github.com/orgs/Emerald-Legacy-Launcher/projects/2).

**Planned Features:**
- [ ] Workshop content browser
- [ ] Additional TU versions support
- [ ] Enhanced mod support
- [ ] Cloud sync for settings/skins
- [ ] Auto-updater integration

---

## Acknowledgments

*Proudly developed by a passionate team from the LCE community.*

- **The Emerald Team** — Technical development and maintenance
- **4J Studios & Mojang** — Original creators of Legacy Console Edition
- **smartcmd & The LCE Community** — Research and foundations for LCE on PC
- **Tauri & Rust Communities** — Core technologies and ecosystem

---

## License

This project is licensed under the **[GNU GPL v3 License](LICENSE)**.

You are free to:
- **Use** — Use the launcher for any purpose
- **Study** — Access and study the source code
- **Share** — Redistribute copies
- **Improve** — Submit improvements and modifications

See `LICENSE` file for full terms.

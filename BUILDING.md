# Building Emerald Launcher
## Requirements

- A C++ Compiler (clang++ or g++) that is compatible with C++20
- CMake 3.24+
- libcurl
- libarchive
- SQLite3 (only on GNU/Linux and macOS)
- GNU Make (only for Flatpak)
- LevelDB (only on Windows) <!--neo: TODO: implement leveldb -->
- Windows, GNU/Linux or a macOS system.

## Building

```sh
cmake -S . -B build
cmake --build build --parallel
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
make -C flatpak
```

## Android

Requirements: Android SDK (`~/Android/Sdk`), Android NDK 28.2.13676358 (or set `ANDROID_NDK_HOME`), and a JDK (`adb` from platform-tools is used by `make install`).

Building Emerald on Android is pretty easy,

```sh
make -C android_extras assets  #neo: fetches the rootfs and proton11
make -C android_extras build
```

Extras: `make -C android_extras install` (install via adb), `make -C android_extras debug` (unsigned debug build), `make -C android_extras clean`.

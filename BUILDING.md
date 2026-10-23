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

Building Emerald on Android is pretty easy,

```sh
make -C android_extras assets  #neo: fetches the rootfs and proton11
make -C android_extras build
```

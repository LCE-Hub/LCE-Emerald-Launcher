{
  lib,
  stdenv,
  rustPlatform,
  cargo-tauri,
  nodejs,
  pkg-config,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
  wrapGAppsHook4,
  openssl,
  webkitgtk_4_1,
  glib-networking,
  libayatana-appindicator,
  librsvg,
  udev,
  version ? "1.5.1",
  src ? null,
}:

# Disable updater artifact signing — Nix builds have no Tauri signing key.
let
  tauriConfOverride = builtins.toFile "tauri-nix.conf.json" ''
    {
      "bundle": {
        "createUpdaterArtifacts": false
      }
    }
  '';

  defaultSrc = lib.cleanSourceWith {
    src = ../.;
    filter =
      path: _type:
      let
        baseName = baseNameOf path;
      in
      !(builtins.elem baseName [
        ".git"
        "node_modules"
        "target"
        "dist"
        "build-flatpak"
        "emerald-repo"
        "result"
        "result-dev"
      ]);
  };
in
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "emerald-legacy-launcher";
  inherit version;

  src = if src != null then src else defaultSrc;

  cargoRoot = "src-tauri";
  buildAndTestSubdir = finalAttrs.cargoRoot;

  cargoHash = "sha256-tSbFyle2eQ5Dw9fTXloIepOZU1UxhkF6/KZBRXehm4w=";

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 3;
    hash = "sha256-6na8YlSTkdnSse8DQjBnTBpfmKSYj3+1FLWVyyfUx1g=";
  };

  nativeBuildInputs = [
    cargo-tauri.hook
    nodejs
    pkg-config
    pnpmConfigHook
    pnpm_10
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [ wrapGAppsHook4 ];

  buildInputs = [
    openssl
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [
    glib-networking
    libayatana-appindicator
    librsvg
    udev
    webkitgtk_4_1
  ];

  tauriBuildFlags = [
    "-c"
    tauriConfOverride
  ];

  postPatch = lib.optionalString stdenv.hostPlatform.isLinux ''
    substituteInPlace "$cargoDepsCopy"/*/libappindicator-sys-*/src/lib.rs \
      --replace-fail "libayatana-appindicator3.so.1" \
      "${libayatana-appindicator}/lib/libayatana-appindicator3.so.1"
  '';

  # Prefer the project's pnpm frontend build over the npm beforeBuildCommand.
  preBuild = ''
    substituteInPlace src-tauri/tauri.conf.json \
      --replace-fail '"beforeBuildCommand": "npm run build"' \
      '"beforeBuildCommand": "pnpm run build"'
  '';

  preFixup = lib.optionalString stdenv.hostPlatform.isLinux ''
    gappsWrapperArgs+=(
      --prefix LD_LIBRARY_PATH : ${
        lib.makeLibraryPath [
          libayatana-appindicator
          udev
        ]
      }
    )
  '';

  doCheck = false;

  env = {
    CI = "true";
  };

  meta = {
    description = "FOSS cross-platform launcher for Minecraft Legacy Console Edition";
    homepage = "https://github.com/LCE-Hub/LCE-Emerald-Launcher";
    changelog = lib.mkIf (!(lib.hasPrefix "unstable-" version)) (
      "https://github.com/LCE-Hub/LCE-Emerald-Launcher/releases/tag/v${version}"
    );
    license = lib.licenses.gpl3Only;
    mainProgram = "emerald-legacy-launcher";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
    maintainers = [ ];
  };
})

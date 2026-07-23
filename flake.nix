{
  description = "LCE Emerald Launcher — FOSS cross-platform launcher for Minecraft Legacy Console Edition";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      inherit (nixpkgs) lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = lib.genAttrs systems;
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          overlays = [ self.overlays.default ];
        };

      # Bump these together when packaging a new upstream stable release.
      stableVersion = "1.5.1";
      stableSrcHash = "sha256-XDR6YCWfVeQgIokMfksakw7tqQ+2uWGFqUkLumJU0EA=";
    in
    {
      overlays.default = final: _prev: {
        emerald-legacy-launcher = final.callPackage ./nix/package.nix {
          version = stableVersion;
          src = final.fetchFromGitHub {
            owner = "LCE-Hub";
            repo = "LCE-Emerald-Launcher";
            rev = "v${stableVersion}";
            hash = stableSrcHash;
          };
        };

        emerald-legacy-launcher-git = final.callPackage ./nix/package.nix {
          version = "unstable-${self.shortRev or self.dirtyShortRev or "dirty"}";
          src = self;
        };
      };

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.emerald-legacy-launcher;
          emerald-legacy-launcher = pkgs.emerald-legacy-launcher;
          emerald-legacy-launcher-git = pkgs.emerald-legacy-launcher-git;
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = lib.getExe self.packages.${system}.default;
        };
        emerald-legacy-launcher-git = {
          type = "app";
          program = lib.getExe self.packages.${system}.emerald-legacy-launcher-git;
        };
      });

      checks = forAllSystems (system: {
        package = self.packages.${system}.default;
        package-git = self.packages.${system}.emerald-legacy-launcher-git;
      });

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            inputsFrom = [ pkgs.emerald-legacy-launcher-git ];
            packages = with pkgs; [
              cargo
              rustc
              rustfmt
              clippy
              cargo-tauri
              nodejs
              pnpm_10
	      unzip
	      libarchive
	      python3
              pkg-config
            ];
            shellHook = ''
              echo "Emerald Legacy Launcher dev shell"
              echo "  pnpm install && pnpm tauri dev"
            '';
          };
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixfmt);
    };
}

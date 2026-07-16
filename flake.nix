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
    in
    {
      overlays.default = final: _prev: {
        emerald-legacy-launcher = final.callPackage ./nix/package.nix {
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
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = lib.getExe self.packages.${system}.default;
        };
      });

      checks = forAllSystems (system: {
        package = self.packages.${system}.default;
      });

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            inputsFrom = [ pkgs.emerald-legacy-launcher ];
            packages = with pkgs; [
              cargo
              rustc
              rustfmt
              clippy
              cargo-tauri
              nodejs
              pnpm_10
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

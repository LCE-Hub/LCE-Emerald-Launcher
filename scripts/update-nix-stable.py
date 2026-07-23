#!/usr/bin/env python3
import argparse
import re
import sys


def update_flake(version: str, src_hash: str) -> None:
    path = "flake.nix"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    new_content, n_version = re.subn(
        r'stableVersion = "[^"]*";',
        f'stableVersion = "{version}";',
        content,
        count=1,
    )
    new_content, n_hash = re.subn(
        r'stableSrcHash = "[^"]*";',
        f'stableSrcHash = "{src_hash}";',
        new_content,
        count=1,
    )

    if n_version != 1 or n_hash != 1:
        print(
            f"Error: expected to update stableVersion and stableSrcHash once each "
            f"(got version={n_version}, hash={n_hash})",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"Updated {path}: stableVersion={version} stableSrcHash={src_hash}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update flake.nix stableVersion and stableSrcHash"
    )
    parser.add_argument("--version", required=True, help="Stable version without v prefix")
    parser.add_argument("--src-hash", required=True, help="SRI sha256 of the release source")
    args = parser.parse_args()
    update_flake(args.version, args.src_hash)


if __name__ == "__main__":
    main()

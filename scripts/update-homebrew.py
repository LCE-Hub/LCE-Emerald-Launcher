import argparse
import re
import os

def update_stable(version, intel_hash, arm_hash, linux_hash):
    cask_path = "Casks/lce-emerald-launcher.rb"
    formula_path = "Formula/lce-emerald-launcher.rb"
    
    # Update Cask
    if os.path.exists(cask_path):
        with open(cask_path, 'r') as f:
            content = f.read()
        
        # Replace version
        content = re.sub(r'^\s*version\s+"[^"]+"', f'  version "{version}"', content, flags=re.MULTILINE)
        # Replace sha256 block
        content = re.sub(r'sha256\s+intel:\s+"[a-f0-9]+",\r?\n\s+arm:\s+"[a-f0-9]+"', 
                         f'sha256 intel: "{intel_hash}",\n         arm:   "{arm_hash}"', 
                         content)
        
        with open(cask_path, 'w') as f:
            f.write(content)
        print(f"Updated {cask_path}")
    else:
        print(f"Error: {cask_path} not found")

    # Update Formula
    if os.path.exists(formula_path):
        with open(formula_path, 'r') as f:
            content = f.read()
            
        # Replace version
        content = re.sub(r'^\s*version\s+"[^"]+"', f'  version "{version}"', content, flags=re.MULTILINE)
        # Replace sha256
        content = re.sub(r'^\s*sha256\s+"[a-f0-9]+"', f'  sha256 "{linux_hash}"', content, flags=re.MULTILINE)
        
        with open(formula_path, 'w') as f:
            f.write(content)
        print(f"Updated {formula_path}")
    else:
        print(f"Error: {formula_path} not found")

def update_experimental(version, intel_hash, arm_hash):
    cask_path = "Casks/lce-emerald-launcher-experimental.rb"
    
    if os.path.exists(cask_path):
        with open(cask_path, 'r') as f:
            content = f.read()
            
        # Replace version
        content = re.sub(r'^\s*version\s+"[^"]+"', f'  version "{version}"', content, flags=re.MULTILINE)
        # Replace sha256 block
        content = re.sub(r'sha256\s+intel:\s+"[a-f0-9]+",\r?\n\s+arm:\s+"[a-f0-9]+"', 
                         f'sha256 intel: "{intel_hash}",\n         arm:   "{arm_hash}"', 
                         content)
        
        with open(cask_path, 'w') as f:
            f.write(content)
        print(f"Updated {cask_path}")
    else:
        print(f"Error: {cask_path} not found")

def main():
    parser = argparse.ArgumentParser(description="Update Homebrew Formula/Cask files")
    parser.add_argument("--type", choices=["stable" ], required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--intel-hash", required=True)
    parser.add_argument("--arm-hash", required=True)
    parser.add_argument("--linux-hash")
    
    args = parser.parse_args()
    
    if args.type == "stable":
        if not args.linux_hash:
            raise ValueError("--linux-hash is required for stable update")
        update_stable(args.version, args.intel_hash, args.arm_hash, args.linux_hash)
    elif args.type == "experimental":
        update_experimental(args.version, args.intel_hash, args.arm_hash)

if __name__ == "__main__":
    main()

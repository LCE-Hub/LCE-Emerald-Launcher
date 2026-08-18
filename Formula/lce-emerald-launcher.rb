class LceEmeraldLauncher < Formula
  desc "Minecraft Legacy Console Edition Launcher"
  homepage "https://github.com/LCE-Hub/LCE-Emerald-Launcher-cask"
  url "https://github.com/LCE-Hub/LCE-Emerald-Launcher/releases/download/v#{version}/LCE.Emerald.Launcher_#{version}_amd64.AppImage"
  sha256 "3f135df96014e6bf83ced13a89ba2ec4599532104e60aea97c45d1d246de62f2"
  version "1.6.1"
  license "GPL-3.0-only"

  depends_on :linux

  def install
    # Rename and install the AppImage
    bin.install "LCE.Emerald.Launcher_#{version}_amd64.AppImage" => "lce-emerald-launcher"
  end

  test do
    assert_predicate bin/"lce-emerald-launcher", :exist?
  end
end

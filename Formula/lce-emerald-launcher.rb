class LceEmeraldLauncher < Formula
  desc "Minecraft Legacy Console Edition Launcher"
  homepage "https://github.com/LCE-Hub/LCE-Emerald-Launcher-cask"
  url "https://github.com/LCE-Hub/LCE-Emerald-Launcher/releases/download/v#{version}/LCE.Emerald.Launcher_#{version}_amd64.AppImage"
  sha256 "9fe9f682d3461f46139c82ec59d768260ce44e907981f7a25a18f6e219da6a24"
  version "1.6.0"
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

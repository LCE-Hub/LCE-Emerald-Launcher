class LceEmeraldLauncher < Formula
  desc "Minecraft Legacy Console Edition Launcher"
  homepage "https://github.com/HuntedRaven7/LCE-Emerald-Launcher-cask"
  url "https://github.com/HuntedRaven7/LCE-Emerald-Launcher-cask/releases/download/v#{version}/LCE.Emerald.Launcher_#{version}_amd64.AppImage"
  sha256 "541271f927249fdfc4ada03b72110cdacaef388ed33b7d75724545145b8c412f"
  version "1.5.0"
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

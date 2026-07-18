cask "lce-emerald-launcher" do
  version "1.5.1"
  sha256 intel: "7826e105f283f22cb5784b7e0dd3c90b8fc493a636ca11333a4b867f3e1a9891",
         arm:   "e1c392213e0d34546f55971a1e381b942d2c896671576a18ab1db4ff1d4270b9"

  url "https://github.com/LCE-Hub/LCE-Emerald-Launcher-cask/releases/download/v#{version}/LCE.Emerald.Launcher_#{version}_#{arch}.dmg"
  name "LCE Emerald Launcher"
  desc "Minecraft Legacy Console Edition Launcher"
  homepage "https://github.com/HuntedRaven7/LCE-Emerald-Launcher-cask"

  app "LCE Emerald Launcher/LCE Emerald Launcher.app"

  zap trash: [
    "~/Library/Application Support/com.emerald.legacy",
    "~/Library/Preferences/com.emerald.legacy.plist",
    "~/Library/Saved Application State/com.emerald.legacy.savedState",
  ]
end

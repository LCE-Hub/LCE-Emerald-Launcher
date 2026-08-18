cask "lce-emerald-launcher" do
  version "1.6.0"
  sha256 intel: "777eef6ac4487a9988496552ae233cf7bd59cccbe3d1265691ef0ce698bc6ca0",
         arm:   "307cdfa5fc164fc0c4a09d41d111637c017ec65e665714624ef69b5b1c28f134"

  url "https://github.com/LCE-Hub/LCE-Emerald-Launcher/releases/download/v#{version}/LCE.Emerald.Launcher_#{version}_#{arch}.dmg"
  name "LCE Emerald Launcher"
  desc "Minecraft Legacy Console Edition Launcher"
  homepage "https://github.com/LCE-Hub/LCE-Emerald-Launcher"

  app "LCE Emerald Launcher/LCE Emerald Launcher.app"

  zap trash: [
    "~/Library/Application Support/com.emerald.legacy",
    "~/Library/Preferences/com.emerald.legacy.plist",
    "~/Library/Saved Application State/com.emerald.legacy.savedState",
  ]
end

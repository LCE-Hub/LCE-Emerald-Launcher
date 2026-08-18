cask "lce-emerald-launcher" do
  version "1.6.1"
  sha256 intel: "dd86c3f63088585f71ab94acd7c3e3ec0b535fc06ef71e7770741e08fe60782f",
         arm:   "e2e6c50a5b0b847ed7c857ab8a4ae421fa8666096f3c9fa8bb216f21639dcfd2"

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

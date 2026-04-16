import { useEffect } from "react";
import RpcService from "../services/RpcService";
interface DiscordRPCProps {
  rpcEnabled: boolean;
  showIntro: boolean;
  username: string;
  profile: string;
  activeView: string;
  isGameRunning: boolean;
  isWindowVisible: boolean;
  downloadProgress: number | null;
  downloadingId: string | null;
  editions: any[];
}

export function useDiscordRPC({
  rpcEnabled,
  showIntro,
  username,
  profile,
  activeView,
  isGameRunning,
  isWindowVisible,
  downloadProgress,
  downloadingId,
  editions,
}: DiscordRPCProps) {
  useEffect(() => {
    const updateRPC = async () => {
      if (!rpcEnabled || showIntro || !username) return;
      if (!isWindowVisible && !isGameRunning && downloadProgress === null)
        return;

      const version = editions.find((e) => e.id === profile);
      const versionName = version ? version.name : "Unknown Version";
      let details = "In Menus";
      let state = isGameRunning
        ? `Playing as ${username}`
        : `Logged in as ${username}`;

      if (isGameRunning) {
        details = `Playing ${versionName}`;
      } else if (downloadProgress !== null) {
        const downloadingName =
          editions.find((e) => e.id === downloadingId)?.name || "Game Files";
        details = `Downloading ${downloadingName} (${downloadProgress.toFixed(0)}%)`;
      } else {
        const tabNames: Record<string, string> = {
          main: "Main Menu",
          versions: "Selecting Version",
          settings: "In Settings",
          devtools: "Developing for LCE",
          skins: "Changing Skins",
          workshop: "Browsing Workshop",
        };
        details = tabNames[activeView] || "In Menus";
      }

      await RpcService.updateActivity(details, state, isGameRunning);
    };

    updateRPC();
  }, [
    rpcEnabled,
    showIntro,
    username,
    profile,
    activeView,
    isGameRunning,
    isWindowVisible,
    Math.floor(downloadProgress || 0),
    downloadingId,
    editions,
  ]);
}

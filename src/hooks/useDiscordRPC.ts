import { useEffect } from "react";
import RpcService from "../services/RpcService";
import type { Edition } from "../types/edition";
interface DiscordRPCProps {
  rpcEnabled: boolean;
  showIntro: boolean;
  username: string;
  profile: string;
  activeView: string;
  isGameRunning: boolean;
  isWindowVisible: boolean;
  downloadProgress: Record<string, number>;
  downloadingIds: string[];
  editions: Edition[];
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
  downloadingIds,
  editions,
}: DiscordRPCProps) {
  useEffect(() => {
    const updateRPC = async () => {
      if (!rpcEnabled || showIntro || !username) return;
      if (
        !isWindowVisible &&
        !isGameRunning &&
        Object.keys(downloadProgress).length === 0
      )
        return;
      const version = editions.find((e) => e.id === profile);
      const versionName = version ? version.name : "Unknown Version";
      let details = "In Menus";
      let state = isGameRunning
        ? `Playing as ${username}`
        : `Logged in as ${username}`;

      if (isGameRunning) {
        details = `Playing ${versionName}`;
      } else if (downloadingIds.length > 0) {
        const firstId = downloadingIds[0];
        const pct = downloadProgress[firstId];
        const downloadingName =
          editions.find((e) => e.id === firstId)?.name || "Game Files";
        const extra =
          downloadingIds.length > 1
            ? ` +${downloadingIds.length - 1} more`
            : "";
        details = `Downloading ${downloadingName}${extra} (${(pct ?? 0).toFixed(0)}%)`;
      } else {
        const tabNames: Record<string, string> = {
          main: "Main Menu",
          versions: "Selecting Version",
          settings: "In Settings",
          devtools: "Developing for LCE",
          skins: "Changing Skins",
          workshop: "Browsing Workshop",
          lceonline: "Browsing Friends",
          "pck-editor": "Editing a PCK file",
          "options-editor": "Editing Options Files",
          "arc-editor": "Editing an ARC file",
          "loc-editor": "Editing Localisation Files",
          screenshots: "Browsing Screenshots",
          "col-editor": "Editing Color Files",
          "grf-editor": "Editing Game Rules",
          "swf-editor": "Editing Game UI",
        };
        details = tabNames[activeView] || "In Menus";
      }

      await RpcService.updateActivity(details, state, isGameRunning, username);
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
    downloadProgress,
    downloadingIds,
    editions,
  ]);
}

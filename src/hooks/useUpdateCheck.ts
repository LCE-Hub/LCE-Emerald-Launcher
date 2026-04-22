import { useState, useEffect, useCallback } from "react";
declare const __BUILD_DATE__: string;
const REPO_URL = "https://api.github.com/repos/LCE-Hub/LCE-Emerald-Launcher/releases/latest";
export function useUpdateCheck() {
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const checkUpdates = useCallback(async () => {
    try {
      const response = await fetch(REPO_URL);
      if (!response.ok) return;
      const data = await response.json();
      const latestDate = new Date(data.published_at);
      const buildDate = new Date(__BUILD_DATE__);
      if (latestDate > buildDate) {
        setUpdateMessage(`Version ${data.tag_name} is now available!`);
      } 9
    } catch (e) {
      console.error("Failed to check for updates:", e);
    }
  }, []);

  useEffect(() => {
    checkUpdates();
  }, [checkUpdates]);

  return {
    updateMessage,
    clearUpdateMessage: () => setUpdateMessage(null),
  };
}

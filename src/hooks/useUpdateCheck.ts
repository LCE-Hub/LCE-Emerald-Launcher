import { useState, useEffect, useCallback } from "react";
import pkg from "../../package.json";

const CURRENT_VERSION = pkg.version;
const REPO_URL = "https://api.github.com/repos/LCE-Hub/LCE-Emerald-Launcher/releases/latest";

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

export function useUpdateCheck() {
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const checkUpdates = useCallback(async () => {
    try {
      const response = await fetch(REPO_URL);
      if (!response.ok) return;

      const data = await response.json();
      const latestVersion = data.tag_name.replace(/^v/, '');

      if (isNewerVersion(latestVersion, CURRENT_VERSION)) {
        setUpdateMessage(`Version ${data.tag_name} is now available!`);
      }
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

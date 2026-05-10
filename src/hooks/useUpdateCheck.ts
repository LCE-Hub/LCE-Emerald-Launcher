import { useState, useEffect, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
export function useUpdateCheck() {
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);
  const checkUpdates = useCallback(async () => {
    try {
      const update = await check();
      if (update) {
        setUpdateMessage(`Downloading update: ${update.version}...`);
        let downloaded = 0;
        let contentLength = 0;
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              setUpdateMessage(`Starting download of ${update.version}...`);
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                const percent = Math.round((downloaded / contentLength) * 100);
                setUpdateMessage(`Downloading update: ${percent}%`);
              }
              break;
            case 'Finished':
              setUpdateMessage(`Installing update...`);
              break;
          }
        });

        setUpdateMessage("Update installed. Restarting...");
        try {
          await relaunch();
        } catch (e) {
          console.warn("Could not relaunch immediately:", e);
        }
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
    updateUrl,
    clearUpdateMessage: () => setUpdateMessage(null),
  };
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { TauriService } from "../services/TauriService";
import { getCurrentWindow } from "@tauri-apps/api/window";
const BASE_EDITIONS = [
  {
    id: "legacy_evolved", //neo: yes. we're not changing the ID. that will break user data.
    name: "neoLegacy",
    desc: "Backporting newer title updates and Minigames back to LCE",
    url: "https://github.com/pieeebot/neoLegacy/releases/download/Nightly/neoLegacyWindows64.zip",
    titleImage: "/images/minecraft_title_neoLegacy.png",
    supportsSlimSkins: true,
    logo: "/images/neoLegacy.png"
  },
  {
    id: "revelations",
    name: "Legacy Revelations",
    desc: "QoL, performance, hardcore mode, & security features for LCE.",
    url: "https://github.com/itsRevela/LCE-Revelations/releases/download/Nightly/LCE-Revelations-Client-Win64.zip",
    titleImage: "/images/minecraft_title_revelations.png",
    supportsSlimSkins: false,
  },
  {
    id: "360revived",
    name: "360 Revived",
    desc: "PC port of Xbox 360 Edition TU19",
    url: "https://github.com/BluTac10/360Revived/releases/download/nightly/LCEWindows64.zip",
    titleImage: "/images/minecraft_title_360revived.png",
    supportsSlimSkins: false,
    logo: "/images/360_revived.png"
  }
];

const PARTNERSHIP_SERVERS = [
  {
    name: "Kowhaifans Clubhouse",
    ip: "lce.kowhaifan.net",
    port: 1026,
  },
];

interface GameManagerProps {
  profile: string;
  setProfile: (id: string) => void;
  customEditions: any[];
  setCustomEditions: (editions: any[]) => void;
}

export function useGameManager({
  profile,
  setProfile,
  customEditions,
  setCustomEditions,
}: GameManagerProps) {
  const [installs, setInstalls] = useState<string[]>([]);
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isRunnerDownloading, setIsRunnerDownloading] = useState(false);
  const [runnerDownloadProgress, setRunnerDownloadProgress] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const editions = useMemo(
    () => [...BASE_EDITIONS, ...customEditions],
    [customEditions],
  );

  const checkInstalls = useCallback(async () => {
    const results = await Promise.all(
      editions.map(async (e) => {
        const isInstalled = await TauriService.checkGameInstalled(e.id);
        return isInstalled ? e.id : null;
      }),
    );
    setInstalls(results.filter((id): id is string => id !== null));
  }, [editions]);

  useEffect(() => {
    checkInstalls();
    const unlistenDownload = TauriService.onDownloadProgress((p) =>
      setDownloadProgress(p),
    );
    const unlistenRunner = TauriService.onRunnerDownloadProgress((p) =>
      setRunnerDownloadProgress(p),
    );
    return () => {
      unlistenDownload.then((u) => u());
      unlistenRunner.then((u) => u());
    };
  }, [customEditions, checkInstalls]);

  const downloadRunner = useCallback(
    async (name: string, url: string) => {
      if (isRunnerDownloading) return;
      setIsRunnerDownloading(true);
      setRunnerDownloadProgress(0);
      setError(null);
      try {
        await TauriService.downloadRunner(name, url);
        setRunnerDownloadProgress(null);
      } catch (e: any) {
        console.error(e);
        setError(
          typeof e === "string" ? e : e.message || "Failed to download runner",
        );
      } finally {
        setIsRunnerDownloading(false);
      }
    },
    [isRunnerDownloading],
  );

  const toggleInstall = useCallback(
    async (id: string) => {
      if (downloadingId) return;
      const edition = editions.find((e) => e.id === id);
      if (!edition) return;
      setError(null);
      try {
        setDownloadingId(id);
        setDownloadProgress(0);
        await TauriService.downloadAndInstall(edition.url, id);
        await TauriService.syncDlc(id);
        await checkInstalls();
        setProfile(id);
        setDownloadProgress(null);
        setDownloadingId(null);
      } catch (e: any) {
        console.error(e);
        setError(
          typeof e === "string" ? e : e.message || "Failed to install version",
        );
        setDownloadProgress(null);
        setDownloadingId(null);
      }
    },
    [downloadingId, editions, checkInstalls, setProfile],
  );

  const handleUninstall = useCallback(
    async (id: string) => {
      await TauriService.deleteInstance(id);
      await checkInstalls();
    },
    [checkInstalls],
  );

  const handleCancelDownload = useCallback(async () => {
    if (!downloadingId) return;
    try {
      await TauriService.cancelDownload();
      await TauriService.deleteInstance(downloadingId);
      setDownloadingId(null);
      setDownloadProgress(null);
      await checkInstalls();
    } catch (e) {
      console.error(e);
    }
  }, [downloadingId, checkInstalls]);

  const handleLaunch = useCallback(async () => {
    if (isGameRunning) return;
    setError(null);
    setIsGameRunning(true);
    try {
      getCurrentWindow().minimize();
      await TauriService.launchGame(profile, PARTNERSHIP_SERVERS);
    } catch (e: any) {
      console.error(e);
      setError(
        typeof e === "string" ? e : e.message || "Failed to launch game",
      );
    } finally {
      setIsGameRunning(false);
    }
  }, [isGameRunning, profile]);

  const stopGame = useCallback(async () => {
    try {
      await TauriService.stopGame(profile);
      setIsGameRunning(false);
    } catch (e) {
      console.error(e);
    }
  }, [profile]);

  const addCustomEdition = useCallback(
    (edition: { name: string; desc: string; url: string }) => {
      const id = `custom_${Date.now()}`;
      const newEdition = {
        ...edition,
        id,
        titleImage: "/images/minecraft_title_tucustom.png",
      };
      setCustomEditions([...customEditions, newEdition]);
      return id;
    },
    [customEditions, setCustomEditions],
  );

  const deleteCustomEdition = useCallback(
    (id: string) => {
      setCustomEditions(customEditions.filter((e) => e.id !== id));
      TauriService.deleteInstance(id).catch(console.error);
    },
    [customEditions, setCustomEditions],
  );

  const updateCustomEdition = useCallback(
    (id: string, updated: { name: string; desc: string; url: string }) => {
      setCustomEditions(
        customEditions.map((e) => (e.id === id ? { ...e, ...updated } : e)),
      );
    },
    [customEditions, setCustomEditions],
  );

  return {
    installs,
    isGameRunning,
    downloadProgress,
    downloadingId,
    isRunnerDownloading,
    runnerDownloadProgress,
    error,
    setError,
    editions,
    toggleInstall,
    handleUninstall,
    handleCancelDownload,
    handleLaunch,
    stopGame,
    addCustomEdition,
    deleteCustomEdition,
    updateCustomEdition,
    downloadRunner,
    checkInstalls,
  };
}

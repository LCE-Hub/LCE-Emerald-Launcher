import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { TauriService, type CustomEdition } from "../services/TauriService";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Edition } from "../types/edition";

async function imageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
const BASE_EDITIONS = [
  {
    id: "legacy_evolved",
    name: "neoLegacy",
    desc: "Backporting newer title updates and Minigames back to LCE",
    url: "https://github.com/pieeebot/neoLegacy/releases/download/latest/neoLegacyWindows64.zip",
    titleImage: "/images/minecraft_title_neoLegacy.png",
    supportsSlimSkins: true,
    logo: "/images/neoLegacy.png",
    panorama: "legacy_evolved",
  },
  {
    id: "revelations",
    name: "Legacy Revelations",
    desc: "QoL, performance, hardcore mode, & security features for LCE.",
    url: "https://git.revela.dev/itsRevela/LCE-Revelations/releases/download/Nightly/LCE-Revelations-Client-Win64.zip",
    titleImage: "/images/minecraft_title_revelations.png",
    supportsSlimSkins: false,
    panorama: "vanilla_tu24",
  },
  {
    id: "360revived",
    name: "360 Revived",
    desc: "PC port of Xbox 360 Edition TU19",
    url: "https://github.com/BluTac10/360Revived/releases/download/nightly/LCEWindows64.zip",
    titleImage: "/images/minecraft_title_360revived.png",
    supportsSlimSkins: false,
    logo: "/images/360_revived.png",
    panorama: "360revived",
  },
  {
    id: "legacy_nether_fork",
    name: "Hellish Ends",
    desc: "QoL, Random additions, and Nether/End dimensions overhaul (Modded build!)",
    url: "https://github.com/deadvoxelx/ThatModdedRepo/releases/download/nightly/LCEWindows64.zip",
    titleImage: "/images/minecraft_title_hellishends.png",
    supportsSlimSkins: false,
    logo: "/images/netherrack_0.png",
    panorama: "vanilla_tu19",
  },
];

const PARTNERSHIP_SERVERS = [
  {
    name: "Kowhaifans Clubhouse",
    ip: "lce.kowhaifan.net",
    port: 25565,
  },
  {
    name: "Relic Network",
    ip: "lce.relicnetwork.xyz",
    port: 25565,
  },
];

interface GameManagerProps {
  profile: string;
  setProfile: (id: string) => void;
  customEditions: CustomEdition[];
  setCustomEditions: (editions: CustomEdition[]) => void;
  extraLaunchArgs?: string[];
}

function compareVersions(v1: string, v2: string) {
  const parts1 = v1.replace(/^v/, "").split(/[.-]/);
  const parts2 = v2.replace(/^v/, "").split(/[.-]/);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || "0";
    const p2 = parts2[i] || "0";
    const n1 = parseInt(p1);
    const n2 = parseInt(p2);
    if (!isNaN(n1) && !isNaN(n2)) {
      if (n1 !== n2) return n1 - n2;
    } else {
      if (p1 !== p2) return p1 > p2 ? 1 : -1;
    }
  }
  return 0;
}

export function useGameManager({
  profile,
  setProfile,
  customEditions,
  setCustomEditions,
  extraLaunchArgs,
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
  const [gameUpdateMessage, setGameUpdateMessage] = useState<string | null>(
    null,
  );
  const [steamSuccessMessage, setSteamSuccessMessage] = useState<string | null>(
    null,
  );
  const [dynamicUrls, setDynamicUrls] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Record<string, string[]>>({});
  const [selectedBranches, setSelectedBranches] = useState<
    Record<string, string>
  >({});
  const branchesFetched = useRef<Set<string>>(new Set());
  const initialBranchesSet = useRef(false);

  useEffect(() => {
    if (initialBranchesSet.current || !profile) return;
    BASE_EDITIONS.forEach((e) => {
      if (profile.startsWith(e.id + "_")) {
        const branch = profile.replace(e.id + "_", "");
        setSelectedBranches((prev) => ({ ...prev, [e.id]: branch }));
      } else if (profile === e.id) {
        setSelectedBranches((prev) => ({ ...prev, [e.id]: "Stable" }));
      }
    });
    initialBranchesSet.current = true;
  }, [profile]);

  useEffect(() => {
    async function fetchLatestReleases() {
      try {
        const response = await fetch(
          "https://api.github.com/repos/pieeebot/neoLegacy/releases/latest",
        );
        if (response.ok) {
          const data = await response.json();
          const asset = data.assets.find(
            (a: { name: string }) => a.name === "neoLegacyWindows64.zip",
          );
          if (asset) {
            setDynamicUrls((prev) => ({
              ...prev,
              legacy_evolved: asset.browser_download_url,
            }));
          }
        }
      } catch (e) {
        console.error("Failed to fetch latest releases:", e);
      }
    }
    fetchLatestReleases();
  }, []);

  const fetchBranchesForEdition = useCallback(
    async (editionId: string, url: string) => {
      if (branchesFetched.current.has(editionId)) return;
      if (!url.includes("github.com")) return;
      const parts = url.split("github.com/")[1].split("/");
      const owner = parts[0];
      const repo = parts[1];
      try {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/releases`,
        );
        if (response.ok) {
          const data = await response.json();
          let tags: string[] = data
            .map((r: { tag_name: string }) => r.tag_name)
            .filter((t: string) => !t.toLowerCase().includes("server"));

          const vTags = tags
            .filter((t) => t.startsWith("v"))
            .sort(compareVersions);
          const bestVTag = vTags[vTags.length - 1];
          if (!tags.includes("Stable")) tags.unshift("Stable");
          if (bestVTag) {
            setDynamicUrls((prev) => ({
              ...prev,
              [`${editionId}_Stable`]: bestVTag,
            }));
          }

          setBranches((prev) => ({ ...prev, [editionId]: tags }));
          branchesFetched.current.add(editionId);
        }
      } catch (e) {
        console.error(`Failed to fetch branches for ${editionId}:`, e);
      }
    },
    [],
  );

  useEffect(() => {
    BASE_EDITIONS.forEach((e) => fetchBranchesForEdition(e.id, e.url));
  }, [fetchBranchesForEdition]);

  const cycleBranch = useCallback(
    (editionId: string) => {
      const available = branches[editionId] || ["Stable"];
      if (available.length <= 1) return;
      setSelectedBranches((prev) => {
        const current = prev[editionId] || available[0];
        let currentIndex = available.indexOf(current);
        let nextIndex = currentIndex;
        let nextBranch = current;
        do {
          nextIndex = (nextIndex + 1) % available.length;
          nextBranch = available[nextIndex];
        } while (nextBranch.startsWith("v") && nextIndex !== currentIndex);
        const oldInstanceId =
          current === "Stable" ? editionId : `${editionId}_${current}`;
        const newInstanceId =
          nextBranch === "Stable" ? editionId : `${editionId}_${nextBranch}`;
        if (profile === oldInstanceId) {
          setProfile(newInstanceId);
        }
        return { ...prev, [editionId]: nextBranch };
      });
    },
    [branches, profile, setProfile],
  );

  const editions = useMemo((): Edition[] => {
    return [
      ...BASE_EDITIONS.map((e) => {
        const availableBranches = branches[e.id] || ["Stable"];
        const selectedBranch = selectedBranches[e.id] || availableBranches[0];
        let url = dynamicUrls[e.id] || e.url;
        const defaultBranchFromUrl = e.url.includes("/releases/download/")
          ? e.url.split("/releases/download/")[1].split("/")[0]
          : "nightly";
        const branchToUse =
          selectedBranch === "Stable"
            ? dynamicUrls[`${e.id}_Stable`] || defaultBranchFromUrl
            : selectedBranch;
        if (e.url.includes("github.com")) {
          const baseUrl = e.url.split("/releases/download/")[0];
          const filename = e.url.split("/").pop();
          url = `${baseUrl}/releases/download/${branchToUse}/${filename}`;
        }

        return {
          ...e,
          url,
          branches: availableBranches,
          selectedBranch,
          instanceId:
            selectedBranch === "Stable" ? e.id : `${e.id}_${selectedBranch}`,
        };
      }),
      ...customEditions.map((e) => ({ ...e, instanceId: e.id })),
    ];
  }, [customEditions, dynamicUrls, branches, selectedBranches]);

  const checkInstalls = useCallback(async () => {
    const results = await Promise.all(
      editions.map(async (e) => {
        const isInstalled = await TauriService.checkGameInstalled(e.instanceId);
        return isInstalled ? e.instanceId : null;
      }),
    );
    setInstalls(results.filter((id): id is string => id !== null));
  }, [editions]);

  const [updatesAvailable, setUpdatesAvailable] = useState<
    Record<string, boolean>
  >({});
  const checkForGameUpdates = useCallback(async () => {
    const checks = await Promise.all(
      editions.map(async (edition) => {
        if (!installs.includes(edition.instanceId))
          return [edition.instanceId, false] as const;
        try {
          const isUpdate = await TauriService.checkGameUpdate(
            edition.instanceId,
            edition.url,
          );
          return [edition.instanceId, isUpdate] as const;
        } catch (e) {
          console.error(e);
          return [edition.instanceId, false] as const;
        }
      }),
    );

    const newUpdates: Record<string, boolean> = {};
    for (const [id, hasUpdate] of checks) {
      newUpdates[id as string] = hasUpdate as boolean;
    }
    setUpdatesAvailable(newUpdates);

    const updatedGames = editions.filter((e) => newUpdates[e.id]);
    if (updatedGames.length > 0) {
      if (updatedGames.length === 1) {
        setGameUpdateMessage(
          `An update is available for ${updatedGames[0].name}!`,
        );
      } else {
        setGameUpdateMessage(
          `Updates are available for ${updatedGames.length} versions!`,
        );
      }
    } else {
      setGameUpdateMessage(null);
    }
  }, [editions, installs]);

  useEffect(() => {
    checkForGameUpdates();
  }, [profile, installs, checkForGameUpdates]);

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
      } catch (e: unknown) {
        console.error(e);
        setError(
          e instanceof Error ? e.message : typeof e === "string" ? e : "Failed to download runner",
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
      const edition = editions.find((e) => e.instanceId === id);
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
      } catch (e: unknown) {
        console.error(e);
        setError(
          e instanceof Error ? e.message : typeof e === "string" ? e : "Failed to install version",
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
      await TauriService.launchGame(profile, PARTNERSHIP_SERVERS, extraLaunchArgs);
    } catch (e: unknown) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : typeof e === "string" ? e : "Failed to launch game",
      );
    } finally {
      setIsGameRunning(false);
    }
  }, [isGameRunning, profile, extraLaunchArgs]);

  const stopGame = useCallback(async () => {
    try {
      await TauriService.stopGame(profile);
      setIsGameRunning(false);
    } catch (e) {
      console.error(e);
    }
  }, [profile]);

  const addCustomEdition = useCallback(
    (edition: {
      name: string;
      desc: string;
      url: string;
      path?: string;
      category?: string[];
      logo?: string;
      id?: string;
    }) => {
      const id = edition.id || `custom_${Date.now()}`;
      const newEdition = {
        ...edition,
        id,
        titleImage: "/images/MenuTitle.png",
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
    (
      id: string,
      updated: { name: string; desc: string; url: string; path?: string },
    ) => {
      setCustomEditions(
        customEditions.map((e) => (e.id === id ? { ...e, ...updated } : e)),
      );
    },
    [customEditions, setCustomEditions],
  );

  const addToSteam = useCallback(
    async (
      id: string,
      name: string,
      titleImage: string,
      panoramaImage: string,
    ) => {
      try {
        const titleBase64 = await imageUrlToBase64(titleImage);
        const panoramaBase64 = await imageUrlToBase64(panoramaImage);
        await TauriService.addToSteam(id, name, titleBase64, panoramaBase64);
        setSteamSuccessMessage(
          `Added ${name} to Steam! (Restart Steam to see it)`,
        );
      } catch (e: unknown) {
        console.error(e);
        setError(
          e instanceof Error ? e.message : typeof e === "string" ? e : "Failed to add to Steam",
        );
      }
    },
    [setError, setSteamSuccessMessage],
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
    gameUpdateMessage,
    setGameUpdateMessage,
    steamSuccessMessage,
    setSteamSuccessMessage,
    updatesAvailable,
    addToSteam,
    cycleBranch,
  };
}

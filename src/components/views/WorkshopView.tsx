import React, {
  useState,
  useEffect,
  memo,
  useCallback,
  useRef,
  useContext,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import {
  useUI,
  useAudio,
  useConfig,
  GameContext,
  useGame,
} from "../../context/LauncherContext";
import {
  TauriService,
  InstalledWorkshopPackage,
  type CustomEdition,
} from "../../services/TauriService";
import { PluginManager } from "../../plugins/PluginManager";
const REGISTRY_URL =
  "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/registry.json";
const VERSIONS_URL =
  "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/versions.json";
const PLUGINS_URL =
  "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/plugins.json";
const RAW_BASE =
  "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main";
const VERSIONS_BASE =
  "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/.00versions";
//const PLUGINS_BASE =
//  "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/.00plugins";
const LCEONLINE_BASE = "https://api.mclegacyedition.xyz";
const CATEGORY_TABS = [
  "Skin",
  "Texture",
  "World",
  "Mod",
  "DLC",
  "Plugins",
] as const;
const UTILITY_TABS = ["Versions", "Installed", "Search"] as const;
const SERVER_TABS = ["Server", "Server Plugins"] as const;
const ALL_TABS = [...CATEGORY_TABS, ...UTILITY_TABS, ...SERVER_TABS] as const;
type TabType = (typeof ALL_TABS)[number];
interface RegistryPackage {
  id: string;
  name: string;
  author: string;
  description: string;
  extended_description?: string;
  category: string[];
  thumbnail: string;
  zips?: Record<string, string>;
  version: string;
  logo?: string;
  url?: string;
  likes?: number;
  download_count?: number;
  game_version?: string;
  github_url?: string;
  download_url?: string;
  file_size?: number;
  server_address?: string;
  server_discord?: string;
  server_type?: string;
  main?: string;
  permissions?: string[];
  files?: string[];
}

interface ServerListing {
  id: string;
  owner: string;
  name: string;
  short_descripton: string
  description: string;
  discord?: string;
  version: string;
  type: string;
  ip: string;
  port: string;
  icon: string;
}

interface LCEOnlineAddon {
  id: string;
  name: string;
  short_description: string;
  description: string;
  category: string;
  game_version: string;
  github_url?: string;
  created_at: string;
  likes: number;
  downloads: number;
  download_url: string;
  file_size: number;
  icon: string;
  has_icon: boolean;
  author: string;
}

interface PluginRegistryEntry {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  extended_description?: string;
  main: string;
  permissions?: string[];
  files?: string[];
}

const COLS = 4;
interface WorkshopViewProps {
  workshopTarget?: { id: string; type?: string } | null;
  onClearWorkshopTarget?: () => void;
}
const WorkshopView = memo(function WorkshopView({
  workshopTarget,
  onClearWorkshopTarget,
}: WorkshopViewProps) {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const config = useConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>("Skin");
  const [allPackages, setAllPackages] = useState<RegistryPackage[]>([]);
  const [versionPackages, setVersionPackages] = useState<RegistryPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPkg, setSelectedPkg] = useState<RegistryPackage | null>(null);
  const [installedPkgs, setInstalledPkgs] = useState<
    InstalledWorkshopPackage[]
  >([]);
  const [serverPlugins, setServerPlugins] = useState<RegistryPackage[]>([]);
  const [serverCategory, setServerCategory] = useState<string>("all");
  const [serverListings, setServerListings] = useState<RegistryPackage[]>([]);
  const [serverListingCategory, setServerListingCategory] =
    useState<string>("all");
  const [savedServers, setSavedServers] = useState<Set<string>>(new Set());
  const [pluginPackages, setPluginPackages] = useState<RegistryPackage[]>([]);
  const [installedPluginIds, setInstalledPluginIds] = useState<Set<string>>(
    new Set(),
  );
  const refreshInstalled = useCallback(async () => {
    try {
      const data = await TauriService.workshopListInstalled();
      setInstalledPkgs(data);
    } catch {
      setInstalledPkgs([]);
    }
  }, []);

  const refreshInstalledPlugins = useCallback(() => {
    const ids = new Set<string>();
    PluginManager.instance.plugins.forEach((_, id) => ids.add(id));
    setInstalledPluginIds(ids);
  }, []);

  useEffect(() => {
    containerRef.current?.focus();
    refreshInstalled();
  }, [refreshInstalled]);

  useEffect(() => {
    TauriService.loadConfig()
      .then((cfg) => {
        setSavedServers(new Set((cfg.savedServers || []).map((s) => s.ip)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(REGISTRY_URL).then((r) => r.json()),
      fetch(VERSIONS_URL).then((r) => r.json()),
      fetch(PLUGINS_URL)
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([registryData, versionsData, pluginsData]) => {
        setAllPackages(registryData.packages ?? []);
        setVersionPackages(versionsData.versionlist ?? []);
        if (pluginsData?.pluginlist) {
          setPluginPackages(
            pluginsData.pluginlist.map((entry: PluginRegistryEntry) => ({
              id: entry.id,
              name: entry.name,
              version: entry.version,
              author: entry.author,
              description: entry.description,
              extended_description: entry.extended_description || "",
              category: ["Plugin"],
              thumbnail: "",
              main: entry.main,
              permissions: entry.permissions,
              files: entry.files,
            })),
          );
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message ?? "Failed to load registry");
        setLoading(false);
      });
    refreshInstalledPlugins();
  }, [refreshInstalledPlugins]);

  useEffect(() => {
    fetch(`${LCEONLINE_BASE}/plugins`)
      .then((r) => r.json())
      .then((data: LCEOnlineAddon[]) => {
        setServerPlugins(
          data.map((a) => ({
            id: a.id,
            name: a.name,
            author: a.author,
            description: a.short_description,
            extended_description: a.description,
            category: [a.category],
            thumbnail: a.icon,
            version: "1.0",
            likes: a.likes,
            download_count: a.downloads,
            game_version: a.game_version,
            github_url: a.github_url,
            download_url: a.download_url,
            file_size: a.file_size,
          })),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${LCEONLINE_BASE}/servers`)
      .then((r) => r.json())
      .then((data: ServerListing[]) => {
        setServerListings(
          data.map((s) => ({
            id: s.id,
            name: s.name,
            author: s.owner,
            description: s.ip,
            extended_description: `**Server:** ${s.type}\n**Version:** ${s.version}\n**Owner:** ${s.owner}`,
            category: [s.type],
            thumbnail: s.icon,
            version: s.version,
            server_address: s.ip,
            server_discord: s.discord ?? "",
            server_type: s.type,
          })),
        );
      })
      .catch(() => {});
  }, []);

  const serverCategories = useMemo(() => {
    const cats = new Set(serverPlugins.flatMap((p) => p.category));
    return ["all", ...cats];
  }, [serverPlugins]);

  const serverListingCategories = useMemo(() => {
    const cats = new Set(serverListings.flatMap((p) => p.category));
    return ["all", ...cats];
  }, [serverListings]);

  const getInstalledEntries = useCallback(
    (pkgId: string, pkgVersion?: string) => {
      if (activeTab === "Versions") {
        const isAdded = config.customEditions?.some(
          (e: CustomEdition) =>
            e.id === pkgId ||
            e.url === versionPackages.find((p) => p.id === pkgId)?.url,
        );
        if (isAdded) {
          const vPkg = versionPackages.find((p) => p.id === pkgId);
          return [
            {
              packageId: pkgId,
              instanceId: pkgId,
              version: vPkg?.version || "0.0.0",
            },
          ] as InstalledWorkshopPackage[];
        }
        return [];
      }
      if (activeTab === "Plugins") {
        return installedPluginIds.has(pkgId)
          ? ([
              {
                packageId: pkgId,
                instanceId: pkgId,
                version: pkgVersion || "0.0.0",
              },
            ] as InstalledWorkshopPackage[])
          : [];
      }
      if (activeTab === "Server Plugins" || activeTab === "Server") return [];
      return installedPkgs.filter((p) => p.packageId === pkgId);
    },
    [
      installedPkgs,
      activeTab,
      config.customEditions,
      versionPackages,
      installedPluginIds,
    ],
  );

  const isInstalled = useCallback(
    (pkgId: string) => {
      if (activeTab === "Plugins") return installedPluginIds.has(pkgId);
      if (activeTab === "Server Plugins" || activeTab === "Server")
        return false;
      if (activeTab === "Versions") {
        return (
          config.customEditions?.some(
            (e: CustomEdition) =>
              e.id === pkgId ||
              e.url === versionPackages.find((p) => p.id === pkgId)?.url,
          ) ?? false
        );
      }
      return installedPkgs.some((p) => p.packageId === pkgId);
    },
    [
      installedPkgs,
      activeTab,
      config.customEditions,
      versionPackages,
      installedPluginIds,
    ],
  );

  const hasUpdate = useCallback(
    (pkg: RegistryPackage) => {
      if (activeTab === "Plugins") {
        return false;
      }
      if (
        activeTab === "Versions" ||
        activeTab === "Server Plugins" ||
        activeTab === "Server"
      )
        return false;
      const entries = installedPkgs.filter((p) => p.packageId === pkg.id);
      return (
        entries.length > 0 && entries.some((e) => e.version !== pkg.version)
      );
    },
    [installedPkgs, activeTab],
  );

  const installedPackageList = allPackages.filter((pkg) => isInstalled(pkg.id));
  const filteredItems =
    activeTab === "Installed"
      ? search.trim()
        ? installedPackageList.filter((pkg) => {
            const q = search.toLowerCase();
            return (
              pkg.name.toLowerCase().includes(q) ||
              pkg.author.toLowerCase().includes(q) ||
              pkg.description.toLowerCase().includes(q)
            );
          })
        : installedPackageList
      : activeTab === "Server Plugins"
        ? search.trim()
          ? serverPlugins.filter((pkg) => {
              if (
                serverCategory !== "all" &&
                !pkg.category.includes(serverCategory)
              )
                return false;
              const q = search.toLowerCase();
              return (
                pkg.name.toLowerCase().includes(q) ||
                pkg.author.toLowerCase().includes(q) ||
                pkg.description.toLowerCase().includes(q)
              );
            })
          : serverCategory === "all"
            ? serverPlugins
            : serverPlugins.filter((pkg) =>
                pkg.category.includes(serverCategory),
              )
        : activeTab === "Server"
          ? search.trim()
            ? serverListings.filter((pkg) => {
                if (
                  serverListingCategory !== "all" &&
                  !pkg.category.includes(serverListingCategory)
                )
                  return false;
                const q = search.toLowerCase();
                return (
                  pkg.name.toLowerCase().includes(q) ||
                  pkg.author.toLowerCase().includes(q) ||
                  pkg.description.toLowerCase().includes(q)
                );
              })
            : serverListingCategory === "all"
              ? serverListings
              : serverListings.filter((pkg) =>
                  pkg.category.includes(serverListingCategory),
                )
          : activeTab === "Plugins"
            ? search.trim()
              ? pluginPackages.filter((pkg) => {
                  const q = search.toLowerCase();
                  return (
                    pkg.name.toLowerCase().includes(q) ||
                    pkg.author.toLowerCase().includes(q) ||
                    pkg.description.toLowerCase().includes(q)
                  );
                })
              : pluginPackages
            : (activeTab === "Versions" ? versionPackages : allPackages).filter(
                (pkg) => {
                  const matchesTab =
                    activeTab === "Search" || activeTab === "Versions"
                      ? true
                      : pkg.category.includes(activeTab);
                  if (!matchesTab) return false;
                  if (!search.trim())
                    return activeTab === "Search" ? false : true;
                  const q = search.toLowerCase();
                  return (
                    pkg.name.toLowerCase().includes(q) ||
                    pkg.author.toLowerCase().includes(q) ||
                    pkg.description.toLowerCase().includes(q)
                  );
                },
              );

  useEffect(() => {
    setFocusedIdx(null);
    if (activeTab === "Search") {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [activeTab]);

  useEffect(() => {
    if (focusedIdx !== null && gridRef.current) {
      const el = gridRef.current.querySelector(
        `[data-card="${focusedIdx}"]`,
      ) as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIdx]);

  const cycleTab = useCallback(
    (direction: "next" | "prev") => {
      playPressSound();
      setActiveTab((prev) => {
        const idx = ALL_TABS.indexOf(prev);
        if (direction === "next") return ALL_TABS[(idx + 1) % ALL_TABS.length];
        return ALL_TABS[(idx - 1 + ALL_TABS.length) % ALL_TABS.length];
      });
    },
    [playPressSound],
  );

  const selectTab = useCallback(
    (tab: TabType) => {
      if (tab !== activeTab) {
        playPressSound();
        setActiveTab(tab);
      }
    },
    [activeTab, playPressSound],
  );

  const openModal = useCallback(
    (pkg: RegistryPackage) => {
      playPressSound();
      setSelectedPkg(pkg);
    },
    [playPressSound],
  );

  const closeModal = useCallback(() => {
    playBackSound();
    setSelectedPkg(null);
  }, [playBackSound]);

  useEffect(() => {
    if (!workshopTarget || loading) return;

    if (
      workshopTarget.type === "lceonline" && serverPlugins.length === 0
    )
      return;
    if (
      workshopTarget.type === "plugin" && pluginPackages.length === 0
    )
      return;
    if (
      workshopTarget.type === "version" && versionPackages.length === 0
    )
      return;
    if (!workshopTarget.type && allPackages.length === 0) return;

    let pkg: RegistryPackage | undefined;
    let tab: TabType | undefined;

    switch (workshopTarget.type) {
      case "lceonline":
        pkg = serverPlugins.find((p) => p.id === workshopTarget.id);
        tab = "Server Plugins";
        break;
      case "plugin":
        pkg = pluginPackages.find((p) => p.id === workshopTarget.id);
        tab = "Plugins";
        break;
      case "version":
        pkg = versionPackages.find((p) => p.id === workshopTarget.id);
        tab = "Versions";
        break;
      default:
        pkg = allPackages.find((p) => p.id === workshopTarget.id);
        if (!pkg) {
          pkg = versionPackages.find((p) => p.id === workshopTarget.id);
          if (pkg) tab = "Versions";
        }
        if (!pkg) {
          pkg = serverPlugins.find((p) => p.id === workshopTarget.id);
          if (pkg) tab = "Server Plugins";
        }
        if (!pkg) {
          pkg = serverListings.find((p) => p.id === workshopTarget.id);
          if (pkg) tab = "Server";
        }
        if (!pkg) {
          pkg = pluginPackages.find((p) => p.id === workshopTarget.id);
          if (pkg) tab = "Plugins";
        }
        break;
    }

    if (pkg) {
      if (tab) setActiveTab(tab);
      openModal(pkg);
      onClearWorkshopTarget?.();
    }
  }, [
    workshopTarget,
    loading,
    allPackages,
    serverPlugins,
    pluginPackages,
    versionPackages,
    serverListings,
    openModal,
    onClearWorkshopTarget,
  ]);

  const toggleSavedServer = useCallback(async (serverPkg: RegistryPackage) => {
    if (!serverPkg.server_address) return;
    const cfg = await TauriService.loadConfig();
    const current = cfg.savedServers || [];
    const exists = current.some((s) => s.ip === serverPkg.server_address);
    const newSaved = exists
      ? current.filter((s) => s.ip !== serverPkg.server_address)
      : [
          ...current,
          { name: serverPkg.name, ip: serverPkg.server_address, port: 25565 },
        ];
    await TauriService.saveConfig({ ...cfg, savedServers: newSaved });
    setSavedServers(new Set(newSaved.map((s) => s.ip)));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedPkg) return;

      const isSearchInput = document.activeElement === searchRef.current;
      if (isSearchInput) {
        if (e.key === "Escape") {
          setSearch("");
          containerRef.current?.focus();
        }
        return;
      }

      const count = filteredItems.length;
      if (e.key === "Escape" || e.key === "Backspace") {
        playBackSound();
        setActiveView("main");
        return;
      }
      if (e.key === "e" || e.key === "E") {
        cycleTab("next");
        return;
      }
      if (e.key === "q" || e.key === "Q") {
        cycleTab("prev");
        return;
      }

      if (count === 0) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusedIdx((p) => Math.min((p ?? -1) + 1, count - 1));
        playPressSound();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedIdx((p) => Math.max((p ?? 1) - 1, 0));
        playPressSound();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((p) =>
          Math.min((p ?? -1) + (isPluginTab ? 1 : COLS), count - 1),
        );
        playPressSound();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((p) => Math.max((p ?? 1) - (isPluginTab ? 1 : COLS), 0));
        playPressSound();
      } else if (e.key === "Enter" && focusedIdx !== null) {
        const pkg = filteredItems[focusedIdx];
        if (pkg) openModal(pkg);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    playBackSound,
    playPressSound,
    setActiveView,
    cycleTab,
    filteredItems,
    focusedIdx,
    selectedPkg,
    openModal,
  ]);

  const isSearchTab = activeTab === "Search";
  const isInstalledTab = activeTab === "Installed";
  const isVersionTab = activeTab === "Versions";
  const isPluginTab = activeTab === "Plugins";
  const showSearch =
    isSearchTab ||
    isInstalledTab ||
    isVersionTab ||
    isPluginTab ||
    activeTab === "Server Plugins" ||
    activeTab === "Server";
  return (
    <motion.div
      ref={containerRef}
      tabIndex={0}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: config.animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full h-full max-h-full relative font-['Mojangles'] text-white select-none outline-none focus:outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-4 mb-6 border-b-2 border-[#373737] pb-2 w-[30%] max-w-[250px] text-center tracking-widest uppercase opacity-80 font-bold whitespace-nowrap px-4">
        Workshop
      </h2>

      <div className="flex items-center justify-center gap-0 mb-4 w-full px-4">
        <div
          className="flex items-center gap-1 px-[11px] py-1 rounded-sm bg-[#696969] border-2 border-black"
          style={{ boxShadow: "inset 0 0 0 2px #fff" }}
        >
          {CATEGORY_TABS.map((tab, i) => {
            const isActive = tab === activeTab;
            return (
              <React.Fragment key={tab}>
                {i > 0 && <div className="w-[2px] h-5 bg-[#777] shrink-0" />}
                <button
                  onClick={() => selectTab(tab)}
                  className={`relative h-8 px-3 text-xs mc-text-shadow tracking-widest border-none outline-none cursor-pointer transition-colors rounded-sm ${
                    isActive
                      ? "text-[#FFFF55] bg-[#FFFF55]/10 shadow-[0_0_12px_rgba(255,255,85,0.15)]"
                      : "text-[#aaa] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div
          className="flex items-center gap-1 px-[11px] py-1 ml-3 rounded-sm bg-[#696969] border-2 border-black"
          style={{ boxShadow: "inset 0 0 0 2px #fff" }}
        >
          {UTILITY_TABS.map((tab, i) => {
            const isActive = tab === activeTab;
            const updateCount =
              tab === "Installed"
                ? allPackages.filter((p) => hasUpdate(p)).length
                : 0;
            return (
              <React.Fragment key={tab}>
                {i > 0 && <div className="w-[2px] h-5 bg-[#777] shrink-0" />}
                <button
                  onClick={() => selectTab(tab)}
                  className={`relative h-8 px-3 text-xs mc-text-shadow tracking-widest border-none outline-none cursor-pointer transition-colors rounded-sm ${
                    isActive
                      ? "text-[#FFFF55] bg-[#FFFF55]/10 shadow-[0_0_12px_rgba(255,255,85,0.15)]"
                      : "text-[#aaa] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.toUpperCase()}
                  {updateCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-[#FF5555] text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center font-bold mc-text-shadow border border-[#AA0000]">
                      {updateCount}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div
          className="flex items-center gap-1 px-[11px] py-1 ml-3 rounded-sm bg-[#696969] border-2 border-black"
          style={{ boxShadow: "inset 0 0 0 2px #fff" }}
        >
          {SERVER_TABS.map((tab, i) => {
            const isActive = tab === activeTab;
            return (
              <React.Fragment key={tab}>
                {i > 0 && <div className="w-[2px] h-5 bg-[#777] shrink-0" />}
                <button
                  onClick={() => selectTab(tab)}
                  className={`relative h-8 px-3 text-xs mc-text-shadow tracking-widest border-none outline-none cursor-pointer transition-colors rounded-sm ${
                    isActive
                      ? "text-[#FFFF55] bg-[#FFFF55]/10 shadow-[0_0_12px_rgba(255,255,85,0.15)]"
                      : "text-[#aaa] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="w-[98%] max-w-6xl flex-1 relative overflow-hidden mc-options-bg">
        {showSearch ? (
          <div className="absolute inset-0 flex flex-col pt-2">
            <div className="flex items-center gap-3 px-6 pb-4">
              <div
                className="flex items-center flex-1 h-12 px-4 border-2 border-[#444] bg-black/40 rounded shadow-inner"
                style={{
                  backgroundImage: "url('/images/Button_Background2.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setFocusedIdx(null);
                  }}
                  placeholder={
                    isInstalledTab
                      ? "FILTER INSTALLED..."
                      : isVersionTab
                        ? "FILTER VERSIONS..."
                        : isPluginTab
                          ? "FILTER PLUGINS..."
                          : activeTab === "Server Plugins"
                            ? "FILTER PLUGINS..."
                            : activeTab === "Server"
                              ? "FILTER SERVERS..."
                              : "ENTER KEYWORDS..."
                  }
                  spellCheck={false}
                  autoFocus={isSearchTab}
                  className="bg-transparent border-none outline-none text-white text-lg mc-text-shadow w-full placeholder-white/40 font-['Mojangles'] tracking-widest"
                />
                {search && (
                  <button
                    onClick={() => {
                      setSearch("");
                      searchRef.current?.focus();
                    }}
                    className="text-white/60 hover:text-white text-lg ml-2 bg-transparent border-none outline-none cursor-pointer mc-text-shadow"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            {activeTab === "Server Plugins" && serverCategories.length > 1 && (
              <div className="flex items-center gap-2 px-6 pb-3 overflow-x-auto scroll-smooth">
                {serverCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setServerCategory(cat)}
                    className={`px-3 py-1 text-xs mc-text-shadow uppercase tracking-widest border outline-none cursor-pointer whitespace-nowrap transition-all ${
                      serverCategory === cat
                        ? "text-[#FFFF55] bg-black/60 border-[#FFFF55]"
                        : "text-[#A0A0A0] bg-black/30 border-[#444] hover:text-white hover:border-[#888]"
                    }`}
                  >
                    {cat === "all" ? "ALL" : cat.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {activeTab === "Server" && serverListingCategories.length > 1 && (
              <div className="flex items-center gap-2 px-6 pb-3 overflow-x-auto scroll-smooth">
                {serverListingCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setServerListingCategory(cat)}
                    className={`px-3 py-1 text-xs mc-text-shadow uppercase tracking-widest border outline-none cursor-pointer whitespace-nowrap transition-all ${
                      serverListingCategory === cat
                        ? "text-[#FFFF55] bg-black/60 border-[#FFFF55]"
                        : "text-[#A0A0A0] bg-black/30 border-[#444] hover:text-white hover:border-[#888]"
                    }`}
                  >
                    {cat === "all" ? "ALL" : cat.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <div
              ref={gridRef}
              className="flex-1 overflow-y-auto p-6 scroll-smooth"
            >
              {isInstalledTab && !search.trim() && filteredItems.length > 0 && (
                <div className="flex items-center justify-center gap-3 mb-4 pb-3 border-b border-[#333]">
                  <button
                    onClick={async () => {
                      const updates = filteredItems.filter((p) => hasUpdate(p));
                      if (updates.length === 0) return;
                      playPressSound();
                      for (const pkg of updates) {
                        const entries = installedPkgs.filter(
                          (p) => p.packageId === pkg.id,
                        );
                        for (const entry of entries) {
                          try {
                            await TauriService.workshopInstall(
                              entry.instanceId,
                              pkg.id,
                              pkg.zips!,
                              pkg.version,
                            );
                          } catch (e) {
                            console.error(e);
                          }
                        }
                      }
                      refreshInstalled();
                    }}
                    className="h-8 px-4 flex items-center justify-center text-sm mc-text-shadow border border-[#555] text-[#FFFF55]"
                    style={{
                      backgroundImage: "url('/images/Button_Background.png')",
                      backgroundSize: "100% 100%",
                      imageRendering: "pixelated",
                    }}
                  >
                    Update All (
                    {filteredItems.filter((p) => hasUpdate(p)).length})
                  </button>
                  <button
                    onClick={async () => {
                      if (filteredItems.length === 0) return;
                      playPressSound();
                      for (const pkg of filteredItems) {
                        const entries = installedPkgs.filter(
                          (p) => p.packageId === pkg.id,
                        );
                        for (const entry of entries) {
                          try {
                            await TauriService.workshopInstall(
                              entry.instanceId,
                              pkg.id,
                              pkg.zips!,
                              pkg.version,
                            );
                          } catch (e) {
                            console.error(e);
                          }
                        }
                      }
                      refreshInstalled();
                    }}
                    className="h-8 px-4 flex items-center justify-center text-sm mc-text-shadow border border-[#555] text-white"
                    style={{
                      backgroundImage: "url('/images/Button_Background.png')",
                      backgroundSize: "100% 100%",
                      imageRendering: "pixelated",
                    }}
                  >
                    Reinstall All ({filteredItems.length})
                  </button>
                </div>
              )}
              {isSearchTab && !search.trim() ? (
                <div className="flex flex-col items-center justify-center h-[200px] opacity-40">
                  <span className="text-xl mc-text-shadow tracking-widest uppercase">
                    Start typing to search...
                  </span>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-3xl text-[#FFFF55] mc-text-shadow tracking-widest animate-pulse uppercase">
                    Searching Archives...
                  </span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-2xl text-[#E0E0E0] mc-text-shadow uppercase tracking-widest opacity-60">
                    {isInstalledTab
                      ? "Nothing Installed"
                      : activeTab === "Plugins"
                        ? "No plugins available"
                        : activeTab === "Server Plugins"
                          ? "No plugins available"
                          : activeTab === "Server"
                            ? "No servers available"
                            : "No results"}
                  </span>
                </div>
              ) : isPluginTab ? (
                <div className="flex flex-col gap-2">
                  {filteredItems.map((pkg, i) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      index={i}
                      focused={focusedIdx === i}
                      onHover={() => setFocusedIdx(i)}
                      onClick={() => openModal(pkg)}
                      installed={isInstalled(pkg.id)}
                      hasUpdate={hasUpdate(pkg)}
                      isVersionTab={isVersionTab}
                      isPluginTab={isPluginTab}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="grid gap-6"
                  style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
                >
                  {filteredItems.map((pkg, i) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      index={i}
                      focused={focusedIdx === i}
                      onHover={() => setFocusedIdx(i)}
                      onClick={() => openModal(pkg)}
                      installed={isInstalled(pkg.id)}
                      hasUpdate={hasUpdate(pkg)}
                      isVersionTab={isVersionTab}
                    />
                  ))}
                </div>
              )}
              {(activeTab === "Server Plugins" || activeTab === "Server") && (
                <div className="flex justify-center pt-4 pb-2">
                  <img
                    src="/images/lceonline.png"
                    alt="LCEOnline"
                    className="h-5 opacity-70 cursor-pointer"
                    onClick={() =>
                      TauriService.openUrl("https://mclegacyedition.xyz/")
                    }
                  />
                </div>
              )}
            </div>
          </div>
        ) : loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl text-[#FFFF55] mc-text-shadow tracking-widest animate-pulse uppercase">
              Searching Archives...
            </span>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl text-red-500 mc-text-shadow uppercase tracking-widest">
              {error}
            </span>
          </div>
        ) : (
          <div
            ref={gridRef}
            className="absolute inset-0 overflow-y-auto p-6 scroll-smooth"
          >
            {filteredItems.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-2xl text-[#E0E0E0] mc-text-shadow uppercase tracking-widest opacity-40">
                  Empty category
                </span>
              </div>
            ) : isPluginTab ? (
              <div className="flex flex-col gap-2">
                {filteredItems.map((pkg, i) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    index={i}
                    focused={focusedIdx === i}
                    onHover={() => setFocusedIdx(i)}
                    onClick={() => openModal(pkg)}
                    installed={isInstalled(pkg.id)}
                    hasUpdate={hasUpdate(pkg)}
                    isVersionTab={isVersionTab}
                    isPluginTab={isPluginTab}
                  />
                ))}
              </div>
            ) : (
              <div
                className="grid gap-6"
                style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
              >
                {filteredItems.map((pkg, i) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    index={i}
                    focused={focusedIdx === i}
                    onHover={() => setFocusedIdx(i)}
                    onClick={() => openModal(pkg)}
                    installed={isInstalled(pkg.id)}
                    hasUpdate={hasUpdate(pkg)}
                    isVersionTab={isVersionTab}
                    isPluginTab={isPluginTab}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="w-full mt-6 mb-4 flex justify-center">
        <button
          onClick={() => {
            playBackSound();
            setActiveView("main");
          }}
          className="w-72 h-10 flex items-center justify-center text-xl mc-text-shadow hover:text-[#FFFF55] text-white border-none outline-none transition-all"
          style={{
            backgroundImage: "url('/images/Button_Background.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundImage =
              "url('/images/button_highlighted.png')";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundImage =
              "url('/images/Button_Background.png')";
          }}
        >
          Back
        </button>
      </div>

      <AnimatePresence>
        {selectedPkg && (
          <PackageModal
            pkg={selectedPkg}
            onClose={closeModal}
            playPressSound={playPressSound}
            installedEntries={getInstalledEntries(
              selectedPkg.id,
              selectedPkg.version,
            )}
            onInstallComplete={() => {
              refreshInstalled();
              refreshInstalledPlugins();
            }}
            onUninstallComplete={() => {
              refreshInstalled();
              refreshInstalledPlugins();
            }}
            isVersionTab={activeTab === "Versions"}
            isServerTab={activeTab === "Server Plugins"}
            isGameServerTab={activeTab === "Server"}
            isPluginTab={isPluginTab}
            isSaved={
              selectedPkg.server_address
                ? savedServers.has(selectedPkg.server_address)
                : false
            }
            onToggleSave={toggleSavedServer}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

function PackageCard({
  pkg,
  index,
  focused,
  onHover,
  onClick,
  installed,
  hasUpdate,
  isVersionTab,
  isPluginTab,
}: {
  pkg: RegistryPackage;
  index: number;
  focused: boolean;
  onHover: () => void;
  onClick: () => void;
  installed: boolean;
  hasUpdate: boolean;
  isVersionTab?: boolean;
  isPluginTab?: boolean;
}) {
  const thumbnailUrl = pkg.thumbnail.startsWith("http")
    ? pkg.thumbnail
    : isVersionTab
      ? `${VERSIONS_BASE}/${pkg.id}/${pkg.thumbnail}`
      : `${RAW_BASE}/${pkg.id}/${pkg.thumbnail}`;
  const [imgError, setImgError] = useState(false);
  return (
    <div
      data-card={index}
      onMouseEnter={onHover}
      onClick={onClick}
      className={`flex flex-col cursor-pointer border-2 ${focused ? "border-[#FFFF55] z-10" : "border-[#333]"} rounded-sm overflow-hidden ${isPluginTab ? "bg-black/80" : "bg-black/40"}`}
      style={{
        backgroundImage: isPluginTab
          ? "url('/images/Button_Background2.png')"
          : "url('/images/frame_background.png')",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        boxShadow: focused ? "0 0 20px rgba(255, 255, 85, 0.2)" : "none",
      }}
    >
      {pkg.thumbnail ? (
        <div
          className={`w-full relative flex items-center justify-center overflow-hidden bg-black/50 border-b border-[#333] ${pkg.thumbnail.startsWith("http") ? "aspect-square" : "h-[120px]"}`}
        >
          {!thumbnailUrl || imgError ? (
            <span className="text-[#555] text-sm mc-text-shadow uppercase tracking-widest">
              No Image
            </span>
          ) : (
            <img
              src={thumbnailUrl}
              alt={pkg.name}
              className={`w-full h-full ${pkg.thumbnail.startsWith("http") ? "object-contain p-2" : "object-cover"}`}
              style={{ imageRendering: "pixelated" }}
              onError={() => setImgError(true)}
            />
          )}
          <div className="absolute top-1 right-1 flex gap-1">
            {pkg.category.slice(0, 1).map((c) => (
              <span
                key={c}
                className="text-[8px] bg-black/80 border border-[#555] px-1.5 py-0.5 text-[#FFFF55] mc-text-shadow uppercase tracking-tighter"
              >
                {c}
              </span>
            ))}
          </div>
          {hasUpdate && (
            <div className="absolute top-1 left-1">
              <span className="text-[8px] bg-[#FF8800]/90 border border-[#FF6600] px-1.5 py-0.5 text-white mc-text-shadow uppercase tracking-tighter">
                Update
              </span>
            </div>
          )}
          {installed && !hasUpdate && (
            <div className="absolute top-1 left-1">
              <span className="text-[8px] bg-[#55FF55] border border-[#55FF55]/60 px-1.5 py-0.5 text-[#003300] mc-text-shadow uppercase tracking-tighter shadow-sm font-bold">
                {isVersionTab ? "Added" : "Installed"}
              </span>
            </div>
          )}
        </div>
      ) : null}
      <div className="flex flex-col p-3 gap-1 relative bg-gradient-to-b from-transparent to-black/20">
        <span
          className={`text-base mc-text-shadow leading-tight truncate font-bold tracking-wide ${focused ? "text-[#FFFF55]" : "text-white"}`}
        >
          {pkg.name}
        </span>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#A0A0A0] mc-text-shadow uppercase tracking-widest">
            v{pkg.version}
          </span>
          <span className="text-[9px] text-[#55FF55] mc-text-shadow truncate opacity-80">
            {pkg.author}
          </span>
        </div>
        <p className="text-[10px] text-[#888] mc-text-shadow leading-[1.3] line-clamp-2 min-h-[2.6em] mt-1 italic">
          {pkg.description}
        </p>
      </div>
    </div>
  );
}

function PackageModal({
  pkg,
  onClose,
  playPressSound,
  installedEntries,
  onInstallComplete,
  onUninstallComplete,
  isVersionTab,
  isServerTab,
  isGameServerTab,
  isPluginTab,
  isSaved,
  onToggleSave,
}: {
  pkg: RegistryPackage;
  onClose: () => void;
  playPressSound: () => void;
  installedEntries: InstalledWorkshopPackage[];
  onInstallComplete: () => void;
  onUninstallComplete: () => void;
  isVersionTab?: boolean;
  isServerTab?: boolean;
  isGameServerTab?: boolean;
  isPluginTab?: boolean;
  isSaved?: boolean;
  onToggleSave?: (pkg: RegistryPackage) => void;
}) {
  const { addCustomEdition } = useGame();
  const thumbnailUrl = pkg.thumbnail.startsWith("http")
    ? pkg.thumbnail
    : isVersionTab
      ? `${VERSIONS_BASE}/${pkg.id}/${pkg.thumbnail}`
      : isPluginTab || !pkg.thumbnail
        ? ""
        : `${RAW_BASE}/${pkg.id}/${pkg.thumbnail}`;
  const [imgError, setImgError] = useState(false);
  const [modalFocus, setModalFocus] = useState<
    "install" | "uninstall" | "close"
  >("install");
  const [showInstall, setShowInstall] = useState(false);
  const [showUninstall, setShowUninstall] = useState(false);
  const hasInstalled = installedEntries.length > 0;
  const needsUpdate =
    hasInstalled && installedEntries.some((e) => e.version !== pkg.version);
  const focusOptions: Array<"install" | "uninstall" | "close"> = isGameServerTab
    ? ["install", "close"]
    : isServerTab
      ? ["install", "close"]
      : hasInstalled || isVersionTab
        ? ["install", "uninstall", "close"]
        : ["install", "close"];

  useEffect(() => {
    if (showInstall || showUninstall) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        onClose();
      } else if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Tab"
      ) {
        e.preventDefault();
        playPressSound();
        setModalFocus((p) => {
          const idx = focusOptions.indexOf(p);
          return focusOptions[(idx + 1) % focusOptions.length];
        });
      } else if (e.key === "Enter") {
        if (modalFocus === "close") onClose();
        else if (modalFocus === "install") handleAction();
        else if (modalFocus === "uninstall") setShowUninstall(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    modalFocus,
    showInstall,
    showUninstall,
    onClose,
    playPressSound,
    focusOptions,
  ]);

  const handleAction = async () => {
    if (isGameServerTab) {
      playPressSound();
      if (onToggleSave) onToggleSave(pkg);
    } else if (isServerTab) {
      playPressSound();
      try {
        const path = await TauriService.saveFileDialog(
          "Save Server Plugin",
          `${pkg.name}.dll`,
          ["*.dll", "*"],
        );
        if (!path) return;
        const response = await fetch(
          `${pkg.download_url}`,
        );
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        await TauriService.writeBinaryFile(path, new Uint8Array(buffer));
      } catch (e) {
        console.error(e);
      }
    } else if (isVersionTab) {
      if (hasInstalled) return;
      playPressSound();
      try {
        const logoUrl = `${VERSIONS_BASE}/${pkg.id}/${pkg.logo}`;
        const localLogoPath = await TauriService.downloadLogo(pkg.id, logoUrl);
        addCustomEdition({
          id: pkg.id,
          name: pkg.name,
          desc: pkg.description,
          url: pkg.url!,
          category: pkg.category,
          logo: localLogoPath,
        });
        onInstallComplete();
      } catch (e) {
        console.error(e);
      }
    } else if (isPluginTab) {
      setShowInstall(true);
    } else {
      setShowInstall(true);
    }
  };

  const installLabel = isGameServerTab
    ? isSaved
      ? "ADDED"
      : "ADD"
    : isServerTab
      ? "DOWNLOAD"
      : isVersionTab
        ? hasInstalled
          ? "ADDED"
          : "ADD"
        : isPluginTab
          ? hasInstalled
            ? needsUpdate
              ? "UPDATE"
              : "REINSTALL"
            : "INSTALL"
          : !hasInstalled
            ? "INSTALL"
            : needsUpdate
              ? "UPDATE"
              : "REINSTALL";
  return (
    <>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col w-[640px] max-h-[85vh] overflow-hidden font-['Mojangles'] mc-options-bg"
        >
          {isPluginTab ? (
            <div className="w-full h-[100px] flex-shrink-0 bg-black/60 flex items-center px-6 border-b border-[#444]">
              <div className="flex flex-col">
                <span className="text-3xl text-white mc-text-shadow block leading-tight tracking-wide font-bold">
                  {pkg.name}
                </span>
                <span className="text-base text-[#FFFF55] mc-text-shadow uppercase tracking-widest opacity-90">
                  By {pkg.author}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-full h-[240px] flex-shrink-0 bg-black/60 overflow-hidden relative border-b border-[#444]">
              {!thumbnailUrl || imgError ? (
                <div className="absolute inset-0 flex items-center justify-center opacity-20">
                  <span className="text-4xl mc-text-shadow uppercase tracking-widest">
                    No Image
                  </span>
                </div>
              ) : (
                <img
                  src={thumbnailUrl}
                  alt={pkg.name}
                  className="w-full h-full object-cover"
                  style={{ imageRendering: "pixelated" }}
                  onError={() => setImgError(true)}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              <div className="absolute bottom-4 left-6 right-6">
                <span className="text-3xl text-white mc-text-shadow block leading-tight tracking-wide font-bold">
                  {pkg.name}
                </span>
                <span className="text-base text-[#FFFF55] mc-text-shadow uppercase tracking-widest opacity-90">
                  By {pkg.author}
                </span>
              </div>
              {needsUpdate && (
                <div className="absolute top-3 right-3 bg-[#FF8800] border border-[#FF6600] px-2 py-1">
                  <span className="text-[10px] text-white mc-text-shadow uppercase tracking-widest">
                    Update Available
                  </span>
                </div>
              )}
              {hasInstalled && !needsUpdate && (
                <div className="absolute top-3 right-3 bg-[#003300] border border-[#55FF55]/60 px-2 py-1">
                  <span className="text-[10px] text-[#55FF55] mc-text-shadow uppercase tracking-widest">
                    Installed
                  </span>
                </div>
              )}
              {isGameServerTab && isSaved && (
                <div className="absolute top-3 right-3 bg-[#003300] border border-[#55FF55]/60 px-2 py-1">
                  <span className="text-[10px] text-[#55FF55] mc-text-shadow uppercase tracking-widest">
                    Saved
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col p-6 gap-6 overflow-y-auto flex-1">
            <div className="space-y-4">
              {pkg.description && pkg.description.trim() !== "" && (
                <p className="text-sm text-[#CCCCCC] mc-text-shadow leading-relaxed">
                  {pkg.description}
                </p>
              )}
              {pkg.extended_description &&
                pkg.extended_description.trim() !== "" && (
                  <div className="space-y-2 p-4 border border-[#444] bg-black/40">
                    <span className="text-[10px] text-[#AAAAAA] mc-text-shadow uppercase tracking-[0.2em] font-bold">
                      Details
                    </span>
                    <div className="text-sm text-white mc-text-shadow leading-relaxed workshop-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema]]}>
                        {pkg.extended_description}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-8 pt-4 border-t border-[#444]">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-[#888] mc-text-shadow uppercase tracking-[0.2em] font-bold">
                  Metadata
                </span>
                <div className="flex flex-col gap-1">
                  {isGameServerTab ? (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          Address:
                        </span>
                        <span className="text-[#55FF55] mc-text-shadow">
                          {pkg.server_address || "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          Type:
                        </span>
                        <span className="text-white mc-text-shadow">
                          {pkg.server_type || "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          Version:
                        </span>
                        <span className="text-white mc-text-shadow">
                          {pkg.version}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          Owner:
                        </span>
                        <span className="text-white mc-text-shadow">
                          {pkg.author}
                        </span>
                      </div>
                      {pkg.server_discord && (
                        <div className="flex justify-between text-xs">
                          <span className="text-[#888] mc-text-shadow">
                            Discord Server:
                          </span>
                          <a
                            href={pkg.server_discord}
                            onClick={(e) => {
                              e.preventDefault();
                              TauriService.openUrl(pkg.server_discord!);
                            }}
                            className="text-[#55FF55] mc-text-shadow truncate ml-2 underline cursor-pointer hover:text-[#FFFF55]"
                          >
                            {pkg.server_discord}
                          </a>
                        </div>
                      )}
                    </>
                  ) : isServerTab ? (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          Downloads:
                        </span>
                        <span className="text-white mc-text-shadow">
                          {pkg.download_count?.toLocaleString() ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          Likes:
                        </span>
                        <span className="text-white mc-text-shadow">
                          {pkg.likes?.toLocaleString() ?? 0}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          Server Type:
                        </span>
                        <span className="text-[#55FF55] mc-text-shadow">
                          {pkg.game_version || "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          File:
                        </span>
                        <span className="text-white mc-text-shadow truncate ml-2">
                          {pkg.name || "N/A"}
                        </span>
                      </div>
                      {pkg.file_size && (
                        <div className="flex justify-between text-xs">
                          <span className="text-[#888] mc-text-shadow">
                            File Size:
                          </span>
                          <span className="text-white mc-text-shadow">
                            {(pkg.file_size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      )}
                      {pkg.github_url && (
                        <div className="flex justify-between text-xs">
                          <span className="text-[#888] mc-text-shadow">
                            GitHub:
                          </span>
                          <a
                            href={pkg.github_url}
                            onClick={(e) => {
                              e.preventDefault();
                              TauriService.openUrl(pkg.github_url!);
                            }}
                            className="text-[#55FF55] mc-text-shadow truncate ml-2 underline cursor-pointer hover:text-[#FFFF55]"
                          >
                            {pkg.github_url}
                          </a>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          Version:
                        </span>
                        <span className="text-white mc-text-shadow">
                          v{pkg.version}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#888] mc-text-shadow">
                          Package ID:
                        </span>
                        <span className="text-[#55FF55] mc-text-shadow truncate ml-2">
                          {pkg.id}
                        </span>
                      </div>
                    </>
                  )}
                  {hasInstalled && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[#888] mc-text-shadow">
                        Installed:
                      </span>
                      <span
                        className={`mc-text-shadow truncate ml-2 ${needsUpdate ? "text-[#FF8800]" : "text-[#55FF55]"}`}
                      >
                        v{installedEntries[0]?.version}
                        {needsUpdate ? " (outdated)" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-[#666] mc-text-shadow uppercase tracking-[0.2em] font-bold">
                  Categories
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {pkg.category.map((c) => (
                    <span
                      key={c}
                      className="text-[10px] bg-black/60 border border-[#444] px-2 py-0.5 text-[#A0A0A0] mc-text-shadow uppercase tracking-widest"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {pkg.zips && Object.keys(pkg.zips).length > 0 && (
              <div className="flex flex-col gap-3 pt-4 border-t border-[#333]">
                <span className="text-[10px] text-[#666] mc-text-shadow uppercase tracking-[0.2em] font-bold">
                  Files
                </span>
                <div className="space-y-1.5">
                  {Object.entries(pkg.zips).map(([file, dest]) => (
                    <div
                      key={file}
                      className="flex items-center justify-between gap-4 bg-black/20 p-2 rounded-sm border border-[#222]"
                    >
                      <span className="text-xs text-[#A0A0A0] mc-text-shadow font-mono">
                        {file}
                      </span>
                      {dest && (
                        <span className="text-[9px] text-[#fff] mc-text-shadow truncate uppercase tracking-tighter">
                          {dest}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 pt-4 mt-auto">
              <button
                onMouseEnter={() => setModalFocus("install")}
                onClick={handleAction}
                className={`flex-1 h-12 flex items-center justify-center text-xl mc-text-shadow border-none outline-none cursor-pointer ${modalFocus === "install" ? "text-[#FFFF55]" : "text-white"}`}
                style={{
                  backgroundImage:
                    modalFocus === "install"
                      ? "url('/images/button_highlighted.png')"
                      : "url('/images/Button_Background.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                {installLabel}
              </button>
              {hasInstalled && (
                <button
                  onMouseEnter={() => setModalFocus("uninstall")}
                  onClick={() => setShowUninstall(true)}
                  className={`w-36 h-12 flex items-center justify-center text-xl mc-text-shadow border-none outline-none cursor-pointer ${modalFocus === "uninstall" ? "text-[#FF5555]" : "text-white"}`}
                  style={{
                    backgroundImage:
                      modalFocus === "uninstall"
                        ? "url('/images/button_highlighted.png')"
                        : "url('/images/Button_Background.png')",
                    backgroundSize: "100% 100%",
                    imageRendering: "pixelated",
                  }}
                >
                  REMOVE
                </button>
              )}
              <button
                onMouseEnter={() => setModalFocus("close")}
                onClick={onClose}
                className={`w-36 h-12 flex items-center justify-center text-xl mc-text-shadow border-none outline-none cursor-pointer ${modalFocus === "close" ? "text-[#FFFF55]" : "text-white"}`}
                style={{
                  backgroundImage:
                    modalFocus === "close"
                      ? "url('/images/button_highlighted.png')"
                      : "url('/images/Button_Background.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                BACK
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showInstall && (
          <InstallModal
            pkg={pkg}
            onClose={() => {
              setShowInstall(false);
              onInstallComplete();
            }}
            playPressSound={playPressSound}
            isPluginTab={isPluginTab}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showUninstall && (
          <UninstallModal
            pkg={pkg}
            installedEntries={installedEntries}
            onClose={() => {
              setShowUninstall(false);
              onUninstallComplete();
            }}
            playPressSound={playPressSound}
            isVersionTab={isVersionTab}
            isPluginTab={isPluginTab}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function InstallModal({
  pkg,
  onClose,
  playPressSound,
  isPluginTab,
}: {
  pkg: RegistryPackage;
  onClose: () => void;
  playPressSound: () => void;
  isPluginTab?: boolean;
}) {
  const game = useContext(GameContext);
  const availableEditions =
    game?.editions.filter((e) => game.installs.includes(e.id)) || [];
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "installing" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const installPlugin = useCallback(async () => {
    setStatus("installing");
    setErrorMsg(null);
    playPressSound();
    try {
      const pluginsDir = await TauriService.getPluginsDir();
      const pluginDir = `${pluginsDir}/${pkg.id}`;

      await TauriService.createPluginDir(pkg.id);

      const encoder = new TextEncoder();

      const manifest = {
        id: pkg.id,
        name: pkg.name,
        version: pkg.version,
        author: pkg.author,
        description: pkg.description,
        extended_description: pkg.extended_description || "",
        main: pkg.main || "main.js",
        permissions: pkg.permissions || [],
      };
      await TauriService.writeBinaryFile(
        `${pluginDir}/plugin.json`,
        encoder.encode(JSON.stringify(manifest, null, 2)),
      );

      const pluginBaseUrl = `${RAW_BASE}/.00plugins/${pkg.id}`;

      const allFiles = [pkg.main || "main.js", ...(pkg.files || [])];
      for (const file of allFiles) {
        const res = await TauriService.httpProxyRequest(
          "GET",
          `${pluginBaseUrl}/${file}`,
          null,
          {},
        );
        if (res.status !== 200) throw new Error(`Failed to download ${file}`);
        await TauriService.writeBinaryFile(
          `${pluginDir}/${file}`,
          encoder.encode(res.body),
        );
      }

      await PluginManager.instance.reload();
      setStatus("success");
    } catch (e: unknown) {
      console.error(e);
      setStatus("error");
      setErrorMsg(
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Unknown error",
      );
    }
  }, [pkg, playPressSound]);

  useEffect(() => {
    if (isPluginTab && status === "idle") {
      installPlugin();
    }
  }, [isPluginTab, status, installPlugin]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (status === "installing") return;
      if (status === "success") {
        if (e.key === "Escape" || e.key === "Backspace" || e.key === "Enter")
          onClose();
        return;
      }

      if (e.key === "Escape" || e.key === "Backspace") {
        onClose();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        playPressSound();
        setFocusedIdx((p) => Math.max(p - 1, 0));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        playPressSound();
        setFocusedIdx((p) => Math.min(p + 1, availableEditions.length - 1));
      } else if (e.key === "Enter") {
        if (availableEditions.length > 0) {
          installTo(availableEditions[focusedIdx].id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [availableEditions, focusedIdx, status, onClose, playPressSound]);

  const installTo = async (instanceId: string) => {
    setStatus("installing");
    setErrorMsg(null);
    playPressSound();
    try {
      await TauriService.workshopInstall(
        instanceId,
        pkg.id,
        pkg.zips!,
        pkg.version,
      );
      setStatus("success");
    } catch (e: unknown) {
      console.error(e);
      setStatus("error");
      setErrorMsg(
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Unknown error",
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80"
      onClick={status !== "installing" ? onClose : undefined}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-[520px] font-['Mojangles'] text-white border-2 border-[#555] rounded-sm overflow-hidden"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <div className="p-6 border-b border-[#555] bg-black/60">
          <span className="text-2xl mc-text-shadow block font-bold tracking-wide">
            {isPluginTab ? "INSTALL PLUGIN" : "INSTALL CONTENT"}
          </span>
          <span className="text-sm text-[#A0A0A0] mc-text-shadow uppercase tracking-widest opacity-80 mt-1">
            {isPluginTab
              ? `Installing "${pkg.name}"`
              : `Target Edition for "${pkg.name}"`}
          </span>
        </div>

        <div className="p-4 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
          {status === "installing" && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <span className="text-2xl text-[#FFFF55] mc-text-shadow animate-pulse">
                Installing...
              </span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow">
                {isPluginTab
                  ? "Downloading plugin files"
                  : "Downloading and extracting assets"}
              </span>
              {isPluginTab && pkg.permissions && pkg.permissions.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2 w-full px-4">
                  <span className="text-[10px] text-[#888] mc-text-shadow uppercase tracking-[0.2em] font-bold text-center">
                    Requested Permissions
                  </span>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {pkg.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="text-[10px] bg-black/60 border border-[#FF8800]/40 px-2 py-0.5 text-[#FFAA33] mc-text-shadow"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {status === "success" && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <span className="text-2xl text-[#55FF55] mc-text-shadow">
                Installed Successfully!
              </span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow">
                Press any key or click to continue
              </span>
            </div>
          )}
          {status === "error" && (
            <div className="py-6 flex flex-col items-center justify-center gap-3">
              <span className="text-xl text-[#FF5555] mc-text-shadow">
                Installation Failed
              </span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow text-center">
                {errorMsg}
              </span>
              <button
                onClick={() => {
                  setStatus("idle");
                  if (isPluginTab) installPlugin();
                }}
                className="mt-2 w-32 h-9 flex items-center justify-center text-sm mc-text-shadow text-white cursor-pointer"
                style={{
                  backgroundImage: "url('/images/Button_Background.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                Retry
              </button>
            </div>
          )}

          {status === "idle" &&
            !isPluginTab &&
            (availableEditions.length === 0 ? (
              <div className="py-6 flex items-center justify-center">
                <span className="text-[#FF5555] mc-text-shadow">
                  No installed editions found
                </span>
              </div>
            ) : (
              availableEditions.map((ed, i) => (
                <div
                  key={ed.id}
                  onClick={() => installTo(ed.id)}
                  onMouseEnter={() => setFocusedIdx(i)}
                  className={`flex flex-col p-3 cursor-pointer border-2 transition-none ${focusedIdx === i ? "border-[#FFFF55] bg-black/40" : "border-[#444] bg-black/20"}`}
                >
                  <span
                    className={`text-lg mc-text-shadow ${focusedIdx === i ? "text-[#FFFF55]" : "text-white"}`}
                  >
                    {ed.name}
                  </span>
                </div>
              ))
            ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function UninstallModal({
  pkg,
  installedEntries,
  onClose,
  playPressSound,
  isVersionTab,
  isPluginTab,
}: {
  pkg: RegistryPackage;
  installedEntries: InstalledWorkshopPackage[];
  onClose: () => void;
  playPressSound: () => void;
  isVersionTab?: boolean;
  isPluginTab?: boolean;
}) {
  const { deleteCustomEdition } = useGame();
  const game = useContext(GameContext);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "removing" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const editionName = (instanceId: string) => {
    const ed = game?.editions.find((e) => e.id === instanceId);
    return ed?.name ?? instanceId;
  };

  const uninstallPlugin = useCallback(async () => {
    setStatus("removing");
    setErrorMsg(null);
    playPressSound();
    try {
      await TauriService.removePluginDir(pkg.id);
      await PluginManager.instance.reload();
      setStatus("success");
    } catch (e: unknown) {
      console.error(e);
      setStatus("error");
      setErrorMsg(
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Unknown error",
      );
    }
  }, [pkg.id, playPressSound]);

  useEffect(() => {
    if (isPluginTab && status === "idle") {
      uninstallPlugin();
    }
  }, [isPluginTab, status, uninstallPlugin]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (status === "removing") return;
      if (status === "success") {
        if (e.key === "Escape" || e.key === "Backspace" || e.key === "Enter")
          onClose();
        return;
      }

      if (e.key === "Escape" || e.key === "Backspace") {
        onClose();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        playPressSound();
        setFocusedIdx((p) => Math.max(p - 1, 0));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        playPressSound();
        setFocusedIdx((p) => Math.min(p + 1, installedEntries.length - 1));
      } else if (e.key === "Enter") {
        if (installedEntries.length > 0) {
          uninstallFrom(installedEntries[focusedIdx].instanceId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [installedEntries, focusedIdx, status, onClose, playPressSound]);

  const uninstallFrom = async (instanceId: string) => {
    setStatus("removing");
    setErrorMsg(null);
    playPressSound();
    try {
      if (isVersionTab) {
        deleteCustomEdition(pkg.id);
      } else {
        await TauriService.workshopUninstall(instanceId, pkg.id);
      }
      setStatus("success");
    } catch (e: unknown) {
      console.error(e);
      setStatus("error");
      setErrorMsg(
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Unknown error",
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80"
      onClick={status !== "removing" ? onClose : undefined}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-[520px] font-['Mojangles'] text-white border-2 border-[#555] rounded-sm overflow-hidden"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <div className="p-6 border-b border-[#555] bg-black/60">
          <span className="text-2xl mc-text-shadow block font-bold tracking-wide text-[#FF5555]">
            {isPluginTab ? "REMOVE PLUGIN" : "REMOVE CONTENT"}
          </span>
          <span className="text-sm text-[#A0A0A0] mc-text-shadow uppercase tracking-widest opacity-80 mt-1">
            {isPluginTab
              ? `Remove "${pkg.name}"`
              : `Select edition to remove "${pkg.name}"`}
          </span>
        </div>

        <div className="p-4 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
          {status === "removing" && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <span className="text-2xl text-[#FF5555] mc-text-shadow animate-pulse">
                Removing...
              </span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow">
                Deleting installed files
              </span>
            </div>
          )}
          {status === "success" && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <span className="text-2xl text-[#55FF55] mc-text-shadow">
                Removed Successfully!
              </span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow">
                Press any key or click to continue
              </span>
            </div>
          )}
          {status === "error" && (
            <div className="py-6 flex flex-col items-center justify-center gap-3">
              <span className="text-xl text-[#FF5555] mc-text-shadow">
                Removal Failed
              </span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow text-center">
                {errorMsg}
              </span>
              <button
                onClick={() => {
                  setStatus("idle");
                  if (isPluginTab) uninstallPlugin();
                }}
                className="mt-2 w-32 h-9 flex items-center justify-center text-sm mc-text-shadow text-white cursor-pointer"
                style={{
                  backgroundImage: "url('/images/Button_Background.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                Retry
              </button>
            </div>
          )}

          {status === "idle" &&
            !isPluginTab &&
            installedEntries.map((entry, i) => (
              <div
                key={entry.instanceId}
                onClick={() => uninstallFrom(entry.instanceId)}
                onMouseEnter={() => setFocusedIdx(i)}
                className={`flex items-center justify-between p-3 cursor-pointer border-2 transition-none ${focusedIdx === i ? "border-[#FF5555] bg-black/40" : "border-[#444] bg-black/20"}`}
              >
                <span
                  className={`text-lg mc-text-shadow ${focusedIdx === i ? "text-[#FF5555]" : "text-white"}`}
                >
                  {editionName(entry.instanceId)}
                </span>
                <span className="text-[10px] text-[#666] mc-text-shadow uppercase tracking-widest">
                  v{entry.version}
                </span>
              </div>
            ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default WorkshopView;

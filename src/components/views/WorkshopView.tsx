import { useState, useEffect, memo, useCallback, useRef, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useUI, useAudio, useConfig, GameContext, useGame } from '../../context/LauncherContext';
import { TauriService, InstalledWorkshopPackage } from '../../services/TauriService';
const REGISTRY_URL = 'https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/registry.json';
const VERSIONS_URL = 'https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/versions.json';
const RAW_BASE = 'https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main';
const VERSIONS_BASE = 'https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/.00versions';
const CATEGORY_TABS = ['Skin', 'Texture', 'World', 'Mod', 'DLC'] as const;
const ALL_TABS = [...CATEGORY_TABS, 'Versions', 'Installed', 'Search'] as const;
type TabType = typeof ALL_TABS[number];
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
}

const COLS = 4;
const WorkshopView = memo(function WorkshopView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const config = useConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('Skin');
  const [allPackages, setAllPackages] = useState<RegistryPackage[]>([]);
  const [versionPackages, setVersionPackages] = useState<RegistryPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedPkg, setSelectedPkg] = useState<RegistryPackage | null>(null);
  const [installedPkgs, setInstalledPkgs] = useState<InstalledWorkshopPackage[]>([]);
  const refreshInstalled = useCallback(async () => {
    try {
      const data = await TauriService.workshopListInstalled();
      setInstalledPkgs(data);
    } catch {
      setInstalledPkgs([]);
    }
  }, []);

  useEffect(() => {
    containerRef.current?.focus();
    refreshInstalled();
  }, [refreshInstalled]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(REGISTRY_URL).then(r => r.json()),
      fetch(VERSIONS_URL).then(r => r.json())
    ])
      .then(([registryData, versionsData]) => {
        setAllPackages(registryData.packages ?? []);
        setVersionPackages(versionsData.versionlist ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message ?? 'Failed to load registry');
        setLoading(false);
      });
  }, []);

  const getInstalledEntries = useCallback((pkgId: string) => {
    if (activeTab === 'Versions') {
      const isAdded = config.customEditions?.some((e: any) => e.id === pkgId || (e.url === versionPackages.find(p => p.id === pkgId)?.url));
      if (isAdded) {
        const vPkg = versionPackages.find(p => p.id === pkgId);
        return [{
          packageId: pkgId,
          instanceId: pkgId,
          version: vPkg?.version || '0.0.0',
        }] as InstalledWorkshopPackage[];
      }
      return [];
    }
    return installedPkgs.filter((p) => p.packageId === pkgId);
  }, [installedPkgs, activeTab, config.customEditions, versionPackages]);

  const isInstalled = useCallback((pkgId: string) => {
    if (activeTab === 'Versions') {
      return config.customEditions?.some((e: any) => e.id === pkgId || (e.url === versionPackages.find(p => p.id === pkgId)?.url)) ?? false;
    }
    return installedPkgs.some((p) => p.packageId === pkgId);
  }, [installedPkgs, activeTab, config.customEditions, versionPackages]);

  const hasUpdate = useCallback((pkg: RegistryPackage) => {
    if (activeTab === 'Versions') return false;
    const entries = installedPkgs.filter((p) => p.packageId === pkg.id);
    return entries.length > 0 && entries.some((e) => e.version !== pkg.version);
  }, [installedPkgs, activeTab]);

  const installedPackageList = allPackages.filter((pkg) => isInstalled(pkg.id));
  const filteredItems = activeTab === 'Installed'
    ? (search.trim()
      ? installedPackageList.filter((pkg) => {
        const q = search.toLowerCase();
        return pkg.name.toLowerCase().includes(q) || pkg.author.toLowerCase().includes(q) || pkg.description.toLowerCase().includes(q);
      })
      : installedPackageList)
    : (activeTab === 'Versions' ? versionPackages : allPackages).filter((pkg) => {
      const matchesTab = (activeTab === 'Search' || activeTab === 'Versions') ? true : pkg.category.includes(activeTab);
      if (!matchesTab) return false;
      if (!search.trim()) return activeTab === 'Search' ? false : true;
      const q = search.toLowerCase();
      return (
        pkg.name.toLowerCase().includes(q) ||
        pkg.author.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q)
      );
    });

  useEffect(() => {
    setFocusedIdx(null);
    if (activeTab === 'Search') {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
    }
  }, [activeTab]);

  useEffect(() => {
    if (focusedIdx !== null && gridRef.current) {
      const el = gridRef.current.querySelector(`[data-card="${focusedIdx}"]`) as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIdx]);

  const cycleTab = useCallback((direction: 'next' | 'prev') => {
    playPressSound();
    setActiveTab((prev) => {
      const idx = ALL_TABS.indexOf(prev);
      if (direction === 'next') return ALL_TABS[(idx + 1) % ALL_TABS.length];
      return ALL_TABS[(idx - 1 + ALL_TABS.length) % ALL_TABS.length];
    });
  }, [playPressSound]);

  const selectTab = useCallback((tab: TabType) => {
    if (tab !== activeTab) {
      playPressSound();
      setActiveTab(tab);
    }
  }, [activeTab, playPressSound]);

  const openModal = useCallback((pkg: RegistryPackage) => {
    playPressSound();
    setSelectedPkg(pkg);
  }, [playPressSound]);

  const closeModal = useCallback(() => {
    playBackSound();
    setSelectedPkg(null);
  }, [playBackSound]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedPkg) return;

      const isSearchInput = document.activeElement === searchRef.current;
      if (isSearchInput) {
        if (e.key === 'Escape') { setSearch(''); containerRef.current?.focus(); }
        return;
      }

      const count = filteredItems.length;
      if (e.key === 'Escape' || e.key === 'Backspace') {
        playBackSound(); setActiveView('main'); return;
      }
      if (e.key === 'e' || e.key === 'E') { cycleTab('next'); return; }
      if (e.key === 'q' || e.key === 'Q') { cycleTab('prev'); return; }

      if (count === 0) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedIdx((p) => Math.min((p ?? -1) + 1, count - 1));
        playPressSound();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedIdx((p) => Math.max((p ?? 1) - 1, 0));
        playPressSound();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((p) => Math.min((p ?? -COLS) + COLS, count - 1));
        playPressSound();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((p) => Math.max((p ?? COLS) - COLS, 0));
        playPressSound();
      } else if (e.key === 'Enter' && focusedIdx !== null) {
        const pkg = filteredItems[focusedIdx];
        if (pkg) openModal(pkg);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playBackSound, playPressSound, setActiveView, cycleTab, filteredItems, focusedIdx, selectedPkg, openModal]);

  const isSearchTab = activeTab === 'Search';
  const isInstalledTab = activeTab === 'Installed';
  const isVersionTab = activeTab === 'Versions';
  const showSearch = isSearchTab || isInstalledTab || isVersionTab;
  return (
    <motion.div
      ref={containerRef}
      tabIndex={0}
      initial={{ opacity: 1, scale: 1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0 }}
      className="flex flex-col items-center w-full max-w-6xl h-full max-h-full relative font-['Mojangles'] text-white select-none outline-none focus:outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-4 mb-6 border-b-2 border-[#373737] pb-2 w-[30%] max-w-[250px] text-center tracking-widest uppercase opacity-80 font-bold whitespace-nowrap px-4">
        Workshop
      </h2>

      <div className="flex flex-col items-center w-[85%] max-w-5xl flex-1">
        <div className="flex items-end gap-1 w-full px-2">
          {ALL_TABS.map((tab) => {
            const isActive = tab === activeTab;
            const updateCount = tab === 'Installed'
              ? allPackages.filter((p) => hasUpdate(p)).length
              : 0;
            return (
              <button
                key={tab}
                onClick={() => selectTab(tab)}
                className={`
                  mc-lce-tab-bg h-10 min-w-[80px] flex items-center justify-center px-3 text-sm mc-text-shadow tracking-wide border-none outline-none cursor-pointer flex-shrink-0
                  ${isActive ? 'active text-white' : 'text-white/70 hover:text-white'}
                `}
              >
                {tab}
                {updateCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#FF5555] text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center font-bold mc-text-shadow border border-[#AA0000]">
                    {updateCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mc-lce-content-bg w-full flex-1 overflow-hidden relative p-3 max-w-[85vw] max-h-[55vh]">
          <div className="w-full h-full p-2 overflow-hidden" style={{
            borderImage: "url('/images/panel_content.png') 4 fill",
            borderWidth: '12px',
            borderStyle: 'solid',
            borderColor: 'transparent',
            imageRendering: 'pixelated',
          }}>
        <AnimatePresence mode="wait">
          {showSearch ? (
            <motion.div
              key={isInstalledTab ? 'installed-tab' : 'search-tab'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="relative w-full h-full flex flex-col pt-2"
            >
              <div className="flex items-center gap-3 px-6 pb-4">
                <div
                  className="flex items-center flex-1 h-12 px-4 border-2 border-[#444] bg-black/40 rounded shadow-inner"
                  style={{
                    backgroundImage: "url('/images/Button_Background2.png')",
                    backgroundSize: '100% 100%',
                    imageRendering: 'pixelated',
                  }}
                >
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setFocusedIdx(null); }}
                    placeholder={isInstalledTab ? "FILTER INSTALLED..." : (isVersionTab ? "FILTER VERSIONS..." : "ENTER KEYWORDS...")}
                    spellCheck={false}
                    autoFocus={isSearchTab}
                    className="bg-transparent border-none outline-none text-white text-lg mc-text-shadow w-full placeholder-white/40 font-['Mojangles'] tracking-widest"
                  />
                  {search && (
                    <button
                      onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                      className="text-white/60 hover:text-white text-lg ml-2 bg-transparent border-none outline-none cursor-pointer mc-text-shadow"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div ref={gridRef} className="flex-1 overflow-y-auto p-6 scroll-smooth max-h-[35vh]">
                {isSearchTab && !search.trim() ? (
                  <div className="flex flex-col items-center justify-center h-[200px] opacity-40">
                    <span className="text-xl mc-text-shadow tracking-widest uppercase">Start typing to search...</span>
                  </div>
                ) : loading ? (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-3xl text-[#ffff00] mc-text-shadow tracking-widest animate-pulse uppercase">Searching Archives...</span>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-2xl text-[#E0E0E0] mc-text-shadow uppercase tracking-widest opacity-60">
                      {isInstalledTab ? 'Nothing Installed' : 'No results'}
                    </span>
                  </div>
                ) : (
                  <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
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
              </div>
            </motion.div>
          ) : loading ? (
            <div key="loading" className="relative w-full h-full flex items-center justify-center">
              <span className="text-3xl text-[#ffff00] mc-text-shadow tracking-widest animate-pulse uppercase">Searching Archives...</span>
            </div>
          ) : error ? (
            <div key="error" className="relative w-full h-full flex items-center justify-center">
              <span className="text-xl text-red-500 mc-text-shadow uppercase tracking-widest">{error}</span>
            </div>
          ) : (
            <div
              key={activeTab}
              ref={gridRef}
              className="relative w-full h-full overflow-y-auto p-6 scroll-smooth max-h-[45vh]"
            >
              {filteredItems.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-2xl text-[#E0E0E0] mc-text-shadow uppercase tracking-widest opacity-40">Empty category</span>
                </div>
              ) : (
                <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
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
            </div>
          )}
        </AnimatePresence>
        </div>
      </div>
      </div>

      <div className="w-full mt-6 mb-4 flex justify-center">
        <button
          onClick={() => { playBackSound(); setActiveView('main'); }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundImage = "url('/images/button_highlighted.png')"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundImage = "url('/images/Button_Background.png')"; }}
          className="w-40 h-10 flex items-center justify-center text-xl mc-text-shadow hover:text-[#ffff00] text-white border-none outline-none transition-all"
          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: '100% 100%', imageRendering: 'pixelated' }}
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
            installedEntries={getInstalledEntries(selectedPkg.id)}
            onInstallComplete={refreshInstalled}
            onUninstallComplete={refreshInstalled}
            isVersionTab={activeTab === 'Versions'}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

function PackageCard({ pkg, index, focused, onHover, onClick, installed, hasUpdate, isVersionTab }: {
  pkg: RegistryPackage;
  index: number;
  focused: boolean;
  onHover: () => void;
  onClick: () => void;
  installed: boolean;
  hasUpdate: boolean;
  isVersionTab?: boolean;
}) {
  const thumbnailUrl = isVersionTab
    ? `${VERSIONS_BASE}/${pkg.id}/${pkg.thumbnail}`
    : `${RAW_BASE}/${pkg.id}/${pkg.thumbnail}`;
  const [imgError, setImgError] = useState(false);
  return (
    <div
      data-card={index}
      onMouseEnter={onHover}
      onClick={onClick}
      className={`flex flex-col cursor-pointer transition-all border-2 ${focused ? 'border-[#ffff00] scale-105 z-10' : 'border-[#333] hover:border-[#ffff00]'} rounded-sm overflow-hidden bg-black/40`}
      style={{
        backgroundImage: "url('/images/frame_background.png')",
        backgroundSize: '100% 100%',
        imageRendering: 'pixelated',
        boxShadow: focused ? '0 0 20px rgba(255, 255, 85, 0.2)' : 'none',
      }}
    >
      <div className="w-full h-[120px] relative flex items-center justify-center overflow-hidden bg-black/50 border-b border-[#333]">
        {imgError ? (
          <span className="text-[#555] text-sm mc-text-shadow uppercase tracking-widest">No Image</span>
        ) : (
          <img src={thumbnailUrl} alt={pkg.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform"
            style={{ imageRendering: 'pixelated' }} onError={() => setImgError(true)} />
        )}
        <div className="absolute top-1 right-1 flex gap-1">
          {pkg.category.slice(0, 1).map((c) => (
            <span key={c} className="text-[8px] bg-black/80 border border-[#555] px-1.5 py-0.5 text-[#ffff00] mc-text-shadow uppercase tracking-tighter">{c}</span>
          ))}
        </div>
        {hasUpdate && (
          <div className="absolute top-1 left-1">
            <span className="text-[8px] bg-[#FF8800]/90 border border-[#FF6600] px-1.5 py-0.5 text-white mc-text-shadow uppercase tracking-tighter">Update</span>
          </div>
        )}
        {installed && !hasUpdate && (
          <div className="absolute top-1 left-1">
            <span className="text-[8px] bg-[#55FF55] border border-[#55FF55]/60 px-1.5 py-0.5 text-[#003300] mc-text-shadow uppercase tracking-tighter shadow-sm font-bold">{isVersionTab ? 'Added' : 'Installed'}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col p-3 gap-1 relative bg-gradient-to-b from-transparent to-black/20">
        <span className={`text-base mc-text-shadow leading-tight truncate font-bold tracking-wide ${focused ? 'text-[#ffff00]' : 'text-white'}`}>
          {pkg.name}
        </span>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#A0A0A0] mc-text-shadow uppercase tracking-widest">v{pkg.version}</span>
          <span className="text-[9px] text-[#55FF55] mc-text-shadow truncate opacity-80">{pkg.author}</span>
        </div>
        <p className="text-[10px] text-[#888] mc-text-shadow leading-[1.3] line-clamp-2 min-h-[2.6em] mt-1 italic">
          {pkg.description}
        </p>
      </div>
    </div>
  );
}

function PackageModal({ pkg, onClose, playPressSound, installedEntries, onInstallComplete, onUninstallComplete, isVersionTab }: {
  pkg: RegistryPackage;
  onClose: () => void;
  playPressSound: () => void;
  installedEntries: InstalledWorkshopPackage[];
  onInstallComplete: () => void;
  onUninstallComplete: () => void;
  isVersionTab?: boolean;
}) {
  const { addCustomEdition } = useGame();
  const thumbnailUrl = isVersionTab
    ? `${VERSIONS_BASE}/${pkg.id}/${pkg.thumbnail}`
    : `${RAW_BASE}/${pkg.id}/${pkg.thumbnail}`;
  const [imgError, setImgError] = useState(false);
  const [modalFocus, setModalFocus] = useState<'install' | 'uninstall' | 'close'>('install');
  const [showInstall, setShowInstall] = useState(false);
  const [showUninstall, setShowUninstall] = useState(false);
  const hasInstalled = installedEntries.length > 0;
  const needsUpdate = hasInstalled && installedEntries.some((e) => e.version !== pkg.version);
  const focusOptions: Array<'install' | 'uninstall' | 'close'> = (hasInstalled || isVersionTab)
    ? ['install', 'uninstall', 'close']
    : ['install', 'close'];

  useEffect(() => {
    if (showInstall || showUninstall) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        onClose();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
        e.preventDefault();
        playPressSound();
        setModalFocus((p) => {
          const idx = focusOptions.indexOf(p);
          return focusOptions[(idx + 1) % focusOptions.length];
        });
      } else if (e.key === 'Enter') {
        if (modalFocus === 'close') onClose();
        else if (modalFocus === 'install') handleAction();
        else if (modalFocus === 'uninstall') setShowUninstall(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalFocus, showInstall, showUninstall, onClose, playPressSound, focusOptions]);

  const handleAction = async () => {
    if (isVersionTab) {
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
          logo: localLogoPath
        });
        onInstallComplete();
      } catch (e) {
        console.error(e);
      }
    } else {
      setShowInstall(true);
    }
  };

  const installLabel = isVersionTab ? (hasInstalled ? 'ADDED' : 'ADD') : (!hasInstalled ? 'INSTALL' : needsUpdate ? 'UPDATE' : 'REINSTALL');
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col w-[640px] max-h-[85vh] overflow-hidden font-['Mojangles'] border-2 border-[#555] rounded-sm"
          style={{
            backgroundImage: "url('/images/frame_background.png')",
            backgroundSize: '100% 100%',
            imageRendering: 'pixelated',
          }}
        >
          <div className="w-full h-[240px] flex-shrink-0 bg-black/60 overflow-hidden relative border-b border-[#444]">
            {imgError ? (
              <div className="absolute inset-0 flex items-center justify-center opacity-20">
                <span className="text-4xl mc-text-shadow uppercase tracking-widest">No Image</span>
              </div>
            ) : (
              <img src={thumbnailUrl} alt={pkg.name} className="w-full h-full object-cover"
                style={{ imageRendering: 'pixelated' }} onError={() => setImgError(true)} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            <div className="absolute bottom-4 left-6 right-6">
              <span className="text-3xl text-white mc-text-shadow block leading-tight tracking-wide font-bold">{pkg.name}</span>
              <span className="text-base text-[#ffff00] mc-text-shadow uppercase tracking-widest opacity-90">By {pkg.author}</span>
            </div>
            {needsUpdate && (
              <div className="absolute top-3 right-3 bg-[#FF8800] border border-[#FF6600] px-2 py-1">
                <span className="text-[10px] text-white mc-text-shadow uppercase tracking-widest">Update Available</span>
              </div>
            )}
            {hasInstalled && !needsUpdate && (
              <div className="absolute top-3 right-3 bg-[#003300] border border-[#55FF55]/60 px-2 py-1">
                <span className="text-[10px] text-[#55FF55] mc-text-shadow uppercase tracking-widest">Installed</span>
              </div>
            )}
          </div>

          <div className="flex flex-col p-6 gap-6 overflow-y-auto flex-1">
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-[10px] text-[#666] mc-text-shadow uppercase tracking-[0.2em] font-bold">Project Description</span>
                <p className="text-sm text-[#C0C0C0] mc-text-shadow leading-relaxed italic opacity-90">{pkg.description}</p>
              </div>

              {pkg.extended_description && pkg.extended_description.trim() !== "" && (
                <div className="space-y-2 bg-black/20 p-4 border border-[#333] rounded-sm">
                  <span className="text-[10px] text-[#555] mc-text-shadow uppercase tracking-[0.2em] font-bold">Additional Resources</span>
                  <div className="text-sm text-[#A0A0A0] mc-text-shadow leading-relaxed workshop-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{pkg.extended_description}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-8 pt-4 border-t border-[#333]">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-[#666] mc-text-shadow uppercase tracking-[0.2em] font-bold">Metadata</span>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#888] mc-text-shadow">Version:</span>
                    <span className="text-white mc-text-shadow">v{pkg.version}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#888] mc-text-shadow">Package ID:</span>
                    <span className="text-[#55FF55] mc-text-shadow truncate ml-2">{pkg.id}</span>
                  </div>
                  {hasInstalled && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[#888] mc-text-shadow">Installed:</span>
                      <span className={`mc-text-shadow truncate ml-2 ${needsUpdate ? 'text-[#FF8800]' : 'text-[#55FF55]'}`}>
                        v{installedEntries[0]?.version}
                        {needsUpdate ? ' (outdated)' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-[#666] mc-text-shadow uppercase tracking-[0.2em] font-bold">Categories</span>
                <div className="flex flex-wrap gap-1.5">
                  {pkg.category.map((c) => (
                    <span key={c} className="text-[10px] bg-black/60 border border-[#444] px-2 py-0.5 text-[#A0A0A0] mc-text-shadow uppercase tracking-widest">{c}</span>
                  ))}
                </div>
              </div>
            </div>
            {pkg.zips && Object.keys(pkg.zips).length > 0 && (
              <div className="flex flex-col gap-3 pt-4 border-t border-[#333]">
                <span className="text-[10px] text-[#666] mc-text-shadow uppercase tracking-[0.2em] font-bold">Files</span>
                <div className="space-y-1.5">
                  {Object.entries(pkg.zips).map(([file, dest]) => (
                    <div key={file} className="flex items-center justify-between gap-4 bg-black/20 p-2 rounded-sm border border-[#222]">
                      <span className="text-xs text-[#A0A0A0] mc-text-shadow font-mono">{file}</span>
                      {dest && <span className="text-[9px] text-[#fff] mc-text-shadow truncate uppercase tracking-tighter">{dest}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 pt-4 mt-auto">
              <button
                onMouseEnter={() => setModalFocus('install')}
                onClick={handleAction}
                className={`flex-1 h-12 flex items-center justify-center text-xl mc-text-shadow border-none outline-none cursor-pointer transition-all ${modalFocus === 'install' ? 'text-[#ffff00]' : 'text-white'}`}
                style={{
                  backgroundImage: modalFocus === 'install' ? "url('/images/button_highlighted.png')" : "url('/images/Button_Background.png')",
                  backgroundSize: '100% 100%',
                  imageRendering: 'pixelated',
                }}
              >
                {installLabel}
              </button>
              {hasInstalled && (
                <button
                  onMouseEnter={() => setModalFocus('uninstall')}
                  onClick={() => setShowUninstall(true)}
                  className={`w-36 h-12 flex items-center justify-center text-xl mc-text-shadow border-none outline-none cursor-pointer transition-all ${modalFocus === 'uninstall' ? 'text-[#FF5555]' : 'text-white'}`}
                  style={{
                    backgroundImage: modalFocus === 'uninstall' ? "url('/images/button_highlighted.png')" : "url('/images/Button_Background.png')",
                    backgroundSize: '100% 100%',
                    imageRendering: 'pixelated',
                  }}
                >
                  REMOVE
                </button>
              )}
              <button
                onMouseEnter={() => setModalFocus('close')}
                onClick={onClose}
                className={`w-36 h-12 flex items-center justify-center text-xl mc-text-shadow border-none outline-none cursor-pointer transition-all ${modalFocus === 'close' ? 'text-[#ffff00]' : 'text-white'}`}
                style={{
                  backgroundImage: modalFocus === 'close' ? "url('/images/button_highlighted.png')" : "url('/images/Button_Background.png')",
                  backgroundSize: '100% 100%',
                  imageRendering: 'pixelated',
                }}
              >
                BACK
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showInstall && (
          <InstallModal
            pkg={pkg}
            onClose={() => { setShowInstall(false); onInstallComplete(); }}
            playPressSound={playPressSound}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showUninstall && (
          <UninstallModal
            pkg={pkg}
            installedEntries={installedEntries}
            onClose={() => { setShowUninstall(false); onUninstallComplete(); }}
            playPressSound={playPressSound}
            isVersionTab={isVersionTab}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function InstallModal({ pkg, onClose, playPressSound }: {
  pkg: RegistryPackage;
  onClose: () => void;
  playPressSound: () => void;
}) {
  const game = useContext(GameContext);
  const availableEditions = game?.editions.filter(e => game.installs.includes(e.id)) || [];
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [status, setStatus] = useState<'idle' | 'installing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (status === 'installing') return;
      if (status === 'success') {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Enter') onClose();
        return;
      }

      if (e.key === 'Escape' || e.key === 'Backspace') {
        onClose();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        playPressSound();
        setFocusedIdx((p) => Math.max(p - 1, 0));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        playPressSound();
        setFocusedIdx((p) => Math.min(p + 1, availableEditions.length - 1));
      } else if (e.key === 'Enter') {
        if (availableEditions.length > 0) {
          installTo(availableEditions[focusedIdx].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [availableEditions, focusedIdx, status, onClose, playPressSound]);

  const installTo = async (instanceId: string) => {
    setStatus('installing');
    setErrorMsg(null);
    playPressSound();
    try {
      await TauriService.workshopInstall(instanceId, pkg.id, pkg.zips!, pkg.version);
      setStatus('success');
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      setErrorMsg(typeof e === 'string' ? e : e.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80"
      onClick={status !== 'installing' ? onClose : undefined}
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
          backgroundSize: '100% 100%',
          imageRendering: 'pixelated',
        }}
      >
        <div className="p-6 border-b border-[#555] bg-black/60">
          <span className="text-2xl mc-text-shadow block font-bold tracking-wide">INSTALL CONTENT</span>
          <span className="text-sm text-[#A0A0A0] mc-text-shadow uppercase tracking-widest opacity-80 mt-1">Target Edition for "{pkg.name}"</span>
        </div>

        <div className="p-4 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
          {status === 'installing' && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <span className="text-2xl text-[#ffff00] mc-text-shadow animate-pulse">Installing...</span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow">Downloading and extracting assets</span>
            </div>
          )}
          {status === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <span className="text-2xl text-[#55FF55] mc-text-shadow">Installed Successfully!</span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow">Press any key or click to continue</span>
            </div>
          )}
          {status === 'error' && (
            <div className="py-6 flex flex-col items-center justify-center gap-3">
              <span className="text-xl text-[#FF5555] mc-text-shadow">Installation Failed</span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow text-center">{errorMsg}</span>
              <button
                onClick={() => setStatus('idle')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
                className="mt-2 w-32 h-9 flex items-center justify-center text-sm mc-text-shadow text-white cursor-pointer transition-all hover:text-[#ffff00]"
                style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: '100% 100%', imageRendering: 'pixelated' }}
              >
                Retry
              </button>
            </div>
          )}

          {status === 'idle' && (
            availableEditions.length === 0 ? (
              <div className="py-6 flex items-center justify-center">
                <span className="text-[#FF5555] mc-text-shadow">No installed editions found</span>
              </div>
            ) : (
              availableEditions.map((ed, i) => (
                <div
                  key={ed.id}
                  onClick={() => installTo(ed.id)}
                  onMouseEnter={() => setFocusedIdx(i)}
                  className={`flex flex-col p-3 cursor-pointer border-2 transition-none ${focusedIdx === i ? 'border-[#ffff00] bg-black/40' : 'border-[#444] bg-black/20'}`}
                >
                  <span className={`text-lg mc-text-shadow ${focusedIdx === i ? 'text-[#ffff00]' : 'text-white'}`}>{ed.name}</span>
                </div>
              ))
            )
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function UninstallModal({ pkg, installedEntries, onClose, playPressSound, isVersionTab }: {
  pkg: RegistryPackage;
  installedEntries: InstalledWorkshopPackage[];
  onClose: () => void;
  playPressSound: () => void;
  isVersionTab?: boolean;
}) {
  const { deleteCustomEdition } = useGame();
  const game = useContext(GameContext);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [status, setStatus] = useState<'idle' | 'removing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const editionName = (instanceId: string) => {
    const ed = game?.editions.find(e => e.id === instanceId);
    return ed?.name ?? instanceId;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (status === 'removing') return;
      if (status === 'success') {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Enter') onClose();
        return;
      }

      if (e.key === 'Escape' || e.key === 'Backspace') {
        onClose();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        playPressSound();
        setFocusedIdx((p) => Math.max(p - 1, 0));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        playPressSound();
        setFocusedIdx((p) => Math.min(p + 1, installedEntries.length - 1));
      } else if (e.key === 'Enter') {
        if (installedEntries.length > 0) {
          uninstallFrom(installedEntries[focusedIdx].instanceId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [installedEntries, focusedIdx, status, onClose, playPressSound]);

  const uninstallFrom = async (instanceId: string) => {
    setStatus('removing');
    setErrorMsg(null);
    playPressSound();
    try {
      if (isVersionTab) {
        deleteCustomEdition(pkg.id);
      } else {
        await TauriService.workshopUninstall(instanceId, pkg.id);
      }
      setStatus('success');
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      setErrorMsg(typeof e === 'string' ? e : e.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80"
      onClick={status !== 'removing' ? onClose : undefined}
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
          backgroundSize: '100% 100%',
          imageRendering: 'pixelated',
        }}
      >
        <div className="p-6 border-b border-[#555] bg-black/60">
          <span className="text-2xl mc-text-shadow block font-bold tracking-wide text-[#FF5555]">REMOVE CONTENT</span>
          <span className="text-sm text-[#A0A0A0] mc-text-shadow uppercase tracking-widest opacity-80 mt-1">Select edition to remove "{pkg.name}"</span>
        </div>

        <div className="p-4 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
          {status === 'removing' && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <span className="text-2xl text-[#FF5555] mc-text-shadow animate-pulse">Removing...</span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow">Deleting installed files</span>
            </div>
          )}
          {status === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <span className="text-2xl text-[#55FF55] mc-text-shadow">Removed Successfully!</span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow">Press any key or click to continue</span>
            </div>
          )}
          {status === 'error' && (
            <div className="py-6 flex flex-col items-center justify-center gap-3">
              <span className="text-xl text-[#FF5555] mc-text-shadow">Removal Failed</span>
              <span className="text-xs text-[#A0A0A0] mc-text-shadow text-center">{errorMsg}</span>
              <button
                onClick={() => setStatus('idle')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
                className="mt-2 w-32 h-9 flex items-center justify-center text-sm mc-text-shadow text-white cursor-pointer transition-all hover:text-[#ffff00]"
                style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: '100% 100%', imageRendering: 'pixelated' }}
              >
                Retry
              </button>
            </div>
          )}

          {status === 'idle' && installedEntries.map((entry, i) => (
            <div
              key={entry.instanceId}
              onClick={() => uninstallFrom(entry.instanceId)}
              onMouseEnter={() => setFocusedIdx(i)}
              className={`flex items-center justify-between p-3 cursor-pointer border-2 transition-none ${focusedIdx === i ? 'border-[#FF5555] bg-black/40' : 'border-[#444] bg-black/20'}`}
            >
              <span className={`text-lg mc-text-shadow ${focusedIdx === i ? 'text-[#FF5555]' : 'text-white'}`}>{editionName(entry.instanceId)}</span>
              <span className="text-[10px] text-[#666] mc-text-shadow uppercase tracking-widest">v{entry.version}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default WorkshopView;

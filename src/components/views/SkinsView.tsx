import { useState, useEffect, useRef, memo } from "react";
import { motion } from "framer-motion";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { TauriService } from "../../services/TauriService";
import {
  useUI,
  useAudio,
  useSkin,
  useConfig,
} from "../../context/LauncherContext";

interface SavedSkin {
  id: string;
  name: string;
  url: string;
  isSlim?: boolean;
}

interface SavedCape {
  id: string;
  name: string;
  url: string;
}

const DEFAULT_SKINS: SavedSkin[] = [
  {
    id: "default",
    name: "Default Steve",
    url: "/images/Default.png",
    isSlim: false,
  },
  { id: "neoapps", name: "neoapps", url: "/Skins/neoapps.png", isSlim: false },
  {
    id: "justneki",
    name: "JustNeki",
    url: "/Skins/JustNeki.png",
    isSlim: false,
  },
  { id: "kayjann", name: "KayJann", url: "/Skins/KayJann.png", isSlim: false },
  { id: "leon", name: "Leon", url: "/Skins/Leon.png", isSlim: false },
  {
    id: "mr_anilex",
    name: "mr_anilex",
    url: "/Skins/mr_anilex.png",
    isSlim: false,
  },
  { id: "peter", name: "Peter", url: "/Skins/Peter.png", isSlim: false },
  { id: "piebot", name: "piebot", url: "/Skins/piebot.png", isSlim: false },
  { id: "sevenhundred", name: "700", url: "/Skins/700.png", isSlim: false },
];

const SkinsView = memo(function SkinsView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { skinUrl, setSkinUrl, setSkinIsSlim, capeUrl, setCapeUrl } = useSkin();

  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"skin" | "cape">("skin");
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const capeFileInputRef = useRef<HTMLInputElement>(null);

  const [storedSkins, setStoredSkins] = useLocalStorage<SavedSkin[]>(
    "lce-custom-skins",
    [],
  );
  const savedSkins = [
    ...DEFAULT_SKINS,
    ...storedSkins.filter((s) => !DEFAULT_SKINS.some((d) => d.id === s.id)),
  ];
  const [storedCapes, setStoredCapes] = useLocalStorage<SavedCape[]>(
    "lce-custom-capes",
    [],
  );
  const [activeCapeId, setActiveCapeId] = useState<string | null>(null);

  const TOP_BUTTONS_COUNT = viewMode === "skin" ? 3 : 3;
  const SKINS_START_INDEX = TOP_BUTTONS_COUNT;
  const BACK_BUTTON_INDEX =
    SKINS_START_INDEX +
    (viewMode === "skin" ? savedSkins.length : storedCapes.length);
  const ITEM_COUNT = BACK_BUTTON_INDEX + 1;

  const setSavedSkins = (
    newSkins: SavedSkin[] | ((val: SavedSkin[]) => SavedSkin[]),
  ) => {
    const updatedSkins =
      typeof newSkins === "function" ? newSkins(savedSkins) : newSkins;
    const customOnes = updatedSkins.filter(
      (s) => !DEFAULT_SKINS.some((d) => d.id === s.id),
    );
    setStoredSkins(customOnes);
  };

  const [activeSkinId, setActiveSkinId] = useState<string | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [modalFocusIndex, setModalFocusIndex] = useState(0);
  const [importMode, setImportMode] = useState<
    "file" | "username" | "model" | "cape" | null
  >(null);
  const [importUsername, setImportUsername] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [pendingSkin, setPendingSkin] = useState<{
    url: string;
    defaultName: string;
  } | null>(null);

  const processSkinImage = (url: string, defaultName: string) => {
    setPendingSkin({ url, defaultName });
    setImportMode("model");
    setModalFocusIndex(0);
  };

  const handleFinalizeImport = (isSlim: boolean) => {
    if (!pendingSkin) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const cvs = document.createElement("canvas");
      cvs.width = img.width;
      cvs.height = img.height;
      const ctx = cvs.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const base64String = cvs.toDataURL("image/png");
        const newId = Date.now().toString();
        const newSkin = {
          id: newId,
          name: pendingSkin.defaultName,
          url: base64String,
          isSlim,
        };
        setSavedSkins((prev) => [...prev, newSkin]);
        setSkinUrl(base64String);
        setSkinIsSlim(isSlim);
        setActiveSkinId(newId);
      }
    };
    img.src = pendingSkin.url;

    setShowImportModal(false);
    setImportMode(null);
    setPendingSkin(null);
  };

  const handleFetchUsername = async () => {
    if (!importUsername.trim()) return;
    playPressSound();
    setIsImporting(true);
    setImportError("");
    try {
      if (viewMode === "skin") {
        const [base64Raw, exactName] = await TauriService.fetchSkin(
          importUsername.trim(),
        );
        const skinBase64 = `data:image/png;base64,${base64Raw}`;
        processSkinImage(skinBase64, exactName.substring(0, 16));
      }
    } catch (e: any) {
      setImportError(
        typeof e === "string" ? e : e.message || "Failed to fetch",
      );
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    if (!activeSkinId) {
      const match = savedSkins.find((s) => s.url === skinUrl);
      if (match) setActiveSkinId(match.id);
    }
  }, [activeSkinId, savedSkins, skinUrl]);

  useEffect(() => {
    if (!activeCapeId) {
      const match = storedCapes.find((c) => c.url === capeUrl);
      if (match) setActiveCapeId(match.id);
    }
  }, [activeCapeId, storedCapes, capeUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showImportModal) {
        if (e.key === "Escape") {
          playBackSound();
          if (importMode) {
            setImportMode(null);
            setImportUsername("");
            setImportError("");
            setModalFocusIndex(0);
          } else {
            setShowImportModal(false);
            setModalFocusIndex(0);
          }
        } else if (e.key === "ArrowDown" || e.key === "Tab") {
          e.preventDefault();
          setModalFocusIndex((prev) => (prev + 1) % 3);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setModalFocusIndex((prev) => (prev - 1 + 3) % 3);
        } else if (e.key === "Enter") {
          if (!importMode) {
            if (modalFocusIndex === 0) {
              playPressSound();
              fileInputRef.current?.click();
            } else if (modalFocusIndex === 1) {
              playPressSound();
              setImportMode("username");
              setModalFocusIndex(0);
            } else if (modalFocusIndex === 2) {
              playBackSound();
              setShowImportModal(false);
              setModalFocusIndex(0);
            }
          } else if (importMode === "username") {
            if (modalFocusIndex === 0 || modalFocusIndex === 1)
              handleFetchUsername();
            else if (modalFocusIndex === 2) {
              playBackSound();
              setImportMode(null);
              setImportUsername("");
              setImportError("");
              setModalFocusIndex(0);
            }
          } else if (importMode === "model") {
            if (modalFocusIndex === 0) handleFinalizeImport(false);
            else if (modalFocusIndex === 1) handleFinalizeImport(true);
            else if (modalFocusIndex === 2) {
              playBackSound();
              setImportMode(null);
              setPendingSkin(null);
              setModalFocusIndex(0);
            }
          }
        }
        return;
      }
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "Escape") {
        playBackSound();
        setActiveView("main");
        return;
      }

      if (e.key === "ArrowRight") {
        setFocusIndex((prev) =>
          prev === null || prev >= ITEM_COUNT - 1 ? 0 : prev + 1,
        );
      } else if (e.key === "ArrowLeft") {
        setFocusIndex((prev) =>
          prev === null || prev <= 0 ? ITEM_COUNT - 1 : prev - 1,
        );
      } else if (e.key === "ArrowDown") {
        if (focusIndex === null || focusIndex < TOP_BUTTONS_COUNT) {
          setFocusIndex(SKINS_START_INDEX);
        } else if (focusIndex < BACK_BUTTON_INDEX) {
          const rowCount = viewMode === "cape" ? 3 : 4;
          const next = focusIndex + rowCount;
          setFocusIndex(next >= BACK_BUTTON_INDEX ? BACK_BUTTON_INDEX : next);
        }
      } else if (e.key === "ArrowUp") {
        if (focusIndex === null) {
          setFocusIndex(0);
        } else if (focusIndex === BACK_BUTTON_INDEX) {
          const itemCount =
            viewMode === "cape" ? storedCapes.length + 1 : savedSkins.length;
          setFocusIndex(SKINS_START_INDEX + itemCount - 1);
        } else if (focusIndex >= SKINS_START_INDEX) {
          const rowCount = viewMode === "cape" ? 3 : 4;
          const next = focusIndex - rowCount;
          setFocusIndex(next < SKINS_START_INDEX ? 0 : next);
        }
      } else if (e.key === "Enter" && focusIndex !== null) {
        if (focusIndex === 0) {
          if (viewMode === "skin") handleImportClick();
          else capeFileInputRef.current?.click();
        } else if (focusIndex === 1) {
          if (viewMode === "skin") handleDeleteActive();
          else handleDeleteActiveCape();
        } else if (focusIndex === 2) {
          playPressSound();
          setViewMode(viewMode === "skin" ? "cape" : "skin");
        } else if (focusIndex < BACK_BUTTON_INDEX) {
          handleSkinSelect(savedSkins[focusIndex - SKINS_START_INDEX]);
        } else {
          playBackSound();
          setActiveView("main");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusIndex,
    savedSkins.length,
    storedCapes.length,
    playBackSound,
    setActiveView,
    playPressSound,
    showImportModal,
    importMode,
    modalFocusIndex,
    importUsername,
    viewMode,
  ]);

  useEffect(() => {
    if (focusIndex !== null) {
      const el = containerRef.current?.querySelector(
        `[data-index="${focusIndex}"]`,
      ) as HTMLElement;
      if (el) el.focus();
    }
  }, [focusIndex]);

  const handleImportClick = () => {
    playPressSound();
    setShowImportModal(true);
    setModalFocusIndex(0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png") return;

    const defaultName = file.name.replace(".png", "").substring(0, 16);
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      processSkinImage(url, defaultName);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSkinSelect = (skin: SavedSkin) => {
    playPressSound();
    setActiveSkinId(skin.id);
    setSkinUrl(skin.url);
    setSkinIsSlim(skin.isSlim || false);
  };

  const isDefaultSkin = (id: string | null) =>
    DEFAULT_SKINS.some((d) => d.id === id);

  const handleDeleteActive = () => {
    if (!activeSkinId || isDefaultSkin(activeSkinId)) return;
    playPressSound();
    const updatedSkins = savedSkins.filter((s) => s.id !== activeSkinId);
    setSavedSkins(updatedSkins);
    setSkinUrl("/images/Default.png");
    setSkinIsSlim(false);
    setActiveSkinId("default");
  };

  const handleNameChange = (id: string, newName: string) => {
    const updatedSkins = savedSkins.map((s) =>
      s.id === id ? { ...s, name: newName } : s,
    );
    setSavedSkins(updatedSkins);
  };

  const handleCapeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png") return;

    const defaultName = file.name.replace(".png", "").substring(0, 16);
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const newId = Date.now().toString();
      const newCape: SavedCape = { id: newId, name: defaultName, url };
      setStoredCapes((prev) => [...prev, newCape]);
      setCapeUrl(url);
      setActiveCapeId(newId);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCapeSelect = (cape: SavedCape) => {
    playPressSound();
    setActiveCapeId(cape.id);
    setCapeUrl(cape.url);
  };

  const handleDeleteActiveCape = () => {
    if (!activeCapeId) return;
    playPressSound();
    const updatedCapes = storedCapes.filter((c) => c.id !== activeCapeId);
    setStoredCapes(updatedCapes);
    setCapeUrl(null);
    setActiveCapeId(null);
  };

  const handleCapeNameChange = (id: string, newName: string) => {
    const updatedCapes = storedCapes.map((c) =>
      c.id === id ? { ...c, name: newName } : c,
    );
    setStoredCapes(updatedCapes);
  };

  const isActiveDefault =
    isDefaultSkin(activeSkinId) ||
    (!activeSkinId && skinUrl === "/images/Default.png");
  const isActiveCapeDefault = !activeCapeId && !capeUrl;

  return (
    <motion.div
      ref={containerRef}
      tabIndex={-1}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: useConfig().animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-3xl outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 border-b-2 border-[#373737] pb-2 w-[60%] max-w-75 text-center tracking-widest uppercase opacity-80 font-bold">
        {viewMode === "skin" ? "Skin Library" : "Cape Library"}
      </h2>

      <div
        className="w-full max-w-160 h-85 mb-4 p-5 shadow-2xl flex flex-col relative"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <div className="w-full flex items-center border-b-2 border-[#373737] pb-4 mb-4 relative min-h-10">
          <div className="absolute left-0 right-0 flex justify-center gap-4 items-center">
            <button
              data-index="0"
              onMouseEnter={() => setFocusIndex(0)}
              onClick={() => {
                playPressSound();
                if (viewMode === "skin") handleImportClick();
                else capeFileInputRef.current?.click();
              }}
              className={`w-40 h-10 flex items-center justify-center transition-colors text-2xl mc-text-shadow outline-none border-none hover:text-[#FFFF55] ${focusIndex === 0 ? "text-[#FFFF55]" : "text-white"}`}
              style={{
                backgroundImage:
                  focusIndex === 0
                    ? "url('/images/button_highlighted.png')"
                    : "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              {viewMode === "skin" ? "Import Skin" : "Import Cape"}
            </button>

            <button
              data-index="1"
              onMouseEnter={() => {
                if (viewMode === "skin" && !isActiveDefault) setFocusIndex(1);
                else if (viewMode === "cape" && !isActiveCapeDefault)
                  setFocusIndex(1);
              }}
              onClick={() => {
                playPressSound();
                if (viewMode === "skin") handleDeleteActive();
                else handleDeleteActiveCape();
              }}
              className={`w-40 h-10 flex items-center justify-center transition-colors text-2xl mc-text-shadow outline-none border-none ${
                (viewMode === "skin" && isActiveDefault) ||
                (viewMode === "cape" && isActiveCapeDefault)
                  ? "text-gray-400 opacity-80 cursor-not-allowed"
                  : focusIndex === 1
                    ? "text-[#FFFF55]"
                    : "text-white"
              }`}
              style={{
                backgroundImage:
                  (viewMode === "skin" && isActiveDefault) ||
                  (viewMode === "cape" && isActiveCapeDefault)
                    ? "url('/images/Button_Background2.png')"
                    : focusIndex === 1
                      ? "url('/images/button_highlighted.png')"
                      : "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              {viewMode === "skin" ? "Delete Skin" : "Delete Cape"}
            </button>
          </div>

          <div className="flex-1"></div>
          <div className="flex justify-end z-10">
            <button
              data-index="2"
              onMouseEnter={() => setFocusIndex(2)}
              onClick={() => {
                playPressSound();
                setViewMode(viewMode === "skin" ? "cape" : "skin");
              }}
              className={`mc-sq-btn w-10 h-10 flex items-center justify-center outline-none border-none transition-all`}
              style={{
                backgroundImage:
                  focusIndex === 2
                    ? "url('/images/Button_Square_Highlighted.png')"
                    : "url('/images/Button_Square.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              <img
                src="/images/Update_Icon.png"
                alt={viewMode === "skin" ? "Switch to Cape" : "Switch to Skin"}
                className="w-8 h-8 object-contain pointer-events-none drop-shadow-md"
                style={{ imageRendering: "pixelated" }}
                loading="lazy"
                decoding="async"
              />
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".png"
            className="hidden"
          />
          <input
            type="file"
            ref={capeFileInputRef}
            onChange={handleCapeFileChange}
            accept=".png"
            className="hidden"
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-2 flex flex-wrap gap-x-8 gap-y-6 items-start content-start justify-center">
          {viewMode === "skin" ? (
            savedSkins.map((skin, i) => {
              const idx = SKINS_START_INDEX + i;
              const isActive = activeSkinId
                ? activeSkinId === skin.id
                : skinUrl === skin.url;
              const isFocused = focusIndex === idx;
              return (
                <div
                  key={skin.id}
                  data-index={idx}
                  tabIndex={0}
                  onMouseEnter={() => setFocusIndex(idx)}
                  className="flex flex-col items-center gap-1 w-32 outline-none"
                >
                  <div className="h-4 flex items-center justify-center gap-1">
                    {isActive && (
                      <span className="text-[#FFFF55] text-xs mc-text-shadow uppercase tracking-widest">
                        Active
                      </span>
                    )}
                    {skin.isSlim && (
                      <span className="bg-purple-500/50 border border-purple-500/80 text-white px-1 text-[10px] uppercase rounded">
                        Slim
                      </span>
                    )}
                  </div>
                  <div
                    onClick={() => handleSkinSelect(skin)}
                    className={`w-16 h-16 bg-black/40 border-2 shadow-inner relative cursor-pointer overflow-hidden transition-colors outline-none ${isActive || isFocused ? "border-[#FFFF55]" : "border-[#373737] hover:border-[#A0A0A0]"}`}
                  >
                    <img
                      src={skin.url}
                      draggable={false}
                      alt={skin.name}
                      className="absolute max-w-none"
                      style={{
                        width: "800%",
                        height: "auto",
                        left: "-100%",
                        top: "-100%",
                        imageRendering: "pixelated",
                      }}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <input
                    type="text"
                    value={skin.name}
                    maxLength={16}
                    onChange={(e) => handleNameChange(skin.id, e.target.value)}
                    className={`bg-transparent text-center outline-none border-none text-base mc-text-shadow w-full truncate transition-colors relative z-10 ${isActive || isFocused ? "text-[#FFFF55]" : "text-white"} ${isDefaultSkin(skin.id) ? "pointer-events-none" : ""}`}
                    onClick={(e) => e.stopPropagation()}
                    spellCheck={false}
                    readOnly={isDefaultSkin(skin.id)}
                  />
                </div>
              );
            })
          ) : (
            <>
              <div
                data-index={SKINS_START_INDEX}
                tabIndex={0}
                onMouseEnter={() => setFocusIndex(SKINS_START_INDEX)}
                className="flex flex-col items-center gap-1 w-32 outline-none"
              >
                <div className="h-4 flex items-center justify-center gap-1">
                  {isActiveCapeDefault && (
                    <span className="text-[#FFFF55] text-xs mc-text-shadow uppercase tracking-widest">
                      Active
                    </span>
                  )}
                </div>
                <div
                  onClick={() => {
                    playPressSound();
                    setCapeUrl(null);
                    setActiveCapeId(null);
                  }}
                  className={`w-16 h-16 bg-black/40 border-2 shadow-inner relative cursor-pointer overflow-hidden transition-colors outline-none flex items-center justify-center ${isActiveCapeDefault || focusIndex === SKINS_START_INDEX ? "border-[#FFFF55]" : "border-[#373737] hover:border-[#A0A0A0]"}`}
                >
                  <span className="text-gray-500 text-2xl">X</span>
                </div>
                <span
                  className={`text-center outline-none border-none text-base mc-text-shadow w-full truncate transition-colors ${isActiveCapeDefault || focusIndex === SKINS_START_INDEX ? "text-[#FFFF55]" : "text-white"}`}
                >
                  No Cape
                </span>
              </div>
              {storedCapes.map((cape, i) => {
                const idx = SKINS_START_INDEX + 1 + i;
                const isActive = activeCapeId
                  ? activeCapeId === cape.id
                  : capeUrl === cape.url;
                const isFocused = focusIndex === idx;
                return (
                  <div
                    key={cape.id}
                    data-index={idx}
                    tabIndex={0}
                    onMouseEnter={() => setFocusIndex(idx)}
                    className="flex flex-col items-center gap-1 w-32 outline-none"
                  >
                    <div className="h-4 flex items-center justify-center gap-1">
                      {isActive && (
                        <span className="text-[#FFFF55] text-xs mc-text-shadow uppercase tracking-widest">
                          Active
                        </span>
                      )}
                    </div>
                    <div
                      onClick={() => handleCapeSelect(cape)}
                      className={`w-16 h-16 bg-black/40 border-2 shadow-inner relative cursor-pointer overflow-hidden transition-colors outline-none ${isActive || isFocused ? "border-[#FFFF55]" : "border-[#373737] hover:border-[#A0A0A0]"}`}
                    >
                      <img
                        src={cape.url}
                        draggable={false}
                        alt={cape.name}
                        className="absolute max-w-none"
                        style={{
                          width: "auto",
                          height: "200%",
                          left: "50%",
                          top: "-50%",
                          transform: "translateX(-50%)",
                          imageRendering: "pixelated",
                        }}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <input
                      type="text"
                      value={cape.name}
                      maxLength={16}
                      onChange={(e) =>
                        handleCapeNameChange(cape.id, e.target.value)
                      }
                      className={`bg-transparent text-center outline-none border-none text-base mc-text-shadow w-full truncate transition-colors relative z-10 ${isActive || isFocused ? "text-[#FFFF55]" : "text-white"}`}
                      onClick={(e) => e.stopPropagation()}
                      spellCheck={false}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      <button
        data-index={BACK_BUTTON_INDEX}
        onMouseEnter={() => setFocusIndex(BACK_BUTTON_INDEX)}
        onClick={() => {
          playBackSound();
          setActiveView("main");
        }}
        className={`w-72 h-14 flex items-center justify-center transition-colors text-2xl mc-text-shadow mt-2 outline-none border-none hover:text-[#FFFF55] ${focusIndex === BACK_BUTTON_INDEX ? "text-[#FFFF55]" : "text-white"}`}
        style={{
          backgroundImage:
            focusIndex === BACK_BUTTON_INDEX
              ? "url('/images/button_highlighted.png')"
              : "url('/images/Button_Background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        Back
      </button>

      {showImportModal && viewMode === "skin" && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="flex flex-col items-center bg-[#252525] p-6 border-4 border-[#373737] shadow-[0_0_20px_rgba(0,0,0,0.8)] relative"
            style={{
              backgroundImage: "url('/images/frame_background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
              minWidth: "400px",
            }}
          >
            <h2 className="text-2xl text-white mc-text-shadow mb-6 tracking-widest uppercase font-bold text-center">
              Import Skin
            </h2>

            {!importMode ? (
              <div className="flex flex-col gap-4 w-full px-4 mb-2">
                <button
                  onMouseEnter={() => setModalFocusIndex(0)}
                  onClick={() => {
                    playPressSound();
                    fileInputRef.current?.click();
                  }}
                  className={`w-full h-12 flex items-center justify-center transition-colors text-xl mc-text-shadow outline-none ${modalFocusIndex === 0 ? "text-[#FFFF55]" : "text-white"}`}
                  style={{
                    backgroundImage:
                      modalFocusIndex === 0
                        ? "url('/images/button_highlighted.png')"
                        : "url('/images/Button_Background.png')",
                    backgroundSize: "100% 100%",
                    imageRendering: "pixelated",
                  }}
                >
                  From File
                </button>
                <button
                  onMouseEnter={() => setModalFocusIndex(1)}
                  onClick={() => {
                    playPressSound();
                    setImportMode("username");
                    setModalFocusIndex(0);
                  }}
                  className={`w-full h-12 flex items-center justify-center transition-colors text-xl mc-text-shadow outline-none ${modalFocusIndex === 1 ? "text-[#FFFF55]" : "text-white"}`}
                  style={{
                    backgroundImage:
                      modalFocusIndex === 1
                        ? "url('/images/button_highlighted.png')"
                        : "url('/images/Button_Background.png')",
                    backgroundSize: "100% 100%",
                    imageRendering: "pixelated",
                  }}
                >
                  From Username
                </button>
              </div>
            ) : importMode === "username" ? (
              <div className="flex flex-col gap-4 w-full px-4 mb-2">
                <input
                  type="text"
                  placeholder="Minecraft Username"
                  value={importUsername}
                  onChange={(e) => setImportUsername(e.target.value)}
                  onFocus={() => setModalFocusIndex(0)}
                  autoFocus
                  spellCheck={false}
                  className={`w-full h-12 bg-black/50 border-2 text-white px-4 text-xl outline-none transition-colors relative z-10 ${modalFocusIndex === 0 ? "border-[#FFFF55]" : "border-[#373737]"}`}
                />

                {importError && (
                  <span className="text-red-400 text-sm text-center mc-text-shadow">
                    {importError}
                  </span>
                )}

                <button
                  onMouseEnter={() => setModalFocusIndex(1)}
                  onClick={handleFetchUsername}
                  disabled={isImporting}
                  className={`w-full h-12 flex items-center justify-center transition-colors text-xl mc-text-shadow outline-none ${isImporting ? "opacity-50" : modalFocusIndex === 1 ? "text-[#FFFF55]" : "text-white"}`}
                  style={{
                    backgroundImage:
                      modalFocusIndex === 1
                        ? "url('/images/button_highlighted.png')"
                        : "url('/images/Button_Background.png')",
                    backgroundSize: "100% 100%",
                    imageRendering: "pixelated",
                  }}
                >
                  {isImporting
                    ? "Fetching..."
                    : `Fetch ${viewMode === "skin" ? "Skin" : "Cape"}`}
                </button>
              </div>
            ) : importMode === "model" ? (
              <div className="flex flex-col gap-4 w-full px-4 mb-2">
                <span className="text-white/80 text-sm text-center mb-2 mc-text-shadow">
                  Choose the player model type for this skin:
                </span>
                <button
                  onMouseEnter={() => setModalFocusIndex(0)}
                  onClick={() => {
                    playPressSound();
                    handleFinalizeImport(false);
                  }}
                  className={`w-full h-12 flex items-center justify-center transition-colors text-xl mc-text-shadow outline-none ${modalFocusIndex === 0 ? "text-[#FFFF55]" : "text-white"}`}
                  style={{
                    backgroundImage:
                      modalFocusIndex === 0
                        ? "url('/images/button_highlighted.png')"
                        : "url('/images/Button_Background.png')",
                    backgroundSize: "100% 100%",
                    imageRendering: "pixelated",
                  }}
                >
                  Normal (Wide Arms)
                </button>
                <button
                  onMouseEnter={() => setModalFocusIndex(1)}
                  onClick={() => {
                    playPressSound();
                    handleFinalizeImport(true);
                  }}
                  className={`w-full h-12 flex items-center justify-center transition-colors text-xl mc-text-shadow outline-none ${modalFocusIndex === 1 ? "text-[#FFFF55]" : "text-white"}`}
                  style={{
                    backgroundImage:
                      modalFocusIndex === 1
                        ? "url('/images/button_highlighted.png')"
                        : "url('/images/Button_Background.png')",
                    backgroundSize: "100% 100%",
                    imageRendering: "pixelated",
                  }}
                >
                  Slim (Thin Arms)
                </button>
              </div>
            ) : null}

            <button
              onMouseEnter={() => setModalFocusIndex(2)}
              onClick={() => {
                playBackSound();
                setShowImportModal(false);
                setImportMode(null);
                setImportUsername("");
                setImportError("");
                setModalFocusIndex(0);
              }}
              className={`w-40 h-10 flex items-center justify-center transition-colors text-lg mc-text-shadow mt-6 outline-none ${modalFocusIndex === 2 ? "text-[#FFFF55]" : "text-white"}`}
              style={{
                backgroundImage:
                  modalFocusIndex === 2
                    ? "url('/images/button_highlighted.png')"
                    : "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
});

export default SkinsView;

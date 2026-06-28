import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import "../css/App.css";
import HomeView from "../components/views/HomeView";
import SettingsView from "../components/views/SettingsView";
import VersionsView from "../components/views/VersionsView";
import DevtoolsView from "../components/views/DevtoolsView";
import SkinsView from "../components/views/SkinsView";
import WorkshopView from "../components/views/WorkshopView";
import SetupView from "../components/views/SetupView";
import PckEditorView from "../components/views/PckEditorView";
import { ArcEditorView } from "../components/views/ArcEditorView";
import LocEditorView from "../components/views/LocEditorView";
import GrfEditorView from "../components/views/GrfEditorView";
import ColEditorView from "../components/views/ColEditorView";
import OptionsEditorView from "../components/views/OptionsEditorView";
import ScreenshotsView from "../components/views/ScreenshotsView";
import SwfView from "../components/views/SwfView";
import LceLiveView from "../components/views/LceLiveView";
import CreditsView from "../components/views/CreditsView";
import SkinViewer from "../components/common/SkinViewer";
import PanoramaBackground from "../components/common/PanoramaBackground";
import { ClickParticles } from "../components/common/ClickParticles";
import { CinematicIntro } from "../components/common/CinematicIntro";
import { DownloadOverlay } from "../components/layout/DownloadOverlay";
import { AppHeader } from "../components/layout/AppHeader";
import { AchievementToast } from "../components/common/AchievementToast";
import {
  useUI,
  useConfig,
  useAudio,
  useGame,
  useSkin,
} from "../context/LauncherContext";
import { TauriService } from "../services/TauriService";
import { useLceLiveNotifications } from "../hooks/useLceLiveNotifications";
import { usePluginViews } from "../plugins/PluginContext";
import { usePlatform } from "../hooks/usePlatform";
import { PluginManager } from "../plugins/PluginManager";
import { PluginViewContainer } from "../components/plugins/PluginViewContainer";
import type { Edition } from "../types/edition";
import type { ToastOptions } from "../plugins/types";
import pkg from "../../package.json";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
export default function App() {
  const ui = useUI();
  const {
    showIntro,
    setShowIntro,
    activeView,
    setActiveView,
    isUiHidden,
    setIsUiHidden,
    focusSection,
    onNavigateToMenu,
    updateMessage,
    updateUrl,
    clearUpdateMessage,
    connected,
  } = ui;
  const config = useConfig();
  const audio = useAudio();
  const game = useGame();
  const skin = useSkin();
  const { skinUrl, setSkinUrl, capeUrl } = skin;
  const notifications = useLceLiveNotifications();
  const {
    friendRequestMessage,
    gameInviteMessage,
    clearFriendRequestMessage,
    clearGameInviteMessage,
  } = notifications;
  const [showSetup, setShowSetup] = useState(false);
  const [isSetupChecked, setIsSetupChecked] = useState(false);
  const pendingDeepLinks = useRef<string[]>([]);
  const appReadyRef = useRef(false);
  const [workshopTarget, setWorkshopTarget] = useState<{
    id: string;
    type?: string;
  } | null>(null);
  const [addFriendTarget, setAddFriendTarget] = useState<string | null>(null);
  const displayIsDay = config.isDayTime;
  const clearError = useCallback(() => game.setError(null), [game]);
  const clearGameUpdate = useCallback(
    () => game.setGameUpdateMessage(null),
    [game],
  );
  const clearSteamSuccess = useCallback(
    () => game.setSteamSuccessMessage(null),
    [game],
  );
  const pluginViews = usePluginViews();
  const [pluginToast, setPluginToast] = useState<{
    message: string;
    options?: ToastOptions;
  } | null>(null);
  useEffect(() => {
    const pm = PluginManager.instance;
    pm.setNavigateCallback((viewId) => {
      setActiveView(viewId);
    });
    pm.setToastCallback((_pluginId, message, options) => {
      setPluginToast({ message, options });
    });
    pm.setSoundCallback((name) => {
      audio.playSfx(name);
    });
  }, [setActiveView, audio.playSfx]);

  useEffect(() => {
    if (!config.isLoaded) return;
    PluginManager.instance.updateSnapshots(
      { ...config } as unknown as Record<string, unknown>,
      {
        isGameRunning: game.isGameRunning,
        downloadProgress: game.downloadProgress,
        downloadingIds: game.downloadingIds,
      },
      game.installs,
    );
  }, [
    config,
    game.isGameRunning,
    game.downloadProgress,
    game.downloadingIds,
    game.installs,
    config.isLoaded,
  ]);

  useEffect(() => {
    if (showIntro && config.skipIntro) {
      setShowIntro(false);
    }
  }, [showIntro, config.skipIntro, setShowIntro]);

  const processDeepLink = useCallback(
    (url: string) => {
      try {
        const parsed = new URL(url);
        const path = parsed.hostname + parsed.pathname;
        const parts = path.replace(/^\/+/, "").split("/").filter(Boolean);
        if (parts.length === 0) return;
        const action = parts[0];
        if (action === "launch") {
          if (parts.length >= 2) {
            let instanceId = decodeURIComponent(parts[1]);
            if (instanceId === "neolegacy") instanceId = "legacy_evolved"; //neo: piebot said so
            TauriService.launchGame(instanceId, []).catch(console.error);
          } else {
            setActiveView("main");
            game.handleLaunch().catch(console.error);
          }
          return;
        }

        if (
          action === "lcelive" &&
          parts.length >= 2 &&
          parts[1] === "addfriend"
        ) {
          const username = parsed.searchParams.get("username");
          if (username) {
            setActiveView("lcelive");
            setAddFriendTarget(username);
            return;
          }
        }

        if (action === "workshop" && parts.length >= 2) {
          const workshopId = decodeURIComponent(parts[1]);
          const knownTypes = ["normal", "bytebukkit", "plugin", "version"];
          let workshopType: string | undefined;
          if (parts.length >= 3) {
            workshopType = parts[2];
          } else if (parsed.searchParams.get("type")) {
            workshopType = parsed.searchParams.get("type")!;
          } else {
            workshopType = knownTypes.find((t) => parsed.searchParams.has(t));
          }
          setActiveView("workshop");
          setWorkshopTarget({ id: workshopId, type: workshopType });
          return;
        }

        setActiveView(action); //neo: yeah no im not checking if its valid or not.
      } catch (e) {
        console.error("failed to parse deep link:", e);
      }
    },
    [setActiveView, game.handleLaunch, setWorkshopTarget],
  );

  const appReady =
    config.isLoaded && isSetupChecked && !showSetup && !showIntro;

  useEffect(() => {
    if (appReady) {
      appReadyRef.current = true;
      if (pendingDeepLinks.current.length > 0) {
        for (const url of pendingDeepLinks.current) {
          processDeepLink(url);
        }
        pendingDeepLinks.current = [];
      }
    }
  }, [appReady, processDeepLink]);

  const queueDeepLink = useCallback(
    (url: string) => {
      if (appReadyRef.current) {
        processDeepLink(url);
      } else {
        pendingDeepLinks.current.push(url);
      }
    },
    [processDeepLink],
  );

  useEffect(() => {
    getCurrent()
      .then((urls) => {
        if (urls && urls.length > 0) {
          queueDeepLink(urls[0]);
        }
      })
      .catch(() => {});

    let unlistenOpenUrl: Function;
    onOpenUrl((payload) => {
      for (const url of payload) {
        queueDeepLink(url);
      }
    }).then((unlistenFn) => {
      unlistenOpenUrl = unlistenFn;
    });

    let unlistenEvent: Function;
    listen<string[]>("deep-link", (event) => {
      for (const url of event.payload) {
        queueDeepLink(url);
      }
    }).then((unlistenFn) => {
      unlistenEvent = unlistenFn;
    });

    return () => {
      if (unlistenOpenUrl) unlistenOpenUrl();
      if (unlistenEvent) unlistenEvent();
    };
  }, [queueDeepLink]);
  const { isMac } = usePlatform();
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const appWindow = getCurrentWindow();
    if (!isMac) appWindow.setDecorations(false);
    const checkFs = async () => setIsFullscreen(await appWindow.isFullscreen());
    checkFs();
    const unlisten = appWindow.onResized(checkFs);
    return () => {
      unlisten.then((fn: () => void) => fn());
    };
  }, [isMac]);
  const showHeader = !isMac || isFullscreen;
  useEffect(() => {
    if (config.isLoaded) {
      const setupCompleted =
        localStorage.getItem("lce-setup-completed") === "true";
      setShowSetup(!setupCompleted);
      setIsSetupChecked(true);
    }
  }, [config.isLoaded]);

  const selectedEdition = useMemo(
    () => game.editions.find((e: Edition) => e.instanceId === config.profile),
    [game.editions, config.profile],
  );
  const selectedVersionName = selectedEdition?.name ?? "";
  const hasAnyInstall = game.installs.length > 0;
  const titleImage = selectedEdition?.titleImage ?? "/images/MenuTitle.png";
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  const animDuration = config.animationsEnabled ? undefined : { duration: 0 };
  const uiFade = useMemo(
    () => ({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: animDuration ?? { duration: 0.5 },
    }),
    [animDuration],
  );

  const backgroundFade = useMemo(
    () => ({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: animDuration ?? { duration: 0.8 },
    }),
    [animDuration],
  );

  if (!config.isLoaded || !isSetupChecked) {
    return <div className="w-screen h-screen bg-black" />;
  }

  if (showSetup) {
    return (
      <div
        className={`w-screen h-screen overflow-hidden select-none flex flex-col relative bg-black text-white font-['Mojangles'] outline-none focus:outline-none ${!config.animationsEnabled ? "no-animations" : ""}`}
      >
        <SetupView
          onComplete={() => {
            setShowSetup(false);
            setShowIntro(true);
          }}
        />
      </div>
    );
  }

  if (showIntro && !config.skipIntro) {
    return (
      <div
        className={`w-screen h-screen overflow-hidden select-none flex flex-col relative bg-black text-white font-['Mojangles'] outline-none focus:outline-none ${!config.animationsEnabled ? "no-animations" : ""}`}
      >
        <CinematicIntro
          onComplete={() => {
            setShowIntro(false);
          }}
          startMusic={audio.startMusic}
        />
      </div>
    );
  }

  return (
    <MotionConfig transition={config.animationsEnabled ? {} : { duration: 0 }}>
      <div
        className={`w-screen h-screen overflow-hidden select-none flex flex-col relative bg-black text-white font-['Mojangles'] outline-none focus:outline-none ${!config.animationsEnabled ? "no-animations" : ""}`}
      >
        <div className="absolute inset-0">
          <AnimatePresence>
            <motion.div
              key={displayIsDay ? "day" : "night"}
              className="absolute inset-0"
              {...backgroundFade}
            >
              <PanoramaBackground
                profile={selectedEdition?.panorama ?? "vanilla_tu19"}
                isDay={displayIsDay}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {config.vfxEnabled && <ClickParticles />}
        {showHeader && (
          <AppHeader playPressSound={audio.playPressSound} uiFade={uiFade} />
        )}

        <DownloadOverlay
          downloadProgress={game.downloadProgress}
          downloadingIds={game.downloadingIds}
          editions={game.editions}
        />

        <AchievementToast message={game.error} onClose={clearError} />

        <AchievementToast
          message={updateMessage}
          onClose={clearUpdateMessage}
          onClick={() =>
            TauriService.openUrl(
              updateUrl ||
                "https://github.com/LCE-Hub/LCE-Emerald-Launcher/releases/latest",
            )
          }
          title="Update Available!"
          variant="update"
        />

        <AchievementToast
          message={game.gameUpdateMessage}
          onClose={clearGameUpdate}
          onClick={() => {
            clearGameUpdate();
            setActiveView("versions");
          }}
          title="Game Update Available!"
          variant="update"
        />

        <AchievementToast
          message={game.steamSuccessMessage}
          onClose={clearSteamSuccess}
          title="Steam Integration"
          variant="steam"
        />

        {pluginToast && (
          <AchievementToast
            message={pluginToast.message}
            onClose={() => setPluginToast(null)}
            title={pluginToast.options?.title}
            variant={pluginToast.options?.variant}
          />
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`flex flex-col h-full z-10 w-full relative ${showHeader ? "pt-12" : ""}`}
        >
          {!config.legacyMode && (
            <motion.div {...uiFade} className="absolute top-10 left-8 z-50">
              <button
                onClick={() => {
                  audio.playPressSound();
                  setIsUiHidden(!isUiHidden);
                }}
                className="outline-none bg-transparent border-none"
              >
                <img
                  src={
                    isUiHidden
                      ? "/images/Unhide_UI_Button.png"
                      : "/images/Hide_UI_Button.png"
                  }
                  className="w-10 h-10 cursor-pointer object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              </button>
            </motion.div>
          )}

          {!config.legacyMode && (
            <motion.div
              {...uiFade}
              className="absolute bottom-6 right-8 z-50 flex items-center gap-3"
            >
              <span className="text-[#E0E0E0] text-[10px] mc-text-shadow tracking-widest uppercase opacity-70 mt-1">
                {displayIsDay ? "Day" : "Night"}
              </span>
              <button
                onClick={() => {
                  audio.playPressSound();
                  config.setIsDayTime(!config.isDayTime);
                }}
                className="outline-none bg-transparent border-none"
              >
                <img
                  src={
                    displayIsDay
                      ? "/images/Day_Toggle.png"
                      : "/images/Night_Toggle.png"
                  }
                  alt="Toggle Time"
                  className="w-12 h-12 cursor-pointer block object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              </button>
            </motion.div>
          )}

          {isUiHidden && !displayIsDay && activeView === "devtools" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none"
            >
              <button
                onClick={() => {
                  audio.playPressSound();
                  setIsUiHidden(false);
                  setActiveView("swf-editor");
                }}
                className="pointer-events-auto outline-none bg-transparent border-none flex flex-col items-center gap-2 group"
              >
                <img
                  src="/images/tools/pck.png"
                  className="w-16 h-16 cursor-pointer object-contain opacity-50 drop-shadow-[0_4px_4px_rgba(0,0,0,1)] grayscale"
                  style={{ imageRendering: "pixelated" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "/images/Button_Background.png";
                  }}
                />
                <span className="text-[#FFFF55] text-sm mc-text-shadow">
                  SWF Editor
                </span>
              </button>
            </motion.div>
          )}

          <div className="shrink-0 flex justify-center py-4 relative w-full pt-4">
            <div className="relative w-full max-w-135 flex justify-center">
              {activeView !== "credits" && (
                <motion.img
                  layoutId="mainLogo"
                  src={titleImage}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                  className="w-full drop-shadow-[0_8px_6px_rgba(0,0,0,0.8)] pointer-events-none"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
              {activeView !== "credits" && (
                <motion.div
                  {...uiFade}
                  className="absolute bottom-[20%] right-[5%] w-0 h-0 flex items-center justify-center"
                >
                  <div
                    onClick={audio.cycleSplash}
                    className="mc-splash text-[#FFFF55] text-[28px] z-100 cursor-pointer whitespace-nowrap"
                    style={{ textShadow: "2px 2px 0px #3F3F00" }}
                  >
                    {audio.splashIndex === -1
                      ? `Welcome ${config.username}!`
                      : audio.splashes[audio.splashIndex]}
                  </div>
                </motion.div>
              )}
              {activeView === "main" &&
                hasAnyInstall &&
                titleImage === "/images/MenuTitle.png" && (
                  <motion.div
                    {...uiFade}
                    className="absolute -bottom-6 text-[#A0A0A0] text-sm mc-text-shadow tracking-widest uppercase opacity-80 font-['Mojangles']"
                  >
                    {selectedVersionName}
                  </motion.div>
                )}
            </div>
          </div>

          <main className="flex-1 w-full relative">
            <div
              className={`w-full h-full flex flex-col items-center justify-center ${isUiHidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            >
              <AnimatePresence mode="wait">
                {activeView === "main" && (
                    <SkinViewer
                      key="skin-viewer"
                      username={config.username}
                      setUsername={config.setUsername}
                      playPressSound={audio.playPressSound}
                      skinUrl={skinUrl}
                      capeUrl={config.legacyMode ? null : capeUrl}
                      setSkinUrl={setSkinUrl}
                      setActiveView={setActiveView}
                      setIsUiHidden={setIsUiHidden}
                      isFocusedSection={focusSection === "skin"}
                      onNavigateRight={onNavigateToMenu}
                    />
                )}
              </AnimatePresence>

              <div className="w-full h-full max-w-7xl relative flex justify-center items-center overflow-hidden">
                <AnimatePresence mode="wait">
                  {activeView === "main" && <HomeView key="main-view" />}
                  {activeView === "settings" && (
                    <SettingsView key="settings-view" />
                  )}
                  {activeView === "versions" && (
                    <VersionsView key="versions-view" />
                  )}
                  {activeView === "workshop" && (
                    <WorkshopView
                      key="workshop-view"
                      workshopTarget={workshopTarget}
                      onClearWorkshopTarget={() => setWorkshopTarget(null)}
                    />
                  )}
                  {activeView === "devtools" && (
                    <DevtoolsView key="devtools-view" />
                  )}
                  {activeView === "pck-editor" && (
                    <PckEditorView key="pck-editor-view" />
                  )}
                  {activeView === "arc-editor" && (
                    <ArcEditorView key="arc-editor-view" />
                  )}
                  {activeView === "loc-editor" && (
                    <LocEditorView key="loc-editor-view" />
                  )}
                  {activeView === "grf-editor" && (
                    <GrfEditorView key="grf-editor-view" />
                  )}
                  {activeView === "col-editor" && (
                    <ColEditorView key="col-editor-view" />
                  )}
                  {activeView === "options-editor" && (
                    <OptionsEditorView key="options-editor-view" />
                  )}
                  {activeView === "swf-editor" && (
                    <SwfView key="swf-editor-view" />
                  )}
                  {activeView === "lcelive" && (
                    <LceLiveView
                      key="lcelive-view"
                      addFriendTarget={addFriendTarget}
                      onClearAddFriendTarget={() => setAddFriendTarget(null)}
                    />
                  )}
                  {activeView === "skins" && <SkinsView key="skins-view" />}
                  {activeView === "screenshots" && (
                    <ScreenshotsView key="screenshots-view" />
                  )}
                  {activeView === "credits" && (
                    <CreditsView key="credits-view" />
                  )}
                  {pluginViews.map((pv) => {
                    if (activeView === pv.id) {
                      return <PluginViewContainer key={pv.id} registry={pv} />;
                    }
                    return null;
                  })}
                </AnimatePresence>
              </div>
            </div>
          </main>

          <motion.footer
            {...uiFade}
            className="shrink-0 p-4 flex justify-between items-end text-[10px] text-[#A0A0A0] mc-text-shadow bg-gradient-to-t from-black/80 to-transparent uppercase tracking-widest opacity-60 font-['Mojangles']"
            style={{ fontWeight: "normal" }}
          >
            <div className="flex-1 text-left whitespace-nowrap">
              Version: {pkg.version} ({__BUILD_DATE__})
            </div>
            <div className="flex-[2] text-center whitespace-nowrap">
              Not affiliated with Mojang AB or Microsoft. "Minecraft" is a
              trademark of Mojang Synergies AB.
            </div>
            <div className="flex-1 text-right whitespace-nowrap">
              {connected && "CONTROLLER CONNECTED"}
            </div>
          </motion.footer>
        </motion.div>

        <AchievementToast
          message={friendRequestMessage}
          onClose={clearFriendRequestMessage}
          onClick={() => {
            clearFriendRequestMessage();
            setActiveView("lcelive");
          }}
          title="Friend Request"
          variant="update"
        />

        <AchievementToast
          message={gameInviteMessage}
          onClose={clearGameInviteMessage}
          onClick={() => {
            clearGameInviteMessage();
            setActiveView("lcelive");
          }}
          title="Game Invite"
          variant="update"
        />
      </div>
    </MotionConfig>
  );
}

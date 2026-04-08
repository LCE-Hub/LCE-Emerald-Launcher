import { useEffect, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import HomeView from "../components/views/HomeView";
import SettingsView from "../components/views/SettingsView";
import VersionsView from "../components/views/VersionsView";
import DevtoolsView from "../components/views/DevtoolsView";
import SkinsView from "../components/views/SkinsView";
import WorkshopView from "../components/views/WorkshopView";
import SetupView from "../components/views/SetupView";
import SkinViewer from "../components/common/SkinViewer";
import TeamModal from "../components/modals/TeamModal";
import PanoramaBackground from "../components/common/PanoramaBackground";
import { ClickParticles } from "../components/common/ClickParticles";
import { DownloadOverlay } from "../components/layout/DownloadOverlay";
import { AchievementToast } from "../components/common/AchievementToast";
import {
  useUI,
  useConfig,
  useAudio,
  useGame,
  useSkin,
} from "../context/LauncherContext";
import { TauriService } from "../services/TauriService";
import pkg from "../../package.json";

export default function App() {
  const {
    showIntro,
    setShowIntro,
    logoAnimDone,
    setLogoAnimDone,
    activeView,
    setActiveView,
    isUiHidden,
    setIsUiHidden,
    showCredits,
    setShowCredits,
    focusSection,
    onNavigateToMenu,
    updateMessage,
    clearUpdateMessage,
  } = useUI();

  const config = useConfig();
  const audio = useAudio();
  const game = useGame();
  const { skinUrl, setSkinUrl } = useSkin();

  const [showSetup, setShowSetup] = useState(true);
  const [displayIsDay, setDisplayIsDay] = useState(config.isDayTime);

  useEffect(() => {
    setDisplayIsDay(config.isDayTime);
  }, [config.isDayTime]);

  const selectedEdition = game.editions.find(
    (e: any) => e.id === config.profile,
  );
  const selectedVersionName = selectedEdition?.name || "";

  const titleImage = selectedEdition?.titleImage || "/images/MenuTitle.png";

  useEffect(() => {
    if (config.isLoaded) {
      const setupCompleted =
        localStorage.getItem("lce-setup-completed") === "true";
      setShowSetup(!setupCompleted);
    }
  }, [config.isLoaded]);

  useEffect(() => {
    setTimeout(() => setShowIntro(false), 2400);
    setTimeout(() => setLogoAnimDone(true), 3400);
  }, [showSetup]);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  const uiFade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: config.animationsEnabled ? 0.5 : 0 },
  };

  const backgroundFade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: config.animationsEnabled ? 0.8 : 0 },
  };

  return (
    <MotionConfig transition={config.animationsEnabled ? {} : { duration: 0 }}>
      <div
        className={`w-screen h-screen overflow-hidden select-none flex flex-col relative bg-black text-white font-['Mojangles'] outline-none focus:outline-none ${!config.animationsEnabled ? "no-animations" : ""}`}
      >
        <style>{`
        @keyframes splashPulse { 0% { transform: scale(0.95) rotate(-20deg); } 100% { transform: scale(1.08) rotate(-20deg); } }
        .mc-splash { animation: splashPulse 0.45s ease-in-out infinite alternate; transform-origin: center; }
        .mc-slider-custom { -webkit-appearance: none; appearance: none; background: transparent; height: 100%; outline: none; border: none; margin: 0; padding: 0; }
        .mc-slider-custom::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 44px; background: url('/images/Slider_Handle.png') no-repeat center; background-size: 100% 100%; cursor: pointer; position: relative; z-index: 30; }
        *:focus { outline: none !important; box-shadow: none !important; }
        button, input { border-radius: 0 !important; border: none !important; outline: none !important; box-shadow: none !important; }
        .mc-sq-btn { background: url('/images/Button_Square.png') no-repeat center; background-size: 100% 100%; image-rendering: pixelated; }
        .mc-sq-btn:hover { background: url('/images/Button_Square_Highlighted.png') no-repeat center; background-size: 100% 100%; }
      `}</style>

        <div className="absolute inset-0">
          <AnimatePresence>
            <motion.div
              key={displayIsDay ? "day" : "night"}
              className="absolute inset-0"
              {...backgroundFade}
            >
              <PanoramaBackground
                profile={config.profile}
                isDay={displayIsDay}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        {config.vfxEnabled && <ClickParticles />}

        <AnimatePresence>
          {showCredits && (
            <TeamModal
              isOpen={showCredits}
              onClose={() => setShowCredits(false)}
              playPressSound={audio.playPressSound}
              playSfx={audio.playSfx}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          <DownloadOverlay
            downloadProgress={game.downloadProgress}
            downloadingId={game.downloadingId}
            editions={game.editions}
          />
        </AnimatePresence>

        <AchievementToast
          message={game.error}
          onClose={() => game.setError(null)}
        />

        <AchievementToast
          message={updateMessage}
          onClose={clearUpdateMessage}
          onClick={() =>
            TauriService.openUrl("https://emerald-legacy-launcher.github.io/")
          }
          title="Update Available!"
          variant="update"
        />

        <AnimatePresence>
          {showSetup ? (
            <SetupView
              key="setup"
              onComplete={() => {
                setShowSetup(false);
                setShowIntro(true);
              }}
            />
          ) : showIntro ? (
            <motion.div
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-1 items-center justify-center z-10 pointer-events-none"
            >
              <motion.img
                layoutId="mainLogo"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                src={titleImage}
                className="w-3/4 max-w-3xl"
                style={{ imageRendering: "pixelated" }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col h-full z-10 w-full relative"
            >
              <AnimatePresence>
                {logoAnimDone && (
                  <>
                    {!config.legacyMode && (
                      <motion.div
                        key="hideBtn"
                        {...uiFade}
                        className="absolute top-4 left-8 z-50"
                      >
                        <button
                          onClick={() => {
                            audio.playPressSound();
                            setIsUiHidden(!isUiHidden);
                          }}
                          className="hover:scale-110 active:scale-95 transition-transform outline-none bg-transparent border-none"
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
                        key="dayToggle"
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
                          className="hover:scale-110 active:scale-95 transition-transform outline-none bg-transparent border-none"
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
                  </>
                )}
              </AnimatePresence>

              <div className="shrink-0 flex justify-center py-4 relative w-full pt-4">
                <div className="relative w-full max-w-135 flex justify-center">
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
                  <AnimatePresence>
                    {logoAnimDone && (
                      <>
                        <motion.div
                          key="splash"
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
                        {activeView === "main" &&
                          titleImage === "/images/MenuTitle.png" && (
                            <motion.div
                              key="tu-subtitle"
                              {...uiFade}
                              className="absolute -bottom-6 text-[#A0A0A0] text-sm mc-text-shadow tracking-widest uppercase opacity-80 font-['Mojangles']"
                            >
                              {selectedVersionName}
                            </motion.div>
                          )}
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <main className="flex-1 w-full relative">
                <div
                  className={`w-full h-full flex flex-col items-center justify-center ${!logoAnimDone || isUiHidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}
                >
                  <AnimatePresence mode="wait">
                    {activeView === "main" && (
                      <SkinViewer
                        key="skin-viewer"
                        username={config.username}
                        setUsername={config.setUsername}
                        playPressSound={audio.playPressSound}
                        skinUrl={skinUrl}
                        setSkinUrl={setSkinUrl}
                        setActiveView={setActiveView}
                        isFocusedSection={focusSection === "skin"}
                        onNavigateRight={onNavigateToMenu}
                      />
                    )}
                  </AnimatePresence>

                  <div className="w-full max-w-4xl relative flex justify-center items-center">
                    <AnimatePresence mode="wait">
                      {activeView === "main" && <HomeView key="main-view" />}
                      {activeView === "settings" && (
                        <SettingsView key="settings-view" />
                      )}
                      {activeView === "versions" && (
                        <VersionsView key="versions-view" />
                      )}
                      {activeView === "workshop" && (
                        <WorkshopView key="workshop-view" />
                      )}
                      {activeView === "devtools" && (
                        <DevtoolsView key="devtools-view" />
                      )}
                      {activeView === "skins" && <SkinsView key="skins-view" />}
                    </AnimatePresence>
                  </div>
                </div>
              </main>

              <AnimatePresence>
                {logoAnimDone && (
                  <motion.footer
                    key="footer"
                    {...uiFade}
                    className="shrink-0 p-4 flex justify-between items-end text-[10px] text-[#A0A0A0] mc-text-shadow bg-gradient-to-t from-black/80 to-transparent uppercase tracking-widest opacity-60 font-['Mojangles']"
                    style={{ fontWeight: "normal" }}
                  >
                    <div className="flex-1 text-left whitespace-nowrap">
                      Version: {pkg.version}
                    </div>
                    <div className="flex-[2] text-center whitespace-nowrap">
                      Not affiliated with Mojang AB or Microsoft. "Minecraft" is
                      a trademark of Mojang Synergies AB.
                    </div>
                    <div className="flex-1 text-right whitespace-nowrap">
                      {useUI().connected && "CONTROLLER CONNECTED"}
                    </div>
                  </motion.footer>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

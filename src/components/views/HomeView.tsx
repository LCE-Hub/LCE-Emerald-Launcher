import { useState, useEffect, useMemo, memo } from "react";
import { motion } from "framer-motion";
import {
  useUI,
  useConfig,
  useAudio,
  useGame,
} from "../../context/LauncherContext";

const HomeView = memo(function HomeView() {
  const { setActiveView, setShowCredits, focusSection, onNavigateToSkin } =
    useUI();
  const { profile, legacyMode } = useConfig();
  const { playPressSound, playSfx } = useAudio();
  const {
    handleLaunch,
    editions,
    installs,
    toggleInstall,
    downloadingId,
    isGameRunning,
    stopGame,
  } = useGame();

  const isFocusedSection = focusSection === "menu";
  const selectedEdition = editions.find((e: any) => e.id === profile);
  const selectedVersionName = selectedEdition?.name || "Game";
  const isInstalled = installs.includes(profile);
  const isDownloading = downloadingId === profile;
  const [menuFocus, setMenuFocus] = useState<number | null>(null);
  const hasAnyInstall = installs.length > 0;

  const buttons = useMemo(
    () => [
      {
        label: !hasAnyInstall
          ? "Install a version"
          : isGameRunning
            ? "Stop Game"
            : isDownloading
              ? "Installation in progress..."
              : isInstalled
                ? "Play Game"
                : `Download ${selectedVersionName}`,
        action: !hasAnyInstall
          ? () => setActiveView("versions")
          : isGameRunning
            ? stopGame
            : isDownloading
              ? () => {}
              : isInstalled
                ? handleLaunch
                : () => toggleInstall(profile),
        isDanger: isGameRunning,
        disabled: isDownloading,
      },
      { label: "Help & Options", action: () => setActiveView("settings"), disabled: false },
      { label: "Versions", action: () => setActiveView("versions"), disabled: false },
      { label: "Workshop", action: () => setActiveView("workshop"), disabled: false },
      { label: "Developer Tools", action: () => setActiveView("devtools"), disabled: false },
    ],
    [
      isDownloading,
      hasAnyInstall,
      isInstalled,
      selectedVersionName,
      handleLaunch,
      toggleInstall,
      profile,
      setActiveView,
      isGameRunning,
      stopGame,
    ],
  );

  useEffect(() => {
    if (!isFocusedSection) {
      setMenuFocus(null);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "ArrowDown")
        setMenuFocus((prev) =>
          prev === null ? 0 : prev < buttons.length - 1 ? prev + 1 : prev,
        );
      if (e.key === "ArrowUp")
        setMenuFocus((prev) =>
          prev === null ? buttons.length - 1 : prev > 0 ? prev - 1 : prev,
        );
      if (e.key === "ArrowLeft") onNavigateToSkin();
      if (e.key === "Enter" && menuFocus !== null) {
        buttons[menuFocus].action();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuFocus, buttons, playPressSound, isFocusedSection, onNavigateToSkin]);

  return (
    <motion.div
      tabIndex={-1}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isFocusedSection ? 1 : 0.5, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: useConfig().animationsEnabled ? 0.3 : 0 }}
      className="w-full max-w-[540px] flex flex-col space-y-3 outline-none"
    >
      {buttons.map((btn: any, i: number) => (
        <button
          key={i}
          onMouseEnter={() => isFocusedSection && !btn.disabled && setMenuFocus(i)}
          onMouseLeave={() => setMenuFocus(null)}
          onClick={() => {
            if (isFocusedSection && !btn.disabled) {
              playPressSound();
              btn.action();
            }
          }}
          disabled={btn.disabled}
          className={`w-full h-12 flex items-center justify-center text-2xl mc-text-shadow transition-colors outline-none border-none ${btn.disabled ? "text-gray-400 cursor-not-allowed" : menuFocus === i ? (btn.isDanger ? "text-red-400" : "text-[#FFFF55]") : btn.isDanger ? "text-red-500" : "text-white"}`}
          style={{
            backgroundImage: btn.disabled
              ? "url('/images/Button_Background.png')"
              : menuFocus === i
                ? "url('/images/button_highlighted.png')"
                : "url('/images/Button_Background.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
            opacity: btn.disabled ? 0.5 : 1,
          }}
        >
          {btn.label}
        </button>
      ))}
      {!legacyMode && (
        <div className="pt-4 flex flex-col items-center w-full gap-3">
          <div className="flex gap-8">
            <a
              href="https://discord.gg/vD8akRU24f"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (isFocusedSection) playPressSound();
              }}
              className={`hover:scale-110 transition-transform ${!isFocusedSection ? "pointer-events-none" : ""}`}
            >
              <img
                src="/images/discord.png"
                className="w-16 h-16 drop-shadow-md object-contain"
                style={{ imageRendering: "pixelated" }}
                loading="lazy"
                decoding="async"
              />
            </a>
            <a
              href="https://github.com/LCE-Hub/LCE-Emerald-Launcher"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (isFocusedSection) playPressSound();
              }}
              className={`hover:scale-110 transition-transform ${!isFocusedSection ? "pointer-events-none" : ""}`}
            >
              <img
                src="/images/github.png"
                className="w-16 h-16 drop-shadow-md object-contain"
                style={{ imageRendering: "pixelated" }}
                loading="lazy"
                decoding="async"
              />
            </a>
          </div>
          <div className="border-b-[3px] border-[#A0A0A0] w-48 opacity-60" />
          <button
            onClick={() => {
              if (isFocusedSection) {
                playSfx("orb.ogg");
                setShowCredits(true);
              }
            }}
            className={`text-white hover:text-[#FFFF55] text-xl mc-text-shadow tracking-widest transition-colors mt-1 bg-transparent border-none outline-none ${!isFocusedSection ? "cursor-default pointer-events-none" : ""}`}
          >
            EMERALD TEAM
          </button>
        </div>
      )}
    </motion.div>
  );
});

export default HomeView;

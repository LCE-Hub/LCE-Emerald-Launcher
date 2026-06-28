import { useState, useEffect, useMemo, memo } from "react";
import { motion } from "framer-motion";
import {
  useUI,
  useConfig,
  useAudio,
  useGame,
} from "../../context/LauncherContext";
import { usePluginActions } from "../../plugins/PluginContext";
import type { Edition } from "../../types/edition";

const HomeView = memo(function HomeView() {
  const { setActiveView, focusSection, onNavigateToSkin } =
    useUI();
  const { profile, legacyMode } = useConfig();
  const { playPressSound, playSfx } = useAudio();
  const {
    handleLaunch,
    editions,
    installs,
    toggleInstall,
    downloadingIds,
    isGameRunning,
    stopGame,
    updatesAvailable,
  } = useGame();
  const pluginActions = usePluginActions("home-menu");

  const isFocusedSection = focusSection === "menu";
  const selectedEdition = editions.find((e: Edition) => e.id === profile);
  const selectedVersionName = selectedEdition?.name || "Game";
  const isInstalled = installs.includes(profile);
  const isDownloading = downloadingIds.includes(profile);
  const [menuFocus, setMenuFocus] = useState<number | null>(null);

  const hasAnyInstall = installs.length > 0;

  const buttonsVal = useMemo(
    () => {
      const mainBtn = {
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
        id: "main-action",
      };

      const pluginBtns = pluginActions.map((a) => ({
        label: a.label,
        action: () => a.onClick(),
        isDanger: false,
        disabled: false,
        id: a.id,
      }));

      const menuBtns = [
        {
          label: "Help & Options",
          action: () => setActiveView("settings"),
          isDanger: false,
          disabled: false,
          id: "settings",
        },
        {
          label: "Versions",
          action: () => setActiveView("versions"),
          isDanger: false,
          disabled: false,
          id: "versions",
        },
        {
          label: "Workshop",
          action: () => setActiveView("workshop"),
          isDanger: false,
          disabled: false,
          id: "workshop",
        },
        {
          label: "Developer Tools",
          action: () => setActiveView("devtools"),
          isDanger: false,
          disabled: false,
          id: "devtools",
        },
      ];

      return [mainBtn, ...pluginBtns, ...menuBtns];
    },
    [
      isDownloading, hasAnyInstall, isInstalled, selectedVersionName,
      handleLaunch, toggleInstall, profile, setActiveView,
      isGameRunning, stopGame, pluginActions,
    ],
  );

  useEffect(() => {
    if (!isFocusedSection) {
      setMenuFocus(null);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "ArrowDown")
        setMenuFocus((prev) =>
          prev === null ? 0 : prev < buttonsVal.length - 1 ? prev + 1 : prev,
        );
      if (e.key === "ArrowUp")
        setMenuFocus((prev) =>
          prev === null ? buttonsVal.length - 1 : prev > 0 ? prev - 1 : prev,
        );
      if (e.key === "ArrowLeft") onNavigateToSkin();
      if (e.key === "Enter" && menuFocus !== null) buttonsVal[menuFocus].action();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [menuFocus, buttonsVal, isFocusedSection, onNavigateToSkin]);

  return (
    <motion.div
      tabIndex={-1}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isFocusedSection ? 1 : 0.5, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: useConfig().animationsEnabled ? 0.3 : 0 }}
      className="relative w-full max-w-[540px] flex flex-col space-y-3 outline-none"
    >
      {buttonsVal.map((btn, i) => (
        <div key={i} className="relative w-full group">
          <button
            onMouseEnter={() =>
              isFocusedSection && !btn.disabled && setMenuFocus(i)
            }
            onMouseLeave={() => setMenuFocus(null)}
            onClick={() => {
              if (isFocusedSection && !btn.disabled) {
                playPressSound();
                btn.action();
              }
            }}
            disabled={btn.disabled}
            className={`w-full h-12 flex items-center justify-between px-6 text-2xl mc-text-shadow transition-colors outline-none border-none ${btn.disabled ? "text-gray-400 cursor-not-allowed" : menuFocus === i ? (btn.isDanger ? "text-red-400" : "text-[#FFFF55]") : btn.isDanger ? "text-red-500" : "text-white"}`}
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
            <div className="w-full h-full flex items-center justify-center relative">
              <span>{btn.label}</span>
              {btn.id === "versions" &&
                Object.values(updatesAvailable || {}).some((v) => v) && (
                  <img
                    src="/images/Update_Icon.png"
                    className="absolute right-4 w-6 h-6 object-contain"
                    style={{
                      imageRendering: "pixelated",
                      filter:
                        "drop-shadow(0 0 2px rgba(255, 255, 0, 0.8)) sepia(100%) saturate(500%) hue-rotate(5deg) brightness(1.2)",
                    }}
                  />
                )}
            </div>
          </button>
        </div>
      ))}

      {!legacyMode && (
        <div className="pt-4 flex flex-col items-center w-full gap-3">
          <div className="flex gap-8">
            <a
              href="https://discord.gg/cQVKhQXcCx"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (isFocusedSection) playPressSound();
              }}
              className={`${!isFocusedSection ? "pointer-events-none" : ""}`}
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
              className={`${!isFocusedSection ? "pointer-events-none" : ""}`}
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
                setActiveView("credits");
              }
            }}
            className={`text-white hover:text-[#FFFF55] text-xl mc-text-shadow tracking-widest transition-colors mt-1 bg-transparent border-none outline-none ${!isFocusedSection ? "pointer-events-none" : ""}`}
          >
            CREDITS
          </button>
        </div>
      )}
    </motion.div>
  );
});

export default HomeView;

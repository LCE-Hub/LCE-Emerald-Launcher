import { useState, useEffect, useRef, useMemo, memo } from "react";
import { motion } from "framer-motion";
import { TauriService, Runner } from "../../services/TauriService";
import { usePlatform } from "../../hooks/usePlatform";
import { useUI, useConfig, useAudio, useGame } from "../../context/LauncherContext";

const SettingsView = memo(function SettingsView() {
  const { setActiveView } = useUI();
  const { vfxEnabled, setVfxEnabled, animationsEnabled, setAnimationsEnabled, musicVol: musicVolume, setMusicVol: setMusicVolume, sfxVol: sfxVolume, setSfxVol: setSfxVolume, layout, setLayout, linuxRunner, setLinuxRunner, perfBoost, setPerfBoost, rpcEnabled, setRpcEnabled, legacyMode, setLegacyMode, keepLauncherOpen, setKeepLauncherOpen, enableTrayIcon, setEnableTrayIcon } = useConfig();
  const { currentTrack, setCurrentTrack, tracks, playClickSound, playBackSound } = useAudio();
  const { isGameRunning, stopGame, isRunnerDownloading, runnerDownloadProgress, downloadRunner } = useGame();
  const { isLinux, isMac } = usePlatform();
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [currentSubMenu, setCurrentSubMenu] = useState<"main" | "audio" | "video" | "controls" | "launcher">("main");
  const [runners, setRunners] = useState<Runner[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const layouts = ["KBM", "PLAYSTATION", "XBOX"];

  useEffect(() => {
    TauriService.getAvailableRunners().then(setRunners);
  }, [isRunnerDownloading]);

  const handleLayoutToggle = () => {
    playClickSound();
    const currentIndex = layouts.indexOf(layout);
    const nextIndex = (currentIndex + 1) % layouts.length;
    setLayout(layouts[nextIndex]);
  };

  const handleVfxToggle = () => {
    playClickSound();
    setVfxEnabled(!vfxEnabled);
  };

  const handleAnimationsToggle = () => {
    playClickSound();
    setAnimationsEnabled(!animationsEnabled);
  };

  const handlePerfToggle = () => {
    playClickSound();
    setPerfBoost(!perfBoost);
  };

  const handleRpcToggle = () => {
    playClickSound();
    setRpcEnabled(!rpcEnabled);
  };

  const handleLegacyToggle = () => {
    playClickSound();
    setLegacyMode(!legacyMode);
  };

  const handleKeepOpenToggle = () => {
    playClickSound();
    setKeepLauncherOpen(!keepLauncherOpen);
  };

  const handleTrayToggle = () => {
    playClickSound();
    setEnableTrayIcon(!enableTrayIcon);
  };

  const handleRunnerToggle = () => {
    playClickSound();
    if (runners.length === 0) return;
    const currentIndex = runners.findIndex((r) => r.id === linuxRunner);
    const nextIndex = (currentIndex + 1) % runners.length;
    setLinuxRunner(runners[nextIndex].id);
  };

  const handleTrackToggle = () => {
    playClickSound();
    setCurrentTrack((currentTrack + 1) % tracks.length);
  };

  const handleResetSetup = () => {
    playClickSound();

    // Create styled confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
    dialog.innerHTML = `
      <div class="relative p-8 max-w-md mx-4" style="background-image: url('/images/frame_background.png'); background-size: 100% 100%; background-repeat: no-repeat; image-rendering: pixelated;">
        <h3 class="text-2xl font-bold text-white mb-4 text-center" style="text-shadow: 2px 2px 0px rgba(0,0,0,0.8)">Reset Setup</h3>
        <p class="text-white mb-6 text-center">Are you sure you want to reset launcher setup?</p>
        <div class="flex gap-4 justify-center">
          <button id="reset-yes" class="mc-sq-btn px-6 py-3 text-white hover:scale-105 active:scale-95 transition-transform">Yes</button>
          <button id="reset-no" class="mc-sq-btn px-6 py-3 text-white hover:scale-105 active:scale-95 transition-transform">No</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const handleYes = () => {
      document.body.removeChild(dialog);
      showSecondConfirmation();
    };

    const handleNo = () => {
      document.body.removeChild(dialog);
    };

    dialog.querySelector('#reset-yes')?.addEventListener('click', handleYes);
    dialog.querySelector('#reset-no')?.addEventListener('click', handleNo);

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
      }
    });
  };

  const showSecondConfirmation = () => {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
    dialog.innerHTML = `
      <div class="relative p-8 max-w-md mx-4" style="background-image: url('/images/frame_background.png'); background-size: 100% 100%; background-repeat: no-repeat; image-rendering: pixelated;">
        <h3 class="text-2xl font-bold text-yellow-400 mb-4 text-center" style="text-shadow: 2px 2px 0px rgba(0,0,0,0.8)">CONFIRM RESET</h3>
        <div class="text-white mb-6 text-left">
          <p class="mb-2">⚠️ This will:</p>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li>Clear all launcher settings</li>
            <li>Reset your username</li>
            <li>Show setup screen again</li>
            <li>Require reconfiguration</li>
          </ul>
          <p class="mt-3 text-yellow-400 font-bold">This action cannot be undone!</p>
        </div>
        <div class="flex gap-4 justify-center">
          <button id="reset-final-yes" class="mc-sq-btn px-6 py-3 text-yellow-400 hover:scale-105 active:scale-95 transition-transform">YES, RESET</button>
          <button id="reset-final-no" class="mc-sq-btn px-6 py-3 text-white hover:scale-105 active:scale-95 transition-transform">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const handleFinalYes = () => {
      document.body.removeChild(dialog);
      performReset();
    };

    const handleFinalNo = () => {
      document.body.removeChild(dialog);
    };

    dialog.querySelector('#reset-final-yes')?.addEventListener('click', handleFinalYes);
    dialog.querySelector('#reset-final-no')?.addEventListener('click', handleFinalNo);

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
      }
    });
  };

  const performReset = () => {
    // Clear all localStorage data
    localStorage.clear();

    // Set setup as not completed
    localStorage.setItem('lce-setup-completed', 'false');

    // Force reload to show setup screen
    window.location.reload();
  };

  let trackName = "Unknown";
  if (tracks && tracks.length > 0) {
    const fullPath = tracks[currentTrack];
    if (fullPath) {
      trackName = fullPath
        .split("/")
        .pop()
        ?.replace(".ogg", "")
        .replace(".wav", "") || "Unknown";
    }
  }

  const selectedRunnerName =
    runners.find((r) => r.id === linuxRunner)?.name || "Native / Default";

  type SettingsItem =
    | {
      id: string;
      label: string;
      type: "slider";
      value: number;
      onChange: (val: any) => void;
    }
    | {
      id: string;
      label: string;
      type: "button";
      onClick: () => void;
      small?: boolean;
      color?: string;
    };

  const settingsItems = useMemo<SettingsItem[]>(() => {
    const items: SettingsItem[] = [];

    if (currentSubMenu === "main") {
      items.push({
        id: "audio_menu",
        label: "Audio Settings",
        type: "button",
        onClick: () => { playClickSound(); setCurrentSubMenu("audio"); setFocusIndex(0); },
      });
      items.push({
        id: "video_menu",
        label: "Video Settings",
        type: "button",
        onClick: () => { playClickSound(); setCurrentSubMenu("video"); setFocusIndex(0); },
      });
      items.push({
        id: "controls_menu",
        label: "Controls",
        type: "button",
        onClick: () => { playClickSound(); setCurrentSubMenu("controls"); setFocusIndex(0); },
      });
      items.push({
        id: "launcher_menu",
        label: "Launcher Settings",
        type: "button",
        onClick: () => { playClickSound(); setCurrentSubMenu("launcher"); setFocusIndex(0); },
      });
    } else if (currentSubMenu === "audio") {
      items.push({
        id: "music",
        label: `Music: ${musicVolume ?? 50}%`,
        type: "slider",
        value: musicVolume ?? 50,
        onChange: setMusicVolume,
      });
      items.push({
        id: "sfx",
        label: `SFX: ${sfxVolume ?? 100}%`,
        type: "slider",
        value: sfxVolume ?? 100,
        onChange: setSfxVolume,
      });
      items.push({
        id: "track",
        label: `${trackName} - C418`,
        type: "button",
        onClick: handleTrackToggle,
      });
    } else if (currentSubMenu === "video") {
      items.push({
        id: "vfx",
        label: `VFX: ${vfxEnabled ? "ON" : "OFF"}`,
        type: "button",
        onClick: handleVfxToggle,
      });
      items.push({
        id: "animations",
        label: `Animations: ${animationsEnabled ? "ON" : "OFF"}`,
        type: "button",
        onClick: handleAnimationsToggle,
      });
      if (isMac) {
        items.push({
          id: "perf",
          label: `M1/M2 Boost: ${perfBoost ? "Enabled" : "Disabled"}`,
          type: "button",
          onClick: handlePerfToggle,
        });
      }
    } else if (currentSubMenu === "controls") {
      items.push({
        id: "layout",
        label: `Layout: ${layout}`,
        type: "button",
        onClick: handleLayoutToggle,
      });
    } else if (currentSubMenu === "launcher") {
      items.push({
        id: "rpc",
        label: `Discord RPC: ${rpcEnabled ? "ON" : "OFF"}`,
        type: "button",
        onClick: handleRpcToggle,
      });
      items.push({
        id: "legacy",
        label: `Legacy Mode: ${legacyMode ? "ON" : "OFF"}`,
        type: "button",
        onClick: handleLegacyToggle,
      });
      items.push({
        id: "keep_open",
        label: `Keep Launcher Open: ${keepLauncherOpen ? "ON" : "OFF"}`,
        type: "button",
        onClick: handleKeepOpenToggle,
      });
      items.push({
        id: "tray_icon",
        label: `Tray Icon: ${enableTrayIcon ? "ON" : "OFF"}`,
        type: "button",
        onClick: handleTrayToggle,
      });

      if (isLinux) {
        items.push({
          id: "runner",
          label: `Runner: ${selectedRunnerName}`,
          type: "button",
          onClick: handleRunnerToggle,
        });

        if (runners.length === 0 || runners.every(r => r.type !== 'proton')) {
          items.push({
            id: "download_runner",
            label: isRunnerDownloading
              ? `Downloading Runner... ${Math.floor(runnerDownloadProgress || 0)}%`
              : "Download GE-Proton (Recommended)",
            type: "button",
            onClick: () => {
              if (!isRunnerDownloading) {
                downloadRunner("GE-Proton9-25", "https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton9-25/GE-Proton9-25.tar.gz");
              }
            },
            small: true,
          });
        }
      }

      items.push({
        id: "reset_setup",
        label: "Reset Setup",
        type: "button",
        onClick: handleResetSetup,
        color: "orange",
        small: true,
      });
    }

    if (isGameRunning) {
      items.push({
        id: "stop",
        label: "STOP GAME",
        type: "button",
        onClick: stopGame,
        color: "red",
      });
    }

    items.push({
      id: "back",
      label: currentSubMenu === "main" ? "Done" : "Back",
      type: "button",
      onClick: () => {
        playBackSound();
        if (currentSubMenu === "main") {
          setActiveView("main");
        } else {
          setCurrentSubMenu("main");
          setFocusIndex(0);
        }
      },
    });

    return items;
  }, [
    currentSubMenu,
    musicVolume,
    sfxVolume,
    trackName,
    vfxEnabled,
    rpcEnabled,
    legacyMode,
    animationsEnabled,
    keepLauncherOpen,
    enableTrayIcon,
    layout,
    isLinux,
    selectedRunnerName,
    isRunnerDownloading,
    runnerDownloadProgress,
    isMac,
    perfBoost,
    isGameRunning,
    handleTrackToggle,
    handleVfxToggle,
    handleRpcToggle,
    handleLegacyToggle,
    handleAnimationsToggle,
    handleKeepOpenToggle,
    handleTrayToggle,
    handleLayoutToggle,
    handleRunnerToggle,
    handlePerfToggle,
    handleResetSetup,
    stopGame,
    downloadRunner,
    playClickSound,
    playBackSound,
    setActiveView,
    runners,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        playBackSound();
        if (currentSubMenu !== "main") {
          setCurrentSubMenu("main");
          setFocusIndex(0);
        } else {
          setActiveView("main");
        }
        return;
      }

      const itemCount = settingsItems.length;

      if (e.key === "ArrowDown") {
        setFocusIndex((prev) =>
          prev === null || prev >= itemCount - 1 ? 0 : prev + 1,
        );
      } else if (e.key === "ArrowUp") {
        setFocusIndex((prev) =>
          prev === null || prev <= 0 ? itemCount - 1 : prev - 1,
        );
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (focusIndex === null) return;
        const item = settingsItems[focusIndex];
        if (item.type === "slider") {
          const delta = e.key === "ArrowRight" ? 5 : -5;
          item.onChange((v: number) => Math.max(0, Math.min(100, v + delta)));
        }
      } else if (e.key === "Enter" && focusIndex !== null) {
        const item = settingsItems[focusIndex];
        if (item.type === "button") {
          item.onClick();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusIndex, settingsItems, playBackSound, setActiveView, currentSubMenu]);

  useEffect(() => {
    if (focusIndex !== null) {
      const el = containerRef.current?.querySelector(
        `[data-index="${focusIndex}"]`,
      ) as HTMLElement;
      if (el) el.focus();
    }
  }, [focusIndex]);

  const getItemStyle = (index: number) => ({
    backgroundImage:
      focusIndex === index
        ? "url('/images/button_highlighted.png')"
        : "url('/images/Button_Background.png')",
    backgroundSize: "100% 100%",
    imageRendering: "pixelated" as const,
  });

  const getSliderStyle = (index: number) => ({
    backgroundImage: "url('/images/Button_Background2.png')",
    backgroundSize: "100% 100%",
    imageRendering: "pixelated" as const,
    color: focusIndex === index ? "#FFFF55" : "white",
  });

  return (
    <motion.div
      ref={containerRef}
      tabIndex={-1}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-2xl outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 border-b-2 border-[#373737] pb-2 w-[40%] max-w-[200px] text-center tracking-widest uppercase opacity-80 font-bold whitespace-nowrap px-4">
        {currentSubMenu === "main" ? "Settings" : currentSubMenu === "audio" ? "Audio Settings" : currentSubMenu === "video" ? "Video Settings" : currentSubMenu === "controls" ? "Controls" : "Launcher"}
      </h2>

      <div className="w-full max-w-[540px] space-y-2 mb-4 p-6 flex flex-col items-center overflow-y-auto max-h-[55vh]">
        {settingsItems.map((item, index) => {
          if (item.id === "back") return null;

          if (item.type === "slider") {
            return (
              <div
                key={item.id}
                data-index={index}
                tabIndex={0}
                onMouseEnter={() => setFocusIndex(index)}
                className="relative w-[360px] h-10 flex items-center justify-center cursor-pointer transition-all outline-none border-none hover:text-[#FFFF55] shrink-0"
                style={getSliderStyle(index)}
              >
                <span
                  className={`absolute z-10 text-xl mc-text-shadow pointer-events-none transition-colors tracking-widest ${focusIndex === index ? "text-[#FFFF55]" : "text-white"}`}
                >
                  {item.label}
                </span>
                <div className="absolute w-full h-full flex items-center justify-center">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={item.value}
                    onChange={(e) => item.onChange(parseInt(e.target.value))}
                    onMouseUp={playClickSound}
                    className="mc-slider-custom w-[calc(100%+16px)] h-full opacity-100 cursor-pointer z-20 outline-none m-0"
                  />
                </div>
              </div>
            );
          }

          const isRed = (item as any).color === "red";
          const isSmall = (item as any).small;

          return (
            <button
              key={item.id}
              data-index={index}
              onMouseEnter={() => setFocusIndex(index)}
              onClick={item.onClick}
              className={`w-[360px] h-10 flex items-center justify-center px-4 relative z-30 transition-colors outline-none border-none shrink-0 ${isRed
                ? focusIndex === index
                  ? "text-red-400"
                  : "text-red-200"
                : focusIndex === index
                  ? "text-[#FFFF55]"
                  : "text-white"
                } ${isRed ? "hover:text-red-500" : "hover:text-[#FFFF55]"}`}
              style={getItemStyle(index)}
            >
              <span
                className={`mc-text-shadow tracking-widest uppercase ${isSmall ? "text-xs" : item.label.length > 20 ? "text-lg" : "text-xl"} truncate w-full text-center`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {(() => {
        const backIndex = settingsItems.findIndex((i) => i.id === "back");
        const backItem = settingsItems[backIndex];
        if (!backItem || backItem.type !== "button") return null;

        return (
          <button
            data-index={backIndex}
            onMouseEnter={() => setFocusIndex(backIndex)}
            onClick={backItem.onClick}
            className={`w-72 h-10 flex items-center justify-center transition-colors text-xl mc-text-shadow outline-none border-none hover:text-[#FFFF55] ${focusIndex === backIndex ? "text-[#FFFF55]" : "text-white"
              }`}
            style={getItemStyle(backIndex)}
          >
            Back
          </button>
        );
      })()}
    </motion.div>
  );
});

export default SettingsView;

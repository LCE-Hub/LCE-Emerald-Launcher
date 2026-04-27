import { useState, useEffect, useRef, useMemo, memo } from "react";
import { TauriService, Runner } from "../../services/TauriService";
import { usePlatform } from "../../hooks/usePlatform";
import { useUI, useConfig, useAudio, useGame } from "../../context/LauncherContext";

const SettingsView = memo(function SettingsView() {
  const { setActiveView } = useUI();
  const { vfxEnabled, setVfxEnabled, animationsEnabled, setAnimationsEnabled, musicVol: musicVolume, setMusicVol: setMusicVolume, sfxVol: sfxVolume, setSfxVol: setSfxVolume, layout, setLayout, linuxRunner, setLinuxRunner, perfBoost, setPerfBoost, rpcEnabled, setRpcEnabled, legacyMode, setLegacyMode } = useConfig();
  const { currentTrack, setCurrentTrack, tracks, playPressSound, playBackSound } = useAudio();
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
    playPressSound();
    const currentIndex = layouts.indexOf(layout);
    const nextIndex = (currentIndex + 1) % layouts.length;
    setLayout(layouts[nextIndex]);
  };

  const handleVfxToggle = () => {
    playPressSound();
    setVfxEnabled(!vfxEnabled);
  };

  const handleAnimationsToggle = () => {
    playPressSound();
    setAnimationsEnabled(!animationsEnabled);
  };

  const handlePerfToggle = () => {
    playPressSound();
    setPerfBoost(!perfBoost);
  };

  const handleRpcToggle = () => {
    playPressSound();
    setRpcEnabled(!rpcEnabled);
  };

  const handleLegacyToggle = () => {
    playPressSound();
    setLegacyMode(!legacyMode);
  };

  const handleRunnerToggle = () => {
    playPressSound();
    if (runners.length === 0) return;
    const currentIndex = runners.findIndex((r) => r.id === linuxRunner);
    const nextIndex = (currentIndex + 1) % runners.length;
    setLinuxRunner(runners[nextIndex].id);
  };

  const handleTrackToggle = () => {
    playPressSound();
    setCurrentTrack((currentTrack + 1) % tracks.length);
  };

  const handleResetSetup = () => {
    playPressSound();

    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
    dialog.innerHTML = `
      <div class="w-[420px] p-4 flex flex-col items-center mc-options-bg">
        <h3 class="text-2xl font-bold text-[#333333] mb-4 text-left w-full px-4 mc-text-shadow">Reset Setup</h3>
        <p class="text-[#333333] mb-8 text-left w-full px-4">Are you sure you want to reset launcher setup?</p>
        <div class="flex flex-col gap-3 w-full px-4">
          <button id="reset-cancel" class="w-full h-10 flex items-center justify-center text-lg mc-text-shadow text-white hover:text-[#ffff00]" style="background-image: url('/images/Button_Background.png'); background-size: 100% 100%; image-rendering: pixelated; border: none; cursor: pointer;" onmouseenter="this.style.backgroundImage='url(/images/button_highlighted.png)'" onmouseleave="this.style.backgroundImage='url(/images/Button_Background.png)'">Cancel</button>
          <button id="reset-ok" class="w-full h-10 flex items-center justify-center text-lg mc-text-shadow text-white hover:text-[#ffff00]" style="background-image: url('/images/Button_Background.png'); background-size: 100% 100%; image-rendering: pixelated; border: none; cursor: pointer;" onmouseenter="this.style.backgroundImage='url(/images/button_highlighted.png)'" onmouseleave="this.style.backgroundImage='url(/images/Button_Background.png)'">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const handleOk = () => {
      document.body.removeChild(dialog);
      showSecondConfirmation();
    };

    const handleCancel = () => {
      document.body.removeChild(dialog);
    };

    dialog.querySelector('#reset-ok')?.addEventListener('click', handleOk);
    dialog.querySelector('#reset-cancel')?.addEventListener('click', handleCancel);

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
      <div class="w-[420px] p-4 flex flex-col items-center mc-options-bg">
        <h3 class="text-2xl font-bold text-[#333333] mb-2 text-left w-full px-4 mc-text-shadow">CONFIRM RESET</h3>
        <div class="text-[#333333] mb-6 text-left w-full px-4">
          <p class="mb-2">⚠️ This will:</p>
          <ul class="list-none space-y-1 text-sm">
            <li>Clear all launcher settings</li>
            <li>Reset your username</li>
            <li>Show setup screen again</li>
            <li>Require reconfiguration</li>
          </ul>
          <p class="mt-3 text-[#333333] font-bold">This action cannot be undone!</p>
        </div>
        <div class="flex flex-col gap-3 w-full px-4">
          <button id="reset-final-cancel" class="w-full h-10 flex items-center justify-center text-lg mc-text-shadow text-white hover:text-[#ffff00]" style="background-image: url('/images/Button_Background.png'); background-size: 100% 100%; image-rendering: pixelated; border: none; cursor: pointer;" onmouseenter="this.style.backgroundImage='url(/images/button_highlighted.png)'" onmouseleave="this.style.backgroundImage='url(/images/Button_Background.png)'">Cancel</button>
          <button id="reset-final-ok" class="w-full h-10 flex items-center justify-center text-lg mc-text-shadow text-white hover:text-[#ffff00]" style="background-image: url('/images/Button_Background.png'); background-size: 100% 100%; image-rendering: pixelated; border: none; cursor: pointer;" onmouseenter="this.style.backgroundImage='url(/images/button_highlighted.png)'" onmouseleave="this.style.backgroundImage='url(/images/Button_Background.png)'">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const handleFinalOk = () => {
      document.body.removeChild(dialog);
      performReset();
    };

    const handleFinalCancel = () => {
      document.body.removeChild(dialog);
    };

    dialog.querySelector('#reset-final-ok')?.addEventListener('click', handleFinalOk);
    dialog.querySelector('#reset-final-cancel')?.addEventListener('click', handleFinalCancel);

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
      }
    });
  };

  const performReset = () => {
    localStorage.clear();

    localStorage.setItem('lce-setup-completed', 'false');

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
        label: "Audio",
        type: "button",
        onClick: () => { playPressSound(); setCurrentSubMenu("audio"); setFocusIndex(0); },
      });
      items.push({
        id: "video_menu",
        label: "Video",
        type: "button",
        onClick: () => { playPressSound(); setCurrentSubMenu("video"); setFocusIndex(0); },
      });
      items.push({
        id: "controls_menu",
        label: "Controls",
        type: "button",
        onClick: () => { playPressSound(); setCurrentSubMenu("controls"); setFocusIndex(0); },
      });
      items.push({
        id: "launcher_menu",
        label: "Launcher",
        type: "button",
        onClick: () => { playPressSound(); setCurrentSubMenu("launcher"); setFocusIndex(0); },
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
        label: `Sound: ${sfxVolume ?? 100}%`,
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
        label: `Click effects: ${vfxEnabled ? "ON" : "OFF"}`,
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
          label: `Apple silicon performance boost: ${perfBoost ? "Enabled" : "Disabled"}`,
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
      if (isLinux) {
        items.push({
          id: "runner",
          label: `Runner: ${selectedRunnerName}`,
          type: "button",
          onClick: handleRunnerToggle,
        });
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

      items.push({
        id: "reset_setup",
        label: "Reset Setup",
        type: "button",
        onClick: handleResetSetup,
        color: "orange",
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
    handleLayoutToggle,
    handleRunnerToggle,
    handlePerfToggle,
    handleResetSetup,
    stopGame,
    downloadRunner,
    playPressSound,
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
    color: focusIndex === index ? "#ffff00" : "white",
  });

  const isToggleOption = (label: string): boolean => {
    return label.includes("ON") || label.includes("OFF") || label.includes("Enabled") || label.includes("Disabled");
  };

  const getToggleState = (label: string): boolean => {
    return label.includes("ON") || label.includes("Enabled");
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="flex flex-col items-center w-full max-w-3xl outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 border-b-2 border-[#373737] pb-2 w-[40%] max-w-[200px] text-center tracking-widest uppercase opacity-80 font-bold whitespace-nowrap px-4">
        {currentSubMenu === "main" ? "Settings" : currentSubMenu === "audio" ? "Audio" : currentSubMenu === "video" ? "Video" : currentSubMenu === "controls" ? "Controls" : "Launcher"}
      </h2>

      {currentSubMenu === "main" ? (
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
                  className="relative w-[360px] h-10 flex items-center justify-center cursor-pointer transition-all outline-none border-none hover:text-[#ffff00] shrink-0"
                  style={getSliderStyle(index)}
                >
                  <span
                    className={`absolute z-10 text-xl mc-text-shadow pointer-events-none transition-colors tracking-widest ${focusIndex === index ? "text-[#ffff00]" : "text-white"}`}
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
                      onMouseUp={playPressSound}
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
                    ? "text-[#ffff00]"
                    : "text-white"
                  } ${isRed ? "hover:text-red-500" : "hover:text-[#ffff00]"}`}
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
      ) : (
        <div 
          className="min-w-[420px] w-fit p-4 flex flex-col items-center mc-options-bg"
        >
          <div className="w-full space-y-3 flex flex-col items-center overflow-y-auto max-h-[50vh] py-2">
            {settingsItems.map((item, index) => {
              if (item.id === "back") return null;

              if (item.type === "slider") {
                return (
                  <div
                    key={item.id}
                    data-index={index}
                    tabIndex={0}
                    onMouseEnter={() => setFocusIndex(index)}
                    className="relative w-[360px] h-10 flex items-center justify-center cursor-pointer transition-all outline-none border-none hover:text-[#ffff00] shrink-0"
                    style={getSliderStyle(index)}
                  >
                    <span
                      className={`absolute z-10 text-xl pointer-events-none transition-colors tracking-widest ${focusIndex === index ? "text-[#ffff00]" : item.id === "music" || item.id === "sfx" ? "text-white" : "text-[#2a2a2a]"}`}
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
                        onMouseUp={playPressSound}
                        className="mc-slider-custom w-[calc(100%+16px)] h-full opacity-100 cursor-pointer z-20 outline-none m-0"
                      />
                    </div>
                  </div>
                );
              }

              const isRed = (item as any).color === "red";
              const isSmall = (item as any).small;
              const isToggle = isToggleOption(item.label);
              const toggleState = isToggle ? getToggleState(item.label) : false;

              return (
                <button
                  key={item.id}
                  data-index={index}
                  onMouseEnter={() => setFocusIndex(index)}
                  onClick={item.onClick}
                  className={`w-[360px] h-10 flex items-center pl-1.5 pr-4 relative z-30 outline-none border-none shrink-0 rounded ${focusIndex === index ? "text-[#ffff00]" : isRed ? "text-red-600" : "text-[#333333]"}`}
                >
                  {isToggle && (
                    <div className="relative w-6 h-6 mr-3 shrink-0">
                      <img
                        src={focusIndex === index ? "/images/checkbox_highlighted.png" : "/images/checkbox.png"}
                        alt="checkbox"
                        className="w-full h-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                      {toggleState && (
                        <img
                          src="/images/check.png"
                          alt="checked"
                          className="absolute inset-0 w-full h-full object-contain"
                          style={{ imageRendering: "pixelated" }}
                        />
                      )}
                    </div>
                  )}
                  <span
                    className={`tracking-widest text-xl mc-text-shadow ${isSmall ? "text-xs" : item.label.length > 25 ? "text-base" : "text-lg"} truncate text-left capitalize`}
                  >
                    {isToggle ? item.label.split(":")[0].toLowerCase() : item.label.toLowerCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(() => {
        const backIndex = settingsItems.findIndex((i) => i.id === "back");
        const backItem = settingsItems[backIndex];
        if (!backItem || backItem.type !== "button") return null;

        return (
          <button
            data-index={backIndex}
            onMouseEnter={() => setFocusIndex(backIndex)}
            onClick={backItem.onClick}
            className={`w-40 h-10 flex items-center justify-center transition-colors text-xl mc-text-shadow outline-none border-none hover:text-[#ffff00] mt-4 ${focusIndex === backIndex ? "text-[#ffff00]" : "text-white"}`}
            style={{
              backgroundImage: focusIndex === backIndex
                ? "url('/images/button_highlighted.png')"
                : "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            Back
          </button>
        );
      })()}
    </div>
  );
});

export default SettingsView;

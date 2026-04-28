import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TauriService, Runner } from "../../services/TauriService";
import { usePlatform } from "../../hooks/usePlatform";
import { useConfig, useAudio, useGame } from "../../context/LauncherContext";
interface SetupViewProps {
  onComplete: () => void;
}

const SetupView: React.FC<SetupViewProps> = ({ onComplete }) => {
  const { isLinux, isMac } = usePlatform();
  const {
    username, setUsername,
    setHasCompletedSetup,
    profile,
    setVfxEnabled: setConfigVfx,
    setRpcEnabled: setConfigRpc,
    setLinuxRunner,
    linuxRunner: configLinuxRunner,
    vfxEnabled: configVfx,
    rpcEnabled: configRpc,
    animationsEnabled,
  } = useConfig();
  const { playPressSound, playSfx } = useAudio();
  const { editions } = useGame();
  const titleImage = editions.find(e => e.id === profile)?.titleImage || "/images/MenuTitle.png";
  const [currentStep, setCurrentStep] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [tempUsername, setTempUsername] = useState(username);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [selectedRunner, setSelectedRunner] = useState<string>("");
  const [isSettingUpRuntime, setIsSettingUpRuntime] = useState(false);
  const [setupProgress, setSetupProgress] = useState<{ stage: string; message: string; percent?: number } | null>(null);
  const [runtimeAlreadyInstalled, setRuntimeAlreadyInstalled] = useState(false);
  const [enableVfx, setEnableVfx] = useState(configVfx);
  const [enableDiscordRPC, setEnableDiscordRPC] = useState(configRpc);
  const [enableAnimations, setEnableAnimations] = useState(true);
  const [enableLegacyMode, setEnableLegacyMode] = useState(false);
  const totalSteps = 4;
  useEffect(() => {
    if (isLinux || isMac) {
      TauriService.getAvailableRunners().then(availableRunners => {
        setRunners(availableRunners);
        if (configLinuxRunner && availableRunners.find(r => r.id === configLinuxRunner)) {
          setSelectedRunner(configLinuxRunner);
        }
      });
    }

    if (isMac) {
      checkMacOSRuntime();
      const unlisten = TauriService.onMacosProgress((progress) => {
        setSetupProgress(progress);
      });

      return () => {
        unlisten.then(f => f?.());
      };
    }
  }, [isLinux, isMac]);

  const checkMacOSRuntime = async () => {
    try {
      const runtimeCheck = await TauriService.checkMacOSRuntimeInstalledFast();
      setRuntimeAlreadyInstalled(runtimeCheck);
      if (runtimeCheck) {
        localStorage.setItem('lce-macos-runtime-installed', 'true');
      } else {
        localStorage.removeItem('lce-macos-runtime-installed');
      }
    } catch {
      setRuntimeAlreadyInstalled(false);
      localStorage.removeItem('lce-macos-runtime-installed');
    }
  };

  const handleRunnerSelect = (runnerId: string) => {
    playPressSound();
    setSelectedRunner(runnerId);
  };

  const handleNext = async () => {
    playPressSound();
    if (currentStep === 0) {
      setUsername(tempUsername);
      setCurrentStep(1);
      setFocusIndex(0);
    } else if (currentStep === 1) {
      if (isLinux && selectedRunner) setLinuxRunner(selectedRunner);
      setCurrentStep(2);
      setFocusIndex(0);
    } else if (currentStep === 2) {
      setConfigVfx(enableVfx);
      setConfigRpc(enableDiscordRPC);
      setCurrentStep(3);
      setFocusIndex(0);
    } else if (currentStep === 3) {
      playSfx("levelup.ogg");
      setHasCompletedSetup(true);
      onComplete();
    }
  };

  const handleBack = () => {
    playPressSound();
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setFocusIndex(0);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      let count = 0;
      if (currentStep === 0) count = 2;
      else if (currentStep === 1) {
        if (isLinux) count = runners.length + 2;
        else if (isMac) count = 3;
        else count = 2;
      } else if (currentStep === 2) count = 6;
      else if (currentStep === 3) count = 4;
      if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % count);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + count) % count);
      } else if (e.key === "Enter") {
        if (currentStep === 0) {
          if (focusIndex === 0) handleNext();
          else if (focusIndex === 1) handleNext();
        } else if (currentStep === 1) {
          if (isLinux) {
            if (focusIndex < runners.length) handleRunnerSelect(runners[focusIndex].id);
            else if (focusIndex === runners.length) handleBack();
            else if (focusIndex === runners.length + 1) handleNext();
          } else if (isMac) {
            if (focusIndex === 0) handleMacosSetup();
            else if (focusIndex === 1) handleBack();
            else if (focusIndex === 2) handleNext();
          } else {
            if (focusIndex === 0) handleBack();
            else if (focusIndex === 1) handleNext();
          }
        } else if (currentStep === 2) {
          if (focusIndex === 0) { setEnableVfx(!enableVfx); playPressSound(); }
          else if (focusIndex === 1) { setEnableDiscordRPC(!enableDiscordRPC); playPressSound(); }
          else if (focusIndex === 2) { setEnableAnimations(!enableAnimations); playPressSound(); }
          else if (focusIndex === 3) { setEnableLegacyMode(!enableLegacyMode); playPressSound(); }
          else if (focusIndex === 4) handleBack();
          else if (focusIndex === 5) handleNext();
        } else if (currentStep === 3) {
          if (focusIndex === 0) { (document.querySelector('a[href="https://discord.gg/cQVKhQXcCx"]') as HTMLAnchorElement)?.click(); playPressSound(); }
          else if (focusIndex === 1) { (document.querySelector('a[href="https://github.com/LCE-Hub"]') as HTMLAnchorElement)?.click(); playPressSound(); }
          else if (focusIndex === 2) { (document.querySelector('a[href="https://ko-fi.com/kayjann"]') as HTMLAnchorElement)?.click(); playPressSound(); }
          else if (focusIndex === 3) handleBack();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentStep, focusIndex, runners, enableVfx, enableDiscordRPC, enableAnimations, enableLegacyMode, isLinux, isMac, tempUsername]);

  const handleMacosSetup = async () => {
    playPressSound();
    setIsSettingUpRuntime(true);
    setSetupProgress({ stage: "preparing", message: "Preparing macOS runtime setup...", percent: 0 });
    try {
      await TauriService.setupMacosRuntime();
      setSetupProgress({ stage: "completed", message: "Setup completed successfully!", percent: 100 });
      localStorage.setItem('lce-macos-runtime-installed', 'true');
      setRuntimeAlreadyInstalled(true);
      setTimeout(() => {
        setCurrentStep(2);
        setIsSettingUpRuntime(false);
        setSetupProgress(null);
      }, 2000);
    } catch (e) {
      setSetupProgress({ stage: "error", message: `Setup failed: ${e}`, percent: 0 });
      setIsSettingUpRuntime(false);
    }
  };

  const canProceed = () => {
    if (currentStep === 0) return tempUsername.trim().length > 0;
    if (currentStep === 1 && isMac) return runtimeAlreadyInstalled;
    return true;
  };

  const stepTitles = ["Welcome", "Compatibility", "Preferences", "Ready"];
  const navBtnStyle = (isFocused: boolean) => ({
    backgroundImage: isFocused
      ? "url('/images/button_highlighted.png')"
      : "url('/images/Button_Background.png')",
    backgroundSize: "100% 100%",
    imageRendering: "pixelated" as const,
  });

  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <div className="relative w-full h-full flex items-center justify-center p-8">
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2">
          <img
            src={titleImage}
            alt="Emerald Legacy"
            className="h-16"
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: animationsEnabled ? 0.2 : 0 }}
            className="max-w-xl w-full mx-auto flex flex-col items-center"
          >
            <div className="relative p-8 flex flex-col w-full">
              <div className="flex justify-center gap-3 mb-6">
                {Array.from({ length: totalSteps }, (_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-12 transition-all duration-300 ${i <= currentStep ? "bg-white" : "bg-white/20"}`}
                  />
                ))}
              </div>
              <h2 className="text-2xl text-white mc-text-shadow mb-1 border-b-2 border-[#373737] pb-2 text-center tracking-widest uppercase opacity-80 font-bold">
                {stepTitles[currentStep]}
              </h2>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`content-${currentStep}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: animationsEnabled ? 0.2 : 0, delay: animationsEnabled ? 0.05 : 0 }}
                  className="mt-4 overflow-y-auto flex-1"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "#555 transparent" }}
                >

                  {currentStep === 0 && (
                    <div
                      className="p-4 flex flex-col gap-4 mc-options-bg"
                    >
                      <p className="text-[#333333] font-bold text-sm tracking-widest text-center uppercase">
                        Let's configure the emerald launcher
                      </p>
                      <label className="block">
                        <span className="text-[#333333] font-bold uppercase tracking-widest text-sm mc-text-shadow block mb-2">Username</span>
                        <input
                          type="text"
                          value={tempUsername}
                          onChange={(e) => setTempUsername(e.target.value)}
                          onFocus={() => setFocusIndex(0)}
                          className={`w-full px-4 py-2 bg-black/60 focus:outline-none transition-colors text-white tracking-widest
                            ${focusIndex === 0 ? "border-2 border-[#ffff00] text-[#ffff00]" : "border-2 border-white/30"}`}
                          style={{ imageRendering: "pixelated", fontFamily: "'Mojangles', monospace" }}
                          placeholder="Enter your username"
                          maxLength={16}
                          autoFocus
                        />
                      </label>
                      {tempUsername.trim().length === 0 && (
                        <p className="text-white/40 text-xs text-center uppercase tracking-widest">A username is required to continue</p>
                      )}
                    </div>
                  )}

                  {currentStep === 1 && isMac && (
                    <div
                      className="p-4 flex flex-col gap-4 mc-options-bg"
                    >
                      <p className="text-[#333333] font-bold text-xs tracking-widest text-center uppercase">
                        {runtimeAlreadyInstalled
                          ? "Compatibility runtime is already installed"
                          : "Emerald needs a compatibility runtime to run on macOS"
                        }
                      </p>

                      <div className={`flex items-center gap-3 p-3 border-2 ${runtimeAlreadyInstalled ? "border-green-400/60 bg-green-900/10" : "border-yellow-400/60 bg-yellow-900/10"}`}>
                        {runtimeAlreadyInstalled ? (
                          <img
                            src="/images/check.png"
                            alt="checked"
                            className="w-6 h-6 object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                        ) : (
                          <span className="text-xl text-yellow-400">⚠</span>
                        )}
                        <div>
                          <p className={`font-bold text-sm uppercase tracking-widest ${runtimeAlreadyInstalled ? "text-green-400" : "text-yellow-400"}`}>
                            {runtimeAlreadyInstalled ? "Runtime Detected" : "Runtime Not Detected"}
                          </p>
                          <p className="text-[#333333] font-bold text-xs mt-0.5">
                            {runtimeAlreadyInstalled
                              ? "Ready to use — you can proceed."
                              : "You must install the runtime before proceeding."}
                          </p>
                        </div>
                      </div>

                      {setupProgress && (
                        <div className="p-3 bg-black/40 border border-white/10">
                          <p className="text-yellow-400 text-xs font-bold uppercase tracking-widest mb-1">{setupProgress.stage}</p>
                          <p className="text-white/70 font-bold text-xs">{setupProgress.message}</p>
                          {setupProgress.percent !== undefined && (
                            <div className="w-full bg-white/10 h-1.5 mt-2">
                              <div
                                className="h-full bg-green-400 transition-all duration-300"
                                style={{ width: `${setupProgress.percent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex justify-center">
                        <button
                          onClick={handleMacosSetup}
                          onMouseEnter={() => setFocusIndex(0)}
                          disabled={isSettingUpRuntime}
                          className={`w-[260px] h-10 flex items-center justify-center transition-colors mc-text-shadow outline-none border-none
                            ${focusIndex === 0 ? "text-[#ffff00]" : "text-white"} disabled:opacity-50 disabled:cursor-not-allowed`}
                          style={navBtnStyle(focusIndex === 0)}
                        >
                          <span className="tracking-widest text-lg">
                            {isSettingUpRuntime ? "Installing..." : runtimeAlreadyInstalled ? "Reinstall Runtime" : "Install Runtime"}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {currentStep === 1 && isLinux && (
                    <div
                      className="p-4 flex flex-col gap-3 mc-options-bg"
                    >
                      <p className="text-white/70 font-bold text-xs tracking-widest text-center uppercase">
                        Choose your preferred compatibility layer
                      </p>
                      {runners.length === 0 ? (
                        <div className="p-3 border-2 border-yellow-400/50 bg-yellow-900/10">
                          <p className="text-yellow-400 text-sm text-center">No compatible runners found. Please install Wine or Proton.</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {runners.map((runner, idx) => (
                            <button
                              key={runner.id}
                              onClick={() => handleRunnerSelect(runner.id)}
                              onMouseEnter={() => setFocusIndex(idx)}
                              className={`w-full h-10 flex items-center justify-between px-4 transition-all outline-none border-none
                                ${selectedRunner === runner.id ? "bg-white/10" : "bg-transparent"}
                                ${focusIndex === idx ? "text-[#ffff00]" : "text-white/80"} hover:text-[#ffff00] hover:bg-black/10`}
                              style={navBtnStyle(focusIndex === idx)}
                            >
                              <span className="tracking-widest uppercase text-lg mc-text-shadow">{runner.name}</span>
                              {selectedRunner === runner.id && (
                                <span className="text-[#ffff00] text-sm">✓</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-white/40 text-center uppercase tracking-widest mt-1">You can change this later in settings</p>
                    </div>
                  )}

                  {currentStep === 1 && !isMac && !isLinux && (
                    <div
                      className="p-4 flex flex-col gap-4 mc-options-bg"
                    >
                      <p className="text-white/70 font-bold text-xs tracking-widest text-center uppercase">
                        Everything is ready to go!
                      </p>
                      <div className="flex items-center gap-3 p-3 border-2 border-green-400/60 bg-green-900/10">
                        <span className="text-green-400 text-xl">✓</span>
                        <div>
                          <p className="text-green-400 font-bold text-sm uppercase tracking-widest">Windows Native Support</p>
                          <p className="text-white/60 font-bold text-xs mt-0.5">Emerald Legacy runs natively on Windows without additional requirements.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 2 && (
                    <div
                      className="p-4 flex flex-col gap-2 mc-options-bg"
                    >
                      <p className="text-[#333333] font-bold text-xs tracking-widest text-center uppercase mb-2">
                        Choose your preferred launcher settings
                      </p>

                      <button
                        onClick={() => { playPressSound(); setEnableVfx(!enableVfx); }}
                        onMouseEnter={() => setFocusIndex(0)}
                        className={`w-[360px] h-10 flex items-center pl-1.5 pr-4 relative z-30 transition-all outline-none border-none shrink-0 rounded text-[#2a2a2a]`}
                      >
                        <div className="relative w-6 h-6 mr-3 shrink-0">
                          <img
                            src={focusIndex === 0 ? "/images/checkbox_highlighted.png" : "/images/checkbox.png"}
                            alt="checkbox"
                            className="w-full h-full object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                          {enableVfx && (
                            <img
                              src="/images/check.png"
                              alt="checked"
                              className="absolute inset-0 w-full h-full object-contain"
                              style={{ imageRendering: "pixelated" }}
                            />
                          )}
                        </div>
                        <span className={`tracking-widest text-lg mc-text-shadow ${focusIndex === 0 ? "text-[#ffff00]" : "text-[#2a2a2a]"}`}>
                          Click effects
                        </span>
                      </button>
                      <button
                        onClick={() => { playPressSound(); setEnableDiscordRPC(!enableDiscordRPC); }}
                        onMouseEnter={() => setFocusIndex(1)}
                        className={`w-[360px] h-10 flex items-center pl-1.5 pr-4 relative z-30 transition-all outline-none border-none shrink-0 rounded text-[#2a2a2a]`}
                      >
                        <div className="relative w-6 h-6 mr-3 shrink-0">
                          <img
                            src={focusIndex === 1 ? "/images/checkbox_highlighted.png" : "/images/checkbox.png"}
                            alt="checkbox"
                            className="w-full h-full object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                          {enableDiscordRPC && (
                            <img
                              src="/images/check.png"
                              alt="checked"
                              className="absolute inset-0 w-full h-full object-contain"
                              style={{ imageRendering: "pixelated" }}
                            />
                          )}
                        </div>
                        <span className={`tracking-widest text-lg mc-text-shadow ${focusIndex === 1 ? "text-[#ffff00]" : "text-[#2a2a2a]"}`}>
                          Discord RPC
                        </span>
                      </button>
                      <button
                        onClick={() => { playPressSound(); setEnableAnimations(!enableAnimations); }}
                        onMouseEnter={() => setFocusIndex(2)}
                        className={`w-[360px] h-10 flex items-center pl-1.5 pr-4 relative z-30 transition-all outline-none border-none shrink-0 rounded text-[#2a2a2a]`}
                      >
                        <div className="relative w-6 h-6 mr-3 shrink-0">
                          <img
                            src={focusIndex === 2 ? "/images/checkbox_highlighted.png" : "/images/checkbox.png"}
                            alt="checkbox"
                            className="w-full h-full object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                          {enableAnimations && (
                            <img
                              src="/images/check.png"
                              alt="checked"
                              className="absolute inset-0 w-full h-full object-contain"
                              style={{ imageRendering: "pixelated" }}
                            />
                          )}
                        </div>
                        <span className={`tracking-widest text-lg mc-text-shadow ${focusIndex === 2 ? "text-[#ffff00]" : "text-[#2a2a2a]"}`}>
                          Animations
                        </span>
                      </button>
                      <button
                        onClick={() => { playPressSound(); setEnableLegacyMode(!enableLegacyMode); }}
                        onMouseEnter={() => setFocusIndex(3)}
                        className={`w-[360px] h-10 flex items-center pl-1.5 pr-4 relative z-30 transition-all outline-none border-none shrink-0 rounded text-[#2a2a2a]`}
                      >
                        <div className="relative w-6 h-6 mr-3 shrink-0">
                          <img
                            src={focusIndex === 3 ? "/images/checkbox_highlighted.png" : "/images/checkbox.png"}
                            alt="checkbox"
                            className="w-full h-full object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                          {enableLegacyMode && (
                            <img
                              src="/images/check.png"
                              alt="checked"
                              className="absolute inset-0 w-full h-full object-contain"
                              style={{ imageRendering: "pixelated" }}
                            />
                          )}
                        </div>
                        <span className={`tracking-widest text-lg mc-text-shadow ${focusIndex === 3 ? "text-[#ffff00]" : "text-[#2a2a2a]"}`}>
                          Legacy mode
                        </span>
                      </button>

                      <p className="text-xs text-[#333333] font-bold text-center uppercase tracking-widest mt-2">You can change these later in settings</p>
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div
                      className="p-4 flex flex-col gap-4 mc-options-bg"
                    >
                      <p className="text-[#333333] font-bold text-sm tracking-widest text-center leading-relaxed">
                        Thanks for downloading Emerald Launcher! You guys are absolutely amazing, and we couldn't do this without such an awesome community. Live long and prosper LCE!
                      </p>

                      <div className="flex flex-col gap-2 mt-2 items-center">
                        <a
                          href="https://discord.gg/cQVKhQXcCx"
                          target="_blank"
                          rel="noopener noreferrer"
                          onMouseEnter={() => setFocusIndex(0)}
                          className={`w-[360px] h-10 flex items-center justify-center transition-all outline-none border-none rounded ${focusIndex === 0 ? "bg-black/10" : "bg-transparent"} text-[#2a2a2a]`}
                        >
                          <span className={`tracking-widest text-lg mc-text-shadow ${focusIndex === 0 ? "text-[#ffff00]" : "text-[#2a2a2a]"}`}>
                            Join Discord
                          </span>
                        </a>
                        <a
                          href="https://github.com/LCE-Hub"
                          target="_blank"
                          rel="noopener noreferrer"
                          onMouseEnter={() => setFocusIndex(1)}
                          className={`w-[360px] h-10 flex items-center justify-center transition-all outline-none border-none rounded ${focusIndex === 1 ? "bg-black/10" : "bg-transparent"} text-[#2a2a2a]`}
                        >
                          <span className={`tracking-widest text-lg mc-text-shadow ${focusIndex === 1 ? "text-[#ffff00]" : "text-[#2a2a2a]"}`}>
                            GitHub
                          </span>
                        </a>
                        <a
                          href="https://ko-fi.com/kayjann"
                          target="_blank"
                          rel="noopener noreferrer"
                          onMouseEnter={() => setFocusIndex(2)}
                          className={`w-[360px] h-10 flex items-center justify-center transition-all outline-none border-none rounded ${focusIndex === 2 ? "bg-black/10" : "bg-transparent"} text-[#2a2a2a]`}
                        >
                          <span className={`tracking-widest text-lg mc-text-shadow ${focusIndex === 2 ? "text-[#ffff00]" : "text-[#2a2a2a]"}`}>
                            Support on Ko-fi
                          </span>
                        </a>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="flex justify-between mt-5 gap-3">
                {currentStep > 0 ? (
                  <button
                    onClick={handleBack}
                    onMouseEnter={() => {
                      if (currentStep === 3) setFocusIndex(3);
                      else if (currentStep === 2) setFocusIndex(4);
                      else if (currentStep === 1) setFocusIndex(isLinux ? runners.length : (isMac ? 1 : 0));
                    }}
                    className={`w-40 h-10 flex items-center justify-center transition-colors mc-text-shadow outline-none border-none
                      ${(currentStep === 3 && focusIndex === 3) || (currentStep === 2 && focusIndex === 4) ||
                        (currentStep === 1 && ((isLinux && focusIndex === runners.length) || (isMac && focusIndex === 1) || (!isLinux && !isMac && focusIndex === 0)))
                        ? "text-[#ffff00]" : "text-white"}`}
                    style={navBtnStyle(
                      (currentStep === 3 && focusIndex === 3) ||
                      (currentStep === 2 && focusIndex === 4) ||
                      (currentStep === 1 && ((isLinux && focusIndex === runners.length) || (isMac && focusIndex === 1) || (!isLinux && !isMac && focusIndex === 0)))
                    )}
                  >
                    <span className="tracking-widest text-xl">Back</span>
                  </button>
                ) : (
                  <div className="w-36" />
                )}

                <button
                  onClick={handleNext}
                  onMouseEnter={() => {
                    if (currentStep === 0) setFocusIndex(1);
                    else if (currentStep === 1) setFocusIndex(isLinux ? runners.length + 1 : (isMac ? 2 : 1));
                    else if (currentStep === 2) setFocusIndex(5);
                  }}
                  disabled={!canProceed()}
                  className={`w-36 h-10 flex items-center justify-center transition-colors mc-text-shadow outline-none border-none
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${(currentStep === 0 && focusIndex === 1) ||
                      (currentStep === 1 && ((isLinux && focusIndex === runners.length + 1) || (isMac && focusIndex === 2) || (!isLinux && !isMac && focusIndex === 1))) ||
                      (currentStep === 2 && focusIndex === 5)
                      ? "text-[#ffff00]" : "text-white"}`}
                  style={navBtnStyle(
                    (currentStep === 0 && focusIndex === 1) ||
                    (currentStep === 1 && ((isLinux && focusIndex === runners.length + 1) || (isMac && focusIndex === 2) || (!isLinux && !isMac && focusIndex === 1))) ||
                    (currentStep === 2 && focusIndex === 5)
                  )}
                >
                  <span className="tracking-widest text-xl">
                    {currentStep === totalSteps - 1 ? "Finish" : "Next"}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SetupView;

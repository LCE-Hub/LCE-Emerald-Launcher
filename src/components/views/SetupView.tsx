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

  const totalSteps = isLinux ? 4 : 4;

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
        console.log("[macOS Setup Progress]", progress);
        setSetupProgress(progress);
      });

      return () => {
        unlisten.then(f => f?.());
      };
    }
  }, [isLinux, isMac]);

  const checkMacOSRuntime = async () => {
    try {
      const localStorageInstalled = localStorage.getItem('lce-macos-runtime-installed') === 'true';

      if (localStorageInstalled) {
        console.log("[macOS Runtime] Using cached installation status");
        try {
          const runtimeCheck = await TauriService.checkMacOSRuntimeInstalledFast();
          if (runtimeCheck) {
            setRuntimeAlreadyInstalled(true);
            return;
          } else {
            console.log("[macOS Runtime] Cache was wrong, clearing");
            localStorage.removeItem('lce-macos-runtime-installed');
            setRuntimeAlreadyInstalled(false);
            return;
          }
        } catch (error) {
          console.log("[macOS Runtime] Fast check failed, using cache");
          setRuntimeAlreadyInstalled(true);
          return;
        }
      } else {
        console.log("[macOS Runtime] No installation detected");
        setRuntimeAlreadyInstalled(false);
      }
    } catch (error) {
      console.error("[macOS Runtime] Error checking:", error);
      setRuntimeAlreadyInstalled(false);
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
      if (isLinux && selectedRunner) {
        setLinuxRunner(selectedRunner);
      }
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
      // Elements count per step
      let count = 0;
      if (currentStep === 0) count = 2; // Input, Next
      else if (currentStep === 1) {
        if (isLinux) count = runners.length + 2; // Runners, Back, Next
        else if (isMac) count = 3; // Install, Back, Next
        else count = 2; // Back, Next
      } else if (currentStep === 2) count = 4; // 2 Toggles, Back, Next
      else if (currentStep === 3) count = 2; // Back, Finish

      if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % count);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + count) % count);
      } else if (e.key === "Enter") {
        // Handle enter based on focusIndex and step
        if (currentStep === 0) {
          if (focusIndex === 0) handleNext(); // For input field
          else if (focusIndex === 1) handleNext(); // Next button
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
          else if (focusIndex === 2) handleBack();
          else if (focusIndex === 3) handleNext();
        } else if (currentStep === 3) {
          if (focusIndex === 0) handleBack();
          else if (focusIndex === 1) handleNext();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentStep, focusIndex, runners, enableVfx, enableDiscordRPC, isLinux, isMac, tempUsername]);

  const handleMacosSetup = async () => {
    playPressSound();
    setIsSettingUpRuntime(true);
    setSetupProgress({ stage: "preparing", message: "Preparing macOS runtime setup...", percent: 0 });

    try {
      console.log("[macOS Setup] Starting runtime installation...");
      await TauriService.setupMacosRuntime();
      console.log("[macOS Setup] Runtime installation completed successfully!");
      setSetupProgress({ stage: "completed", message: "Setup completed successfully!", percent: 100 });

      localStorage.setItem('lce-macos-runtime-installed', 'true');
      setRuntimeAlreadyInstalled(true);

      setTimeout(() => {
        setCurrentStep(2);
        setIsSettingUpRuntime(false);
        setSetupProgress(null);
      }, 2000);
    } catch (e) {
      console.error("[macOS Setup] Error:", e);
      setSetupProgress({ stage: "error", message: `Setup failed: ${e}`, percent: 0 });
      setIsSettingUpRuntime(false);
    }
  };

  const canProceed = () => {
    if (currentStep === 0) {
      return tempUsername.trim().length > 0;
    }
    if (currentStep === 1 && isMac) {
      return runtimeAlreadyInstalled;
    }
    return true;
  };

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
            transition={{ duration: useConfig().animationsEnabled ? 0.2 : 0 }}
            className="max-w-2xl w-full mx-auto flex flex-col"
          >
            <div className="relative p-8 flex flex-col"
              style={{
                backgroundImage: "url('/images/frame_background.png')",
                backgroundSize: "100% 100%",
                backgroundRepeat: "no-repeat",
                imageRendering: "pixelated",
                transformOrigin: "center center",
                maxHeight: "85vh",
              }}>
              <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#555 transparent" }}>
                <div className="flex justify-center space-x-2 mb-8">
                  {Array.from({ length: totalSteps }, (_, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: useConfig().animationsEnabled ? i * 0.05 : 0 }}
                      className={`h-2 w-16 transition-all ${i <= currentStep ? "bg-white" : "bg-white/20"
                        }`}
                    />
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={`content-${currentStep}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: useConfig().animationsEnabled ? 0.3 : 0, delay: useConfig().animationsEnabled ? 0.1 : 0 }}
                  >
                    {currentStep === 0 && (
                      <div className="text-center">
                        <h2 className="text-3xl font-bold mb-6 text-white" style={{ textShadow: "2px 2px 0px rgba(0,0,0,0.8)" }}>
                          Welcome to Emerald Legacy
                        </h2>
                        <p className="text-lg mb-8 text-white/80">Let's configure your launcher</p>

                        <div className="space-y-4">
                          <label className="block text-left">
                            <span className="text-white font-bold mb-2 block">Username</span>
                            <input
                              type="text"
                              value={tempUsername}
                              onChange={(e) => setTempUsername(e.target.value)}
                              onFocus={() => setFocusIndex(0)}
                              className={`w-full px-4 py-3 bg-black/50 border-2 font-bold focus:outline-none transition-colors ${focusIndex === 0 ? "border-yellow-400" : "border-white"}`}
                              placeholder="Enter your username"
                              maxLength={16}
                              autoFocus
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {currentStep === 1 && isMac && (
                      <div className="text-center">
                        <h2 className="text-3xl font-bold mb-6 text-white" style={{ textShadow: "2px 2px 0px rgba(0,0,0,0.8)" }}>
                          macOS Compatibility
                        </h2>
                        <p className="text-lg mb-6 text-white/80">
                          {runtimeAlreadyInstalled
                            ? "Emerald Legacy compatibility runtime is already installed"
                            : "Emerald Legacy needs compatibility runtime for macOS"
                          }
                        </p>

                        {setupProgress && (
                          <div className="mb-4 p-4 bg-black/50 border border-white/20 rounded">
                            <p className="text-sm font-bold text-yellow-400 mb-2">{setupProgress.stage.toUpperCase()}</p>
                            <p className="text-xs opacity-80">{setupProgress.message}</p>
                            {setupProgress.percent !== undefined && (
                              <div className="w-full bg-white/20 h-2 rounded-full mt-3">
                                <div
                                  className="h-full bg-green-500 rounded-full transition-all duration-300"
                                  style={{ width: `${setupProgress.percent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className={`p-4 rounded-lg ${runtimeAlreadyInstalled
                            ? "bg-green-600/20 border-2 border-green-400"
                            : "bg-yellow-600/20 border-2 border-yellow-400"
                            }`}>
                            <p className={`font-bold mb-2 ${runtimeAlreadyInstalled ? "text-green-400" : "text-yellow-400"
                              }`}>
                              {runtimeAlreadyInstalled ? "✓ Runtime Detected" : "⚠ Runtime Not Detected"}
                            </p>
                            <p className="text-xs text-white/80">
                              {runtimeAlreadyInstalled
                                ? "The compatibility runtime is properly installed and ready to use."
                                : "You must install the compatibility runtime before proceeding to the next step."
                              }
                            </p>
                          </div>

                          <button
                            onClick={handleMacosSetup}
                            onMouseEnter={() => setFocusIndex(0)}
                            disabled={isSettingUpRuntime}
                            className={`px-6 py-3 text-white font-bold bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 active:scale-95 border-4 ${focusIndex === 0 ? "border-yellow-400" : "border-green-400"}`}
                            style={{
                              fontFamily: "'Mojangles', monospace",
                              imageRendering: "pixelated",
                              textShadow: "2px 2px 0px rgba(0,0,0,0.8)",
                              boxShadow: "4px 4px 0px rgba(0,0,0,0.3)",
                              fontSize: "16px",
                              letterSpacing: "1px"
                            }}
                          >
                            {isSettingUpRuntime ? "Installing..." : runtimeAlreadyInstalled ? "Reinstall Runtime" : "Install Runtime"}
                          </button>

                          {!runtimeAlreadyInstalled && (
                            <p className="text-xs text-red-400 font-bold">
                              ⚠ Installation required before proceeding to next step
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {currentStep === 1 && isLinux && (
                      <div className="text-center">
                        <h2 className="text-3xl font-bold mb-6 text-white" style={{ textShadow: "2px 2px 0px rgba(0,0,0,0.8)" }}>
                          Linux Compatibility
                        </h2>
                        <p className="text-lg mb-6 text-white/80">Choose your preferred compatibility layer</p>

                        {runners.length === 0 ? (
                          <div className="p-4 bg-yellow-500/20 border-2 border-yellow-500/50">
                            <p className="text-yellow-400">No compatible runners found. Please install Wine or Proton.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {runners.map((runner, idx) => (
                              <button
                                key={runner.id}
                                onClick={() => handleRunnerSelect(runner.id)}
                                onMouseEnter={() => setFocusIndex(idx)}
                                className={`w-full p-4 text-left border-2 transition-all duration-200 ${selectedRunner === runner.id
                                  ? "bg-white/20 border-white shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                                  : "bg-black/50 border-white/20"
                                  } ${focusIndex === idx ? "border-yellow-400" : ""}`}
                              >
                                <p className="font-bold text-white">{runner.name}</p>
                                <p className="text-xs text-white/60 mt-1">{runner.type}</p>
                              </button>
                            ))}
                          </div>
                        )}

                        <p className="text-xs mt-4 text-white/60">You can change this later in settings</p>
                      </div>
                    )}

                    {currentStep === 1 && !isMac && !isLinux && (
                      <div className="text-center">
                        <h2 className="text-3xl font-bold mb-6 text-white" style={{ textShadow: "2px 2px 0px rgba(0,0,0,0.8)" }}>
                          Windows Setup
                        </h2>
                        <p className="text-lg mb-6 text-white/80">Everything is ready to go!</p>
                        <div className="text-green-400 font-bold">✓ Native compatibility</div>

                        <div className="mt-6 p-4 bg-green-600/20 border-2 border-green-400 rounded-lg">
                          <p className="text-green-400 font-bold mb-2">✓ Windows Native Support</p>
                          <p className="text-xs text-white/80">Emerald Legacy runs natively on Windows without additional requirements.</p>
                        </div>
                      </div>
                    )}

                    {currentStep === 2 && (
                      <div className="text-center">
                        <h2 className="text-3xl font-bold mb-6 text-white" style={{ textShadow: "2px 2px 0px rgba(0,0,0,0.8)" }}>
                          Customize Your Experience
                        </h2>
                        <p className="text-lg mb-8 text-white/80">Choose your preferred launcher settings</p>

                        <div className="space-y-4 max-w-md mx-auto">
                          <div className="bg-black/50 border-2 border-white/20 p-4">
                            <div className="flex items-center justify-between">
                              <div className="text-left">
                                <p className="text-white font-bold">Click effects</p>
                                <p className="text-xs text-white/60">Click particles and animations</p>
                              </div>
                              <button
                                onClick={() => {
                                  playPressSound();
                                  setEnableVfx(!enableVfx);
                                }}
                                onMouseEnter={() => setFocusIndex(0)}
                                className={`w-12 h-6 outline-none border-none bg-transparent transition-all duration-200 hover:border-yellow-400 hover:shadow-[0_0_8px_rgba(250,204,21,0.3)] ${focusIndex === 0 ? "scale-110 shadow-[0_0_8px_rgba(250,204,21,0.6)]" : ""}`}
                                style={{ imageRendering: "pixelated" }}
                              >
                                <img
                                  src={enableVfx ? "/images/Toggle_Switch_On.png" : "/images/Toggle_Switch_Off.png"}
                                  alt="Toggle"
                                  className="w-full h-full object-contain"
                                />
                              </button>
                            </div>
                          </div>

                          <div className="bg-black/50 border-2 border-white/20 p-4">
                            <div className="flex items-center justify-between">
                              <div className="text-left">
                                <p className="text-white font-bold">Discord Rich Presence</p>
                                <p className="text-xs text-white/60">Show your Emerald Legacy status on Discord</p>
                              </div>
                              <button
                                onClick={() => {
                                  playPressSound();
                                  setEnableDiscordRPC(!enableDiscordRPC);
                                }}
                                onMouseEnter={() => setFocusIndex(1)}
                                className={`w-12 h-6 outline-none border-none bg-transparent transition-all duration-200 hover:border-yellow-400 hover:shadow-[0_0_8px_rgba(250,204,21,0.3)] ${focusIndex === 1 ? "scale-110 shadow-[0_0_8px_rgba(250,204,21,0.6)]" : ""}`}
                                style={{ imageRendering: "pixelated" }}
                              >
                                <img
                                  src={enableDiscordRPC ? "/images/Toggle_Switch_On.png" : "/images/Toggle_Switch_Off.png"}
                                  alt="Toggle"
                                  className="w-full h-full object-contain"
                                />
                              </button>
                            </div>
                          </div>
                        </div>

                        <p className="text-xs mt-6 text-white/60">You can change these later in settings</p>
                      </div>
                    )}

                    {currentStep === 3 && (
                      <div className="text-center">
                        <h2 className="text-3xl font-bold mb-6 text-white" style={{ textShadow: "2px 2px 0px rgba(0,0,0,0.8)" }}>
                          Setup Complete!
                        </h2>

                        <div className="space-y-4 mb-8">
                          <div className="text-left bg-black/50 border-2 border-white/20 p-4">
                            <p className="text-white">Username: <span className="font-bold text-green-400">{tempUsername}</span></p>
                            {isMac && (
                              <p className="text-white">
                                Runtime: <span className="font-bold text-green-400">Ready</span>
                              </p>
                            )}
                            {isLinux && selectedRunner && (
                              <p className="text-white">
                                Runner: <span className="font-bold text-green-400">{runners.find(r => r.id === selectedRunner)?.name}</span>
                              </p>
                            )}
                            <div className="mt-2 pt-2 border-t border-white/20">
                              <p className="text-white text-sm">Customization:</p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {enableVfx && <span className="text-xs bg-green-600/30 px-2 py-1 border border-green-400">Visual Effects</span>}
                                {enableDiscordRPC && <span className="text-xs bg-green-600/30 px-2 py-1 border border-green-400">Discord RPC</span>}
                              </div>
                            </div>
                          </div>
                        </div>

                        <p className="text-white/80">Emerald Legacy is now configured and ready to use!</p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex justify-between mt-4">
                {currentStep > 0 && (
                  <button
                    onClick={handleBack}
                    onMouseEnter={() => {
                      if (currentStep === 0) setFocusIndex(1);
                      else if (currentStep === 1) setFocusIndex(isLinux ? runners.length : (isMac ? 1 : 0));
                      else if (currentStep === 2) setFocusIndex(4);
                      else if (currentStep === 3) setFocusIndex(0);
                    }}
                    disabled={currentStep === 0}
                    className={`mc-setup-nav-btn px-6 py-3 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:border-yellow-400 hover:shadow-[0_0_10px_rgba(250,204,21,0.3)] ${(currentStep === 1 && ((isLinux && focusIndex === runners.length) || (isMac && focusIndex === 1) || (!isLinux && !isMac && focusIndex === 0))) ||
                      (currentStep === 2 && focusIndex === 4) ||
                      (currentStep === 3 && focusIndex === 0)
                      ? "border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]" : ""
                      }`}
                  >
                    Back
                  </button>
                )}

                <button
                  onClick={handleNext}
                  onMouseEnter={() => {
                    if (currentStep === 0) setFocusIndex(1);
                    else if (currentStep === 1) setFocusIndex(isLinux ? runners.length + 1 : (isMac ? 2 : 1));
                    else if (currentStep === 2) setFocusIndex(5);
                    else if (currentStep === 3) setFocusIndex(1);
                  }}
                  disabled={!canProceed()}
                  className={`${currentStep > 0 ? '' : 'ml-auto'} mc-setup-nav-btn px-6 py-3 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:border-yellow-400 hover:shadow-[0_0_10px_rgba(250,204,21,0.3)] ${(currentStep === 0 && focusIndex === 1) ||
                    (currentStep === 1 && ((isLinux && focusIndex === runners.length + 1) || (isMac && focusIndex === 2) || (!isLinux && !isMac && focusIndex === 1))) ||
                    (currentStep === 2 && focusIndex === 5) ||
                    (currentStep === 3 && focusIndex === 1)
                    ? "border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]" : ""
                    }`}
                >
                  {currentStep === totalSteps - 1 ? "Finish" : "Next"}
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

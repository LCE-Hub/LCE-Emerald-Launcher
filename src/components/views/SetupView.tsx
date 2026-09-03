import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { TauriService, Runner } from "../../services/TauriService";
import { usePlatform } from "../../hooks/usePlatform";
import { useConfig, useAudio } from "../../context/LauncherContext";
interface SetupViewProps {
  onComplete: () => void;
}

const SetupView: React.FC<SetupViewProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const { isLinux, isMac, isAndroid } = usePlatform();
  const {
    username,
    setUsername,
    setHasCompletedSetup,
    setRpcEnabled: setConfigRpc,
    setLinuxRunner,
    linuxRunner: configLinuxRunner,
    rpcEnabled: configRpc,
    animationsEnabled,
  } = useConfig();
  const { playPressSound, playSfx } = useAudio();
  const titleImage = "/images/emerald_launcher.png";
  const [currentStep, setCurrentStep] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [tempUsername, setTempUsername] = useState(username);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [selectedRunner, setSelectedRunner] = useState<string>("");
  const [isSettingUpRuntime, setIsSettingUpRuntime] = useState(false);
  const [setupProgress, setSetupProgress] = useState<{
    stage: string;
    message: string;
    percent?: number;
  } | null>(null);
  const [runtimeAlreadyInstalled, setRuntimeAlreadyInstalled] = useState(false);
  const [enableDiscordRPC, setEnableDiscordRPC] = useState(configRpc);
  const totalSteps = 4;
  useEffect(() => {
    if (isLinux || isMac) {
      TauriService.getAvailableRunners().then((availableRunners) => {
        setRunners(availableRunners);
        if (
          configLinuxRunner &&
          availableRunners.find((r) => r.id === configLinuxRunner)
        ) {
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
        unlisten.then((f) => f?.());
      };
    }
  }, [isLinux, isMac]);

  const checkMacOSRuntime = async () => {
    try {
      const runtimeCheck = await TauriService.checkMacOSRuntimeInstalledFast();
      setRuntimeAlreadyInstalled(runtimeCheck);
      if (runtimeCheck) {
        localStorage.setItem("lce-macos-runtime-installed", "true");
      } else {
        localStorage.removeItem("lce-macos-runtime-installed");
      }
    } catch {
      setRuntimeAlreadyInstalled(false);
      localStorage.removeItem("lce-macos-runtime-installed");
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
      if (!isAndroid) setConfigRpc(enableDiscordRPC);
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
      } else if (currentStep === 2) count = isAndroid ? 3 : 4;
      else if (currentStep === 3) count = 2;
      if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % count);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + count) % count);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (currentStep === 0) {
          if (focusIndex === 0) handleNext();
          else if (focusIndex === 1) handleNext();
        } else if (currentStep === 1) {
          if (isLinux) {
            if (focusIndex < runners.length)
              handleRunnerSelect(runners[focusIndex].id);
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
          if (isAndroid) {
            if (focusIndex === 0) {
              playPressSound();
            } else if (focusIndex === 1) handleBack();
            else if (focusIndex === 2) handleNext();
          } else {
            if (focusIndex === 0) {
              setEnableDiscordRPC(!enableDiscordRPC);
              playPressSound();
            } else if (focusIndex === 1) {
              playPressSound();
            } else if (focusIndex === 2) handleBack();
            else if (focusIndex === 3) handleNext();
          }
        } else if (currentStep === 3) {
          if (focusIndex === 0) handleBack();
          else if (focusIndex === 1) handleNext();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    currentStep,
    focusIndex,
    runners,
    enableDiscordRPC,
    isLinux,
    isMac,
    isAndroid,
    tempUsername,
  ]);

  const handleMacosSetup = async () => {
    playPressSound();
    setIsSettingUpRuntime(true);
    setSetupProgress({
      stage: "preparing",
      message: t("setup.macosPreparing"),
      percent: 0,
    });
    try {
      await TauriService.setupMacosRuntime();
      setSetupProgress({
        stage: "completed",
        message: t("setup.macosCompleted"),
        percent: 100,
      });
      localStorage.setItem("lce-macos-runtime-installed", "true");
      setRuntimeAlreadyInstalled(true);
      setTimeout(() => {
        setCurrentStep(2);
        setIsSettingUpRuntime(false);
        setSetupProgress(null);
      }, 2000);
    } catch (e) {
      setSetupProgress({
        stage: "error",
        message: t("setup.macosFailed", { error: e }),
        percent: 0,
      });
      setIsSettingUpRuntime(false);
    }
  };

  const canProceed = () => {
    if (currentStep === 0) return tempUsername.trim().length > 0;
    if (currentStep === 1 && isMac) return runtimeAlreadyInstalled;
    return true;
  };

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

        <div className="max-w-xl w-full mx-auto flex flex-col items-center">
          <div
            className="relative p-8 flex flex-col w-full"
            style={{
              maxHeight: "85vh",
            }}
          >
            {currentStep === 0 && (
              <p className="text-white text-sm tracking-widest text-center uppercase mb-4">
                {t("setup.letsConfigure")}
              </p>
            )}
            {currentStep === 1 && (
              <p className="text-white text-xs tracking-widest text-center uppercase mb-4">
                {t("setup.compatibilityRuntime")}
              </p>
            )}
            {currentStep === 2 && (
              <p className="text-white text-xs tracking-widest text-center uppercase mb-4">
                {t("setup.choosePreferredOptions")}
              </p>
            )}
            <div
              className="mt-4 overflow-y-auto flex-1"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "#555 transparent",
              }}
            >
              {currentStep === 0 && (
                <div className="p-5 flex flex-col gap-4 mc-options-bg">
                  <label className="block relative">
                    <span className="text-black font-bold uppercase tracking-widest text-sm block mb-2">
                      {t("setup.username")}
                    </span>
                    <div className="relative">
                      <input
                        type="text"
                        ref={(el) => {
                          if (el) {
                            const selectionStart = el.selectionStart ?? 0;
                            const textBeforeCursor = tempUsername.substring(
                              0,
                              selectionStart,
                            );
                            const span = document.createElement("span");
                            span.style.font = getComputedStyle(el).font;
                            span.style.letterSpacing =
                              getComputedStyle(el).letterSpacing;
                            span.textContent = textBeforeCursor;
                            document.body.appendChild(span);
                            const cursorPosition = span.offsetWidth;
                            document.body.removeChild(span);
                            const caret =
                              document.getElementById("custom-caret");
                            if (caret) {
                              caret.style.left = `${cursorPosition + 16}px`;
                            }
                          }
                        }}
                        value={tempUsername}
                        onChange={(e) => setTempUsername(e.target.value)}
                        onFocus={() => setFocusIndex(0)}
                        onSelect={() => {
                          const el = document.querySelector(
                            'input[type="text"]',
                          ) as HTMLInputElement;
                          if (el) {
                            const selectionStart = el.selectionStart ?? 0;
                            const textBeforeCursor = tempUsername.substring(
                              0,
                              selectionStart,
                            );
                            const span = document.createElement("span");
                            span.style.font = getComputedStyle(el).font;
                            span.style.letterSpacing =
                              getComputedStyle(el).letterSpacing;
                            span.textContent = textBeforeCursor;
                            document.body.appendChild(span);
                            const cursorPosition = span.offsetWidth;
                            document.body.removeChild(span);
                            const caret =
                              document.getElementById("custom-caret");
                            if (caret) {
                              caret.style.left = `${cursorPosition + 16}px`;
                            }
                          }
                        }}
                        className={`w-full px-4 py-2 focus:outline-none transition-colors text-white tracking-widest
                              ${focusIndex === 0 ? "border-4 border-[#FFFF55] text-[#FFFF55]" : "border-4 border-[#323232]"}`}
                        style={{
                          imageRendering: "pixelated",
                          fontFamily: "'Mojangles', monospace",
                          backgroundColor: "#646464",
                          caretColor: "transparent",
                        }}
                        placeholder={t("setup.enterUsername")}
                        maxLength={16}
                        autoFocus
                      />
                      {focusIndex === 0 && (
                        <span
                          id="custom-caret"
                          className="absolute top-1/2 -translate-y-1/2 text-white blink-caret"
                          style={{
                            fontFamily: "'Mojangles', monospace",
                            left: "16px",
                          }}
                        >
                          _
                        </span>
                      )}
                    </div>
                  </label>
                  {tempUsername.trim().length === 0 && (
                    <p className="text-gray-500 text-xs text-center uppercase tracking-widest">
                      {t("setup.usernameRequired")}
                    </p>
                  )}
                </div>
              )}

              {currentStep === 1 && isMac && (
                <div className="p-5 flex flex-col gap-4 mc-options-bg">
                  <div
                    className={`flex items-center gap-3 p-3 border-2 ${runtimeAlreadyInstalled ? "border-green-400/60 bg-green-100" : "border-yellow-400/60 bg-yellow-100"}`}
                  >
                    {runtimeAlreadyInstalled ? (
                      <img
                        src="/images/check.png"
                        alt="checked"
                        className="w-6 h-6"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <span className="text-xl text-yellow-600">⚠</span>
                    )}
                    <div>
                      <p
                        className={`font-bold text-sm uppercase tracking-widest ${runtimeAlreadyInstalled ? "text-green-700" : "text-yellow-700"}`}
                      >
                        {runtimeAlreadyInstalled
                          ? t("setup.runtimeDetected")
                          : t("setup.runtimeNotDetected")}
                      </p>
                      <p className="text-gray-700 text-xs mt-0.5">
                        {runtimeAlreadyInstalled
                          ? t("setup.gptInstalled")
                          : t("setup.mustInstallRuntime")}
                      </p>
                    </div>
                  </div>

                  {setupProgress && (
                    <div className="p-3 bg-gray-100 border border-gray-300">
                      <p className="text-yellow-600 text-xs font-bold uppercase tracking-widest mb-1">
                        {setupProgress.stage}
                      </p>
                      <p className="text-gray-700 text-xs">
                        {setupProgress.message}
                      </p>
                      {setupProgress.percent !== undefined && (
                        <div className="w-full bg-gray-300 h-1.5 mt-2">
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
                            ${focusIndex === 0 ? "text-[#FFFF55]" : "text-white"} disabled:opacity-50 disabled:cursor-not-allowed`}
                      style={navBtnStyle(focusIndex === 0)}
                    >
                      <span className="tracking-widest uppercase text-lg">
                        {isSettingUpRuntime
                          ? t("setup.installing")
                          : runtimeAlreadyInstalled
                            ? t("setup.reinstallRuntime")
                            : t("setup.installRuntime")}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {currentStep === 1 && isLinux && (
                <div className="p-5 flex flex-col gap-3 mc-options-bg">
                  {runners.length === 0 ? (
                    <div className="p-3 border-2 border-yellow-400/50 bg-yellow-50">
                      <p className="text-yellow-600 text-sm text-center">
                        {t("setup.noCompatibleRunners")}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {runners.map((runner, idx) => (
                        <button
                          key={runner.id}
                          onClick={() => handleRunnerSelect(runner.id)}
                          onMouseEnter={() => setFocusIndex(idx)}
                          className={`w-full h-10 flex items-center justify-between px-4 transition-all outline-none border-none
                                ${selectedRunner === runner.id ? "bg-gray-200" : "bg-transparent"}
                                ${focusIndex === idx ? "text-[#FFFF55]" : "text-gray-800"} hover:text-[#FFFF55] hover:bg-gray-200`}
                          style={navBtnStyle(focusIndex === idx)}
                        >
                          <span className="tracking-widest uppercase text-lg text-gray-800">
                            {runner.name}
                          </span>
                          {selectedRunner === runner.id && (
                            <span className="text-[#FFFF55] text-sm">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 text-center uppercase tracking-widest mt-1">
                    {t("setup.changeLaterInSettings")}
                  </p>
                </div>
              )}

              {currentStep === 1 && !isMac && !isLinux && !isAndroid && (
                <div className="p-5 flex flex-col gap-4 mc-options-bg">
                  <div className="flex items-center gap-3 p-3 border-2 border-green-400/60 bg-green-50">
                    <span className="text-green-400 text-xl">✓</span>
                    <div>
                      <p className="text-green-600 font-bold text-sm uppercase tracking-widest">
                        {t("setup.windowsNativeSupport")}
                      </p>
                      <p className="text-gray-600 text-xs mt-0.5">
                        {t("setup.windowsNativeDesc")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 1 && isAndroid && (
                <div className="p-5 flex flex-col gap-4 mc-options-bg">
                  <div className="flex items-center gap-3 p-3 border-2 border-green-400/60 bg-green-50">
                    <span className="text-green-400 text-xl">✓</span>
                    <div>
                      <p className="text-green-600 font-bold text-sm uppercase tracking-widest">
                        {t("setup.diamondRuntimeSupport")}
                      </p>
                      <p className="text-gray-600 text-xs mt-0.5">
                        {t("setup.diamondRuntimeDesc")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="p-5 flex flex-col gap-2 mc-options-bg">
                  {!isAndroid && (
                    <button
                      onClick={() => {
                        playPressSound();
                        setEnableDiscordRPC(!enableDiscordRPC);
                      }}
                      onMouseEnter={() => setFocusIndex(0)}
                      className={`w-full h-10 flex items-center justify-between px-4 transition-all outline-none border-none rounded
                            ${focusIndex === 0 ? "bg-gray-200" : "bg-transparent"} hover:bg-gray-200`}
                    >
                      <span
                        className={`tracking-widest uppercase text-lg ${focusIndex === 0 ? "text-[#FFFF55]" : "text-gray-800"}`}
                      >
                        {t("setup.discordRpc")}
                      </span>
                      <div className="relative w-6 h-6 shrink-0">
                        <img
                          src={
                            focusIndex === 0
                              ? "/images/checkbox_highlighted.png"
                              : "/images/checkbox.png"
                          }
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
                    </button>
                  )}
                  <button
                    onClick={() => {
                      playPressSound();
                    }}
                    onMouseEnter={() => setFocusIndex(isAndroid ? 0 : 1)}
                    className={`w-full h-10 flex items-center justify-between px-4 transition-all outline-none border-none rounded
                          ${focusIndex === (isAndroid ? 0 : 1) ? "bg-gray-200" : "bg-transparent"} hover:bg-gray-200`}
                  >
                    <span
                      className={`tracking-widest uppercase text-lg ${focusIndex === (isAndroid ? 0 : 1) ? "text-[#FFFF55]" : "text-gray-800"}`}
                    >
                      {t("setup.animations")}
                    </span>
                    <div className="relative w-6 h-6 shrink-0">
                      <img
                        src={
                          focusIndex === (isAndroid ? 0 : 1)
                            ? "/images/checkbox_highlighted.png"
                            : "/images/checkbox.png"
                        }
                        alt="checkbox"
                        className="w-full h-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                      {animationsEnabled && (
                        <img
                          src="/images/check.png"
                          alt="checked"
                          className="absolute inset-0 w-full h-full object-contain"
                          style={{ imageRendering: "pixelated" }}
                        />
                      )}
                    </div>
                  </button>

                  <p className="text-xs text-gray-500 text-center uppercase tracking-widest mt-2">
                    {t("setup.changeTheseLater")}
                  </p>
                </div>
              )}

              {currentStep === 3 && (
                <div className="p-5 flex flex-col gap-3 mc-options-bg">
                  <p className="text-gray-700 text-xs tracking-widest text-center uppercase">
                    {t("setup.setupComplete")}
                  </p>

                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center justify-between px-4 h-10 border-b border-white/10">
                      <span className="text-gray-600 text-sm uppercase tracking-widest">
                        {t("setup.username")}
                      </span>
                      <span className="text-[#FFFF55] font-bold mc-text-shadow">
                        {tempUsername}
                      </span>
                    </div>
                    {isMac && (
                      <div className="flex items-center justify-between px-4 h-10 border-b border-white/10">
                        <span className="text-gray-600 text-sm uppercase tracking-widest">
                          {t("setup.runtime")}
                        </span>
                        <span className="text-green-400 font-bold">{t("setup.ready")}</span>
                      </div>
                    )}
                    {isLinux && selectedRunner && (
                      <div className="flex items-center justify-between px-4 h-10 border-b border-white/10">
                        <span className="text-gray-600 text-sm uppercase tracking-widest">
                          {t("setup.runner")}
                        </span>
                        <span className="text-green-400 font-bold">
                          {runners.find((r) => r.id === selectedRunner)?.name}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-4 h-10 border-b border-white/10">
                      <span className="text-gray-600 text-sm uppercase tracking-widest">
                        {t("setup.animations")}
                      </span>
                      <div className="relative w-5 h-5">
                        <img
                          src="/images/checkbox.png"
                          alt="checkbox"
                          className="w-full h-full object-contain"
                          style={{ imageRendering: "pixelated" }}
                        />
                        {animationsEnabled && (
                          <img
                            src="/images/check.png"
                            alt="checked"
                            className="absolute inset-0 w-full h-full object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                        )}
                      </div>
                    </div>
                    {!isAndroid && (
                      <div className="flex items-center justify-between px-4 h-10">
                        <span className="text-gray-600 text-sm uppercase tracking-widest">
                          {t("setup.discordRpc")}
                        </span>
                        <div className="relative w-5 h-5">
                          <img
                            src="/images/checkbox.png"
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
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between mt-5 gap-3">
              {currentStep > 0 ? (
                <button
                  onClick={handleBack}
                  onMouseEnter={() => {
                    if (currentStep === 3) setFocusIndex(0);
                    else if (currentStep === 2)
                      setFocusIndex(isAndroid ? 1 : 2);
                    else if (currentStep === 1)
                      setFocusIndex(isLinux ? runners.length : isMac ? 1 : 0);
                  }}
                  className={`w-36 h-10 flex items-center justify-center transition-colors mc-text-shadow outline-none border-none
                      ${
                        (currentStep === 3 && focusIndex === 0) ||
                        (currentStep === 2 &&
                          focusIndex === (isAndroid ? 1 : 2)) ||
                        (currentStep === 1 &&
                          ((isLinux && focusIndex === runners.length) ||
                            (isMac && focusIndex === 1) ||
                            (!isLinux && !isMac && focusIndex === 0)))
                          ? "text-[#FFFF55]"
                          : "text-white"
                      }`}
                  style={navBtnStyle(
                    (currentStep === 3 && focusIndex === 0) ||
                      (currentStep === 2 &&
                        focusIndex === (isAndroid ? 1 : 2)) ||
                      (currentStep === 1 &&
                        ((isLinux && focusIndex === runners.length) ||
                          (isMac && focusIndex === 1) ||
                          (!isLinux && !isMac && focusIndex === 0))),
                  )}
                >
                  <span className="tracking-widest uppercase text-xl">
                    {t("common.back")}
                  </span>
                </button>
              ) : (
                <div className="w-36" />
              )}

              <button
                onClick={handleNext}
                onMouseEnter={() => {
                  if (currentStep === 0) setFocusIndex(1);
                  else if (currentStep === 1)
                    setFocusIndex(isLinux ? runners.length + 1 : isMac ? 2 : 1);
                  else if (currentStep === 2) setFocusIndex(isAndroid ? 2 : 3);
                  else if (currentStep === 3) setFocusIndex(1);
                }}
                disabled={!canProceed()}
                className={`w-36 h-10 flex items-center justify-center transition-colors mc-text-shadow outline-none border-none
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${
                      (currentStep === 0 && focusIndex === 1) ||
                      (currentStep === 1 &&
                        ((isLinux && focusIndex === runners.length + 1) ||
                          (isMac && focusIndex === 2) ||
                          (!isLinux && !isMac && focusIndex === 1))) ||
                      (currentStep === 2 &&
                        focusIndex === (isAndroid ? 2 : 3)) ||
                      (currentStep === 3 && focusIndex === 1)
                        ? "text-[#FFFF55]"
                        : "text-white"
                    }`}
                style={navBtnStyle(
                  (currentStep === 0 && focusIndex === 1) ||
                    (currentStep === 1 &&
                      ((isLinux && focusIndex === runners.length + 1) ||
                        (isMac && focusIndex === 2) ||
                        (!isLinux && !isMac && focusIndex === 1))) ||
                    (currentStep === 2 && focusIndex === (isAndroid ? 2 : 3)) ||
                    (currentStep === 3 && focusIndex === 1),
                )}
              >
                <span className="tracking-widest uppercase text-xl">
                  {currentStep === totalSteps - 1 ? t("common.finish") : t("common.next")}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupView;

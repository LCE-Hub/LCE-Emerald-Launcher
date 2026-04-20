import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { useAppConfig } from "../hooks/useAppConfig";
import { TauriService } from "../services/TauriService";
import { useAudioController } from "../hooks/useAudioController";
import { useGameManager } from "../hooks/useGameManager";
import { useSkinSync } from "../hooks/useSkinSync";
import { useDiscordRPC } from "../hooks/useDiscordRPC";
import { useGamepad } from "../hooks/useGamepad";
import { useUpdateCheck } from "../hooks/useUpdateCheck";

interface UIContextType {
  activeView: string;
  setActiveView: (view: string) => void;
  showIntro: boolean;
  setShowIntro: (show: boolean) => void;
  logoAnimDone: boolean;
  setLogoAnimDone: (done: boolean) => void;
  isUiHidden: boolean;
  setIsUiHidden: (hidden: boolean) => void;
  isWindowVisible: boolean;
  showCredits: boolean;
  setShowCredits: (show: boolean) => void;
  focusSection: "menu" | "skin";
  setFocusSection: (section: "menu" | "skin") => void;
  onNavigateToSkin: () => void;
  onNavigateToMenu: () => void;
  connected: boolean;
  updateMessage: string | null;
  clearUpdateMessage: () => void;
}
const UIContext = createContext<UIContextType | undefined>(undefined);

export const ConfigContext = createContext<ReturnType<typeof useAppConfig> | undefined>(undefined);
export const AudioContext = createContext<ReturnType<typeof useAudioController> | undefined>(undefined);
export const GameContext = createContext<ReturnType<typeof useGameManager> | undefined>(undefined);
export const SkinContext = createContext<ReturnType<typeof useSkinSync> | undefined>(undefined);

export function LauncherProvider({ children }: { children: React.ReactNode }) {
  const [showIntro, setShowIntro] = useState(true);
  const [logoAnimDone, setLogoAnimDone] = useState(false);
  const [activeView, setActiveView] = useState("main");
  const [isUiHidden, setIsUiHidden] = useState(false);
  const [isWindowVisible, setIsWindowVisible] = useState(true);
  const [showCredits, setShowCredits] = useState(false);
  const [focusSection, setFocusSection] = useState<"menu" | "skin">("menu");

  const { updateMessage, clearUpdateMessage } = useUpdateCheck();

  const configRaw = useAppConfig();
  const gameRaw = useGameManager({
    profile: configRaw.profile,
    setProfile: configRaw.setProfile,
    customEditions: configRaw.customEditions,
    setCustomEditions: configRaw.setCustomEditions,
  });
  const skinSync = useSkinSync({ username: configRaw.username, profile: configRaw.profile, editions: gameRaw.editions });
  const audioRaw = useAudioController({
    musicVol: configRaw.musicVol,
    sfxVol: configRaw.sfxVol,
    showIntro,
    isGameRunning: gameRaw.isGameRunning,
    isWindowVisible,
  });

  const config = useMemo(() => configRaw, [
    configRaw.username, configRaw.theme, configRaw.layout, configRaw.vfxEnabled,
    configRaw.rpcEnabled, configRaw.musicVol, configRaw.sfxVol, configRaw.isDayTime,
    configRaw.profile, configRaw.linuxRunner, configRaw.perfBoost, configRaw.customEditions,
    configRaw.legacyMode, configRaw.animationsEnabled
  ]);

  const game = useMemo(() => gameRaw, [
    gameRaw.installs, gameRaw.isGameRunning, gameRaw.downloadProgress,
    gameRaw.downloadingId, gameRaw.editions, gameRaw.isRunnerDownloading,
    gameRaw.runnerDownloadProgress, gameRaw.error, gameRaw.updateCustomEdition,
    gameRaw.handleUninstall, gameRaw.handleCancelDownload, configRaw.profile
  ]);

  const audio = useMemo(() => audioRaw, [
    audioRaw.currentTrack, audioRaw.splashIndex, audioRaw.tracks, audioRaw.splashes
  ]);

  useDiscordRPC({
    rpcEnabled: config.rpcEnabled,
    showIntro,
    username: config.username,
    profile: config.profile,
    activeView,
    isGameRunning: game.isGameRunning,
    downloadProgress: game.downloadProgress,
    downloadingId: game.downloadingId,
    editions: game.editions,
    isWindowVisible,
  });

  const { connected } = useGamepad({ playSfx: audio.playSfx, isWindowVisible });

  const onNavigateToSkin = useCallback(() => setFocusSection("skin"), []);
  const onNavigateToMenu = useCallback(() => setFocusSection("menu"), []);

  useEffect(() => {
    if (activeView === "main") {
      audioRaw.setSplashIndex(-1);
    }
  }, [activeView]);

  useEffect(() => {
    if (config.isLoaded && config.profile) {
      TauriService.syncDlc(config.profile).catch(console.error);
    }
  }, [config.profile, config.isLoaded]);

  useEffect(() => {
    if (config.isLoaded) {
      TauriService.saveConfig({
        username: config.username,
        skinBase64: skinSync.skinBase64 || undefined,
        themeStyleId: config.theme,
        linuxRunner: config.linuxRunner,
        appleSiliconPerformanceBoost: config.perfBoost,
        profile: config.profile,
        customEditions: config.customEditions,
        animationsEnabled: config.animationsEnabled,
        vfxEnabled: config.vfxEnabled,
        rpcEnabled: config.rpcEnabled,
        musicVol: config.musicVol,
        sfxVol: config.sfxVol,
        legacyMode: config.legacyMode,
      }).catch(console.error);
    }
  }, [
    config.username, skinSync.skinBase64, config.theme, config.linuxRunner,
    config.perfBoost, config.customEditions, config.profile,
    config.vfxEnabled, config.animationsEnabled,
    config.rpcEnabled, config.musicVol, config.sfxVol, config.legacyMode, config.isLoaded
  ]);

  useEffect(() => {
    const setupVisibilityDetection = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        const unlistenClose = await listen("tauri://close-requested", () => {
          console.log("Window close requested - hiding music");
          setIsWindowVisible(false);
        });

        const unlistenShow = await listen("tauri://window-shown", () => {
          console.log("Window shown - resuming music");
          setIsWindowVisible(true);
        });

        const unlistenFocus = await listen("tauri://focus", () => {
          console.log("Window focused - resuming music");
          setIsWindowVisible(true);
        });

        const unlistenBlur = await listen("tauri://blur", () => {
          console.log("Window blurred - checking visibility");
        });

        return () => {
          unlistenClose();
          unlistenShow();
          unlistenFocus();
          unlistenBlur();
        };
      } catch (error) {
        console.error("Failed to setup visibility detection:", error);
        setIsWindowVisible(true);
      }
    };

    setupVisibilityDetection();
  }, []);

  const uiValue = useMemo(() => ({
    activeView, setActiveView, showIntro, setShowIntro,
    logoAnimDone, setLogoAnimDone, isUiHidden, setIsUiHidden,
    isWindowVisible,
    showCredits, setShowCredits, focusSection, setFocusSection,
    onNavigateToSkin, onNavigateToMenu, connected,
    updateMessage, clearUpdateMessage
  }), [activeView, showIntro, logoAnimDone, isUiHidden, isWindowVisible, showCredits, focusSection, onNavigateToSkin, onNavigateToMenu, connected, updateMessage, clearUpdateMessage]);

  return (
    <UIContext.Provider value={uiValue}>
      <ConfigContext.Provider value={config}>
        <AudioContext.Provider value={audio}>
          <GameContext.Provider value={game}>
            <SkinContext.Provider value={skinSync}>
              {children}
            </SkinContext.Provider>
          </GameContext.Provider>
        </AudioContext.Provider>
      </ConfigContext.Provider>
    </UIContext.Provider>
  );
}

export const useUI = () => { const c = useContext(UIContext); if (!c) throw new Error("useUI must be used within LauncherProvider"); return c; };
export const useConfig = () => { const c = useContext(ConfigContext); if (!c) throw new Error("useConfig must be used within LauncherProvider"); return c; };
export const useAudio = () => { const c = useContext(AudioContext); if (!c) throw new Error("useAudio must be used within LauncherProvider"); return c; };
export const useGame = () => { const c = useContext(GameContext); if (!c) throw new Error("useGame must be used within LauncherProvider"); return c; };
export const useSkin = () => { const c = useContext(SkinContext); if (!c) throw new Error("useSkin must be used within LauncherProvider"); return c; };

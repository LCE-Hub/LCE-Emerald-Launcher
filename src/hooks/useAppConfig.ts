import { useState, useEffect, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { TauriService } from "../services/TauriService";

export function useAppConfig() {
  const [username, setUsername] = useLocalStorage("lce-username", "Steve");
  const [theme, setTheme] = useLocalStorage("lce-theme", "Modern");
  const [layout, setLayout] = useLocalStorage("lce-layout", "KBM");
  const [vfxEnabled, setVfxEnabled] = useLocalStorage("lce-vfx", true);
  const [animationsEnabled, setAnimationsEnabled] = useLocalStorage("lce-animations", true);
  const [rpcEnabled, setRpcEnabled] = useLocalStorage("discord-rpc", true);
  const [musicVol, setMusicVol] = useLocalStorage("lce-music", 50);
  const [sfxVol, setSfxVol] = useLocalStorage("lce-sfx", 100);
  const [isDayTime, setIsDayTime] = useLocalStorage("lce-daytime", true);
  const [profile, setProfile] = useLocalStorage("lce-profile", "legacy_evolved");
  const [legacyMode, setLegacyMode] = useLocalStorage("lce-legacy-mode", false);
  const [keepLauncherOpen, setKeepLauncherOpen] = useLocalStorage("lce-keep-open", false);
  const [enableTrayIcon, setEnableTrayIcon] = useLocalStorage("lce-tray-icon", true);
  const [hasCompletedSetup, setHasCompletedSetup] = useLocalStorage("lce-setup-completed", false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [linuxRunner, setLinuxRunner] = useState<string | undefined>();
  const [perfBoost, setPerfBoost] = useState(false);
  const [customEditions, setCustomEditions] = useState<any[]>([]);

  useEffect(() => {
    TauriService.loadConfig().then((config) => {
      if (config.username) setUsername(config.username);
      if (config.themeStyleId) setTheme(config.themeStyleId);
      if (config.linuxRunner) setLinuxRunner(config.linuxRunner);
      if (config.appleSiliconPerformanceBoost !== undefined)
        setPerfBoost(config.appleSiliconPerformanceBoost);
      if (config.customEditions) setCustomEditions(config.customEditions);
      if (config.profile) setProfile(config.profile);
      if (config.keepLauncherOpen !== undefined) setKeepLauncherOpen(config.keepLauncherOpen);
      if (config.enableTrayIcon !== undefined) setEnableTrayIcon(config.enableTrayIcon);
      if (config.vfxEnabled !== undefined) setVfxEnabled(config.vfxEnabled);
      if (config.animationsEnabled !== undefined) setAnimationsEnabled(config.animationsEnabled);
      if (config.rpcEnabled !== undefined) setRpcEnabled(config.rpcEnabled);
      if (config.musicVol !== undefined && config.musicVol !== null) setMusicVol(config.musicVol);
      if (config.sfxVol !== undefined && config.sfxVol !== null) setSfxVol(config.sfxVol);
      if (config.legacyMode !== undefined) setLegacyMode(config.legacyMode);
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isLoaded) {
      TauriService.updateTrayIcon(enableTrayIcon);
    }
  }, [enableTrayIcon, isLoaded]);

  const saveConfig = useCallback((skinBase64?: string | null) => {
    TauriService.saveConfig({
      username,
      skinBase64: skinBase64 || undefined,
      themeStyleId: theme,
      linuxRunner,
      appleSiliconPerformanceBoost: perfBoost,
      profile,
      customEditions,
      keepLauncherOpen,
      enableTrayIcon,
      animationsEnabled,
      vfxEnabled,
      rpcEnabled,
      musicVol,
      sfxVol,
      legacyMode,
    }).catch(console.error);
  }, [username, theme, linuxRunner, perfBoost, profile, customEditions, keepLauncherOpen, enableTrayIcon, animationsEnabled, vfxEnabled, rpcEnabled, musicVol, sfxVol, legacyMode]);

  return {
    username,
    setUsername,
    theme,
    setTheme,
    layout,
    setLayout,
    vfxEnabled,
    setVfxEnabled,
    animationsEnabled,
    setAnimationsEnabled,
    rpcEnabled,
    setRpcEnabled,
    musicVol: musicVol ?? 50,
    setMusicVol,
    sfxVol: sfxVol ?? 100,
    setSfxVol,
    isDayTime,
    setIsDayTime,
    legacyMode,
    setLegacyMode,
    keepLauncherOpen,
    setKeepLauncherOpen,
    enableTrayIcon,
    setEnableTrayIcon,
    profile,
    setProfile,
    linuxRunner,
    setLinuxRunner,
    perfBoost,
    setPerfBoost,
    customEditions,
    setCustomEditions,
    isLoaded,
    hasCompletedSetup,
    setHasCompletedSetup,
    saveConfig,
  };
}

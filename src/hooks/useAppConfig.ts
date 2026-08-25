import { useState, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import {
  TauriService,
  type CustomEdition,
  type GoldMapperMapping,
} from "../services/TauriService";
export function useAppConfig() {
  const [username, setUsername] = useLocalStorage("lce-username", "Steve");
  const [theme, setTheme] = useLocalStorage("lce-theme", "Modern");
  const [layout, setLayout] = useLocalStorage("lce-layout", "KBM");
  const [vfxEnabled, setVfxEnabled] = useLocalStorage("lce-vfx", true);
  const [animationsEnabled, setAnimationsEnabled] = useLocalStorage("lce-animations", true);
  const [rpcEnabled, setRpcEnabled] = useLocalStorage("discord-rpc", true);
  const [startFullscreen, setStartFullscreen] = useLocalStorage("lce-fullscreen", true);
  const [musicVol, setMusicVol] = useLocalStorage("lce-music", 50);
  const [sfxVol, setSfxVol] = useLocalStorage("lce-sfx", 100);
  const [isDayTime, setIsDayTime] = useLocalStorage("lce-daytime", true);
  const [profile, setProfile] = useLocalStorage("lce-profile", "legacy_evolved");
  const [legacyMode, setLegacyMode] = useLocalStorage("lce-legacy-mode", false);
  const [hasCompletedSetup, setHasCompletedSetup] = useLocalStorage("lce-setup-completed", false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [linuxRunner, setLinuxRunner] = useState<string | undefined>();
  const [perfBoost, setPerfBoost] = useState(false);
  const [customEditions, setCustomEditions] = useState<CustomEdition[]>([]);
  const [customPaths, setCustomPaths] = useState<Record<string, string>>({});
  const [customizations, setCustomizations] = useState<Record<string, { titleImage?: string; panorama?: string }>>({});
  const [mangohudEnabled, setMangohudEnabled] = useState(false);
  const [extraLaunchArgs, setExtraLaunchArgs] = useState<string[] | undefined>();
  const [launchPrefix, setLaunchPrefix] = useState<string | undefined>();
  const [launchEnvVars, setLaunchEnvVars] = useState<Record<string, string> | undefined>();
  const [skipIntro, setSkipIntro] = useLocalStorage("lce-skip-intro", false);
  const [instanceLaunchArgs, setInstanceLaunchArgs] = useState<
    Record<string, { values: Record<string, unknown>; args: string[] }>
  >({});
  const [androidRunner, setAndroidRunner] = useLocalStorage<string | undefined>("lce-android-runner", undefined);
  const [androidAudioBackend, setAndroidAudioBackend] = useLocalStorage<"alsa" | "pulseaudio">("lce-android-audio", "pulseaudio");
  const [goldmapperEnabled, setGoldmapperEnabled] = useLocalStorage("lce-goldmapper", true);
  const [goldmapperMappings, setGoldmapperMappings] = useState<GoldMapperMapping[] | undefined>();
  useEffect(() => {
    TauriService.loadConfig().then((config) => {
      if (config.username) setUsername(config.username);
      if (config.themeStyleId) setTheme(config.themeStyleId);
      if (config.linuxRunner) setLinuxRunner(config.linuxRunner);
      if (config.appleSiliconPerformanceBoost !== undefined)
        setPerfBoost(config.appleSiliconPerformanceBoost);
      if (config.customEditions) setCustomEditions(config.customEditions);
      if (config.customPaths) setCustomPaths(config.customPaths);
      if (config.customizations) setCustomizations(config.customizations);
      if (config.profile) setProfile(config.profile);
      if (config.vfxEnabled !== undefined) setVfxEnabled(config.vfxEnabled);
      if (config.animationsEnabled !== undefined) setAnimationsEnabled(config.animationsEnabled);
      if (config.rpcEnabled !== undefined) setRpcEnabled(config.rpcEnabled);
      if (config.startFullscreen !== undefined) setStartFullscreen(config.startFullscreen);
      if (config.musicVol !== undefined && config.musicVol !== null) setMusicVol(config.musicVol);
      if (config.sfxVol !== undefined && config.sfxVol !== null) setSfxVol(config.sfxVol);
      if (config.legacyMode !== undefined) setLegacyMode(config.legacyMode);
      if (config.mangohudEnabled !== undefined) setMangohudEnabled(config.mangohudEnabled);
      if (config.extraLaunchArgs) setExtraLaunchArgs(config.extraLaunchArgs);
      if (config.launchPrefix) setLaunchPrefix(config.launchPrefix);
      if (config.launchEnvVars) setLaunchEnvVars(config.launchEnvVars);
      if (config.skipIntro !== undefined) setSkipIntro(config.skipIntro);
      if (config.instanceLaunchArgs) setInstanceLaunchArgs(config.instanceLaunchArgs);
      if (config.androidRunner) setAndroidRunner(config.androidRunner);
      if (config.androidAudioBackend) setAndroidAudioBackend(config.androidAudioBackend);
      if (config.goldmapperEnabled !== undefined) setGoldmapperEnabled(config.goldmapperEnabled);
      if (config.goldmapperMappings) setGoldmapperMappings(config.goldmapperMappings);
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isLoaded) {
      TauriService.saveConfig({
        username,
        themeStyleId: theme,
        linuxRunner,
        appleSiliconPerformanceBoost: perfBoost,
        profile,
        customEditions,
        customPaths,
        customizations,
        animationsEnabled,
        vfxEnabled,
        rpcEnabled,
        startFullscreen,
        musicVol,
        sfxVol,
        legacyMode,
        mangohudEnabled,
        extraLaunchArgs,
        launchPrefix,
        launchEnvVars,
        skipIntro,
        instanceLaunchArgs,
        androidRunner,
        androidAudioBackend,
        goldmapperEnabled,
        goldmapperMappings,
      }).catch(console.error);
    }
  }, [username, theme, linuxRunner, perfBoost, profile, customEditions, customPaths, customizations, animationsEnabled, vfxEnabled, rpcEnabled, startFullscreen, musicVol, sfxVol, legacyMode, mangohudEnabled, extraLaunchArgs, launchPrefix, launchEnvVars, skipIntro, isLoaded, instanceLaunchArgs, androidRunner, androidAudioBackend, goldmapperEnabled, goldmapperMappings]);

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
    startFullscreen,
    setStartFullscreen,
    musicVol: musicVol ?? 50,
    setMusicVol,
    sfxVol: sfxVol ?? 100,
    setSfxVol,
    isDayTime,
    setIsDayTime,
    legacyMode,
    setLegacyMode,
    profile,
    setProfile,
    linuxRunner,
    setLinuxRunner,
    perfBoost,
    setPerfBoost,
    customEditions,
    setCustomEditions,
    customPaths,
    setCustomPaths,
    customizations,
    setCustomizations,
    isLoaded,
    hasCompletedSetup,
    setHasCompletedSetup,
    mangohudEnabled,
    setMangohudEnabled,
    extraLaunchArgs,
    setExtraLaunchArgs,
    launchPrefix,
    setLaunchPrefix,
    launchEnvVars,
    setLaunchEnvVars,
    skipIntro,
    setSkipIntro,
    instanceLaunchArgs,
    setInstanceLaunchArgs,
    androidRunner,
    setAndroidRunner,
    androidAudioBackend,
    setAndroidAudioBackend,
    goldmapperEnabled,
    setGoldmapperEnabled,
    goldmapperMappings,
    setGoldmapperMappings,
  };
}

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface McServer {
  name: string;
  ip: string;
  port: number;
}

export interface SkinLibraryItem {
  id: string;
  name: string;
  skinBase64: string;
}

export interface CustomEdition {
  id: string;
  name: string;
  desc: string;
  url: string;
  path?: string;
  category?: string[];
  logo?: string;
}

export interface AppConfig {
  username: string;
  linuxRunner?: string;
  skinBase64?: string;
  skinLibrary?: SkinLibraryItem[];
  themeStyleId?: string;
  themePaletteId?: string;
  appleSiliconPerformanceBoost?: boolean;
  customEditions?: CustomEdition[];
  profile?: string;
  animationsEnabled?: boolean;
  vfxEnabled?: boolean;
  rpcEnabled?: boolean;
  musicVol?: number;
  sfxVol?: number;
  legacyMode?: boolean;
}

export interface ThemePalette {
  id: string;
  name: string;
  colors: any;
}

export interface Runner {
  id: string;
  name: string;
  path: string;
  type: "wine" | "proton";
}

export interface MacOSSetupProgress {
  stage: string;
  message: string;
  percent?: number;
}

export interface InstalledWorkshopPackage {
  instanceId: string;
  packageId: string;
  version: string;
}

export class TauriService {
  static async saveConfig(config: AppConfig): Promise<void> {
    return invoke("save_config", { config });
  }

  static async loadConfig(): Promise<AppConfig> {
    return invoke("load_config");
  }

  static async getExternalPalettes(): Promise<ThemePalette[]> {
    return invoke("get_external_palettes");
  }

  static async importTheme(): Promise<string> {
    return invoke("import_theme");
  }

  static async getAvailableRunners(): Promise<Runner[]> {
    return invoke("get_available_runners");
  }

  static async downloadRunner(name: string, url: string): Promise<string> {
    return invoke("download_runner", { name, url });
  }

  static async checkGameInstalled(instanceId: string): Promise<boolean> {
    return invoke("check_game_installed", { instanceId });
  }

  static async openInstanceFolder(instanceId: string): Promise<void> {
    return invoke("open_instance_folder", { instanceId });
  }

  static async deleteInstance(instanceId: string): Promise<void> {
    return invoke("delete_instance", { instanceId });
  }

  static async cancelDownload(): Promise<void> {
    return invoke("cancel_download");
  }

  static async setupMacosRuntime(): Promise<void> {
    return invoke("setup_macos_runtime");
  }

  static async downloadAndInstall(
    url: string,
    instanceId: string,
  ): Promise<string> {
    return invoke("download_and_install", { url, instanceId });
  }

  static async launchGame(
    instanceId: string,
    servers: McServer[],
  ): Promise<void> {
    return invoke("launch_game", { instanceId, servers });
  }

  static async stopGame(instanceId: string): Promise<void> {
    return invoke("stop_game", { instanceId });
  }

  static async syncDlc(instanceId: string): Promise<void> {
    return invoke("sync_dlc", { instanceId });
  }

  static async workshopInstall(
    instanceId: string,
    packageId: string,
    zips: Record<string, string>,
    version: string,
  ): Promise<void> {
    return invoke("workshop_install", {
      request: { instanceId, packageId, zips, version },
    });
  }

  static async workshopUninstall(instanceId: string, packageId: string): Promise<void> {
    return invoke("workshop_uninstall", { instanceId, packageId });
  }

  static async workshopListInstalled(): Promise<InstalledWorkshopPackage[]> {
    return invoke("workshop_list_installed");
  }

  static onDownloadProgress(callback: (percent: number) => void) {
    return listen<number>("download-progress", (event) =>
      callback(event.payload),
    );
  }

  static onRunnerDownloadProgress(callback: (percent: number) => void) {
    return listen<number>("runner-download-progress", (event) =>
      callback(event.payload),
    );
  }

  static onMacosProgress(callback: (payload: MacOSSetupProgress) => void) {
    return listen<MacOSSetupProgress>("macos-setup-progress", (event) =>
      callback(event.payload),
    );
  }

  static async openUrl(url: string): Promise<void> {
    return invoke("plugin:opener|open_url", { url });
  }

  static async restartLauncher(): Promise<void> {
    return invoke("restart_launcher");
  }

  static async checkMacOSRuntimeInstalled(): Promise<boolean> {
    return invoke("check_macos_runtime_installed");
  }

  static async checkMacOSRuntimeInstalledFast(): Promise<boolean> {
    return invoke("check_macos_runtime_installed_fast");
  }

  static async setupMacOSRuntimeOptimized(): Promise<void> {
    return invoke("setup_macos_runtime_optimized");
  }

  static async fetchSkin(username: string): Promise<[string, string]> {
    return invoke("fetch_skin", { username });
  }

  static async saveGlobalSkinPck(pckData: Uint8Array): Promise<void> {
    return invoke("save_global_skin_pck", { pckData: Array.from(pckData) });
  }

  static async checkGameUpdate(instanceId: string, url: string): Promise<boolean> {
    return invoke("check_game_update", { instanceId, url });
  }

  static async pickFolder(): Promise<string> {
    return invoke("pick_folder");
  }

  static async pickFile(title: string, filters: string[]): Promise<string> {
    return invoke("pick_file", { title, filters });
  }

  static async saveFileDialog(title: string, filename: string, filters: string[]): Promise<string> {
    return invoke("save_file_dialog", { title, filename, filters });
  }

  static async writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
    return invoke("write_binary_file", { path, data: Array.from(data) });
  }

  static async readBinaryFile(path: string): Promise<Uint8Array> {
    const data: number[] = await invoke("read_binary_file", { path });
    return new Uint8Array(data);
  }

  static async downloadLogo(id: string, url: string): Promise<string> {
    return invoke("download_logo", { id, url });
  }
}

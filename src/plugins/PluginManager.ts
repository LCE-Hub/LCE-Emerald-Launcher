import { invoke } from "@tauri-apps/api/core";
import { buildPluginAPI } from "./PluginAPI";
import { PluginSandbox } from "./PluginSandbox";
import { SPLASHES } from "../data/splashes";
import type {
  PluginManifest,
  LoadedPlugin,
  HookEvent,
  HookCallback,
  UnsubscribeFn,
  PluginComponentFactory,
  ViewOptions,
  PluginViewRegistration,
  ActionSlot,
  ActionDef,
  ToastOptions,
  StateSnapshot,
  EventBus,
} from "./types";
type StateChangeCallback = (snapshot: StateSnapshot) => void;
type ViewChangeCallback = (views: PluginViewRegistration[]) => void;
type NavigateCallback = (viewId: string) => void;
type ToastCallback = (
  pluginId: string,
  message: string,
  options?: ToastOptions,
) => void;
type SoundCallback = (name: string) => void;
type PluginEventHandler = (payload: unknown) => void;

export interface PluginInfo {
  manifest: PluginManifest;
  enabled: boolean;
}

export class PluginManager {
  static instance: PluginManager = new PluginManager();
  plugins: Map<string, LoadedPlugin> = new Map();
  private enabledMap: Map<string, boolean> = new Map();
  private hooks: Map<HookEvent, Map<string, HookCallback>> = new Map();
  private views: Map<string, PluginViewRegistration> = new Map();
  private actions: Map<ActionSlot, Map<string, { action: ActionDef; pluginId: string }>> = new Map();
  private splashes: Map<string, Set<string>> = new Map();
  private stateSubs: Map<string, StateChangeCallback> = new Map();
  private pluginEvents: Map<string, Map<string, Set<PluginEventHandler>>> = new Map();
  private onViewsChanged: ViewChangeCallback | null = null;
  private onNavigate: NavigateCallback | null = null;
  private onToast: ToastCallback | null = null;
  private onSound: SoundCallback | null = null;
  private onSplashesChanged: ((splashes: string[]) => void) | null = null;
  private onEnabledChanged: (() => void) | null = null;
  private configSnapshot: Record<string, unknown> = {};
  private gameStateSnapshot: Record<string, unknown> = {};
  private installsSnapshot: string[] = [];
  private _initialized = false;
  get initialized(): boolean {
    return this._initialized;
  }

  setEnabledChangedCallback(cb: () => void): void {
    this.onEnabledChanged = cb;
  }

  isPluginEnabled(id: string): boolean {
    if (!this.enabledMap.has(id)) {
      const stored = localStorage.getItem(`plugin:enabled:${id}`);
      const enabled = stored === null ? true : stored === "true";
      this.enabledMap.set(id, enabled);
    }
    return this.enabledMap.get(id) ?? true;
  }

  setPluginEnabled(id: string, enabled: boolean): void {
    this.enabledMap.set(id, enabled);
    localStorage.setItem(`plugin:enabled:${id}`, String(enabled));
    this.notifyViewsChanged();
    this.notifySplashesChanged();
    this.onEnabledChanged?.();
  }

  getPluginInfoList(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((p) => ({
      manifest: p.manifest,
      enabled: this.isPluginEnabled(p.manifest.id),
    }));
  }

  setViewsChangedCallback(cb: ViewChangeCallback): void {
    this.onViewsChanged = cb;
  }

  setNavigateCallback(cb: NavigateCallback): void {
    this.onNavigate = cb;
  }

  setToastCallback(cb: ToastCallback): void {
    this.onToast = cb;
  }

  setSoundCallback(cb: SoundCallback): void {
    this.onSound = cb;
  }

  setSplashesChangedCallback(cb: (splashes: string[]) => void): void {
    this.onSplashesChanged = cb;
  }

  updateSnapshots(
    config: Record<string, unknown>,
    game: Record<string, unknown>,
    installs: string[],
  ): void {
    this.configSnapshot = config;
    this.gameStateSnapshot = game;
    this.installsSnapshot = installs;
    const snapshot: StateSnapshot = { config, game, installs };
    this.stateSubs.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (err) {
        console.error("[PluginManager] state sub error:", err);
      }
    });
  }

  getConfigSnapshot(): Record<string, unknown> {
    return { ...this.configSnapshot };
  }

  getGameStateSnapshot(): Record<string, unknown> {
    return { ...this.gameStateSnapshot };
  }

  getInstallsSnapshot(): string[] {
    return [...this.installsSnapshot];
  }

  subscribeToState(subId: string, cb: StateChangeCallback): UnsubscribeFn {
    this.stateSubs.set(subId, cb);
    return () => {
      this.stateSubs.delete(subId);
    };
  }

  async reload(): Promise<void> {
    this._initialized = false;
    this.hooks.clear();
    this.views.clear();
    this.actions.clear();
    this.splashes.clear();
    this.plugins.clear();
    this.enabledMap.clear();
    this.pluginEvents.clear();
    this.notifySplashesChanged();
    await this.init();
  }

  async init(): Promise<void> {
    if (this._initialized) return;
    let pluginsDir: string;
    try {
      pluginsDir = await invoke<string>("get_plugins_dir");
    } catch {
      console.warn("[PluginManager] Could not get plugins directory");
      return;
    }

    let entries: Array<{ name: string; is_dir: boolean }>;
    try {
      entries = await invoke("list_directory", { path: pluginsDir });
    } catch {
      return;
    }

    const dirs = entries.filter((e) => e.is_dir);

    for (const dir of dirs) {
      await this.loadPlugin(pluginsDir, dir.name);
    }

    this._initialized = true;
    this.emit("app:ready", {});
    this.notifyViewsChanged();
  }

  private async loadPlugin(pluginsDir: string, dirName: string): Promise<void> {
    const manifestPath = `${pluginsDir}/${dirName}/plugin.json`;
    let manifestRaw: number[];
    try {
      manifestRaw = await invoke<number[]>("read_binary_file", {
        path: manifestPath,
      });
    } catch {
      return;
    }

    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(
        new TextDecoder().decode(new Uint8Array(manifestRaw)),
      );
    } catch {
      console.warn(`[PluginManager] Invalid plugin.json in ${dirName}`);
      return;
    }

    if (!manifest.id || !manifest.main || !manifest.name) {
      console.warn(`[PluginManager] Invalid manifest in ${dirName}`);
      return;
    }

    if (this.plugins.has(manifest.id)) {
      console.warn(`[PluginManager] Duplicate plugin id: ${manifest.id}`);
      return;
    }

    const mainPath = `${pluginsDir}/${dirName}/${manifest.main}`;
    let mainCodeRaw: number[];
    try {
      mainCodeRaw = await invoke<number[]>("read_binary_file", {
        path: mainPath,
      });
    } catch {
      console.warn(
        `[PluginManager] Could not read main file for ${manifest.id}`,
      );
      return;
    }

    const mainCode = new TextDecoder().decode(new Uint8Array(mainCodeRaw));
    const api = buildPluginAPI(manifest, this);
    try {
      await PluginSandbox.evaluateAsync(api, mainCode);
    } catch (err) {
      console.error(
        `[PluginManager] Error loading plugin ${manifest.id}:`,
        err,
      );
      return;
    }

    this.plugins.set(manifest.id, { manifest, api });
  }

  registerHook(
    pluginId: string,
    event: HookEvent,
    callback: HookCallback,
  ): void {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, new Map());
    }
    this.hooks.get(event)!.set(pluginId, callback);
  }

  emit(event: HookEvent, payload: unknown): void {
    const handlers = this.hooks.get(event);
    if (!handlers) return;
    handlers.forEach((cb, pid) => {
      if (!this.isPluginEnabled(pid)) return;
      try {
        cb(payload);
      } catch (err) {
        console.error(`[PluginManager] Error in hook ${event}:`, err);
      }
    });
  }

  emitPluginEvent(event: string, _sourcePluginId: string, payload: unknown): void {
    const eventHandlers = this.pluginEvents.get(event);
    if (!eventHandlers) return;
    eventHandlers.forEach((handlers, pid) => {
      if (!this.isPluginEnabled(pid)) return;
      handlers.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[PluginManager] Error in plugin event "${event}":`, err);
        }
      });
    });
  }

  onPluginEvent(pluginId: string, event: string, callback: PluginEventHandler): UnsubscribeFn {
    if (!this.pluginEvents.has(event)) {
      this.pluginEvents.set(event, new Map());
    }
    const eventHandlers = this.pluginEvents.get(event)!;
    if (!eventHandlers.has(pluginId)) {
      eventHandlers.set(pluginId, new Set());
    }
    eventHandlers.get(pluginId)!.add(callback);
    return () => {
      eventHandlers.get(pluginId)?.delete(callback);
    };
  }

  offPluginEvent(pluginId: string, event: string, callback: PluginEventHandler): void {
    const eventHandlers = this.pluginEvents.get(event);
    if (!eventHandlers) return;
    eventHandlers.get(pluginId)?.delete(callback);
  }

  buildEventBus(pluginId: string): EventBus {
    const self = this;
    return {
      emit(event: string, payload?: unknown): void {
        self.emitPluginEvent(event, pluginId, payload);
      },
      on(event: string, callback: (payload: unknown) => void): UnsubscribeFn {
        return self.onPluginEvent(pluginId, event, callback);
      },
      once(event: string, callback: (payload: unknown) => void): UnsubscribeFn {
        const inner: PluginEventHandler = (payload) => {
          callback(payload);
          unsub();
        };
        const unsub = self.onPluginEvent(pluginId, event, inner);
        return unsub;
      },
      off(event: string, callback: (payload: unknown) => void): void {
        self.offPluginEvent(pluginId, event, callback);
      },
    };
  }

  registerView(
    _pluginId: string,
    id: string,
    factory: PluginComponentFactory,
    options: ViewOptions,
  ): void {
    this.views.set(id, { id, factory, options, pluginId: _pluginId });
    this.notifyViewsChanged();
  }

  unregisterView(id: string): void {
    this.views.delete(id);
    this.notifyViewsChanged();
  }

  getViews(): PluginViewRegistration[] {
    return Array.from(this.views.values()).filter((v) =>
      this.isPluginEnabled(v.pluginId),
    );
  }

  requestNavigate(viewId: string): void {
    this.onNavigate?.(viewId);
  }

  registerAction(
    pluginId: string,
    slot: ActionSlot,
    action: ActionDef,
  ): UnsubscribeFn {
    if (!this.actions.has(slot)) {
      this.actions.set(slot, new Map());
    }
    this.actions.get(slot)!.set(action.id, { action, pluginId });
    return () => {
      this.actions.get(slot)?.delete(action.id);
    };
  }

  getActions(slot: ActionSlot): ActionDef[] {
    const slotActions = this.actions.get(slot);
    if (!slotActions) return [];
    return Array.from(slotActions.values())
      .filter((entry) => this.isPluginEnabled(entry.pluginId))
      .map((entry) => entry.action);
  }

  showToast(pluginId: string, message: string, options?: ToastOptions): void {
    this.onToast?.(pluginId, message, options);
  }

  playSound(name: string): void {
    this.onSound?.(name);
  }

  registerSplash(pluginId: string, splash: string): UnsubscribeFn {
    if (!this.splashes.has(pluginId)) {
      this.splashes.set(pluginId, new Set());
    }
    this.splashes.get(pluginId)!.add(splash);
    this.notifySplashesChanged();
    return () => {
      this.splashes.get(pluginId)?.delete(splash);
      this.notifySplashesChanged();
    };
  }

  getSplashes(): string[] {
    const pluginSplashes: string[] = [];
    this.splashes.forEach((set, pid) => {
      if (this.isPluginEnabled(pid)) {
        pluginSplashes.push(...set);
      }
    });
    return [...SPLASHES, ...pluginSplashes];
  }

  private notifyViewsChanged(): void {
    this.onViewsChanged?.(this.getViews());
  }

  private notifySplashesChanged(): void {
    this.onSplashesChanged?.(this.getSplashes());
  }
}

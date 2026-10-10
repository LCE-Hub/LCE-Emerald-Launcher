import type React from "react";
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  main: string;
  views?: PluginViewDeclaration[];
  permissions?: string[];
}

export interface PluginViewDeclaration {
  id: string;
  label: string;
  icon?: string;
}

export type HookEvent =
  | "app:ready"
  | "app:before-quit"
  | "game:before-launch"
  | "game:after-launch"
  | "game:before-stop"
  | "game:after-stop"
  | "game:install-start"
  | "game:install-complete"
  | "game:install-progress"
  | "game:uninstall"
  | "config:change"
  | "view:mount"
  | "view:unmount";

export type HookCallback = (payload: unknown) => void;
export type UnsubscribeFn = () => void;
export type PluginComponentFactory = (
  api: PluginAPI,
) => React.ComponentType<Record<string, unknown>>;

export interface ViewOptions {
  label: string;
  icon?: string;
}

export type ActionSlot =
  | "home-menu"
  | "version-toolbar"
  | "devtools-list"
  | "settings-tab";

export interface ActionDef {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
}

export interface ToastOptions {
  title?: string;
  variant?: "error" | "update" | "steam";
  duration?: number;
}

export interface StateSnapshot {
  config: Record<string, unknown>;
  game: Record<string, unknown>;
  installs: string[];
}

export interface PluginViewRegistration {
  id: string;
  factory: PluginComponentFactory;
  options: ViewOptions;
  pluginId: string;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  api: PluginAPI;
}

export interface EventBus {
  emit(event: string, payload?: unknown): void;
  on(event: string, callback: (payload: unknown) => void): UnsubscribeFn;
  once(event: string, callback: (payload: unknown) => void): UnsubscribeFn;
  off(event: string, callback: (payload: unknown) => void): void;
}

export interface PluginAPI {
  id: string;
  manifest: PluginManifest;
  events: EventBus;
  hooks: {
    on(event: HookEvent, callback: HookCallback): UnsubscribeFn;
    once(event: HookEvent, callback: HookCallback): UnsubscribeFn;
    off(event: HookEvent, callback: HookCallback): void;
  };
  views: {
    register(
      id: string,
      factory: PluginComponentFactory,
      options: ViewOptions,
    ): void;
    unregister(id: string): void;
    navigate(id: string): void;
  };
  actions: {
    register(slot: ActionSlot, action: ActionDef): UnsubscribeFn;
  };
  tauri: {
    invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
    listen<T>(
      event: string,
      callback: (payload: T) => void,
    ): Promise<UnsubscribeFn>;
  };
  state: {
    getConfig(): Record<string, unknown>;
    getGameState(): Record<string, unknown>;
    getInstalls(): string[];
    subscribe(cb: (snapshot: StateSnapshot) => void): UnsubscribeFn;
  };
  storage: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    remove(key: string): void;
    clear(): void;
  };
  React: typeof React;
  useState: typeof React.useState;
  useEffect: typeof React.useEffect;
  useMemo: typeof React.useMemo;
  useCallback: typeof React.useCallback;
  ui: {
    showToast(message: string, options?: ToastOptions): void;
    playSound(name: string): void;
    addSplash(splash: string): UnsubscribeFn;
    openUrl(url: string): Promise<void>;
  };
  log: {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  };
}

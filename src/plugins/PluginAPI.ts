import React, { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { PluginStorage } from "./PluginStorage";
import { PluginManager } from "./PluginManager";
import type {
  PluginManifest,
  PluginAPI as PluginAPIType,
  HookEvent,
  HookCallback,
  UnsubscribeFn,
  PluginComponentFactory,
  ViewOptions,
  ActionSlot,
  ActionDef,
  ToastOptions,
  StateSnapshot,
  EventBus,
} from "./types";
const PERMISSION_HOOK_PREFIX = "hooks:";
const PERMISSION_STORAGE = "storage:plugin";
const PERMISSION_TAURI_ALL = "tauri:*";
const PERMISSION_TAURI_PREFIX = "tauri:";
export function buildPluginAPI(
  manifest: PluginManifest,
  manager: PluginManager,
): PluginAPIType {
  const pluginId = manifest.id;
  const perms = new Set(manifest.permissions ?? []);
  const storage = new PluginStorage(pluginId);
  function hasPermission(perm: string): boolean {
    return perms.has(perm);
  }

  function checkHookPermission(event: HookEvent): void {
    if (perms.size === 0) return;
    if (hasPermission(`${PERMISSION_HOOK_PREFIX}${event}`)) return;
    if (hasPermission(`${PERMISSION_HOOK_PREFIX}*`)) return;
    throw new Error(
      `Plugin "${pluginId}" lacks permission for hook "${event}"`,
    );
  }

  const hookHandlers = new Map<HookEvent, Set<HookCallback>>();
  const eventBus: EventBus = manager.buildEventBus(pluginId);

  return {
    id: pluginId,
    manifest,
    events: eventBus,
    hooks: {
      on(event: HookEvent, callback: HookCallback): UnsubscribeFn {
        checkHookPermission(event);
        if (!hookHandlers.has(event)) {
          hookHandlers.set(event, new Set());
          manager.registerHook(pluginId, event, (payload: unknown) => {
            const handlers = hookHandlers.get(event);
            if (handlers) {
              handlers.forEach((cb) => {
                try {
                  cb(payload);
                } catch (err) {
                  console.error(
                    `[Plugin ${pluginId}] hook error on ${event}:`,
                    err,
                  );
                }
              });
            }
          });
        }
        hookHandlers.get(event)!.add(callback);
        return () => {
          hookHandlers.get(event)?.delete(callback);
        };
      },

      once(event: HookEvent, callback: HookCallback): UnsubscribeFn {
        const inner: HookCallback = (payload) => {
          callback(payload);
          unsub();
        };
        const unsub = this.on(event, inner);
        return unsub;
      },

      off(event: HookEvent, callback: HookCallback): void {
        hookHandlers.get(event)?.delete(callback);
      },
    },

    views: {
      register(
        id: string,
        factory: PluginComponentFactory,
        options: ViewOptions,
      ): void {
        manager.registerView(pluginId, id, factory, options);
      },

      unregister(id: string): void {
        manager.unregisterView(id);
      },

      navigate(id: string): void {
        manager.requestNavigate(id);
      },
    },

    actions: {
      register(slot: ActionSlot, action: ActionDef): UnsubscribeFn {
        return manager.registerAction(pluginId, slot, action);
      },
    },

    tauri: {
      async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
        if (perms.size > 0 && !hasPermission(PERMISSION_TAURI_ALL)) {
          if (!hasPermission(`${PERMISSION_TAURI_PREFIX}${cmd}`)) {
            throw new Error(
              `Plugin "${pluginId}" lacks permission for tauri command "${cmd}"`,
            );
          }
        }
        return invoke<T>(cmd, args);
      },

      async listen<T>(
        event: string,
        callback: (payload: T) => void,
      ): Promise<UnsubscribeFn> {
        if (perms.size > 0 && !hasPermission(PERMISSION_TAURI_ALL)) {
          if (!hasPermission(`${PERMISSION_TAURI_PREFIX}listen:${event}`)) {
            throw new Error(
              `Plugin "${pluginId}" lacks permission to listen for event "${event}"`,
            );
          }
        }
        return tauriListen<T>(event, (evt) => callback(evt.payload));
      },
    },

    state: {
      getConfig(): Record<string, unknown> {
        return manager.getConfigSnapshot();
      },

      getGameState(): Record<string, unknown> {
        return manager.getGameStateSnapshot();
      },

      getInstalls(): string[] {
        return manager.getInstallsSnapshot();
      },

      subscribe(cb: (snapshot: StateSnapshot) => void): UnsubscribeFn {
        return manager.subscribeToState(pluginId, cb);
      },
    },

    storage: {
      get<T>(key: string): T | undefined {
        if (!hasPermission(PERMISSION_STORAGE)) return undefined;
        return storage.get<T>(key);
      },
      set<T>(key: string, value: T): void {
        if (!hasPermission(PERMISSION_STORAGE)) return;
        storage.set(key, value);
      },
      remove(key: string): void {
        if (!hasPermission(PERMISSION_STORAGE)) return;
        storage.remove(key);
      },
      clear(): void {
        if (!hasPermission(PERMISSION_STORAGE)) return;
        storage.clear();
      },
    },

    React,
    useState,
    useEffect,
    useMemo,
    useCallback,
    ui: {
      showToast(message: string, options?: ToastOptions): void {
        manager.showToast(pluginId, message, options);
      },
      playSound(name: string): void {
        manager.playSound(name);
      },
      addSplash(splash: string): UnsubscribeFn {
        return manager.registerSplash(pluginId, splash);
      },
      async openUrl(url: string): Promise<void> {
        if (
          perms.size > 0 &&
          !hasPermission(PERMISSION_TAURI_ALL) &&
          !hasPermission("tauri:open_url")
        ) {
          throw new Error(`Plugin "${pluginId}" lacks permission for open_url`);
        }
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      },
    },

    log: {
      info(...args: unknown[]): void {
        console.log(`[Plugin ${pluginId}]`, ...args);
      },
      warn(...args: unknown[]): void {
        console.warn(`[Plugin ${pluginId}]`, ...args);
      },
      error(...args: unknown[]): void {
        console.error(`[Plugin ${pluginId}]`, ...args);
      },
    },
  };
}

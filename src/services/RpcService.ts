import { invoke } from "@tauri-apps/api/core";
import { setActivity, start, clearActivity, stop } from "tauri-plugin-drpc";
import {
  Activity,
  ActivityType,
  Assets,
  Timestamps,
  Button,
  Party,
} from "tauri-plugin-drpc/activity";
class RPC {
  private startTime: number = Date.now();
  private initializationPromise: Promise<void> | null = null;
  private initialized: boolean = false;
  private headUrlCache: Map<string, string> = new Map();
  private headUploadPending: Map<string, Promise<string | null>> = new Map();
  private async renderHeadBlob(skinUrl: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64);
        if (img.height !== 32) {
          ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64);
        }
        canvas.toBlob((blob) => {
          resolve(blob);
        }, "image/png");
      };
      img.onerror = () => {
        resolve(null);
      };
      img.src = skinUrl;
    });
  }

  private async uploadHead(skinUrl: string): Promise<string | null> {
    const cached = this.headUrlCache.get(skinUrl);
    if (cached) {
      return cached;
    }
    const pending = this.headUploadPending.get(skinUrl);
    if (pending) {
      return pending;
    }
    const uploadPromise = (async (): Promise<string | null> => {
      const blob = await this.renderHeadBlob(skinUrl);
      if (!blob) {
        return null;
      }
      const formData = new FormData();
      formData.append("file", blob, "head.png");
      formData.append("expire", "21600");
      try {
        const res = await fetch("https://tmpfiles.org/api/v1/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (json.status === "success" && json.data?.url) {
          const pageUrl = json.data.url;
          const pageRes = await invoke<{ status: number; body: string }>(
            "http_proxy_request",
            {
              method: "GET",
              url: pageUrl,
              body: null,
              headers: {},
            },
          );
          const html = pageRes.body;
          const match = html.match(/id="img_preview"\s+src="([^"]+)"/);
          if (match) {
            const directUrl = match[1];
            this.headUrlCache.set(skinUrl, directUrl);
            return directUrl;
          }
          console.error(
            "[RPC] uploadHead: could not extract direct image url from page",
          );
        }
        console.error("[RPC] uploadHead: upload failed or no url in response");
      } catch (e) {
        console.error("[RPC] uploadHead: fetch error:", e);
      }
      return null;
    })();
    this.headUploadPending.set(skinUrl, uploadPromise);
    try {
      return await uploadPromise;
    } finally {
      this.headUploadPending.delete(skinUrl);
    }
  }
  public async StartRPC() {
    if (this.initialized) return;
    if (sessionStorage.getItem("lce_rpc_started") === "true") {
      this.initialized = true;
      return;
    }

    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = (async () => {
      try {
        await start("1482504445152460871");
        sessionStorage.setItem("lce_rpc_started", "true");
        this.initialized = true;
      } catch (e) {
        console.error("Failed to start RPC:", e);
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  public async updateActivity(
    details: string,
    state: string,
    isPlaying: boolean = false,
    username: string,
    skinUrl?: string,
  ) {
    if (!this.initialized) {
      await this.StartRPC();
      if (!this.initialized) return;
    }

    const activity = new Activity();
    activity.setDetails(details);
    activity.setState(state);
    activity.setActivity(ActivityType.Playing);
    if (!state.startsWith("Logged")) {
      activity.setParty(new Party(`emerald_${username}`, [1, 2]));
    }
    const assets = new Assets();
    assets.setLargeImage("logo");
    assets.setLargeText("LCE Emerald Launcher");
    const headUrl = skinUrl ? await this.uploadHead(skinUrl) : null;
    console.log("[RPC] updateActivity: headUrl:", headUrl);
    if (headUrl) {
      assets.setSmallImage(headUrl);
      assets.setSmallText(username);
    } else {
      assets.setSmallImage("app-icon");
      assets.setSmallText(isPlaying ? "Playing" : "In Menus");
    }
    activity.setAssets(assets);
    activity.setTimestamps(new Timestamps(this.startTime));
    activity.setButton([
      new Button("Discord", "https://discord.gg/cQVKhQXcCx"),
      new Button(
        "Get Emerald",
        "https://github.com/LCE-Hub/LCE-Emerald-Launcher",
      ),
    ]);

    try {
      await setActivity(activity);
    } catch (e) {
      console.error("Failed to set RPC activity:", e);
    }
  }

  public async StopRPC() {
    try {
      await clearActivity();
      await stop();
    } catch (e) {
      // no need to handle errors here as the launcher will close anyways!
    } finally {
      this.initialized = false;
      this.initializationPromise = null;
      sessionStorage.removeItem("lce_rpc_started");
    }
  }
}

export default new RPC();

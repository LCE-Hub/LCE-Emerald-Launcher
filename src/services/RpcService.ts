import { setActivity, start } from "tauri-plugin-drpc";
import { Activity, ActivityType, Assets, Timestamps, Button } from "tauri-plugin-drpc/activity";

class RPC {
  private startTime: number = Date.now();
  private initializationPromise: Promise<void> | null = null;
  private initialized: boolean = false;

  public async StartRPC() {
    if (this.initialized) return;
    if (sessionStorage.getItem('lce_rpc_started') === 'true') {
      this.initialized = true;
      return;
    }

    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = (async () => {
      try {
        await start("1482504445152460871");
        sessionStorage.setItem('lce_rpc_started', 'true');
        this.initialized = true;
      } catch (e) {
        console.error("Failed to start RPC:", e);
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  public async updateActivity(details: string, state: string, isPlaying: boolean = false) {
    if (!this.initialized) {
      await this.StartRPC();
      if (!this.initialized) return;
    }

    const activity = new Activity();
    activity.setDetails(details);
    activity.setState(state);
    activity.setActivity(ActivityType.Playing);

    const assets = new Assets();
    assets.setLargeImage("logo");
    assets.setLargeText("Emerald Legacy");
    assets.setSmallImage("app-icon");
    assets.setSmallText(isPlaying ? "Playing" : "In Menus");
    activity.setAssets(assets);

    activity.setTimestamps(new Timestamps(this.startTime));

    activity.setButton([
      new Button("Discord", "https://discord.gg/RHGRUwpmVc"),
      new Button("GitHub", "https://github.com/Emerald-Legacy-Launcher/Emerald-Legacy-Launcher")
    ]);

    try {
      await setActivity(activity);
    } catch (e) {
      console.error("Failed to set RPC activity:", e);
    }
  }
}

export default new RPC();
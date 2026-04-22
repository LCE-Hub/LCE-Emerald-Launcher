import { invoke } from "@tauri-apps/api/core";
export interface ScreenshotInfo {
  path: string;
  instanceId: string;
  name: string;
  date: number;
}

export class ScreenshotService {
  static async getScreenshots(): Promise<ScreenshotInfo[]> {
    return invoke("get_screenshots");
  }

  static async deleteScreenshot(path: string): Promise<void> {
    return invoke("delete_screenshot", { path });
  }

  static async showInFolder(path: string): Promise<void> {
    return invoke("open_screenshot_folder", { path });
  }
}

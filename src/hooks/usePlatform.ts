import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
//neo: "why the fuck are you doing it in rust instead of UserAgent", well, Linux was being detected as Android SOMEHOW I DONT FUCKING KNOW HOW OH MY GOD
const DEFAULT = {
  isLinux: false,
  isMac: false,
  isWindows: false,
  isAndroid: false,
};
export function usePlatform() {
  const [platform, setPlatform] = useState(DEFAULT);
  useEffect(() => {
    invoke<{
      isLinux: boolean;
      isMac: boolean;
      isWindows: boolean;
      isAndroid: boolean;
    }>("get_platform")
      .then(setPlatform)
      .catch(() => setPlatform(DEFAULT));
  }, []);

  return platform;
}

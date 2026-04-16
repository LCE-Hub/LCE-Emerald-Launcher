import { useState, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { PckService } from "../services/PckService";
import { TauriService } from "../services/TauriService";

interface Edition {
  id: string;
  supportsSlimSkins?: boolean;
}

interface UseSkinSyncProps {
  profile: string;
  editions: Edition[];
}

export function useSkinSync({ profile, editions }: UseSkinSyncProps) {
  const [skinUrl, setSkinUrl] = useLocalStorage("lce-skin", "/images/Default.png");
  const [skinIsSlim, setSkinIsSlim] = useLocalStorage("lce-skin-slim", false);
  const [skinBase64, setSkinBase64] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!skinUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      if (cancelled) return;
      const cvs = document.createElement("canvas");
      cvs.width = img.width;
      cvs.height = img.height;
      const ctx = cvs.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const b64 = cvs.toDataURL("image/png");
        setSkinBase64(b64);
        try {
          const res = await fetch(b64);
          const buf = await res.arrayBuffer();
          const animValue = (skinIsSlim) ? (1 << 19) : 0;
          const pckBuf = PckService.serializePCK({
            version: 2,
            endianness: "little",
            xmlSupport: false,
            properties: ["ANIM"],
            files: [{
              id: "dlcskin00000001",
              path: "dlcskin00000001.png",
              type: 0,
              size: buf.byteLength,
              data: new Uint8Array(buf),
              properties: [{
                key: "ANIM",
                value: animValue.toString(10)
              }, {
                key: "DISPLAYNAME",
                value: "Custom Skin"
              }, {
                key: "THEMENAME",
                value: "Emerald Launcher"
              }]
            }]
          });
          await TauriService.saveGlobalSkinPck(new Uint8Array(pckBuf));
        } catch (e) {
          console.error("Failed to generate and save Skin PCK", e);
        }
      }
    };
    img.src = skinUrl;
    return () => {
      cancelled = true;
    };
  }, [skinUrl, profile, editions]);

  return {
    skinUrl,
    setSkinUrl,
    skinIsSlim,
    setSkinIsSlim,
    skinBase64,
  };
}

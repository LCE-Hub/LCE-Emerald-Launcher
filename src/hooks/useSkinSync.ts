import { useState, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { PckService } from "../services/PckService";
import { TauriService } from "../services/TauriService";
import { PCKAssetType, PCKProperty } from "../types/pck";
interface Edition {
  id: string;
  supportsSlimSkins?: boolean;
}

interface UseSkinSyncProps {
  profile: string;
  editions: Edition[];
}

export function useSkinSync({ profile, editions }: UseSkinSyncProps) {
  const [skinUrl, setSkinUrl] = useLocalStorage(
    "lce-skin",
    "/images/Default.png",
  );
  const [skinIsSlim, setSkinIsSlim] = useLocalStorage("lce-skin-slim", false);
  const [skinBase64, setSkinBase64] = useState<string | null>(null);
  const [capeUrl, setCapeUrl] = useLocalStorage<string | null>(
    "lce-cape",
    null,
  );
  const [capeBase64, setCapeBase64] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!skinUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      if (cancelled) return;
      const cvs = document.createElement("canvas");
      if (skinIsSlim) {
        cvs.width = 64;
        cvs.height = 64;
      } else {
        cvs.width = 64;
        cvs.height = 32;
      }
      const ctx = cvs.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const b64 = cvs.toDataURL("image/png");
        setSkinBase64(b64);
        try {
          const res = await fetch(b64);
          const skinBuf = await res.arrayBuffer();
          const isModernHeight = img.height === 64;
          const animValue = skinIsSlim
            ? "0x00080000"
            : isModernHeight
              ? "0x00040000"
              : "0x00000000";
          let boxes: PCKProperty[] = [];
          if (skinIsSlim) {
            boxes.push({
              key: "BOX",
              value: "ARM0 -2 1 -1 3 10 3 40 16 0 0 0",
            });
            boxes.push({
              key: "BOX",
              value: "ARM1 -1 1 -1 3 10 3 52 16 0 0 0",
            });
          }

          let capeBuf: ArrayBuffer | null = null;
          if (capeUrl) {
            const capeImg = new Image();
            capeImg.crossOrigin = "anonymous";
            await new Promise<void>((resolve) => {
              capeImg.onload = () => resolve();
              capeImg.onerror = () => resolve();
              capeImg.src = capeUrl;
            });
            if (!cancelled && capeImg.complete && capeImg.naturalWidth > 0) {
              const capeCanvas = document.createElement("canvas");
              capeCanvas.width = capeImg.naturalWidth;
              capeCanvas.height = capeImg.naturalHeight;
              const capeCtx = capeCanvas.getContext("2d");
              if (capeCtx) {
                capeCtx.drawImage(capeImg, 0, 0);
                const capeDataUrl = capeCanvas.toDataURL("image/png");
                const capeRes = await fetch(capeDataUrl);
                capeBuf = await capeRes.arrayBuffer();
                setCapeBase64(capeDataUrl);
              }
            }
          } else {
            setCapeBase64(null);
          }

          const getSeededId = (name: string) => {
            let hash = 0;
            for (let i = 0; i < name.length; i++) {
              hash = (hash << 5) - hash + name.charCodeAt(i);
              hash |= 0;
            }
            return Math.abs(hash).toString().padStart(8, "0").slice(-8);
          };

          const seededId = getSeededId(profile);
          const files: any[] = [
            {
              id: "0",
              path: "0",
              type: PCKAssetType.INFO,
              size: 0,
              data: new Uint8Array(0),
              properties: [
                {
                  key: "PACKID",
                  value: "9999",
                },
              ],
            },
            {
              id: `dlcskin${seededId}`,
              path: `dlcskin${seededId}.png`,
              type: PCKAssetType.SKIN,
              size: skinBuf.byteLength,
              data: new Uint8Array(skinBuf),
              properties: [
                {
                  key: "DISPLAYNAME",
                  value: "Custom Skin",
                },
                {
                  key: "GAME_FLAGS",
                  value: "0x1c",
                },
                {
                  key: "FREE",
                  value: "1",
                },
                {
                  key: "ANIM",
                  value: animValue,
                },
                ...boxes,
                {
                  key: "THEMENAME",
                  value: "Emerald Launcher",
                },
                {
                  key: "CAPEPATH",
                  value: `dlccape${seededId}.png`,
                },
              ],
            },
          ];

          if (capeBuf) {
            files.push({
              id: `dlccape${seededId}`,
              path: `dlccape${seededId}.png`,
              type: PCKAssetType.CAPE,
              size: capeBuf.byteLength,
              data: new Uint8Array(capeBuf),
              properties: [],
            });
          }

          const pckBuf = PckService.serializePCK({
            version: 3,
            endianness: "little",
            xmlSupport: false,
            properties: [
              "ANIM",
              "DISPLAYNAME",
              "THEMENAME",
              "GAME_FLAGS",
              "FREE",
              "BOX",
            ],
            files,
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
  }, [skinUrl, capeUrl, profile, editions, skinIsSlim]);

  return {
    skinUrl,
    setSkinUrl,
    skinIsSlim,
    setSkinIsSlim,
    skinBase64,
    capeUrl,
    setCapeUrl,
    capeBase64,
  };
}

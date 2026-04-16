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
          const buf = await res.arrayBuffer();
          const animValue = (skinIsSlim) ? "0x00040000" : "0x00040000"; //neo: forces wide skin, because slim is not even working.
          let boxes: PCKProperty[] = [];
          /*if (skinIsSlim) {
            boxes.push({
              key: "BOX",
              value: "ARM0 -2 1 -1 3 10 3 40 16 0 0 0"
            });
            boxes.push({
              key: "BOX",
              value: "ARM1 -1 1 -1 3 10 3 52 16 0 0 0"
            });
          }*/
          const pckBuf = PckService.serializePCK({
            version: 3,
            endianness: "little",
            xmlSupport: true,
            properties: ["ANIM", "DISPLAYNAME", "THEMENAME", "GAME_FLAGS", "FREE", "BOX"],
            files: [{
              id: "0",
              path: "0",
              type: PCKAssetType.INFO,
              size: 0,
              data: new Uint8Array(0),
              properties: [{
                key: "PACKID",
                value: "9999"
              }]
            }, {
              id: "dlcskin00000001",
              path: "dlcskin00000001.png",
              type: PCKAssetType.SKIN,
              size: buf.byteLength,
              data: new Uint8Array(buf),
              properties: [{
                key: "DISPLAYNAME",
                value: "Custom Skin"
              }, {
                key: "GAME_FLAGS",
                value: "0x18"
              }, {
                key: "FREE",
                value: "1"
              },
              {
                key: "ANIM",
                value: animValue
              }, ...boxes, {
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

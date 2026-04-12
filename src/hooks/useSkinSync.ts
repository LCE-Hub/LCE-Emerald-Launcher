import { useState, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

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
  const [skinBase64, setSkinBase64] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!skinUrl) return;

    const edition = editions.find((e) => e.id === profile);
    const supportsSlim = edition?.supportsSlimSkins ?? false;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const cvs = document.createElement("canvas");
      if (supportsSlim) {
        cvs.width = img.width;
        cvs.height = img.height;
      } else {
        cvs.width = 64;
        cvs.height = 32;
      }
      const ctx = cvs.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setSkinBase64(cvs.toDataURL("image/png"));
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
    skinBase64,
  };
}

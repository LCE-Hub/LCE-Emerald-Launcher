import { useState, useEffect, useRef } from "react";
import { TauriService } from "../../services/TauriService";
interface ScreenshotImageProps {
  path: string;
  className?: string;
  alt?: string;
  loading?: "lazy" | "eager";
  style?: React.CSSProperties;
  fallbackSrc?: string;
}

const imgCache = new Map<string, string>();
let activeLoads = 0;
const MAX_CONCURRENT = 4;
const loadQueue: Array<() => void> = [];
function dequeue() {
  while (activeLoads < MAX_CONCURRENT && loadQueue.length > 0) {
    const next = loadQueue.shift()!;
    activeLoads++;
    next();
  }
}

function enqueueLoad(
  path: string,
  onLoad: (url: string) => void,
  onError: () => void,
) {
  const cached = imgCache.get(path);
  if (cached) {
    onLoad(cached);
    return;
  }

  const run = () => {
    TauriService.readScreenshotAsDataUrl(path)
      .then((url) => {
        imgCache.set(path, url);
        onLoad(url);
      })
      .catch(() => onError())
      .finally(() => {
        activeLoads--;
        dequeue();
      });
  };

  if (activeLoads < MAX_CONCURRENT) {
    activeLoads++;
    run();
  } else {
    loadQueue.push(run);
  }
}

export function ScreenshotImage({
  path,
  className,
  alt,
  loading,
  style,
  fallbackSrc,
}: ScreenshotImageProps) {
  const [src, setSrc] = useState<string | undefined>(fallbackSrc);
  const imgRef = useRef<HTMLImageElement>(null);
  const loadedRef = useRef(false);
  useEffect(() => {
    const el = imgRef.current?.parentElement || imgRef.current;
    if (!el) return;
    let cancelled = false;
    const doLoad = () => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      enqueueLoad(
        path,
        (url) => {
          if (!cancelled) setSrc(url);
        },
        () => {
          if (!cancelled && fallbackSrc) setSrc(fallbackSrc);
        },
      );
    };

    if (loading === "eager") {
      doLoad();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          doLoad();
        }
      },
      { rootMargin: "800px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [path, fallbackSrc, loading]);
  const handleError = () => {
    if (fallbackSrc) setSrc(fallbackSrc);
  };

  return (
    <img
      ref={imgRef}
      src={src}
      className={className}
      alt={alt}
      loading={loading}
      style={style}
      onError={handleError}
    />
  );
}

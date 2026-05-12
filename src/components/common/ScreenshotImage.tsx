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

  useEffect(() => {
    let cancelled = false;
    setSrc(fallbackSrc);
    TauriService.readScreenshotAsDataUrl(path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled && fallbackSrc) setSrc(fallbackSrc);
      });
    return () => {
      cancelled = true;
    };
  }, [path, fallbackSrc]);

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

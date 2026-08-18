import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
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
  const [hasError, setHasError] = useState(false);

  return (
    <img
      src={hasError && fallbackSrc ? fallbackSrc : convertFileSrc(path)}
      className={className}
      alt={alt}
      loading={loading}
      style={style}
      onError={() => {
        if (fallbackSrc) setHasError(true);
      }}
    />
  );
}

import React, { useEffect, useRef, useState } from "react";


interface PanoramaProps {
  profile: string;
  isDay: boolean;
}

const PanoramaBackground = React.memo(({ profile, isDay }: PanoramaProps) => {
  const baseId = profile;
  const profileId = baseId ? baseId : "vanilla_tu19";
  const isCustomUrl = profile.startsWith("data:") || profile.startsWith("blob:");
  const currentPanorama = isCustomUrl
    ? profile
    : `/panorama/${profileId}_Panorama_Background_${isDay ? "Day" : "Night"}.png`;
  const [bgWidth, setBgWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const updateWidth = () => {
      if (!containerRef.current) return;
      const img = new Image();
      img.src = currentPanorama;
      img.onload = () => {
        if (!active || !containerRef.current) return;
        const height = containerRef.current.clientHeight;
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        setBgWidth(Math.ceil(height * aspectRatio));
      };
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => {
      active = false;
      window.removeEventListener("resize", updateWidth);
    };
  }, [currentPanorama]);

  return (
    <>
      {bgWidth && (
        <style>{`
          @keyframes panoramaLoop {
            0% { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(-${bgWidth}px, 0, 0); }
          }
        `}</style>
      )}

      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden pointer-events-none transition-opacity duration-500"
      >
        <div
          className="absolute top-0 left-0 h-full will-change-transform"
          style={{
            width: bgWidth ? `calc(100vw + ${bgWidth}px)` : "200vw",
            backgroundImage: `url("${currentPanorama}")`,
            backgroundSize: bgWidth ? `${bgWidth}px 100%` : "auto 100%",
            backgroundRepeat: "repeat-x",
            animation: bgWidth ? "panoramaLoop 140s linear infinite" : "none",
          }}
        />
      </div>
      <div className="absolute inset-0 bg-black/35 pointer-events-none" />
    </>
  );
});

export default PanoramaBackground;

import { motion } from "framer-motion";
import { memo } from "react";

interface DownloadOverlayProps {
  downloadProgress: number | null;
  downloadingId: string | null;
  editions: any[];
}

export const DownloadOverlay = memo(function DownloadOverlay({ downloadProgress, downloadingId, editions }: DownloadOverlayProps) {
  if (downloadProgress === null) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      className="absolute top-14 right-8 z-100 w-64 p-4 shadow-2xl flex flex-col gap-2"
      style={{
        backgroundImage: "url('/images/Download_Background.png')",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
      }}
    >
      <div className="flex flex-col gap-1 w-full">
        <span className="text-[15px] text-[#ffff00] mc-text-shadow uppercase tracking-widest text-center w-full">
          Downloading
        </span>
        <div className="text-[10px] text-gray-300 mc-text-shadow truncate uppercase opacity-80 pb-1 text-center w-full">
          {editions.find((e) => e.id === downloadingId)?.name || "Game Files"}
        </div>
        <div className="flex items-center gap-2 w-full">
          <span className="text-[10px] text-white mc-text-shadow w-6 text-right shrink-0 flex items-center justify-end h-[14px] leading-none">
            {Math.floor(downloadProgress)}%
          </span>
          <div className="flex-1 h-3.5 border-2 border-white bg-black/40 relative">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <div className="w-6 flex items-center justify-start shrink-0">
            <img
              src="/images/loading.gif"
              alt="Loading"
              className="w-4 h-4 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
});

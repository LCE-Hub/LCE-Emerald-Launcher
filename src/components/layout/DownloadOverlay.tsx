import { motion } from "framer-motion";
import { memo } from "react";
import type { Edition } from "../../types/edition";

interface DownloadOverlayProps {
  downloadProgress: Record<string, number>;
  downloadingIds: string[];
  editions: Edition[];
}

export const DownloadOverlay = memo(function DownloadOverlay({ downloadProgress, downloadingIds, editions }: DownloadOverlayProps) {
  if (downloadingIds.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.15 }}
      className="absolute top-14 right-8 z-100 w-72 bg-[#1a1a1a] border-2 border-[#555] shadow-2xl"
      style={{ imageRendering: "pixelated" }}
    >
      <div className="px-3 pt-2.5 pb-2 border-b border-white/10">
        <span className="text-[13px] text-[#FFFF55] mc-text-shadow uppercase tracking-widest">
          Downloads
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2 max-h-[260px] overflow-y-auto custom-scrollbar">
        {downloadingIds.map((id) => {
          const pct = downloadProgress[id] ?? 0;
          const edition = editions.find((e) => e.instanceId === id || e.id === id);
          const name = edition?.name || "Game Files";
          return (
            <div key={id} className="flex items-center gap-2.5">
              {edition?.logo ? (
                <img
                  src={edition.logo}
                  alt=""
                  className="w-6 h-6 object-contain shrink-0"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="w-6 h-6 flex items-center justify-center border border-[#555] bg-black/40 shrink-0">
                  <svg className="w-3 h-3 text-[#FFFF55]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[11px] text-white mc-text-shadow truncate leading-tight">
                  {name}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-2 border border-white/30 bg-black/60">
                    <div
                      className="h-full bg-[#FFFF55]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 mc-text-shadow w-7 text-right shrink-0 leading-none">
                    {Math.floor(pct)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
});

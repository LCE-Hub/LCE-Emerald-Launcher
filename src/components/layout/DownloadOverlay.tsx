import { motion } from "framer-motion";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { ScreenshotImage } from "../common/ScreenshotImage";
import type { Edition } from "../../types/edition";

interface DownloadOverlayProps {
  downloadProgress: Record<string, number>;
  downloadingIds: string[];
  editions: Edition[];
}

export const DownloadOverlay = memo(function DownloadOverlay({
  downloadProgress,
  downloadingIds,
  editions,
}: DownloadOverlayProps) {
  const { t } = useTranslation();
  if (downloadingIds.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.15 }}
      className="absolute top-14 right-8 z-100 w-100 mc-options-bg"
      style={{ imageRendering: "pixelated" }}
    >
      <div className="px-3 pb-1">
        <span className="text-xl text-[#333333]">{t("download.title")}</span>
      </div>
      <div className="flex flex-col gap-1.5 py-2 max-h-[260px] overflow-y-auto custom-scrollbar mc-options-fg">
        {downloadingIds.map((id) => {
          const pct = downloadProgress[id] ?? 0;
          const edition = editions.find(
            (e) => e.instanceId === id || e.id === id,
          );
          const name =
            edition?.name ||
            (id.startsWith("runner_")
              ? id.replace(/^runner_/, "")
              : t("download.gameFiles"));
          return (
            <div key={id} className="flex items-center mc-options-bg">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex-1 flex flex-row justify-between">
                  <div className="flex-1 flex flex-row">
                    {edition?.logo ? (
                      edition.logo.startsWith("http") ||
                      edition.logo.startsWith("/images") ? (
                        <img
                          src={edition.logo}
                          alt=""
                          className="w-6 h-6 object-contain shrink-0"
                          style={{ imageRendering: "pixelated" }}
                        />
                      ) : (
                        <ScreenshotImage
                          path={edition.logo}
                          alt=""
                          className="w-6 h-6 object-contain shrink-0"
                          style={{ imageRendering: "pixelated" }}
                        />
                      )
                    ) : edition?.titleImage ? (
                      edition.titleImage.startsWith("http") ||
                      edition.titleImage.startsWith("/images") ? (
                        <img
                          src={edition.titleImage}
                          alt=""
                          className="w-6 h-6 object-contain shrink-0"
                          style={{ imageRendering: "pixelated" }}
                        />
                      ) : (
                        <ScreenshotImage
                          path={edition.titleImage}
                          alt=""
                          className="w-6 h-6 object-contain shrink-0"
                          style={{ imageRendering: "pixelated" }}
                        />
                      )
                    ) : (
                      <div className="w-6 h-6 flex items-center justify-center border border-[#555] bg-black/40 shrink-0">
                        <svg
                          className="w-3 h-3 text-[#FFFF55]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </div>
                    )}
                    <span className="text-sm text-[#333333] truncate leading-tight shrink-0 self-center pl-1">
                      {name}
                    </span>
                  </div>
                  <span className="text-sm text-[#333333] w-7 text-right shrink-0 pr-1">
                    {Math.floor(pct)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-3 border border-[#666666] bg-[#666666]">
                    <div
                      className="h-full bg-[#00ff61]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
});

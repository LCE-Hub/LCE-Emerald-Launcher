import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { TauriService } from "../../services/TauriService";

function isFilePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("/images/") && !value.startsWith("/panorama/");
}

async function resolvePath(value: string | undefined): Promise<string | undefined> {
  if (!value) return undefined;
  if (isFilePath(value)) {
    try {
      return await TauriService.readScreenshotAsDataUrl(value);
    } catch {
      return value;
    }
  }
  return value;
}

export default function CustomizeModal({
  isOpen,
  onClose,
  playPressSound,
  playBackSound,
  editionName,
  currentTitleImage,
  currentPanorama,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  playPressSound: (s?: string) => void;
  playBackSound: (s?: string) => void;
  editionName: string;
  currentTitleImage?: string;
  currentPanorama?: string;
  onSave: (updates: { titleImage?: string; panorama?: string }) => void;
}) {
  const { t } = useTranslation();
  const [titleImage, setTitleImage] = useState(currentTitleImage || "");
  const [panorama, setPanorama] = useState(currentPanorama || "");
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setTitleImage(currentTitleImage || "");
      setPanorama(currentPanorama || "");
      setFocusIndex(0);
    }
  }, [isOpen, currentTitleImage, currentPanorama]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        playBackSound("close_click.wav");
        onClose();
      } else if (e.key === "Enter") {
        if (focusIndex === 4) {
          playBackSound("close_click.wav");
          onClose();
        } else if (focusIndex === 5) {
          handleSave();
        }
      } else if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % 6);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + 6) % 6);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, focusIndex, titleImage, panorama]);

  const handleSave = async () => {
    playPressSound("save_click.wav");
    const [resolvedTitle, resolvedPanorama] = await Promise.all([
      resolvePath(titleImage || undefined),
      resolvePath(panorama || undefined),
    ]);
    onSave({
      titleImage: resolvedTitle,
      panorama: resolvedPanorama,
    });
    onClose();
  };

  const handlePickFile = async (field: "titleImage" | "panorama") => {
    try {
      const path = await TauriService.pickFile(
        field === "titleImage" ? t("modals.customize.selectTitleImage") : t("modals.customize.selectPanorama"),
        ["png", "jpg", "jpeg", "bmp"],
      );
      if (path) {
        if (field === "titleImage") setTitleImage(path);
        else setPanorama(path);
        playPressSound();
      }
    } catch (e) {
      if (e !== "CANCELED") console.error(e);
    }
  };

  const handleReset = (field: "titleImage" | "panorama") => {
    playPressSound();
    if (field === "titleImage") setTitleImage("");
    else setPanorama("");
  };

  if (!isOpen) return null;

  const pickerSection = (
    field: "titleImage" | "panorama",
    value: string,
    idx: number,
    resetIdx: number,
  ) => (
    <div className="flex flex-col gap-2">
      <label className="text-[#AAAAAA] text-xs mc-text-shadow uppercase tracking-widest">
        {field === "titleImage" ? t("modals.customize.titleImage") : t("modals.customize.panoramaBackground")}
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => handlePickFile(field)}
          onMouseEnter={() => setFocusIndex(idx)}
          className="flex-1 h-10 flex items-center justify-center text-xs mc-text-shadow text-white outline-none border-none bg-transparent"
          style={{
            backgroundImage:
              focusIndex === idx
                ? "url('/images/button_highlighted.png')"
                : "url('/images/Button_Background.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        >
          {value ? t("modals.customize.changeImage") : t("modals.customize.pickImage")}
        </button>
        {value && (
          <button
            onClick={() => handleReset(field)}
            onMouseEnter={() => setFocusIndex(resetIdx)}
            className="w-24 h-10 flex items-center justify-center text-xs mc-text-shadow text-red-400 outline-none border-none bg-transparent"
            style={{
              backgroundImage:
                focusIndex === resetIdx
                  ? "url('/images/button_highlighted.png')"
                  : "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            {t("modals.customize.reset")}
          </button>
        )}
      </div>
      {value && (
        <div className="flex items-center gap-2 mt-1">
          <img
            src={value}
            alt={t("modals.customize.preview")}
            className="w-10 h-6 object-contain border border-[#555]"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="text-[10px] text-white/50 truncate flex-1">
            {value.split("/").pop() || value}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 w-screen h-screen z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md outline-none border-none"
    >
      <div
        className="relative w-[420px] p-6 flex flex-col items-center shadow-2xl"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <h2 className="text-[#FFFF55] text-2xl mc-text-shadow mb-4 border-b-2 border-[#373737] pb-2 w-full text-center uppercase">
          {t("modals.customize.title")}
        </h2>
        <p className="text-white/70 text-xs mc-text-shadow mb-4 -mt-2 truncate max-w-full">
          {editionName}
        </p>

        <div className="flex flex-col gap-4 w-full">
          {pickerSection("titleImage", titleImage, 0, 1)}
          {pickerSection("panorama", panorama, 2, 3)}
        </div>

        <div className="flex gap-4 mt-6 w-full justify-center">
          <button
            onMouseEnter={() => setFocusIndex(4)}
            onClick={() => {
              playBackSound("close_click.wav");
              onClose();
            }}
            className={`w-32 h-10 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none ${
              focusIndex === 4 ? "text-[#FFFF55]" : "text-white"
            }`}
            style={{
              backgroundImage:
                focusIndex === 4
                  ? "url('/images/button_highlighted.png')"
                  : "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            {t("modals.customize.cancel")}
          </button>
          <button
            onMouseEnter={() => setFocusIndex(5)}
            onClick={handleSave}
            className={`w-32 h-10 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none ${
              focusIndex === 5 ? "text-[#FFFF55]" : "text-white"
            }`}
            style={{
              backgroundImage:
                focusIndex === 5
                  ? "url('/images/button_highlighted.png')"
                  : "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            {t("modals.customize.save")}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

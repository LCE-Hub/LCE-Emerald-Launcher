import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useAudio } from "../../context/LauncherContext";

interface AchievementToastProps {
  message: string | null;
  onClose: () => void;
  onClick?: () => void;
  title?: string;
  variant?: "error" | "update" | "steam";
}

export function AchievementToast({
  message,
  onClose,
  onClick,
  title,
  variant = "error",
}: AchievementToastProps) {
  const { t } = useTranslation();
  const { playSfx } = useAudio();
  const displayTitle = title ?? t("common.error");
  const prevMessage = useRef(message);
  useEffect(() => {
    const wasNull = !prevMessage.current;
    const isNull = !message;
    prevMessage.current = message;
    if (message && wasNull) {
      if (variant === "update") {
        playSfx("notification.ogg");
      } else {
        playSfx("in.ogg");
      }
    }

    if (message) {
      const timer = setTimeout(() => {
        onClose();
      }, 8000);
      return () => {
        clearTimeout(timer);
        if (isNull) {
          playSfx("out.ogg");
        }
      };
    }
  }, [message, onClose, variant, playSfx]);

  const getIcon = () => {
    if (variant === "update") {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFF55"
          strokeWidth="3"
          strokeLinecap="square"
          className="drop-shadow-md"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      );
    }
    if (variant === "steam") {
      return (
        <img
          src="/images/steam.png"
          alt="Steam"
          className="w-8 h-8 object-contain"
          style={{
            imageRendering: "pixelated",
            filter: "brightness(0) invert(1)",
          }}
        />
      );
    }
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FF5555"
        strokeWidth="3"
        strokeLinecap="square"
        className="drop-shadow-md"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    );
  };

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 100 }}
          onClick={
            onClick
              ? () => {
                  onClick();
                  onClose();
                }
              : undefined
          }
          className={`fixed top-6 right-6 z-[9999] ${onClick ? "cursor-pointer" : ""}`}
        >
          <div className="flex items-center gap-3 p-3 min-w-[260px] max-w-[380px] mc-options-bg">
            <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-[#3F3F3F] border-2 border-[#1A1A1A]">
              {getIcon()}
            </div>
            <div className="flex flex-col">
              <span className="text-[#333333] text-[20px] leading-tight font-normal">
                {displayTitle}
              </span>
              <span className="text-[#333333] text-[13px] leading-tight break-words font-normal">
                {message}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

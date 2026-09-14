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
        <img
          src="/images/Update_Icon.png"
          alt="Update"
          className="w-8 h-8 object-contain"
          style={{
            imageRendering: "pixelated",
            filter: "drop-shadow(0 0 2px rgba(255, 255, 0, 0.8)) sepia(100%) saturate(500%) hue-rotate(5deg) brightness(1.2)"
          }}
        />
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
          className={onClick ? "cursor-pointer" : ""}
        >
          <div className="flex gap-3 p-1 min-w-[380px] max-w-[380px] min-h-[100px] mc-options-bg">
            <div className="h-[54px] w-[54px] flex-shrink-0 flex items-center justify-center bg-[url(/images/empty.png)] bg-cover bg-center bg-no-repeat self-center">
              {getIcon()}
            </div>
            <div className="flex flex-col mt-[6px]">
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

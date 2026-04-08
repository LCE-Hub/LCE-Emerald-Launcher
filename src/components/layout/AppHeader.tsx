import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion } from "framer-motion";
import { memo } from "react";

const appWindow = getCurrentWindow();

interface AppHeaderProps {
  playPressSound: () => void;
  uiFade: any;
}

export const AppHeader = memo(function AppHeader({ playPressSound, uiFade }: AppHeaderProps) {
  return (
    <motion.div
      key="header"
      {...uiFade}
      data-tauri-drag-region
      className="h-10 w-full flex justify-between items-center px-1 absolute top-0 left-0 z-50 bg-gradient-to-b from-black/80 to-transparent"
    >
      <div
        data-tauri-drag-region
        className="pl-3 flex items-center justify-center gap-1.5 pointer-events-none h-full pt-0.5"
      >
        <img
          src="/images/icon.png"
          alt="Icon"
          className="w-4 h-4 object-contain block"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="text-xs text-gray-300 mc-text-shadow opacity-90 tracking-wide leading-none block pt-[1px]">
          Emerald Legacy Launcher
        </span>
      </div>
      <div className="flex items-center gap-1 pr-2">
        <button
          onClick={() => {
            playPressSound();
            appWindow.minimize();
          }}
          className="w-10 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/20 transition-all bg-transparent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="square"
          >
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button
          onClick={() => {
            playPressSound();
            appWindow.toggleMaximize();
          }}
          className="w-10 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/20 transition-all bg-transparent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="square"
          >
            <rect x="3" y="3" width="18" height="18"></rect>
          </svg>
        </button>
        <button
          onClick={() => {
            playPressSound();
            appWindow.close();
          }}
          className="w-10 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-red-600 transition-all bg-transparent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="square"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </motion.div>
  );
});

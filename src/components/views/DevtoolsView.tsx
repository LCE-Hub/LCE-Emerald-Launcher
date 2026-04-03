import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";
export default function DevtoolsView() {
  const { setActiveView } = useUI();
  const [backHover, setBackHover] = useState(false);
  const { playBackSound } = useAudio();
  const [focusIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        playBackSound();
        setActiveView("main");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playBackSound, setActiveView]);

  useEffect(() => {
    if (focusIndex !== null) {
      const el = containerRef.current?.querySelector(
        `[data-index="${focusIndex}"]`,
      ) as HTMLElement;
      if (el) el.focus();
    }
  }, [focusIndex]);

  return (
    <motion.div
      tabIndex={0}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: useConfig().animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-4xl outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 border-b-2 border-[#373737] pb-2 w-[60%] max-w-[300px] text-center tracking-widest uppercase opacity-80">
        Developer Tools
      </h2>

      <div
        className="w-full max-w-135 h-48 mb-6 p-8 shadow-2xl flex items-center justify-center"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <span className="text-[#E0E0E0] text-xl mc-text-shadow tracking-wide">
          Developer Tools coming soon...
        </span>
      </div>

      <button
        onMouseEnter={() => setBackHover(true)}
        onMouseLeave={() => setBackHover(false)}
        onClick={() => {
          playBackSound();
          setActiveView("main");
        }}
        className={`w-72 h-12 flex items-center justify-center transition-colors text-2xl mc-text-shadow outline-none border-none hover:text-[#FFFF55] ${backHover ? "text-[#FFFF55]" : "text-white"}`}
        style={{
          backgroundImage: backHover
            ? "url('/images/button_highlighted.png')"
            : "url('/images/Button_Background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        Back
      </button>
    </motion.div>
  );
}

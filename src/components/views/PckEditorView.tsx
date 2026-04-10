import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";

export default function PckEditorView() {
  const { setActiveView } = useUI();
  const { playBackSound } = useAudio();
  const { animationsEnabled } = useConfig();
  const [focusIndex, setFocusIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        playBackSound();
        setActiveView("devtools");
        return;
      }
      if (e.key === "Enter") {
        if (focusIndex === 0) {
          playBackSound();
          setActiveView("devtools");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playBackSound, setActiveView, focusIndex]);

  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-index="${focusIndex}"]`) as HTMLElement;
    if (el) el.focus();
  }, [focusIndex]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-3xl outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 border-b-2 border-[#373737] pb-2 w-[60%] max-w-75 text-center tracking-widest uppercase opacity-80 font-bold">
        PCK Editor
      </h2>

      <div
        className="w-full max-w-160 h-85 mb-4 p-8 shadow-2xl flex flex-col items-center justify-center p-12"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <img
          src="/images/tools/pck.png"
          className="w-24 h-24 mb-6 opacity-20 grayscale"
          style={{ imageRendering: "pixelated" }}
        />
        <h3 className="text-xl text-[#FFFF55] mc-text-shadow mb-2">PCK Editor Coming Soon</h3>
        <p className="text-center text-white/60 mc-text-shadow max-w-md">
          This tool will allow you to explore and modify PCK archive files.
        </p>
      </div>

      <button
        data-index="0"
        onMouseEnter={() => setFocusIndex(0)}
        onClick={() => {
          playBackSound();
          setActiveView("devtools");
        }}
        className={`w-72 h-14 flex items-center justify-center transition-colors text-2xl mc-text-shadow mt-2 outline-none border-none ${focusIndex === 0 ? "text-[#FFFF55]" : "text-white"
          }`}
        style={{
          backgroundImage:
            focusIndex === 0
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

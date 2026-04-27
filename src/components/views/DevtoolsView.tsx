import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useUI, useAudio } from "../../context/LauncherContext";

interface DevTool {
  id: string;
  name: string;
  view: string;
  comingSoon: boolean;
}

const DEV_TOOLS: DevTool[] = [
  { id: "pck", name: "PCK Editor", view: "pck-editor", comingSoon: false },
  { id: "arc", name: "ARC Editor", view: "arc-editor", comingSoon: false },
  { id: "loc", name: "LOC Editor", view: "loc-editor", comingSoon: false },
  { id: "grf", name: "GRF Editor", view: "grf-editor", comingSoon: false },
  { id: "col", name: "COL Editor", view: "col-editor", comingSoon: false },
  { id: "options", name: "Options Editor", view: "options-editor", comingSoon: false }
];

export default function DevtoolsView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
    const [focusIndex, setFocusIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const BACK_BUTTON_INDEX = DEV_TOOLS.length;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        playBackSound();
        setActiveView("main");
        return;
      }

      if (e.key === "ArrowRight") {
        setFocusIndex((prev) => (prev >= BACK_BUTTON_INDEX ? 0 : prev + 1));
      } else if (e.key === "ArrowLeft") {
        setFocusIndex((prev) => (prev <= 0 ? BACK_BUTTON_INDEX : prev - 1));
      } else if (e.key === "ArrowDown") {
        if (focusIndex < BACK_BUTTON_INDEX) {
          setFocusIndex(BACK_BUTTON_INDEX);
        }
      } else if (e.key === "ArrowUp") {
        if (focusIndex === BACK_BUTTON_INDEX) {
          setFocusIndex(0);
        }
      } else if (e.key === "Enter") {
        if (focusIndex === BACK_BUTTON_INDEX) {
          playBackSound();
          setActiveView("main");
        } else {
          playPressSound();
          const tool = DEV_TOOLS[focusIndex];
          setActiveView(tool.view);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusIndex, playPressSound, playBackSound, setActiveView, BACK_BUTTON_INDEX]);

  useEffect(() => {
    if (focusIndex !== null) {
      const el = containerRef.current?.querySelector(`[data-index="${focusIndex}"]`) as HTMLElement;
      if (el) el.focus();
    }
  }, [focusIndex]);

  return (
    <motion.div
      ref={containerRef}
      tabIndex={-1}
      initial={{ opacity: 1, scale: 1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0 }}
      className="flex flex-col items-center w-full max-w-3xl outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 border-b-2 border-[#373737] pb-2 w-[60%] max-w-75 text-center tracking-widest uppercase opacity-80 font-bold">
        Developer Tools
      </h2>

      <div className="mc-lce-content-bg w-full max-w-[85vw] max-h-[55vh] mb-4 flex flex-col items-center p-3">
        <div className="w-full h-full p-2 overflow-hidden" style={{
          borderImage: "url('/images/panel_content.png') 4 fill",
          borderWidth: '12px',
          borderStyle: 'solid',
          borderColor: 'transparent',
          imageRendering: 'pixelated',
        }}>
        <div className="flex flex-wrap gap-8 justify-center items-start w-full h-full overflow-y-auto pt-4">
          {DEV_TOOLS.map((tool, i) => (
            <div
              key={tool.id}
              data-index={i}
              tabIndex={0}
              onMouseEnter={() => setFocusIndex(i)}
              onClick={() => {
                playPressSound();
                setActiveView(tool.view);
              }}
              className={`group flex flex-col items-center gap-3 w-40 p-4 relative transition-all cursor-pointer outline-none border-2 ${focusIndex === i ? "border-[#ffff00] bg-white/5" : "border-transparent"
                }`}
            >
              <div className="w-20 h-20 bg-black/40 border-2 border-[#373737] flex items-center justify-center relative shadow-inner">
                <img
                  src={`/images/tools/${tool.id}.png`}
                  alt={tool.name}
                  className="w-12 h-12 object-contain opacity-50 grayscale"
                  style={{ imageRendering: "pixelated" }}
                />
                {tool.comingSoon && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <span className="text-[10px] text-[#ffff00] mc-text-shadow uppercase tracking-tighter text-center px-1">
                      Coming Soon
                    </span>
                  </div>
                )}
              </div>
              <span
                className={`text-center text-lg mc-text-shadow transition-colors ${focusIndex === i ? "text-[#ffff00]" : "text-white"
                  }`}
              >
                {tool.name}
              </span>
            </div>
          ))}
        </div>
        </div>
      </div>

      <button
        data-index={BACK_BUTTON_INDEX}
        onMouseEnter={() => setFocusIndex(BACK_BUTTON_INDEX)}
        onClick={() => {
          playBackSound();
          setActiveView("main");
        }}
        className={`w-40 h-10 flex items-center justify-center transition-colors text-xl mc-text-shadow mt-2 outline-none border-none ${focusIndex === BACK_BUTTON_INDEX ? "text-[#ffff00]" : "text-white"}`}
        style={{
          backgroundImage:
            focusIndex === BACK_BUTTON_INDEX
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

import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export default function TeamModal({
  isOpen,
  onClose,
  playPressSound,
  playSfx,
}: any) {
  const [focusIndex, setFocusIndex] = useState(0);

  const team = [
    { name: "neoapps", url: "https://github.com/neoapps-dev" },
    { name: "KayJann", url: "https://github.com/KayJannOnGit" },
    { name: "Santiago Fisela", url: "https://github.com/PinkLittleKitty" },
    { name: "Leon", url: "https://github.com/hornyalcoholic" },
    { name: "Criador_Mods", url: "https://github.com/CriadorMods" },
  ];

  useEffect(() => {
    if (!isOpen) {
      setFocusIndex(0);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        playSfx("close_click.wav");
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % (team.length + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + (team.length + 1)) % (team.length + 1));
      } else if (e.key === "Enter") {
        if (focusIndex === team.length) {
          playSfx("close_click.wav");
          onClose();
        } else {
          playPressSound();
          window.open(team[focusIndex].url, "_blank", "noopener,noreferrer");
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, focusIndex]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm outline-none border-none"
    >
      <div
        className="relative w-[360px] p-6 flex flex-col items-center shadow-2xl"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <h2 className="text-[#ffff00] text-2xl mc-text-shadow mb-4 border-b-2 border-[#373737] pb-2 w-full text-center uppercase">
          Emerald Team
        </h2>
        <div className="flex flex-col gap-3 w-full items-center">
          {team.map((dev, idx) => (
            <a
              key={dev.name}
              href={dev.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playPressSound()}
              onMouseEnter={() => setFocusIndex(idx)}
              className={`w-56 h-10 flex items-center justify-center mc-text-shadow text-xl transition-all outline-none border-none bg-transparent ${focusIndex === idx ? "text-[#ffff00]" : "text-white"}`}
              style={{
                backgroundImage: focusIndex === idx
                  ? "url('/images/button_highlighted.png')"
                  : "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              {dev.name}
            </a>
          ))}
        </div>
        <button
          onMouseEnter={() => setFocusIndex(team.length)}
          onClick={() => {
            playSfx("close_click.wav");
            onClose();
          }}
          className={`mt-6 w-56 h-12 flex items-center justify-center transition-colors text-2xl mc-text-shadow outline-none border-none ${focusIndex === team.length ? "text-[#ffff00]" : "text-white"}`}
          style={{
            backgroundImage: focusIndex === team.length
              ? "url('/images/button_highlighted.png')"
              : "url('/images/Button_Background.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        >
          Close
        </button>
      </div>
    </motion.div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TauriService } from "../../services/TauriService";
const MAX_DISPLAY_LINES = 5000;
const WINE_CHANNEL =
  /^\s*(?:[0-9a-fA-F]{1,8}:)?(err|fixme|warn|trace|debugstr):/;
function lineColor(line: string): string {
  const match = WINE_CHANNEL.exec(line);
  switch (match?.[1]) {
    case "err":
      return "#FF5555";
    case "fixme":
      return "#FFFF55";
    case "warn":
      return "#FFB347";
    case "trace":
      return "#7FFF7F";
    case "debugstr":
      return "#55FFFF";
    default:
      return "#E0E0E0";
  }
}

function LogActionButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      className={`h-10 flex items-center justify-center text-lg mc-text-shadow border-none outline-none cursor-pointer text-white hover:text-[#ffff00] ${className}`}
      style={{
        backgroundImage: hovered
          ? "url('/images/button_highlighted.png')"
          : "url('/images/Button_Background.png')",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
      }}
    >
      {children}
    </button>
  );
}

export default function GameLogModal({
  isOpen,
  log,
  onClose,
  playBackSound,
}: {
  isOpen: boolean;
  log: string | null;
  onClose: () => void;
  playBackSound: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState("");
  const lines = useMemo(() => (log ?? "").split("\n"), [log]);
  const truncated = lines.length > MAX_DISPLAY_LINES;
  const visibleLines = truncated ? lines.slice(-MAX_DISPLAY_LINES) : lines;
  useEffect(() => {
    if (isOpen) {
      setFeedback("");
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [isOpen, log]);
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        playBackSound();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, playBackSound]);

  if (!isOpen) return null;
  const handleSave = async () => {
    if (!log) return;
    try {
      const path = await TauriService.saveFileDialog(
        "Save Game Log",
        "game-log.txt",
        ["txt", "log"],
      );
      if (!path) return;
      await TauriService.writeBinaryFile(path, new TextEncoder().encode(log));
      setFeedback("Saved!");
    } catch (e) {
      console.error(e);
      setFeedback("Failed to save.");
    }
  };

  const handleCopy = async () => {
    if (!log) return;
    try {
      await navigator.clipboard.writeText(log);
      setFeedback("Copied to clipboard!");
    } catch (e) {
      console.error(e);
      setFeedback("Failed to copy.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
      onClick={() => {
        playBackSound();
        onClose();
      }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-[640px] max-w-[92vw] max-h-[85vh] p-5 font-['Mojangles'] mc-options-bg"
      >
        <h3 className="text-2xl font-bold text-[#333333] mb-3 text-left w-full px-2 mc-text-shadow">
          Game Crash Log
        </h3>

        {truncated && (
          <p className="text-[#666666] text-sm mb-3 text-left w-full px-2">
            Showing last {MAX_DISPLAY_LINES} lines of {lines.length}.
          </p>
        )}

        <div
          ref={scrollRef}
          className="w-full flex-1 min-h-0 overflow-x-hidden overflow-y-auto bg-black/75 border-2 border-[#555] p-3 mb-4 text-left"
        >
          <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
            {visibleLines.map((line, i) => (
              <span key={i} style={{ color: lineColor(line) }}>
                {line}
                {"\n"}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-3 w-full px-2 mb-2">
          <LogActionButton onClick={handleSave} className="flex-1">
            Save As File
          </LogActionButton>
          <LogActionButton onClick={handleCopy} className="flex-1">
            Copy
          </LogActionButton>
          <LogActionButton
            onClick={() => {
              playBackSound();
              onClose();
            }}
            className="flex-1"
          >
            Close
          </LogActionButton>
        </div>
        {feedback && (
          <p className="text-[#333333] text-sm text-center w-full">
            {feedback}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

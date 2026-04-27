import { useState, useEffect, memo } from "react";

interface ModalButtonProps {
  label: string;
  onClick: () => void;
  isDanger?: boolean;
}

const ModalButton = memo(function ModalButton({
  label,
  onClick,
  isDanger = false,
}: ModalButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`flex-1 h-12 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none bg-transparent ${isDanger ? "text-red-500" : "text-white"
        } ${isHovered ? (isDanger ? "text-red-400" : "text-[#ffff00]") : ""}`}
      style={{
        backgroundImage: isHovered
          ? "url('/images/button_highlighted.png')"
          : "url('/images/Button_Background.png')",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
      }}
    >
      {label}
    </button>
  );
});

export default function CustomTUModal({
  isOpen,
  onClose,
  onImport,
  playPressSound,
  playBackSound,
  editingEdition = null,
  initialPath = "",
}: any) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    if (isOpen && editingEdition) {
      setName(editingEdition.name);
      setDesc(editingEdition.desc);
      setUrl(editingEdition.url);
      setPath(editingEdition.path || "");
    } else if (isOpen && initialPath) {
      setPath(initialPath);
    } else if (!isOpen) {
      setName("");
      setDesc("");
      setUrl("");
      setPath("");
      setError("");
    }
  }, [editingEdition, isOpen, initialPath]);

  useEffect(() => {
    if (!isOpen) {
      setFocusIndex(0);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        playBackSound("close_click.wav");
        onClose();
      } else if (e.key === "Enter") {
        if (focusIndex === 3) {
          playBackSound("close_click.wav");
          onClose();
        } else if (focusIndex === 4 || e.ctrlKey) {
          playPressSound("save_click.wav");
          handleImport();
        }
      } else if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % 5);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + 5) % 5);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, focusIndex, name, desc, url, path]);

  if (!isOpen) return null;

  const handleImport = () => {
    if (!name) {
      setError("Name is required");
      return;
    }
    if (!url && !path) {
      setError("URL or Path is required");
      return;
    }
    if (url && !url.startsWith("http")) {
      setError("Invalid URL");
      return;
    }
    setError("");
    onImport({ name, desc: desc || "Custom imported TU", url, path: path || undefined });
    onClose();
    setName("");
    setDesc("");
    setUrl("");
    setPath("");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 outline-none border-none">
      <div
        className="relative w-[400px] p-4 flex flex-col items-center mc-options-bg"
      >
        <h2 className="text-xl text-black mc-text-shadow mb-4 text-center">
          {editingEdition ? "Edit Custom TU" : "Import Custom TU"}
        </h2>

        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1">
            <label className="text-gray text-sm mc-text-shadow uppercase tracking-widest">
              TU Name
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setFocusIndex(0)}
              placeholder="e.g. My Awesome Mod"
              className="w-full h-10 px-3 bg-black/40 border-2 border-[#373737] text-white text-base outline-none font-['Mojangles']"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray text-sm mc-text-shadow uppercase tracking-widest">
              Description (Optional)
            </label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onFocus={() => setFocusIndex(1)}
              placeholder="A brief description..."
              className="w-full h-10 px-3 bg-black/40 border-2 border-[#373737] text-white text-base outline-none font-['Mojangles']"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray text-sm mc-text-shadow uppercase tracking-widest">
              Download URL (.zip)
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={() => setFocusIndex(2)}
              placeholder="optional if path is set"
              className="w-full h-10 px-3 bg-black/40 border-2 border-[#373737] text-white text-base outline-none font-['Mojangles']"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          {path && (
            <div className="flex flex-col gap-1">
              <label className="text-gray text-sm mc-text-shadow uppercase tracking-widest">
                Local Path
              </label>
              <input
                type="text"
                readOnly
                value={path}
                className="w-full h-10 px-3 bg-black/20 border-2 border-[#222] text-black text-xs outline-none font-['Mojangles'] cursor-not-allowed"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          )}

          {error && (
            <div className="text-red-500 text-center mc-text-shadow uppercase text-xs tracking-widest">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-4 mt-6 w-full">
          <ModalButton
            label="Cancel"
            onClick={() => {
              playBackSound("close_click.wav");
              onClose();
            }}
          />
          <ModalButton
            label={editingEdition ? "Save" : "Import"}
            onClick={() => {
              playPressSound("save_click.wav");
              handleImport();
            }}
          />
        </div>
      </div>
    </div>
  );
}

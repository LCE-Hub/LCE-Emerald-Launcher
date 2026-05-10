import { useState, useEffect, memo } from "react";
import { motion } from "framer-motion";
import { TauriService } from "../../services/TauriService";

export default function SetUidModal({
  isOpen,
  onClose,
  playPressSound,
  playBackSound,
  instances,
  installedVersions,
  targetInstanceId,
}: any) {
  const [mode, setMode] = useState<"manual" | "copy">("manual");
  const [uid, setUid] = useState("0xFF02F0C87E8AC1F2");
  const [selectedInstance, setSelectedInstance] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [error, setError] = useState("");
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setMode("manual");
      setUid("0xFF02F0C87E8AC1F2");
      setSelectedInstance("");
      setError("");
      setFocusIndex(0);
      setIsDropdownOpen(false);
    } else if (targetInstanceId) {
      (async () => {
        try {
          const targetPath = await TauriService.getInstancePath(targetInstanceId);
          const data = await TauriService.readBinaryFile(`${targetPath}/uid.dat`);
          const currentUid = new TextDecoder().decode(data);
          if (currentUid.trim()) {
            setUid(currentUid);
          } else {
            setUid("0xFF02F0C87E8AC1F2");
          }
        } catch (e) {
          setUid("0xFF02F0C87E8AC1F2");
        }
      })();
    }
  }, [isOpen, targetInstanceId]);

  const validInstances = instances.filter((i: any) => installedVersions.includes(i.instanceId) && i.instanceId !== targetInstanceId);
  const handleSave = async () => {
    playPressSound("save_click.wav");
    try {
      let finalUid = uid;
      if (mode === "copy") {
        if (!selectedInstance) {
          setError("Select an instance to copy from.");
          return;
        }
        const sourcePath = await TauriService.getInstancePath(selectedInstance);
        try {
          const sourceData = await TauriService.readBinaryFile(`${sourcePath}/uid.dat`);
          finalUid = new TextDecoder().decode(sourceData);
        } catch (e) {
          setError("Source instance has no uid.dat or it could not be read.");
          return;
        }
      }

      if (!finalUid) {
        setError("UID cannot be empty.");
        return;
      }

      const encodedUid = new TextEncoder().encode(finalUid);
      const targetPath = await TauriService.getInstancePath(targetInstanceId);
      await TauriService.writeBinaryFile(`${targetPath}/uid.dat`, encodedUid);

      onClose();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        playBackSound("close_click.wav");
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % 5);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + 5) % 5);
      } else if (e.key === "Enter") {
        if (focusIndex === 0) {
          playPressSound();
          setMode("manual");
        } else if (focusIndex === 1) {
          playPressSound();
          setMode("copy");
        } else if (focusIndex === 2 && mode === "copy") {
          playPressSound();
          setIsDropdownOpen(!isDropdownOpen);
        } else if (focusIndex === 3) {
          playBackSound("close_click.wav");
          onClose();
        } else if (focusIndex === 4) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, focusIndex, mode, uid, selectedInstance, isDropdownOpen]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[100] flex items-center justify-center outline-none border-none"
    >
      <div
        className="relative w-[400px] p-6 flex flex-col items-center shadow-2xl"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <h2 className="text-[#FFFF55] text-2xl mc-text-shadow mb-4 border-b-2 border-[#373737] pb-2 w-full text-center uppercase">
          Set UID
        </h2>

        <div className="flex gap-4 mb-5 w-full justify-center">
          <button
            onMouseEnter={() => setFocusIndex(0)}
            onClick={() => { playPressSound(); setMode("manual"); }}
            className={`w-32 h-10 flex items-center justify-center text-sm mc-text-shadow transition-all outline-none border-none bg-transparent ${focusIndex === 0 ? "text-[#FFFF55]" : mode === "manual" ? "text-white" : "text-gray-400"}`}
            style={{
              backgroundImage: focusIndex === 0 || mode === "manual"
                ? "url('/images/button_highlighted.png')"
                : "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            Manual
          </button>
          <button
            onMouseEnter={() => setFocusIndex(1)}
            onClick={() => { playPressSound(); setMode("copy"); }}
            className={`w-32 h-10 flex items-center justify-center text-sm mc-text-shadow transition-all outline-none border-none bg-transparent ${focusIndex === 1 ? "text-[#FFFF55]" : mode === "copy" ? "text-white" : "text-gray-400"}`}
            style={{
              backgroundImage: focusIndex === 1 || mode === "copy"
                ? "url('/images/button_highlighted.png')"
                : "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            Copy
          </button>
        </div>

        <div className="flex flex-col gap-4 w-full min-h-[80px]">
          {mode === "manual" ? (
            <div className="flex flex-col gap-1 items-center w-full">
              <label className="text-gray text-xs mc-text-shadow uppercase tracking-widest text-[#AAAAAA]">
                Enter UID
              </label>
              <input
                type="text"
                autoFocus
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                onFocus={() => setFocusIndex(2)}
                placeholder="0xFF02F0C87E8AC1F2"
                className={`w-full h-10 px-3 bg-black/40 border-2 ${focusIndex === 2 ? 'border-white' : 'border-[#373737]'} text-white text-base outline-none font-['Mojangles'] text-center`}
                style={{ imageRendering: "pixelated", filter: focusIndex === 2 ? 'brightness(1.2)' : 'none' }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1 items-center w-full relative">
              <label className="text-gray text-xs mc-text-shadow uppercase tracking-widest text-[#AAAAAA]">
                Select Installed Instance
              </label>
              
              <div 
                onClick={() => { playPressSound(); setIsDropdownOpen(!isDropdownOpen); }}
                onFocus={() => { setFocusIndex(2); setIsDropdownOpen(false); }}
                tabIndex={0}
                className={`w-full h-10 px-3 bg-black/40 border-2 ${focusIndex === 2 ? 'border-white' : 'border-[#373737]'} flex items-center justify-between text-white text-base outline-none font-['Mojangles'] cursor-pointer`}
                style={{ imageRendering: "pixelated", filter: focusIndex === 2 ? 'brightness(1.2)' : 'none' }}
              >
                <span className="truncate">
                  {selectedInstance 
                    ? (() => {
                        const i = validInstances.find((inst: any) => inst.instanceId === selectedInstance);
                        return i ? `${i.name} ${i.selectedBranch ? `(${i.selectedBranch})` : ""}` : "-- Select an Instance --";
                      })()
                    : "-- Select an Instance --"}
                </span>
                <span className="text-xs">▼</span>
              </div>

              {isDropdownOpen && validInstances.length > 0 && (
                <div className="absolute top-[60px] left-0 w-full max-h-40 overflow-y-auto bg-black/90 border-2 border-[#373737] z-50 flex flex-col custom-scrollbar shadow-xl" style={{ imageRendering: "pixelated" }}>
                  {validInstances.map((i: any) => (
                    <div
                      key={i.instanceId}
                      onClick={() => {
                        playPressSound();
                        setSelectedInstance(i.instanceId);
                        setIsDropdownOpen(false);
                      }}
                      className="px-3 py-2 text-white text-sm cursor-pointer hover:bg-white/20 transition-colors truncate font-['Mojangles']"
                    >
                      {i.name} {i.selectedBranch ? `(${i.selectedBranch})` : ""}
                    </div>
                  ))}
                </div>
              )}

              {validInstances.length === 0 && (
                <p className="text-red-400 text-xs text-center mt-1">No other installed instances available.</p>
              )}
            </div>
          )}

          {error && (
            <div className="text-red-500 text-center mc-text-shadow uppercase text-xs tracking-widest mt-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-4 mt-6 w-full justify-center">
          <button
            onMouseEnter={() => setFocusIndex(3)}
            onClick={() => {
              playBackSound("close_click.wav");
              onClose();
            }}
            className={`w-32 h-10 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none ${focusIndex === 3 ? "text-[#FFFF55]" : "text-white"}`}
            style={{
              backgroundImage: focusIndex === 3
                ? "url('/images/button_highlighted.png')"
                : "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            Cancel
          </button>
          <button
            onMouseEnter={() => setFocusIndex(4)}
            onClick={handleSave}
            className={`w-32 h-10 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none ${focusIndex === 4 ? "text-[#FFFF55]" : "text-white"}`}
            style={{
              backgroundImage: focusIndex === 4
                ? "url('/images/button_highlighted.png')"
                : "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </motion.div>
  );
}

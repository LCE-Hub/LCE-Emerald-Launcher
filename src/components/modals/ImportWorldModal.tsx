import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TauriService } from "../../services/TauriService";
export default function ImportWorldModal({
  isOpen,
  onClose,
  playPressSound,
  playBackSound,
  targetInstanceId,
  targetInstanceName,
}: {
  isOpen: boolean;
  onClose: () => void;
  playPressSound: (s?: string) => void;
  playBackSound: (s?: string) => void;
  targetInstanceId: string;
  targetInstanceName: string;
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setStatus("");
      setError("");
      setIsImporting(false);
    }
  }, [isOpen]);

  const handleImportMs = async () => {
    if (!targetInstanceId) return;
    playPressSound();
    setIsImporting(true);
    setError("");
    setStatus("Selecting source...");
    try {
      setStatus("Selecting saveData.ms file...");
      const picked = await TauriService.pickFile("Select saveData.ms", [
        "*.ms",
        "*",
      ]);
      if (!picked) {
        setIsImporting(false);
        return;
      }
      const worldName = deriveWorldName(picked);
      setStatus("Copying LCE save...");

      const instancePath = await TauriService.getInstancePath(targetInstanceId);
      const saveDir = `${instancePath}/Windows64/GameHDD/${worldName}`;
      await TauriService.importWorld(picked, `${saveDir}/saveData.ms`);

      setStatus(`World imported into "${targetInstanceName}"!`);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
      setIsImporting(false);
    }
  };

  const handleImportXbox = async () => {
    if (!targetInstanceId) return;
    playPressSound();
    setIsImporting(true);
    setError("");
    setStatus("Selecting source...");
    try {
      setStatus("Selecting Xbox 360 save (.bin)...");
      const picked = await TauriService.pickFile(
        "Select Xbox 360 Minecraft save",
        ["*.bin", "*"],
      );
      if (!picked) {
        setIsImporting(false);
        return;
      }
      setStatus("Converting Xbox 360 save...");
      const instancePath = await TauriService.getInstancePath(targetInstanceId);
      const gameHdd = `${instancePath}/Windows64/GameHDD`;
      await TauriService.importLceSave(picked, gameHdd);
      setStatus(`Xbox 360 save converted into "${targetInstanceName}"!`);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
      setIsImporting(false);
    }
  };

  const handleImportPs3 = async () => {
    if (!targetInstanceId) return;
    playPressSound();
    setIsImporting(true);
    setError("");
    setStatus("Selecting source...");
    try {
      setStatus("Selecting PS3 save folder...");
      const picked = await TauriService.pickFolder();
      if (!picked) {
        setIsImporting(false);
        return;
      }
      setStatus("Converting PS3 save...");
      const instancePath = await TauriService.getInstancePath(targetInstanceId);
      const gameHdd = `${instancePath}/Windows64/GameHDD`;
      await TauriService.importLceSave(picked, gameHdd);
      setStatus(`PS3 save converted into "${targetInstanceName}"!`);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
      setIsImporting(false);
    }
  };

  const handleImportJava = async () => {
    if (!targetInstanceId) return;
    playPressSound();
    setIsImporting(true);
    setError("");
    setStatus("Selecting source...");
    try {
      setStatus("Selecting Java world folder...");
      const picked = await TauriService.pickFolder();
      if (!picked) {
        setIsImporting(false);
        return;
      }
      const worldName = deriveWorldName(picked);
      setStatus("Converting Java world to LCE...");
      const instancePath = await TauriService.getInstancePath(targetInstanceId);
      const saveDir = `${instancePath}/Windows64/GameHDD/${worldName}`;
      await TauriService.javaToLce(picked, `${saveDir}/saveData.ms`);
      setStatus(`Java world converted into "${targetInstanceName}"!`);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
      setIsImporting(false);
    }
  };

  const handleExportJava = async () => {
    if (!targetInstanceId) return;
    playPressSound();
    setIsImporting(true);
    setError("");
    setStatus("Selecting source...");
    try {
      setStatus("Selecting saveData.ms file...");
      const picked = await TauriService.pickFile("Select saveData.ms", [
        "*.ms",
        "*",
      ]);
      if (!picked) {
        setIsImporting(false);
        return;
      }
      setStatus("Selecting output folder for Java world...");
      const outputFolder = await TauriService.pickFolder();
      if (!outputFolder) {
        setIsImporting(false);
        return;
      }
      setStatus("Converting LCE save to Java world...");
      await TauriService.lceToJava(picked, outputFolder);
      setStatus(`Java world exported to "${outputFolder}"!`);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
      setIsImporting(false);
    }
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      playBackSound();
      if (isImporting) return;
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, isImporting]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 w-screen h-screen z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md"
    >
      <div
        className="relative w-[450px] p-6 flex flex-col items-center shadow-2xl"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        {!isImporting ? (
          <>
            <h2 className="text-[#FFFF55] text-2xl mc-text-shadow mb-2 border-b-2 border-[#373737] pb-2 w-full text-center uppercase">
              Import World
            </h2>
            <p className="text-white text-sm mc-text-shadow mb-4 text-center">
              Import into:{" "}
              <span className="text-[#FFFF55]">{targetInstanceName}</span>
            </p>

            <p className="text-gray-400 text-xs mc-text-shadow mb-2 text-center">
              Import an existing .ms save file:
            </p>
            <button
              onClick={handleImportMs}
              className="w-48 h-9 flex items-center justify-center text-sm text-white mc-text-shadow hover:text-[#FFFF55] mb-4"
              style={{
                backgroundImage: "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              Select .ms File
            </button>

            <p className="text-gray-400 text-xs mc-text-shadow mb-2 text-center">
              Convert an Xbox 360 or PS3 save:
            </p>
            <div className="flex gap-3 mb-2">
              <button
                onClick={handleImportXbox}
                className="w-40 h-9 flex items-center justify-center text-sm text-white mc-text-shadow hover:text-[#FFFF55]"
                style={{
                  backgroundImage: "url('/images/Button_Background.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                Xbox 360 (.bin)
              </button>
              <button
                onClick={handleImportPs3}
                className="w-40 h-9 flex items-center justify-center text-sm text-white mc-text-shadow hover:text-[#FFFF55]"
                style={{
                  backgroundImage: "url('/images/Button_Background.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                PS3 (Folder)
              </button>
            </div>

            <p className="text-gray-400 text-xs mc-text-shadow mb-2 text-center">
              Java Edition world conversion:
            </p>
            <div className="flex gap-3 mb-2">
              <button
                onClick={handleImportJava}
                className="w-40 h-9 flex items-center justify-center text-sm text-white mc-text-shadow hover:text-[#FFFF55]"
                style={{
                  backgroundImage: "url('/images/Button_Background.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                Java → LCE
              </button>
              <button
                onClick={handleExportJava}
                className="w-40 h-9 flex items-center justify-center text-sm text-white mc-text-shadow hover:text-[#FFFF55]"
                style={{
                  backgroundImage: "url('/images/Button_Background.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                LCE → Java
              </button>
            </div>

            {error && (
              <div className="text-red-500 text-center mc-text-shadow uppercase text-xs tracking-widest mb-3">
                {error}
              </div>
            )}

            <button
              onClick={() => {
                playBackSound();
                onClose();
              }}
              className="w-32 h-10 flex items-center justify-center text-xl text-white mc-text-shadow mt-2"
              style={{
                backgroundImage: "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="text-[#FFFF55] text-2xl mc-text-shadow mb-4 border-b-2 border-[#373737] pb-2 w-full text-center uppercase">
              Importing World
            </h2>
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-4 border-[#FFFF55] border-t-transparent rounded-full animate-spin" />
              <p className="text-white text-lg mc-text-shadow text-center">
                {status}
              </p>
            </div>
            {error && (
              <div className="text-red-500 text-center mc-text-shadow uppercase text-xs tracking-widest mb-3">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function deriveWorldName(inputPath: string): string {
  const name =
    inputPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ||
    "ImportedWorld";
  return name.replace(/[^a-zA-Z0-9_\- ]/g, "_").slice(0, 64);
}

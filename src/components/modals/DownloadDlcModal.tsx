import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { TauriService } from "../../services/TauriService";
interface DlcEntry {
  name: string;
  selected: boolean;
}

export default function DownloadDlcModal({
  isOpen,
  onClose,
  playPressSound,
  playBackSound,
  editionName,
  instanceId,
  officialDLC,
}: {
  isOpen: boolean;
  onClose: () => void;
  playPressSound: (s?: string) => void;
  playBackSound: (s?: string) => void;
  editionName: string;
  instanceId: string;
  officialDLC: string;
}) {
  const [dlcList, setDlcList] = useState<DlcEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [branch, repoUrl] = officialDLC.includes(":")
    ? [
        officialDLC.slice(0, officialDLC.indexOf(":")),
        officialDLC.slice(officialDLC.indexOf(":") + 1),
      ]
    : ["main", officialDLC];

  const fetchDlcs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gitEntries, instancePath] = await Promise.all([
        TauriService.listGitDirectory(repoUrl, branch, ""),
        TauriService.getInstancePath(instanceId),
      ]);

      let existingDlcs: string[] = [];
      try {
        const dlcDirEntries = await TauriService.listDirectory(
          instancePath + "/Windows64Media/DLC",
        );
        existingDlcs = dlcDirEntries.filter((e) => e.is_dir).map((e) => e.name);
      } catch {
        existingDlcs = [];
      }

      const folders = gitEntries
        .filter((e) => e.is_dir)
        .map((e) => e.name)
        .sort();

      setDlcList(
        folders
          .filter((name) => !existingDlcs.includes(name))
          .map((name) => ({
            name,
            selected: false,
          })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [repoUrl, branch, instanceId]);

  useEffect(() => {
    if (isOpen) {
      setDlcList([]);
      setError(null);
      setDownloading(false);
      setDownloaded([]);
      setFocusIndex(0);
      fetchDlcs();
    }
  }, [isOpen, fetchDlcs]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!downloading) {
          playBackSound();
          onClose();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, dlcList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && !downloading) {
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < dlcList.length) {
          toggleDlc(dlcList[focusIndex].name);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, dlcList, focusIndex, downloading, playBackSound, onClose]);

  useEffect(() => {
    if (focusIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector(
        `[data-dlc-index="${focusIndex}"]`,
      ) as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [focusIndex]);

  const toggleDlc = (name: string) => {
    playPressSound();
    setDlcList((prev) =>
      prev.map((d) => (d.name === name ? { ...d, selected: !d.selected } : d)),
    );
  };

  const selectAll = () => {
    playPressSound();
    setDlcList((prev) => prev.map((d) => ({ ...d, selected: true })));
  };

  const deselectAll = () => {
    playPressSound();
    setDlcList((prev) => prev.map((d) => ({ ...d, selected: false })));
  };

  const handleDownload = async () => {
    const selected = dlcList.filter((d) => d.selected);
    if (selected.length === 0) return;
    playPressSound();
    setDownloading(true);
    setDownloaded([]);
    for (const dlc of selected) {
      try {
        await TauriService.downloadDlcFiles(
          instanceId,
          repoUrl,
          branch,
          dlc.name,
        );
        setDownloaded((prev) => [...prev, dlc.name]);
      } catch (e) {
        setError(
          `Failed to download ${dlc.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
        setDownloading(false);
        return;
      }
    }
    setDownloading(false);
  };

  const selectedCount = dlcList.filter((d) => d.selected).length;
  if (!isOpen) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 w-screen h-screen z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md outline-none border-none"
    >
      <div
        className="relative w-[480px] max-h-[80vh] p-6 flex flex-col items-center shadow-2xl"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <h2 className="text-[#FFFF55] text-2xl mc-text-shadow mb-1 w-full text-center uppercase">
          Download DLC
        </h2>
        <p className="text-white text-sm mc-text-shadow mb-4 text-center">
          {editionName}
        </p>

        {loading && (
          <div className="text-white text-sm mc-text-shadow mb-4 py-8">
            Loading available DLCs...
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm mc-text-shadow mb-4 text-center max-w-full break-words">
            {error}
          </div>
        )}

        {!loading && !error && dlcList.length === 0 && (
          <div className="text-white text-sm mc-text-shadow mb-4 py-8">
            No DLC folders found in the repository.
          </div>
        )}

        {!loading && dlcList.length > 0 && (
          <>
            <div className="flex items-center justify-between w-full mb-2 gap-2">
              <span className="text-white text-[10px] mc-text-shadow uppercase tracking-widest">
                {dlcList.length} available
              </span>
              <div className="flex gap-1">
                <button
                  onClick={selectAll}
                  disabled={downloading}
                  className="text-[9px] px-1.5 py-0.5 border border-[#555] text-white bg-black/20 hover:border-[#FFFF55] hover:text-[#FFFF55] mc-text-shadow uppercase tracking-wider transition-colors disabled:opacity-40"
                >
                  All
                </button>
                <button
                  onClick={deselectAll}
                  disabled={downloading}
                  className="text-[9px] px-1.5 py-0.5 border border-[#555] text-white bg-black/20 hover:border-[#FFFF55] hover:text-[#FFFF55] mc-text-shadow uppercase tracking-wider transition-colors disabled:opacity-40"
                >
                  None
                </button>
              </div>
            </div>

            <div
              ref={listRef}
              className="w-full max-h-[40vh] overflow-y-auto custom-scrollbar border border-[#373737] bg-black/20"
            >
              {dlcList.map((dlc, i) => (
                <div
                  key={dlc.name}
                  data-dlc-index={i}
                  onClick={() => !downloading && toggleDlc(dlc.name)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-white/5 ${
                    focusIndex === i ? "ring-1 ring-white bg-white/5" : ""
                  }`}
                >
                  <div
                    className={`w-4 h-4 border flex items-center justify-center flex-shrink-0 ${
                      dlc.selected
                        ? "border-[#FFFF55] bg-[#FFFF55]/20"
                        : "border-[#555]"
                    }`}
                    style={{ imageRendering: "pixelated" }}
                  >
                    {dlc.selected && (
                      <span className="text-[#FFFF55] text-xs leading-none">
                        ✔
                      </span>
                    )}
                  </div>
                  <span className="text-sm mc-text-shadow text-white">
                    {dlc.name}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-center gap-4 mt-4">
          {downloading && (
            <div className="text-[#FFFF55] text-sm mc-text-shadow">
              Downloading... ({downloaded.length}/{selectedCount})
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 mt-3">
          {!downloading && selectedCount > 0 && (
            <button
              onClick={handleDownload}
              className="w-32 h-10 flex items-center justify-center text-sm mc-text-shadow text-white outline-none border-none"
              style={{
                backgroundImage: "url('/images/button_highlighted.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              Download ({selectedCount})
            </button>
          )}
          {downloading && downloaded.length === selectedCount && (
            <button
              onClick={() => {
                playPressSound();
                onClose();
              }}
              className="w-32 h-10 flex items-center justify-center text-sm mc-text-shadow text-white outline-none border-none"
              style={{
                backgroundImage: "url('/images/button_highlighted.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              Done
            </button>
          )}
          <button
            onClick={() => {
              playBackSound();
              onClose();
            }}
            disabled={downloading}
            className="w-24 h-10 flex items-center justify-center text-sm mc-text-shadow outline-none border-none text-white disabled:opacity-40"
            style={{
              backgroundImage: "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </motion.div>
  );
}

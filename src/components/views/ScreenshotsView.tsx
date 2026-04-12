import { useState, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUI, useAudio, useGame, useConfig } from "../../context/LauncherContext";
import { ScreenshotService, ScreenshotInfo } from "../../services/ScreenshotService";
const ScreenshotsView = memo(function ScreenshotsView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { editions } = useGame();
  const { animationsEnabled } = useConfig();
  const [screenshots, setScreenshots] = useState<ScreenshotInfo[]>([]);
  const [selectedScreenshot, setSelectedScreenshot] = useState<ScreenshotInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [gridFocusIndex, setGridFocusIndex] = useState(0);
  const [modalFocusIndex, setModalFocusIndex] = useState(0);

  useEffect(() => {
    ScreenshotService.getScreenshots().then((data) => {
      setScreenshots(data);
      setLoading(false);
    });
  }, []);

  const handleBack = () => {
    playBackSound();
    setActiveView("main");
  };

  const handleDelete = async (screenshot: ScreenshotInfo) => {
    if (confirm("Are you sure you want to delete this screenshot?")) {
      playPressSound();
      await ScreenshotService.deleteScreenshot(screenshot.path);
      setScreenshots((prev) => prev.filter((s) => s.path !== screenshot.path));
      setSelectedScreenshot(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;

      if (selectedScreenshot) {
        if (e.key === "Escape") {
          playBackSound();
          setSelectedScreenshot(null);
        } else if (e.key === "ArrowLeft") {
          setModalFocusIndex((prev) => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === "ArrowRight") {
          setModalFocusIndex((prev) => (prev < 2 ? prev + 1 : prev));
        } else if (e.key === "Enter") {
          if (modalFocusIndex === 0) handleDelete(selectedScreenshot);
          else if (modalFocusIndex === 1) {
            playBackSound();
            setSelectedScreenshot(null);
          }
        }
        return;
      }

      const cols = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 3 : 2;

      if (e.key === "Escape") {
        handleBack();
      } else if (e.key === "ArrowLeft") {
        setGridFocusIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "ArrowRight") {
        setGridFocusIndex((prev) => (prev < screenshots.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        setGridFocusIndex((prev) => (prev >= cols ? prev - cols : prev));
      } else if (e.key === "ArrowDown") {
        setGridFocusIndex((prev) => (prev <= screenshots.length - 1 - cols ? prev + cols : prev));
      } else if (e.key === "Enter") {
        if (screenshots[gridFocusIndex]) {
          playPressSound();
          setModalFocusIndex(0);
          setSelectedScreenshot(screenshots[gridFocusIndex]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, selectedScreenshot, gridFocusIndex, modalFocusIndex, screenshots]);

  useEffect(() => {
    if (!selectedScreenshot) {
      const element = document.getElementById(`ss-${gridFocusIndex}`);
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [gridFocusIndex, selectedScreenshot]);

  const getEditionLogo = (instanceId: string) => {
    const edition = editions.find((e: any) => e.id === instanceId);
    return edition?.logo || edition?.titleImage;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full h-full max-w-5xl"
    >
      <div className="flex items-center justify-between w-full mb-4 border-b-2 border-[#373737] pb-2">
        <h2 className="text-2xl text-white mc-text-shadow tracking-widest uppercase opacity-80 font-bold px-4">
          Screenshots
        </h2>
        <button
          onClick={handleBack}
          className="mc-button px-6 py-2 text-white text-xl mc-text-shadow"
          style={{ width: "120px", height: "40px" }}
        >
          Back
        </button>
      </div>

      <div className="w-full flex-1 overflow-y-auto custom-scrollbar p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-white text-xl mc-text-shadow">Scanning for screenshots...</span>
          </div>
        ) : screenshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <span className="text-gray-400 text-xl mc-text-shadow italic">No screenshots found.</span>
            <span className="text-gray-500 text-sm mc-text-shadow">Take some in-game with F2!</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {screenshots.map((ss, index) => (
              <motion.div
                key={ss.path}
                id={`ss-${index}`}
                whileHover={{ scale: 1.05 }}
                onClick={() => {
                  setGridFocusIndex(index);
                  setSelectedScreenshot(ss);
                }}
                className={`relative aspect-video bg-black/40 border-2 transition-all cursor-pointer overflow-hidden group shadow-lg ${gridFocusIndex === index ? "border-[#FFFF55] scale-105" : "border-transparent"}`}
              >
                <img
                  src={`screenshots://localhost/${ss.path}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  alt={ss.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/images/Folder_Icon.png";
                  }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                {getEditionLogo(ss.instanceId) && (
                  <img
                    src={getEditionLogo(ss.instanceId)}
                    className="absolute bottom-2 left-2 w-8 h-8 object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                    style={{ imageRendering: "pixelated" }}
                  />
                )}
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-2 py-1 text-[10px] text-white pointer-events-none">
                  {new Date(ss.date * 1000).toLocaleDateString()}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedScreenshot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-8 backdrop-blur-sm"
            onClick={() => setSelectedScreenshot(null)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative max-w-full max-h-[80vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={`screenshots://localhost/${selectedScreenshot.path}`}
                className="max-w-full max-h-full object-contain border-4 border-[#373737] shadow-2xl"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/images/Pack_Icon.png";
                }}
              />

              <div className="flex gap-4 mt-8 w-full justify-center">
                <button
                  onClick={() => handleDelete(selectedScreenshot)}
                  className={`mc-button px-6 py-2 text-red-500 mc-text-shadow flex items-center justify-center transition-all ${modalFocusIndex === 1 ? "scale-110 brightness-125" : ""}`}
                  style={{ minWidth: "180px", height: "48px", backgroundImage: modalFocusIndex === 1 ? "url('/images/button_highlighted.png')" : "" }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedScreenshot(null)}
                  className={`mc-button px-6 py-2 text-white mc-text-shadow flex items-center justify-center transition-all ${modalFocusIndex === 2 ? "scale-110 brightness-125" : ""}`}
                  style={{ minWidth: "120px", height: "48px", backgroundImage: modalFocusIndex === 2 ? "url('/images/button_highlighted.png')" : "" }}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 text-gray-400 text-sm mc-text-shadow">
                {selectedScreenshot.name} - {new Date(selectedScreenshot.date * 1000).toLocaleString()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default ScreenshotsView;

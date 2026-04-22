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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmFocusIndex, setDeleteConfirmFocusIndex] = useState(0);
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

  const handleOpenFolder = (screenshot: ScreenshotInfo) => {
    playPressSound();
    ScreenshotService.showInFolder(screenshot.path);
  };

  const confirmDelete = async () => {
    if (!selectedScreenshot) return;
    playPressSound();
    await ScreenshotService.deleteScreenshot(selectedScreenshot.path);
    setScreenshots((prev) => prev.filter((s) => s.path !== selectedScreenshot.path));
    setSelectedScreenshot(null);
    setShowDeleteConfirm(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      if (showDeleteConfirm) {
        if (e.key === "Escape" || e.key === "Backspace") {
          playBackSound();
          setShowDeleteConfirm(false);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Tab") {
          e.preventDefault();
          playPressSound();
          setDeleteConfirmFocusIndex((prev) => (prev === 0 ? 1 : 0));
        } else if (e.key === "Enter") {
          if (deleteConfirmFocusIndex === 1) confirmDelete();
          else {
            playBackSound();
            setShowDeleteConfirm(false);
          }
        }
        return;
      }

      if (selectedScreenshot) {
        if (e.key === "Escape" || e.key === "Backspace") {
          playBackSound();
          setSelectedScreenshot(null);
        } else if (e.key === "ArrowLeft") {
          playPressSound();
          setModalFocusIndex((prev) => (prev > 0 ? prev - 1 : 2));
        } else if (e.key === "ArrowRight" || e.key === "Tab") {
          e.preventDefault();
          playPressSound();
          setModalFocusIndex((prev) => (prev < 2 ? prev + 1 : 0));
        } else if (e.key === "Enter") {
          if (modalFocusIndex === 0) handleOpenFolder(selectedScreenshot);
          else if (modalFocusIndex === 1) {
            playPressSound();
            setDeleteConfirmFocusIndex(0);
            setShowDeleteConfirm(true);
          }
          else if (modalFocusIndex === 2) {
            playBackSound();
            setSelectedScreenshot(null);
          }
        }
        return;
      }

      const cols = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 3 : 2;
      if (e.key === "Escape" || e.key === "Backspace") {
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
          setModalFocusIndex(2);
          setSelectedScreenshot(screenshots[gridFocusIndex]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, selectedScreenshot, gridFocusIndex, modalFocusIndex, screenshots, showDeleteConfirm, deleteConfirmFocusIndex]);

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
      className="flex flex-col items-center w-full h-full max-w-6xl relative font-['Mojangles'] text-white select-none outline-none focus:outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-4 mb-6 border-b-2 border-[#373737] pb-2 w-[30%] max-w-[250px] text-center tracking-widest uppercase opacity-80 font-bold whitespace-nowrap px-4">
        Screenshots
      </h2>

      <div className="w-[98%] flex-1 relative overflow-hidden">
        <div className="absolute inset-0 overflow-y-auto p-6 scroll-smooth custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <span className="text-3xl text-[#FFFF55] mc-text-shadow tracking-widest animate-pulse uppercase">Scanning Archives...</span>
            </div>
          ) : screenshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-40">
              <span className="text-2xl mc-text-shadow uppercase tracking-widest">No screenshots found</span>
              <span className="text-sm mc-text-shadow tracking-widest italic">Take some in-game with F2</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {screenshots.map((ss, index) => (
                <div
                  key={ss.path}
                  id={`ss-${index}`}
                  onClick={() => {
                    setGridFocusIndex(index);
                    setModalFocusIndex(2); // Close button
                    setSelectedScreenshot(ss);
                    playPressSound();
                  }}
                  onMouseEnter={() => setGridFocusIndex(index)}
                  className={`
                    relative aspect-video flex flex-col cursor-pointer transition-all border-2 rounded-sm overflow-hidden bg-black/40
                    ${gridFocusIndex === index ? "border-[#FFFF55] scale-105 z-10" : "border-[#333] hover:border-[#FFFF55]"}
                  `}
                  style={{
                    backgroundImage: "url('/images/frame_background.png')",
                    backgroundSize: '100% 100%',
                    imageRendering: 'pixelated',
                    boxShadow: gridFocusIndex === index ? '0 0 20px rgba(255, 255, 85, 0.2)' : 'none',
                  }}
                >
                  <div className="w-full h-full relative overflow-hidden bg-black/50">
                    <img
                      src={`screenshots://localhost/${ss.path}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                      alt={ss.name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/images/Folder_Icon.png";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />

                    {getEditionLogo(ss.instanceId) && (
                      <div className="absolute bottom-2 left-2 flex items-center gap-2">
                        <img
                          src={getEditionLogo(ss.instanceId)}
                          className="w-6 h-6 object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                          style={{ imageRendering: "pixelated" }}
                        />
                      </div>
                    )}

                    <div className="absolute bottom-2 right-2 text-[8px] bg-black/60 border border-[#555] px-1.5 py-0.5 text-[#A0A0A0] mc-text-shadow uppercase tracking-tighter">
                      {new Date(ss.date * 1000).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full mt-6 mb-4 flex justify-center">
        <button
          onClick={handleBack}
          className={`
            w-72 h-10 flex items-center justify-center text-xl mc-text-shadow border-none outline-none transition-all text-white
            hover:text-[#FFFF55]
          `}
          style={{
            backgroundImage: "url('/images/Button_Background.png')",
            backgroundSize: '100% 100%',
            imageRendering: 'pixelated'
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundImage = "url('/images/button_highlighted.png')"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundImage = "url('/images/Button_Background.png')"; }}
        >
          Back
        </button>
      </div>

      <AnimatePresence>
        {selectedScreenshot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-8 backdrop-blur-md"
            onClick={() => setSelectedScreenshot(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative max-w-5xl w-full flex flex-col items-center border-2 border-[#555] rounded-sm p-2"
              style={{
                backgroundImage: "url('/images/frame_background.png')",
                backgroundSize: '100% 100%',
                imageRendering: 'pixelated',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative w-full aspect-video bg-black/60 overflow-hidden border border-[#444] rounded-sm">
                <img
                  src={`screenshots://localhost/${selectedScreenshot.path}`}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/images/Pack_Icon.png";
                  }}
                />
                <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between pointer-events-none">
                  <div className="flex flex-col gap-1">
                    <span className="text-xl text-white mc-text-shadow block leading-tight tracking-wide font-bold">
                      {selectedScreenshot.name}
                    </span>
                    <span className="text-sm text-[#FFFF55] mc-text-shadow uppercase tracking-widest opacity-90">
                      Captured on {new Date(selectedScreenshot.date * 1000).toLocaleString()}
                    </span>
                  </div>
                  {getEditionLogo(selectedScreenshot.instanceId) && (
                    <img
                      src={getEditionLogo(selectedScreenshot.instanceId)}
                      className="w-16 h-16 object-contain drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
                      style={{ imageRendering: "pixelated" }}
                    />
                  )}
                </div>
              </div>

              <div className="flex gap-6 mt-6 mb-2 w-full justify-center px-6">
                <button
                  onMouseEnter={() => setModalFocusIndex(0)}
                  onClick={() => handleOpenFolder(selectedScreenshot)}
                  className={`
                    flex-1 h-12 flex items-center justify-center text-xl mc-text-shadow border-none outline-none cursor-pointer transition-all
                    ${modalFocusIndex === 0 ? "text-[#FFFF55] scale-105" : "text-white"}
                  `}
                  style={{
                    backgroundImage: modalFocusIndex === 0 ? "url('/images/button_highlighted.png')" : "url('/images/Button_Background.png')",
                    backgroundSize: '100% 100%',
                    imageRendering: 'pixelated',
                  }}
                >
                  OPEN FOLDER
                </button>
                <button
                  onMouseEnter={() => setModalFocusIndex(1)}
                  onClick={() => {
                    playPressSound();
                    setDeleteConfirmFocusIndex(0);
                    setShowDeleteConfirm(true);
                  }}
                  className={`
                    flex-1 h-12 flex items-center justify-center text-xl mc-text-shadow border-none outline-none cursor-pointer transition-all
                    ${modalFocusIndex === 1 ? "text-[#FF5555] scale-105" : "text-white"}
                  `}
                  style={{
                    backgroundImage: modalFocusIndex === 1 ? "url('/images/button_highlighted.png')" : "url('/images/Button_Background.png')",
                    backgroundSize: '100% 100%',
                    imageRendering: 'pixelated',
                  }}
                >
                  DELETE
                </button>
                <button
                  onMouseEnter={() => setModalFocusIndex(2)}
                  onClick={() => setSelectedScreenshot(null)}
                  className={`
                    w-48 h-12 flex items-center justify-center text-xl mc-text-shadow border-none outline-none cursor-pointer transition-all
                    ${modalFocusIndex === 2 ? "text-[#FFFF55] scale-105" : "text-white"}
                  `}
                  style={{
                    backgroundImage: modalFocusIndex === 2 ? "url('/images/button_highlighted.png')" : "url('/images/Button_Background.png')",
                    backgroundSize: '100% 100%',
                    imageRendering: 'pixelated',
                  }}
                >
                  CLOSE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-[420px] p-6 border-2 border-[#555] rounded-sm flex flex-col items-center"
              style={{
                backgroundImage: "url('/images/frame_background.png')",
                backgroundSize: '100% 100%',
                imageRendering: 'pixelated',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-2xl text-white mc-text-shadow text-center mb-6 px-4">
                Are you sure you want to delete this screenshot?
              </span>

              <div className="flex gap-4 w-full">
                <button
                  onMouseEnter={() => setDeleteConfirmFocusIndex(0)}
                  onClick={() => { playBackSound(); setShowDeleteConfirm(false); }}
                  className={`
                    flex-1 h-10 flex items-center justify-center text-lg mc-text-shadow border-none outline-none cursor-pointer transition-all
                    ${deleteConfirmFocusIndex === 0 ? "text-[#FFFF55] scale-105" : "text-white"}
                  `}
                  style={{
                    backgroundImage: deleteConfirmFocusIndex === 0 ? "url('/images/button_highlighted.png')" : "url('/images/Button_Background.png')",
                    backgroundSize: '100% 100%',
                    imageRendering: 'pixelated',
                  }}
                >
                  CANCEL
                </button>
                <button
                  onMouseEnter={() => setDeleteConfirmFocusIndex(1)}
                  onClick={confirmDelete}
                  className={`
                    flex-1 h-10 flex items-center justify-center text-lg mc-text-shadow border-none outline-none cursor-pointer transition-all
                    ${deleteConfirmFocusIndex === 1 ? "text-[#FF5555] scale-105" : "text-white"}
                  `}
                  style={{
                    backgroundImage: deleteConfirmFocusIndex === 1 ? "url('/images/button_highlighted.png')" : "url('/images/Button_Background.png')",
                    backgroundSize: '100% 100%',
                    imageRendering: 'pixelated',
                  }}
                >
                  DELETE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default ScreenshotsView;

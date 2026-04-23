import { useState, useEffect, useRef, memo } from "react";
import { motion } from "framer-motion";
import { TauriService } from "../../services/TauriService";
import CustomTUModal from "../modals/CustomTUModal";
import { useUI, useConfig, useAudio, useGame } from "../../context/LauncherContext";

interface DeleteConfirmButtonProps {
  label: string;
  onClick: () => void;
  isDanger?: boolean;
}

const DeleteConfirmButton = memo(function DeleteConfirmButton({
  label,
  onClick,
  isDanger = false,
}: DeleteConfirmButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-24 h-10 flex items-center justify-center mc-text-shadow transition-colors ${isDanger ? "text-red-500" : "text-white"
        } ${isHovered ? (isDanger ? "text-red-400" : "text-[#FFFF55]") : ""}`}
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

const VersionsView = memo(function VersionsView() {
  const { setActiveView } = useUI();
  const { profile: selectedProfile, setProfile: setSelectedProfile, animationsEnabled } = useConfig();
  const { playPressSound, playBackSound } = useAudio();
  const { editions, installs: installedVersions, toggleInstall, handleUninstall, handleCancelDownload, deleteCustomEdition: onDeleteEdition, addCustomEdition: onAddEdition, updateCustomEdition: onUpdateEdition, downloadingId, downloadProgress } = useGame();
  const [focusIndex, setFocusIndex] = useState<number>(0);
  const [focusBtn, setFocusBtn] = useState<number>(0);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingEdition, setEditingEdition] = useState<any>(null);
  const [initialPath, setInitialPath] = useState<string>("");
  const [hoveredBtn, setHoveredBtn] = useState<{ row: number, btn: string } | null>(null);
  const [deleteConfirmEdition, setDeleteConfirmEdition] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ITEM_COUNT = editions.length + 3;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;

      if (e.key === "Escape" || e.key === "Backspace") {
        playBackSound();
        setActiveView("main");
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((prev) => (prev >= ITEM_COUNT - 1 ? 0 : prev + 1));
        setFocusBtn(0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev <= 0 ? ITEM_COUNT - 1 : prev - 1));
        setFocusBtn(0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (focusIndex < editions.length) {
          const edition = editions[focusIndex];
          const isInstalled = installedVersions.includes(edition.id);
          const isCustom = edition.id.startsWith("custom_");
          const maxBtn = isInstalled ? (isCustom ? 4 : 3) : 1;
          setFocusBtn((prev) => (prev <= 0 ? maxBtn : prev - 1));
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (focusIndex < editions.length) {
          const edition = editions[focusIndex];
          const isInstalled = installedVersions.includes(edition.id);
          const isCustom = edition.id.startsWith("custom_");
          const maxBtn = isInstalled ? (isCustom ? 4 : 3) : 1;
          setFocusBtn((prev) => (prev >= maxBtn ? 0 : prev + 1));
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusIndex < editions.length) {
          const edition = editions[focusIndex];
          const isInstalled = installedVersions.includes(edition.id);
          const isCustom = edition.id.startsWith("custom_");
          const isDownloading = downloadingId === edition.id;

          if (focusBtn === 0) {
            if (isInstalled) {
              playPressSound();
              setSelectedProfile(edition.id);
            }
          } else if (isInstalled) {
            if (focusBtn === 1) {
              if (!downloadingId) {
                playPressSound();
                toggleInstall(edition.id);
              }
            } else if (focusBtn === 2) {
              playPressSound();
              TauriService.openInstanceFolder(edition.id);
            } else if (focusBtn === 3) {
              if (isCustom) {
                playBackSound();
                onDeleteEdition(edition.id);
              } else {
                playPressSound();
                setDeleteConfirmEdition(edition);
              }
            } else if (focusBtn === 4 && isCustom) {
              playPressSound();
              setEditingEdition(edition);
              setIsImportModalOpen(true);
            }
          } else {
            if (focusBtn === 1) {
              if (isDownloading) {
                handleCancelDownload();
              } else if (!downloadingId) {
                playPressSound();
                toggleInstall(edition.id);
              }
            }
          }
        } else if (focusIndex === editions.length) {
          playPressSound();
          setIsImportModalOpen(true);
        } else if (focusIndex === editions.length + 1) {
          playPressSound();
          handleImportFolder();
        } else {
          playBackSound();
          setActiveView("main");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusIndex,
    focusBtn,
    editions,
    installedVersions,
    downloadingId,
    ITEM_COUNT,
    playPressSound,
    playBackSound,
    setSelectedProfile,
    setActiveView,
    toggleInstall,
    handleCancelDownload,
  ]);

  useEffect(() => {
    if (focusIndex < editions.length && listRef.current) {
      const el = listRef.current.querySelector(`[data-index="${focusIndex}"]`) as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [focusIndex]);

  const handleEditionClick = (edition: any, index: number) => {
    const isInstalled = installedVersions.includes(edition.id);

    if (isInstalled) {
      playPressSound();
      setSelectedProfile(edition.id);
    }
    setFocusIndex(index);
  };

  const handleImportFolder = async () => {
    try {
      const folder = await TauriService.pickFolder();
      if (folder) {
        setInitialPath(folder);
        setIsImportModalOpen(true);
      }
    } catch (e) {
      if (e !== "CANCELED") console.error(e);
    }
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: animationsEnabled ? 0.25 : 0 }}
      className="flex flex-col items-center w-full max-w-2xl outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 pb-2 w-[40%] max-w-[200px] text-center tracking-widest uppercase font-bold">
        Versions
      </h2>

      <div
        className="w-full min-w-[480px] p-6 mb-4"
        style={{
          backgroundImage: "url('/images/background.png')",
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      >
        <div
          ref={listRef}
          className="w-full max-h-[45vh] overflow-y-auto py-2 custom-scrollbar"
        >
          <div className="flex flex-col gap-1">
            {editions.map((edition: any, i: number) => {
              const isInstalled = installedVersions.includes(edition.id);
              const hasAnyInstall = installedVersions.length > 0;
              const isSelected = hasAnyInstall && selectedProfile === edition.id;
              const isFocused = focusIndex === i;
              const isCustom = edition.id.startsWith("custom_");
              const isDownloading = downloadingId === edition.id;
              const isComingSoon = edition.comingSoon;

              return (
                <div
                  key={edition.id}
                  data-index={i}
                  className={`w-[calc(100%-16px)] mx-2 flex items-center gap-3 p-2 rounded-sm ${isSelected && !isComingSoon ? "bg-[#404040]/50" : ""
                    } ${isFocused && !isComingSoon ? "ring-2 ring-white" : ""} ${isComingSoon ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  onMouseEnter={() => !isComingSoon && setFocusIndex(i)}
                >
                  <div className="w-6 flex items-center justify-center flex-shrink-0">
                    {isComingSoon ? (
                      <img
                        src="/images/wool_8.png"
                        alt="Coming Soon"
                        className="w-4 h-4 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : isDownloading ? (
                      <span className="text-xs text-gray-400 font-bold">
                        {Math.floor(downloadProgress || 0)}%
                      </span>
                    ) : isInstalled ? (
                      <img
                        src="/images/wool_5.png"
                        alt="Installed"
                        className="w-4 h-4 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <img
                        src="/images/wool_14.png"
                        alt="Not installed"
                        className="w-4 h-4 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    )}
                  </div>

                  <button
                    onClick={() => !isComingSoon && handleEditionClick(edition, i)}
                    disabled={isComingSoon}
                    className={`flex-1 text-left min-w-0 outline-none rounded ${focusIndex === i && focusBtn === 0 && !isComingSoon ? "ring-2 ring-white" : ""
                      } ${isComingSoon ? "cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      {edition.logo && (
                        <img
                          src={edition.logo}
                          alt=""
                          className="w-5 h-5 object-contain flex-shrink-0"
                          style={{ imageRendering: "pixelated" }}
                        />
                      )}
                      <span
                        className={`text-xl tracking-wide truncate ${isSelected ? "text-white" : "text-black"
                          }`}
                        style={{ textShadow: "none" }}
                      >
                        {edition.name}
                      </span>
                      {isCustom && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#777] text-[#222] font-bold uppercase">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className={`text-base font-medium leading-tight ${isSelected ? "text-[#DDDDDD]" : "text-[#666666]"
                      }`}>
                      {edition.desc}
                    </p>
                  </button>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!isInstalled ? (
                      isDownloading ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelDownload();
                          }}
                          onMouseEnter={() => setHoveredBtn({ row: i, btn: 'cancel' })}
                          onMouseLeave={() => setHoveredBtn(null)}
                          className="w-8 h-8 flex items-center justify-center text-red-600"
                          style={{
                            backgroundImage: (hoveredBtn?.row === i && hoveredBtn?.btn === 'cancel') || (focusIndex === i && focusBtn === 1)
                              ? "url('/images/Button_Square_Highlighted.png')"
                              : "url('/images/Button_Square.png')",
                            backgroundSize: "100% 100%",
                            imageRendering: "pixelated",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      ) : edition.comingSoon ? (
                        <div className="w-8 h-8" />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!downloadingId) toggleInstall(edition.id);
                          }}
                          onMouseEnter={() => setHoveredBtn({ row: i, btn: 'download' })}
                          onMouseLeave={() => setHoveredBtn(null)}
                          className={`w-8 h-8 flex items-center justify-center ${downloadingId ? "text-gray-400 cursor-not-allowed" : "text-[#3a3a3a]"}`}
                          style={{
                            backgroundImage: (hoveredBtn?.row === i && hoveredBtn?.btn === 'download') || (focusIndex === i && focusBtn === 1)
                              ? "url('/images/Button_Square_Highlighted.png')"
                              : "url('/images/Button_Square.png')",
                            backgroundSize: "100% 100%",
                            imageRendering: "pixelated",
                            opacity: downloadingId ? 0.5 : 1,
                          }}
                          disabled={!!downloadingId}
                        >
                          <img
                            src="/images/Download_Icon.png"
                            alt="Download"
                            className="w-6 h-6 object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                        </button>
                      )
                    ) : (
                      <>
                        {isDownloading ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelDownload();
                            }}
                            onMouseEnter={() => setHoveredBtn({ row: i, btn: 'cancel' })}
                            onMouseLeave={() => setHoveredBtn(null)}
                            className="w-8 h-8 flex items-center justify-center text-red-600"
                            style={{
                              backgroundImage: (hoveredBtn?.row === i && hoveredBtn?.btn === 'cancel') || (focusIndex === i && focusBtn === 1)
                                ? "url('/images/Button_Square_Highlighted.png')"
                                : "url('/images/Button_Square.png')",
                              backgroundSize: "100% 100%",
                              imageRendering: "pixelated",
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!downloadingId) toggleInstall(edition.id);
                              }}
                              onMouseEnter={() => setHoveredBtn({ row: i, btn: 'update' })}
                              onMouseLeave={() => setHoveredBtn(null)}
                              className={`w-8 h-8 flex items-center justify-center ${downloadingId ? "text-gray-400 cursor-not-allowed" : "text-[#3a3a3a]"}`}
                              style={{
                                backgroundImage: (hoveredBtn?.row === i && hoveredBtn?.btn === 'update') || (focusIndex === i && focusBtn === 1)
                                  ? "url('/images/Button_Square_Highlighted.png')"
                                  : "url('/images/Button_Square.png')",
                                backgroundSize: "100% 100%",
                                imageRendering: "pixelated",
                                opacity: downloadingId ? 0.5 : 1,
                              }}
                              disabled={!!downloadingId}
                            >
                              <img
                                src="/images/Update_Icon.png"
                                alt="Update"
                                className="w-6 h-6 object-contain"
                                style={{ imageRendering: "pixelated" }}
                              />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playPressSound();
                                TauriService.openInstanceFolder(edition.id);
                              }}
                              onMouseEnter={() => setHoveredBtn({ row: i, btn: 'folder' })}
                              onMouseLeave={() => setHoveredBtn(null)}
                              className="w-8 h-8 flex items-center justify-center text-[#3a3a3a]"
                              style={{
                                backgroundImage: (hoveredBtn?.row === i && hoveredBtn?.btn === 'folder') || (focusIndex === i && focusBtn === 2)
                                  ? "url('/images/Button_Square_Highlighted.png')"
                                  : "url('/images/Button_Square.png')",
                                backgroundSize: "100% 100%",
                                imageRendering: "pixelated",
                              }}
                            >
                              <img
                                src="/images/Folder_Icon.png"
                                alt="Folder"
                                className="w-6 h-6 object-contain"
                                style={{ imageRendering: "pixelated" }}
                              />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playBackSound();
                                setDeleteConfirmEdition(edition);
                              }}
                              onMouseEnter={() => setHoveredBtn({ row: i, btn: 'delete' })}
                              onMouseLeave={() => setHoveredBtn(null)}
                              className="w-8 h-8 flex items-center justify-center text-[#3a3a3a]"
                              style={{
                                backgroundImage: (hoveredBtn?.row === i && hoveredBtn?.btn === 'delete') || (focusIndex === i && focusBtn === 3)
                                  ? "url('/images/Button_Square_Highlighted.png')"
                                  : "url('/images/Button_Square.png')",
                                backgroundSize: "100% 100%",
                                imageRendering: "pixelated",
                              }}
                            >
                              <img
                                src="/images/Trash_Bin_Icon.png"
                                alt="Delete"
                                className="w-6 h-6 object-contain"
                                style={{ imageRendering: "pixelated" }}
                              />
                            </button>
                            {isCustom && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playPressSound();
                                    setEditingEdition(edition);
                                    setIsImportModalOpen(true);
                                  }}
                                  onMouseEnter={() => setHoveredBtn({ row: i, btn: 'edit' })}
                                  onMouseLeave={() => setHoveredBtn(null)}
                                  className="w-8 h-8 flex items-center justify-center text-[#3a3a3a]"
                                  style={{
                                    backgroundImage: (hoveredBtn?.row === i && hoveredBtn?.btn === 'edit') || (focusIndex === i && focusBtn === 4)
                                      ? "url('/images/Button_Square_Highlighted.png')"
                                      : "url('/images/Button_Square.png')",
                                    backgroundSize: "100% 100%",
                                    imageRendering: "pixelated",
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playBackSound();
                                    onDeleteEdition(edition.id);
                                  }}
                                  onMouseEnter={() => setHoveredBtn({ row: i, btn: 'delete' })}
                                  onMouseLeave={() => setHoveredBtn(null)}
                                  className="w-8 h-8 flex items-center justify-center text-red-600"
                                  style={{
                                    backgroundImage: (hoveredBtn?.row === i && hoveredBtn?.btn === 'delete') || (focusIndex === i && focusBtn === 3)
                                      ? "url('/images/Button_Square_Highlighted.png')"
                                      : "url('/images/Button_Square.png')",
                                    backgroundSize: "100% 100%",
                                    imageRendering: "pixelated",
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="w-full flex items-center justify-center gap-4 p-2 mt-1">
              <button
                onClick={() => {
                  playPressSound();
                  setInitialPath("");
                  setIsImportModalOpen(true);
                }}
                onMouseEnter={() => setFocusIndex(editions.length)}
                onMouseLeave={() => setHoveredBtn(null)}
                className="w-8 h-8 flex items-center justify-center text-[#3a3a3a]"
                style={{
                  backgroundImage: (hoveredBtn?.row === editions.length && hoveredBtn?.btn === 'add') || focusIndex === editions.length
                    ? "url('/images/Button_Square_Highlighted.png')"
                    : "url('/images/Button_Square.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>

              <button
                onClick={() => {
                  playPressSound();
                  handleImportFolder();
                }}
                onMouseEnter={() => setFocusIndex(editions.length + 1)}
                onMouseLeave={() => setHoveredBtn(null)}
                title="Import Custom TU"
                className="w-8 h-8 flex items-center justify-center text-[#3a3a3a]"
                style={{
                  backgroundImage: (hoveredBtn?.row === editions.length && hoveredBtn?.btn === 'folder_import') || focusIndex === editions.length + 1
                    ? "url('/images/Button_Square_Highlighted.png')"
                    : "url('/images/Button_Square.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                <img
                  src="/images/Folder_Icon.png"
                  alt="Import Custom TU"
                  className="w-5 h-5 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          data-index={editions.length + 2}
          onMouseEnter={() => setFocusIndex(editions.length + 2)}
          onClick={() => {
            playBackSound();
            setActiveView("main");
          }}
          className="w-48 h-10 flex items-center justify-center text-xl mc-text-shadow outline-none border-none text-white"
          style={{
            backgroundImage: focusIndex === editions.length + 2
              ? "url('/images/button_highlighted.png')"
              : "url('/images/Button_Background.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        >
          Done
        </button>
      </div>

      <CustomTUModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setEditingEdition(null);
          setInitialPath("");
        }}
        onImport={(ed: any) => {
          if (editingEdition) {
            onUpdateEdition(editingEdition.id, ed);
          } else {
            const id = onAddEdition(ed);
            setSelectedProfile(id);
          }
        }}
        playPressSound={playPressSound}
        playBackSound={playBackSound}
        editingEdition={editingEdition}
        initialPath={initialPath}
      />

      {deleteConfirmEdition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="w-[400px] p-6"
            style={{
              backgroundImage: "url('/images/Download_Background.png')",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              imageRendering: "pixelated",
            }}
          >
            <h3 className="text-xl text-white mc-text-shadow mb-4 text-center">
              Delete {deleteConfirmEdition.name}?
            </h3>
            <p className="text-sm text-white mb-6 text-center leading-relaxed">
              Warning: All your saves and worlds for this version will be permanently deleted!
            </p>
            <div className="flex justify-center gap-4">
              <DeleteConfirmButton
                label="Cancel"
                onClick={() => {
                  playBackSound();
                  setDeleteConfirmEdition(null);
                }}
              />
              <DeleteConfirmButton
                label="Delete"
                isDanger
                onClick={() => {
                  playPressSound();
                  handleUninstall(deleteConfirmEdition.id);
                  setDeleteConfirmEdition(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
});

export default VersionsView;

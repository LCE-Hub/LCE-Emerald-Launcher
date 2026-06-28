import { useState, useEffect, useRef, memo } from "react";
import { motion } from "framer-motion";
import { TauriService, PlaytimeResponse } from "../../services/TauriService";
import CustomTUModal from "../modals/CustomTUModal";
import SetUidModal from "../modals/SetUidModal";
import ImportWorldModal from "../modals/ImportWorldModal";
import PlaytimeModal from "../modals/PlaytimeModal";
import CustomizeModal from "../modals/CustomizeModal";
import DownloadDlcModal from "../modals/DownloadDlcModal";
import {
  useUI,
  useConfig,
  useAudio,
  useGame,
} from "../../context/LauncherContext";
import { ScreenshotImage } from "../common/ScreenshotImage";
import type { Edition } from "../../types/edition";
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
      className={`w-24 h-10 flex items-center justify-center mc-text-shadow transition-colors ${
        isDanger ? "text-red-500" : "text-white"
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

function formatPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return seconds > 0 ? `${seconds}s` : "";
}

const VersionsView = memo(function VersionsView() {
  const { setActiveView } = useUI();
  const {
    profile: selectedProfile,
    setProfile: setSelectedProfile,
    animationsEnabled,
  } = useConfig();
  const { playPressSound, playBackSound } = useAudio();
  const {
    editions,
    installs: installedVersions,
    toggleInstall,
    handleUninstall,
    handleCancelDownload,
    deleteCustomEdition: onDeleteEdition,
    addCustomEdition: onAddEdition,
    updateCustomEdition: onUpdateEdition,
    downloadingIds,
    downloadProgress,
    updatesAvailable,
    addToSteam,
    cycleBranch,
    customizations,
    updateCustomization,
    saveCustomPath,
  } = useGame();
  const { isDayTime } = useConfig();
  const [focusIndex, setFocusIndex] = useState<number>(0);
  const [focusBtn, setFocusBtn] = useState<number>(0);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSetUidModalOpen, setIsSetUidModalOpen] = useState(false);
  const [setUidTargetId, setSetUidTargetId] = useState("");
  const [editingEdition, setEditingEdition] = useState<Edition | null>(null);
  const [isImportWorldModalOpen, setIsImportWorldModalOpen] = useState(false);
  const [importWorldTarget, setImportWorldTarget] = useState<{ id: string; name: string } | null>(null);
  const [isPlaytimeModalOpen, setIsPlaytimeModalOpen] = useState(false);
  const [playtimeTarget, setPlaytimeTarget] = useState<{ id: string; name: string } | null>(null);
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [customizeTarget, setCustomizeTarget] = useState<Edition | null>(null);
  const [playtimeMap, setPlaytimeMap] = useState<Record<string, PlaytimeResponse>>({});
  const [initialPath, setInitialPath] = useState<string>("");
  const [hoveredBtn, setHoveredBtn] = useState<{
    row: number;
    btn: string;
  } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteConfirmEdition, setDeleteConfirmEdition] = useState<Edition | null>(null);
  const [isDlcModalOpen, setIsDlcModalOpen] = useState(false);
  const [dlcTargetEdition, setDlcTargetEdition] = useState<Edition | null>(null);
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
          const maxBtn = isInstalled ? (isCustom ? 6 : 4) : 1;
          setFocusBtn((prev) => (prev <= 0 ? maxBtn : prev - 1));
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (focusIndex < editions.length) {
          const edition = editions[focusIndex];
          const isInstalled = installedVersions.includes(edition.id);
          const isCustom = edition.id.startsWith("custom_");
          const maxBtn = isInstalled ? (isCustom ? 6 : 4) : 1;
          setFocusBtn((prev) => (prev >= maxBtn ? 0 : prev + 1));
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusIndex < editions.length) {
          const edition = editions[focusIndex];
          const isInstalled = installedVersions.includes(edition.instanceId);
          const isDownloading = downloadingIds.includes(edition.instanceId);
          if (focusBtn === 0) {
            if (isInstalled) {
              playPressSound();
              setOpenMenuId(openMenuId === edition.id ? null : edition.id);
            } else {
              if (!isDownloading) {
                playPressSound();
                toggleInstall(edition.instanceId);
              } else {
                handleCancelDownload(edition.instanceId);
              }
            }
          } else if (focusBtn === 1 && !isInstalled) {
            playPressSound();
            setOpenMenuId(openMenuId === edition.id ? null : edition.id);
          } else if (focusBtn === 2) {
            playPressSound();
            cycleBranch(edition.id);
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
    downloadingIds,
    ITEM_COUNT,
    playPressSound,
    playBackSound,
    setSelectedProfile,
    setActiveView,
    toggleInstall,
    handleCancelDownload,
    addToSteam,
    isDayTime,
  ]);

  useEffect(() => {
    if (focusIndex < editions.length && listRef.current) {
      const el = listRef.current.querySelector(
        `[data-index="${focusIndex}"]`,
      ) as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [focusIndex]);

  useEffect(() => {
    const fetchPlaytimes = async () => {
      const map: Record<string, PlaytimeResponse> = {};
      await Promise.all(installedVersions.map(async (id) => {
        try {
          map[id] = await TauriService.getPlaytime(id);
        } catch (e) {
          console.error(e);
        }
      }));
      setPlaytimeMap(map);
    };
    fetchPlaytimes();
  }, [installedVersions]);

  const handleEditionClick = (edition: Edition, index: number) => {
    const isInstalled = installedVersions.includes(edition.instanceId);
    if (isInstalled) {
      playPressSound();
      setSelectedProfile(edition.instanceId);
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

  const handleImportWorld = (instanceId: string) => {
    const edition = editions.find((e: Edition) => e.instanceId === instanceId);
    setImportWorldTarget({ id: instanceId, name: edition?.name ?? instanceId });
    setIsImportWorldModalOpen(true);
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: animationsEnabled ? 0.25 : 0 }}
      className="flex flex-col items-center w-full max-w-5xl outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 pb-2 w-[40%] max-w-[200px] text-center tracking-widest uppercase font-bold">
        Versions
      </h2>

      <div
        className="w-full min-w-[480px] p-6 mb-4 mc-options-bg"
      >
        <div
          ref={listRef}
          className="w-full max-h-[45vh] overflow-y-auto py-2 custom-scrollbar"
        >
          <div className="flex flex-col gap-1">
            {editions.map((edition: Edition, i: number) => {
              const isInstalled = installedVersions.includes(
                edition.instanceId,
              );
              const hasAnyInstall = installedVersions.length > 0;
              const isSelected =
                hasAnyInstall && selectedProfile === edition.instanceId;
              const isFocused = focusIndex === i;
              const isCustom = edition.id.startsWith("custom_");
              const isDownloading = downloadingIds.includes(edition.instanceId);
              const isComingSoon = edition.comingSoon;

              return (
                <div
                  key={edition.id}
                  data-index={i}
                  className={`w-[calc(100%-16px)] mx-2 flex items-center gap-3 p-2 rounded-sm ${
                    isSelected && !isComingSoon ? "bg-[#404040]/50" : ""
                  } ${isFocused && !isComingSoon ? "ring-2 ring-white" : ""} ${
                    isComingSoon ? "opacity-50 cursor-not-allowed" : ""
                  } relative ${openMenuId === edition.id ? "z-50" : "z-0"}`}
                  onMouseEnter={() => !isComingSoon && setFocusIndex(i)}
                >
                  <div className="w-6 flex items-center justify-center flex-shrink-0">
                    {isDownloading ? (
                      <span className="text-xs text-gray-400 font-bold">
                        {Math.floor(downloadProgress[edition.instanceId] || 0)}%
                      </span>
                    ) : edition.logo ? (
                      edition.logo.startsWith("http") ||
                      edition.logo.startsWith("/images") ? (
                        <img
                          src={edition.logo}
                          alt=""
                          className={`w-6 h-6 object-contain ${isComingSoon ? "opacity-40 grayscale" : ""}`}
                          style={{ imageRendering: "pixelated" }}
                        />
                      ) : (
                        <ScreenshotImage
                          path={edition.logo}
                          alt=""
                          className={`w-6 h-6 object-contain ${isComingSoon ? "opacity-40 grayscale" : ""}`}
                          style={{ imageRendering: "pixelated" }}
                        />
                      )
                    ) : (
                      <div className="w-6 h-6 bg-gray-600/30 rounded-sm" />
                    )}
                  </div>

                  <div
                    onClick={() =>
                      !isComingSoon && handleEditionClick(edition, i)
                    }
                    className={`flex-1 text-left min-w-0 outline-none rounded cursor-pointer ${
                      focusIndex === i && focusBtn === 0 && !isComingSoon
                        ? "ring-2 ring-white"
                        : ""
                    } ${isComingSoon ? "cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xl tracking-wide truncate ${
                          isSelected ? "text-white" : "text-black"
                        }`}
                        style={{ textShadow: "none" }}
                      >
                        {edition.name}
                      </span>
                      {isInstalled && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPressSound();
                            setPlaytimeTarget({ id: edition.instanceId, name: edition.name });
                            setIsPlaytimeModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-2 py-1 bg-black/60 border border-[#555] hover:border-[#FFFF55] group transition-colors flex-shrink-0"
                          title="View playtime"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#AAAAAA"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="group-hover:stroke-[#FFFF55] transition-colors"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span className="text-xs text-[#AAAAAA] group-hover:text-[#FFFF55] leading-none transition-colors">
                            {playtimeMap[edition.instanceId] ? formatPlaytime(playtimeMap[edition.instanceId].totalSeconds) : ""}
                          </span>
                        </button>
                      )}
                      {edition.category &&
                        edition.category.map((cat: string) => (
                          <span
                            key={cat}
                            className="text-[9px] px-1.5 py-0.5 bg-[#444] text-[#aaa] font-bold uppercase border border-[#555] mc-text-shadow"
                          >
                            {cat}
                          </span>
                        ))}
                      {isCustom && !edition.category && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#777] text-[#222] font-bold uppercase">
                          Custom
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-base font-medium leading-tight ${
                        isSelected ? "text-[#DDDDDD]" : "text-[#666666]"
                      }`}
                    >
                      {edition.desc}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 relative">
                    {!isInstalled && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isDownloading) {
                            toggleInstall(edition.instanceId);
                          } else {
                            handleCancelDownload(edition.instanceId);
                          }
                        }}
                        onMouseEnter={() =>
                          setHoveredBtn({ row: i, btn: "main" })
                        }
                        onMouseLeave={() => setHoveredBtn(null)}
                        className={`w-9 h-9 flex items-center justify-center ${
                          isDownloading ? "opacity-50" : ""
                        }`}
                        style={{
                          backgroundImage:
                            (hoveredBtn?.row === i &&
                              hoveredBtn?.btn === "main") ||
                            (focusIndex === i && focusBtn === 0)
                              ? "url('/images/Button_Square_Highlighted.png')"
                              : "url('/images/Button_Square.png')",
                          backgroundSize: "100% 100%",
                          imageRendering: "pixelated",
                        }}
                      >
                        <img
                          src={
                            isDownloading
                              ? "/images/Trash_Bin_Icon.png"
                              : "/images/Download_Icon.png"
                          }
                          alt=""
                          className="w-5 h-5 object-contain"
                          style={{
                            imageRendering: "pixelated",
                            filter: isDownloading
                              ? "hue-rotate(300deg)"
                              : "none",
                          }}
                        />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playPressSound();
                        setOpenMenuId(
                          openMenuId === edition.id ? null : edition.id,
                        );
                      }}
                      onMouseEnter={() =>
                        setHoveredBtn({ row: i, btn: "menu" })
                      }
                      onMouseLeave={() => setHoveredBtn(null)}
                      className="w-9 h-9 flex flex-col items-center justify-center gap-1 transition-colors relative"
                      style={{
                        backgroundImage:
                          (hoveredBtn?.row === i &&
                            hoveredBtn?.btn === "menu") ||
                          (focusIndex === i &&
                            (focusBtn === 0 || focusBtn === 1))
                            ? "url('/images/Button_Square_Highlighted.png')"
                            : "url('/images/Button_Square.png')",
                        backgroundSize: "100% 100%",
                        imageRendering: "pixelated",
                        filter: updatesAvailable?.[edition.instanceId]
                          ? "drop-shadow(0 0 4px rgba(255,255,0,0.8))"
                          : "none",
                      }}
                    >
                      <div
                        className={`w-1.5 h-1.5 ${updatesAvailable?.[edition.instanceId] ? "bg-[#ffff55]" : "bg-white"}`}
                      />
                      <div
                        className={`w-1.5 h-1.5 ${updatesAvailable?.[edition.instanceId] ? "bg-[#ffff55]" : "bg-white"}`}
                      />
                      <div
                        className={`w-1.5 h-1.5 ${updatesAvailable?.[edition.instanceId] ? "bg-[#ffff55]" : "bg-white"}`}
                      />
                    </button>

                    {openMenuId === edition.id && (
                      <div
                        className="absolute right-0 top-11 w-48 bg-[#1a1a1a] border-2 border-[#555] z-[100] shadow-2xl p-0.5 animate-in fade-in zoom-in duration-75"
                        style={{
                          imageRendering: "pixelated",
                        }}
                      >
                        {updatesAvailable?.[edition.instanceId] && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playPressSound();
                              toggleInstall(edition.instanceId);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-[#ffff55] hover:text-white hover:bg-[#ffff55]/20 flex items-center gap-2 group transition-colors mc-text-shadow font-bold border-b border-white/5 mb-1"
                          >
                            <img
                              src="/images/Download_Icon.png"
                              alt=""
                              className="w-3 h-3 object-contain"
                              style={{ imageRendering: "pixelated" }}
                            />
                            Update Available!
                          </button>
                        )}
                        {!isInstalled && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              playPressSound();
                              setOpenMenuId(null);
                              try {
                                const folder = await TauriService.pickFolder();
                                if (folder) {
                                  await saveCustomPath(edition.instanceId, folder);
                                  toggleInstall(edition.instanceId);
                                }
                              } catch (err) {
                                if (err !== "CANCELED") console.error(err);
                              }
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-[#dddddd] flex items-center gap-2 mc-text-shadow"
                          >
                            <img
                              src="/images/Download_Icon.png"
                              alt=""
                              className="w-3.5 h-3.5 object-contain"
                              style={{ imageRendering: "pixelated" }}
                            />
                            Download to custom path
                          </button>
                        )}
                        {edition.officialDLC && isInstalled ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playPressSound();
                              setDlcTargetEdition(edition);
                              setIsDlcModalOpen(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-[10px] text-[#dddddd] flex items-center gap-2 mc-text-shadow"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="w-3.5 h-3.5"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            Download DLC
                          </button>
                        ) : null}
                        {Array.isArray(edition.branches) &&
                          edition.branches.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playPressSound();
                                cycleBranch(edition.id);
                              }}
                              className="w-full text-left px-3 py-1.5 text-[10px] text-white mc-text-shadow flex items-center justify-between group"
                            >
                              <span className="text-[#AAAAAA] font-bold">
                                Channel
                              </span>
                              <span className="text-[#ffff55] font-bold">
                                {edition.selectedBranch ?? "Latest"}
                              </span>
                            </button>
                          )}
                        <div className="h-[1px] bg-white/5 my-0.5 mx-1" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPressSound();
                            TauriService.openInstanceFolder(edition.instanceId);
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-[#dddddd] flex items-center gap-2 mc-text-shadow"
                        >
                          <img
                            src="/images/Folder_Icon.png"
                            alt=""
                            className="w-3.5 h-3.5 object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                          Open Folder
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPressSound();
                            const PANORAMA_PROFILES = [
                              "legacy_evolved",
                              "vanilla_tu19",
                              "360revived",
                              "vanilla_tu24",
                            ];
                            const panoId = PANORAMA_PROFILES.includes(
                              edition.id,
                            )
                              ? edition.id
                              : "vanilla_tu19";
                            const panoramaUrl = `/panorama/${panoId}_Panorama_Background_${isDayTime ? "Day" : "Night"}.png`;
                            addToSteam(
                              edition.instanceId,
                              edition.name,
                              edition.titleImage ?? "",
                              panoramaUrl,
                            );
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-[#dddddd] flex items-center gap-2 mc-text-shadow"
                        >
                          <img
                            src="/images/steam.png"
                            alt=""
                            className="w-3.5 h-3.5 object-contain invert brightness-0"
                            style={{ imageRendering: "pixelated" }}
                          />
                          Add to Steam
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPressSound();
                            handleImportWorld(edition.instanceId);
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-[#dddddd] flex items-center gap-2 mc-text-shadow"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="w-3.5 h-3.5"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          Import World
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPressSound();
                            TauriService.backupInstance(edition.instanceId).catch((err) => {
                              if (err !== "CANCELED") console.error(err);
                            });
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-[#dddddd] flex items-center gap-2 mc-text-shadow"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="w-3.5 h-3.5"
                          >
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                          </svg>
                          Backup
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            playPressSound();
                            setOpenMenuId(null);
                            try {
                              await TauriService.restoreInstance();
                            } catch (err) {
                              if (err !== "CANCELED") console.error(err);
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-[#dddddd] flex items-center gap-2 mc-text-shadow"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="w-3.5 h-3.5"
                          >
                            <path d="M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z" />
                            <polyline points="12 7 12 12 15 15" />
                          </svg>
                          Restore
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPressSound();
                            setCustomizeTarget(edition);
                            setIsCustomizeModalOpen(true);
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-[#dddddd] flex items-center gap-2 mc-text-shadow"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="w-3.5 h-3.5"
                          >
                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                          Customize
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPressSound();
                            setSetUidTargetId(edition.instanceId);
                            setIsSetUidModalOpen(true);
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-[#dddddd] flex items-center gap-2 mc-text-shadow"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="w-3.5 h-3.5"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                          Set UID
                        </button>
                        {isCustom ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playPressSound();
                              setEditingEdition(edition);
                              setIsImportModalOpen(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-[#aaaaaa] flex items-center gap-2 mc-text-shadow"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="w-3.5 h-3.5"
                            >
                              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                            Edit Custom
                          </button>
                        ) : null}
                        <div className="h-[2px] bg-[#555] my-0.5 mx-1" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playBackSound();
                            if (isCustom) {
                              onDeleteEdition(edition.id);
                            } else {
                              setDeleteConfirmEdition(edition);
                            }
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors mc-text-shadow font-bold"
                        >
                          <img
                            src="/images/Trash_Bin_Icon.png"
                            alt=""
                            className="w-3.5 h-3.5 object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                          {isCustom ? "Remove Custom" : "Uninstall"}
                        </button>
                      </div>
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
                  backgroundImage:
                    (hoveredBtn?.row === editions.length &&
                      hoveredBtn?.btn === "add") ||
                    focusIndex === editions.length
                      ? "url('/images/Button_Square_Highlighted.png')"
                      : "url('/images/Button_Square.png')",
                  backgroundSize: "100% 100%",
                  imageRendering: "pixelated",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="square"
                >
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
                  backgroundImage:
                    (hoveredBtn?.row === editions.length &&
                      hoveredBtn?.btn === "folder_import") ||
                    focusIndex === editions.length + 1
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
            backgroundImage:
              focusIndex === editions.length + 2
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
        onImport={(ed: { name: string; desc: string; url: string; path?: string }) => {
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

      <SetUidModal
        isOpen={isSetUidModalOpen}
        onClose={() => setIsSetUidModalOpen(false)}
        playPressSound={playPressSound}
        playBackSound={playBackSound}
        instances={editions}
        installedVersions={installedVersions}
        targetInstanceId={setUidTargetId}
      />

      <ImportWorldModal
        isOpen={isImportWorldModalOpen}
        onClose={() => { setIsImportWorldModalOpen(false); setImportWorldTarget(null); }}
        playPressSound={playPressSound}
        playBackSound={playBackSound}
        targetInstanceId={importWorldTarget?.id ?? ""}
        targetInstanceName={importWorldTarget?.name ?? ""}
      />

      <PlaytimeModal
        isOpen={isPlaytimeModalOpen}
        onClose={() => { setIsPlaytimeModalOpen(false); setPlaytimeTarget(null); }}
        playBackSound={playBackSound}
        instanceId={playtimeTarget?.id ?? ""}
        instanceName={playtimeTarget?.name ?? ""}
      />

      <CustomizeModal
        isOpen={isCustomizeModalOpen}
        onClose={() => { setIsCustomizeModalOpen(false); setCustomizeTarget(null); }}
        playPressSound={playPressSound}
        playBackSound={playBackSound}
        editionName={customizeTarget?.name ?? ""}
        currentTitleImage={customizeTarget ? customizations[customizeTarget.instanceId]?.titleImage || customizeTarget.titleImage : undefined}
        currentPanorama={customizeTarget ? customizations[customizeTarget.instanceId]?.panorama || customizeTarget.panorama : undefined}
        onSave={(updates) => {
          if (customizeTarget) {
            updateCustomization(customizeTarget.instanceId, updates);
          }
        }}
      />

      <DownloadDlcModal
        isOpen={isDlcModalOpen}
        onClose={() => { setIsDlcModalOpen(false); setDlcTargetEdition(null); }}
        playPressSound={playPressSound}
        playBackSound={playBackSound}
        editionName={dlcTargetEdition?.name ?? ""}
        instanceId={dlcTargetEdition?.instanceId ?? ""}
        officialDLC={dlcTargetEdition?.officialDLC ?? ""}
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
              Warning: All your saves and worlds for this version will be
              permanently deleted!
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

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";
import { PckService } from "../../services/PckService";
import { PCKFile, PCKAsset, PCKAssetType } from "../../types/pck";
import SkinPreview3D from "../common/SkinPreview3D";
export default function PckEditorView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { animationsEnabled } = useConfig();
  const [pck, setPck] = useState<PCKFile | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditingProperty, setIsEditingProperty] = useState<{ idx: number, key: string, val: string } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<{ message: string, type: "success" | "error" } | null>(null);
  const [showTypeModal, setShowTypeModal] = useState<{ file: File, data: Uint8Array } | null>(null);
  const [isChangingType, setIsChangingType] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addAssetInputRef = useRef<HTMLInputElement>(null);
  const treeData = useMemo(() => {
    if (!pck) return [];
    interface TempNode {
      name: string;
      path: string;
      isFolder: boolean;
      asset?: PCKAsset;
      children: Record<string, TempNode>;
    }

    const root: Record<string, TempNode> = {};
    pck.files.forEach(asset => {
      if (searchTerm && !asset.path.toLowerCase().includes(searchTerm.toLowerCase())) return;
      const parts = asset.path.split("/");
      let currentLevel = root;
      let currentPath = "";
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = index === parts.length - 1;
        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            path: currentPath,
            isFolder: !isLast,
            asset: isLast ? asset : undefined,
            children: {}
          };
        }
        currentLevel = currentLevel[part].children;
      });
    });

    const convert = (nodes: Record<string, TempNode>): any[] => {
      return Object.values(nodes)
        .sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        })
        .map(node => ({
          ...node,
          children: convert(node.children)
        }));
    };

    return convert(root);
  }, [pck, searchTerm]);

  const selectedAsset = useMemo(() => {
    return pck?.files.find(f => f.id === selectedAssetId) || null;
  }, [pck, selectedAssetId]);

  const [assetPreview, setAssetPreview] = useState<{ id: string, url: string } | null>(null);

  useEffect(() => {
    if (!selectedAsset || ![PCKAssetType.SKIN, PCKAssetType.CAPE, PCKAssetType.TEXTURE, PCKAssetType.SKIN_DATA].includes(selectedAsset.type)) {
      setAssetPreview(null);
      return;
    }

    const blob = new Blob([selectedAsset.data as any], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    setAssetPreview({ id: selectedAsset.id, url });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedAsset]);

  const assetPreviewUrl = (assetPreview && selectedAsset && assetPreview.id === selectedAsset.id) ? assetPreview.url : null;

  const toggleFolder = (path: string) => {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedFolders(next);
  };

  const renderTree = (nodes: any[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedFolders.has(node.path) || !!searchTerm;
      const isSelected = selectedAssetId === node.asset?.id;
      return (
        <div key={node.path} className="flex flex-col">
          <div
            onClick={() => {
              if (node.isFolder) {
                toggleFolder(node.path);
              } else {
                playPressSound();
                setSelectedAssetId(node.asset.id);
              }
            }}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
            className={`flex items-center gap-2 p-2 cursor-pointer transition-all border-l-2 ${isSelected
              ? "bg-[#FFFF55]/10 border-[#FFFF55] text-[#FFFF55]"
              : "border-transparent hover:bg-white/5 text-white"
              } ${node.isFolder ? "font-bold" : ""}`}
          >
            {node.isFolder ? (
              <img
                src={isExpanded ? "/images/Settings_Arrow_Down.png" : "/images/Settings_Arrow_Right.png"}
                className="w-3 h-3 object-contain opacity-80"
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <div className="w-3" />
            )}
            <img
              src={node.isFolder ? "/images/Folder_Icon.png" : "/images/tools/pck.png"}
              className={`w-4 h-4 object-contain ${isSelected ? "" : "grayscale opacity-60"}`}
              style={{ imageRendering: "pixelated" }}
            />
            <span className="truncate mc-text-shadow text-base">
              {node.name}
            </span>
            {!node.isFolder && (
              <span className="ml-auto text-[10px] opacity-40 uppercase">
                {(node.asset.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
          {node.isFolder && isExpanded && (
            <div className="flex flex-col">
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    playPressSound();
    const buffer = await file.arrayBuffer();
    try {
      const parsed = await PckService.readPCK(buffer);
      setPck(parsed);
      setSelectedAssetId(parsed.files[0]?.id || null);
      setExpandedFolders(new Set());
    } catch (err) {
      console.error("Failed to parse PCK", err);
      showNotification("Failed to parse PCK", "error");
    }
  };

  const handleNewPCK = () => {
    playPressSound();
    const newPck: PCKFile = {
      version: 3,
      endianness: "little",
      xmlSupport: false,
      properties: ["ANIM", "BOX"],
      files: []
    };
    setPck(newPck);
    setSelectedAssetId(null);
    setExpandedFolders(new Set());
    showNotification("New PCK Created");
  };


  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleExportAsset = (asset: PCKAsset) => {
    playPressSound();
    const blob = new Blob([asset.data as any]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = asset.path.split("/").pop() || "asset";
    a.click();
    URL.revokeObjectURL(url);
    showNotification(`Exported: ${asset.path.split("/").pop()}`);
  };

  const handleDeleteAsset = (id: string) => {
    if (!pck) return;
    playBackSound();
    const newFiles = pck.files.filter(f => f.id !== id);
    const assetPath = pck.files.find(f => f.id === id)?.path;
    setPck({ ...pck, files: newFiles });
    if (selectedAssetId === id) setSelectedAssetId(newFiles[0]?.id || null);
    showNotification(`Deleted: ${assetPath?.split("/").pop()}`);
  };

  const handleReplaceAsset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!pck || !selectedAssetId) return;
    const file = e.target.files?.[0];
    if (!file) return;

    playPressSound();
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    const newFiles = pck.files.map(f => f.id === selectedAssetId ? { ...f, data, size: data.length } : f);
    setPck({ ...pck, files: newFiles });
    e.target.value = "";
    showNotification("Asset Replaced");
  };

  const handleAddAsset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!pck) return;
    const file = e.target.files?.[0];
    if (!file) return;
    playPressSound();
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    setShowTypeModal({ file, data });
    e.target.value = "";
  };

  const confirmAddAsset = (type: PCKAssetType) => {
    if (!pck || !showTypeModal) return;
    const { file, data } = showTypeModal;
    const newAsset: PCKAsset = {
      id: Math.random().toString(36).substr(2, 9),
      path: file.name,
      type,
      size: data.length,
      data,
      properties: []
    };

    if (type === PCKAssetType.SKIN || type === PCKAssetType.CAPE) {
      newAsset.properties.push({ key: "ANIM", value: "0" });
    }

    setPck({ ...pck, files: [...pck.files, newAsset] });
    setSelectedAssetId(newAsset.id);
    setShowTypeModal(null);
    showNotification("Asset Added");
  };

  const handlePropertyEdit = (idx: number, newVal: string, isKey = false) => {
    if (!pck || !selectedAssetId) return;
    const newFiles = pck.files.map(f => {
      if (f.id === selectedAssetId) {
        const newProps = [...f.properties];
        if (isKey) {
          newProps[idx] = { ...newProps[idx], key: newVal };
          if (!pck.properties.includes(newVal)) {
            pck.properties.push(newVal);
          }
        } else {
          newProps[idx] = { ...newProps[idx], value: newVal };
        }
        return { ...f, properties: newProps };
      }
      return f;
    });
    setPck({ ...pck, files: newFiles });
  };

  const handleAddProperty = () => {
    if (!pck || !selectedAssetId) return;
    playPressSound();
    const newFiles = pck.files.map(f => {
      if (f.id === selectedAssetId) {
        return {
          ...f,
          properties: [...f.properties, { key: "NEW_PROPERTY", value: "0" }]
        };
      }
      return f;
    });
    setPck({ ...pck, files: newFiles });
  };

  const handleRemoveProperty = (idx: number) => {
    if (!pck || !selectedAssetId) return;
    playBackSound();
    const newFiles = pck.files.map(f => {
      if (f.id === selectedAssetId) {
        const newProps = [...f.properties];
        newProps.splice(idx, 1);
        return { ...f, properties: newProps };
      }
      return f;
    });
    setPck({ ...pck, files: newFiles });
  };

  const handleTypeChange = (newType: PCKAssetType) => {
    if (!pck || !selectedAssetId) return;
    playPressSound();
    const newFiles = pck.files.map(f => {
      if (f.id === selectedAssetId) {
        return { ...f, type: newType };
      }
      return f;
    });
    setPck({ ...pck, files: newFiles });
  };

  const handleMoveAsset = (direction: 'up' | 'down') => {
    if (!pck || !selectedAssetId) return;
    const idx = pck.files.findIndex(f => f.id === selectedAssetId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= pck.files.length) return;
    playPressSound();
    const newFiles = [...pck.files];
    [newFiles[idx], newFiles[newIdx]] = [newFiles[newIdx], newFiles[idx]];
    setPck({ ...pck, files: newFiles });
  };

  const handleSavePCK = () => {
    if (!pck) return;
    playPressSound();
    const buffer = PckService.serializePCK(pck);
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pck.files.length > 0 ? "new.pck" : "empty.pck";
    a.click();
    URL.revokeObjectURL(url);
    showNotification("PCK Saved Successfully");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "Escape" || e.key === "Backspace") {
        if (isEditingProperty) {
          setIsEditingProperty(null);
          return;
        }
        playBackSound();
        setActiveView("devtools");
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playBackSound, setActiveView, isEditingProperty]);

  const getTypeColor = (type: PCKAssetType) => {
    switch (type) {
      case PCKAssetType.SKIN: return "#FFFF55";
      case PCKAssetType.SKIN_DATA: return "#FFFF55";
      case PCKAssetType.CAPE: return "#AA00AA";
      case PCKAssetType.TEXTURE: return "#55FFFF";
      case PCKAssetType.AUDIO_DATA: return "#55FF55";
      case PCKAssetType.UI_DATA: return "#FFAA00";
      case PCKAssetType.LOCALISATION: return "#FF55FF";
      case PCKAssetType.MODELS: return "#5555FF";
      default: return "#AAAAAA";
    }
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-6xl h-[85vh] outline-none"
    >
      <div className="w-full flex justify-between items-center mb-4 px-8">
        <h2 className="text-2xl text-white mc-text-shadow border-b-2 border-[#373737] pb-1 tracking-widest uppercase font-bold">
          PCK Editor
        </h2>
        <div className="flex gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 text-white mc-text-shadow transition-all hover:text-[#FFFF55] text-lg outline-none"
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Open PCK
          </button>
          <button
            onClick={handleNewPCK}
            className="px-6 py-2 text-white mc-text-shadow transition-all hover:text-[#FFFF55] text-lg outline-none"
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            New PCK
          </button>
          <button
            onClick={handleSavePCK}
            disabled={!pck}
            className={`px-6 py-2 text-white mc-text-shadow transition-all hover:text-[#FFFF55] text-lg outline-none ${!pck ? "opacity-50 grayscale" : ""}`}
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Save PCK
          </button>
        </div>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileLoad} className="hidden" accept=".pck" />
      <input type="file" ref={replaceInputRef} onChange={handleReplaceAsset} className="hidden" />
      <input type="file" ref={addAssetInputRef} onChange={handleAddAsset} className="hidden" />
      {!pck ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-12"
          style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <img src="/images/tools/pck.png" className="w-32 h-32 mb-8 opacity-20 grayscale" style={{ imageRendering: "pixelated" }} />
          <h3 className="text-2xl text-white/40 mc-text-shadow italic">Open a PCK file to begin editing</h3>
        </div>
      ) : (
        <div className="flex-1 w-full flex gap-4 overflow-hidden">
          <div className="w-2/3 flex flex-col p-4" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
            <div className="mb-4 flex gap-4">
              <input
                type="text"
                placeholder="Search assets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 bg-black/40 border-2 border-[#373737] text-white px-4 py-2 outline-none focus:border-[#FFFF55] transition-colors"
              />
              <button
                onClick={() => addAssetInputRef.current?.click()}
                className="px-4 py-2 text-white mc-text-shadow text-sm shrink-0"
                style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
              >
                Add Asset
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {renderTree(treeData)}
            </div>
          </div>
          <div className="w-1/3 flex flex-col p-6 overflow-y-auto" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
            <AnimatePresence mode="wait">
              {!selectedAsset ? (
                <div className="flex-1 flex flex-col items-center justify-center text-white/20 italic gap-4">
                  <img src="/images/tools/pck.png" className="w-16 h-16 opacity-10 grayscale" style={{ imageRendering: "pixelated" }} />
                  <span>Select an asset to view details</span>
                </div>
              ) : (
                <motion.div
                  key={selectedAsset.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col h-full"
                >
                  <div className="flex justify-between items-start mb-4 border-b border-[#373737] pb-2">
                    <div className="flex flex-col gap-1 min-w-0 flex-1 pr-4">
                      <h3 className="text-[#FFFF55] text-xl mc-text-shadow truncate">
                        {selectedAsset.path.split("/").pop()}
                      </h3>
                      <div className="relative">
                        <button
                          onClick={() => setIsChangingType(!isChangingType)}
                          className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-sm transition-all group/type"
                        >
                          <span className="text-[10px] uppercase tracking-widest mc-text-shadow font-bold" style={{ color: getTypeColor(selectedAsset.type) }}>
                            {PCKAssetType[selectedAsset.type].replace(/_/g, " ")}
                          </span>
                          <img
                            src="/images/Settings_Arrow_Down.png"
                            className={`w-2 h-2 object-contain opacity-40 group-hover/type:opacity-60 transition-transform ${isChangingType ? "rotate-180" : ""}`}
                            style={{ imageRendering: "pixelated" }}
                          />
                        </button>

                        <AnimatePresence>
                          {isChangingType && (
                            <>
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[120]"
                                onClick={() => setIsChangingType(false)}
                              />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                className="absolute top-full left-0 mt-2 z-[130] p-2 min-w-[180px] grid grid-cols-1 gap-1 shadow-2xl"
                                style={{
                                  backgroundImage: "url('/images/frame_background.png')",
                                  backgroundSize: "100% 100%",
                                  imageRendering: "pixelated"
                                }}
                              >
                                {Object.keys(PCKAssetType)
                                  .filter(k => isNaN(Number(k)))
                                  .map((typeName) => {
                                    const typeVal = PCKAssetType[typeName as keyof typeof PCKAssetType];
                                    const isActive = selectedAsset.type === typeVal;
                                    return (
                                      <button
                                        key={typeName}
                                        onClick={() => {
                                          handleTypeChange(typeVal);
                                          setIsChangingType(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-[10px] uppercase tracking-widest transition-all border-l-2 ${isActive
                                          ? "bg-white/10 border-[#FFFF55] text-white"
                                          : "border-transparent text-white/40 hover:text-white/80 hover:bg-white/5"
                                          }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getTypeColor(typeVal) }} />
                                          {typeName.replace(/_/g, " ")}
                                        </div>
                                      </button>
                                    );
                                  })}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleMoveAsset('up')} className="hover:scale-110 active:scale-95 transition-transform">
                        <img src="/images/Settings_Arrow_Up.png" className="w-4 h-4 object-contain" style={{ imageRendering: "pixelated" }} />
                      </button>
                      <button onClick={() => handleMoveAsset('down')} className="hover:scale-110 active:scale-95 transition-transform">
                        <img src="/images/Settings_Arrow_Down.png" className="w-4 h-4 object-contain" style={{ imageRendering: "pixelated" }} />
                      </button>
                    </div>
                  </div>

                  {assetPreviewUrl && (
                    <div className="w-full h-[550px] bg-black/40 border-2 border-[#373737] mb-6 flex items-center justify-center overflow-hidden relative group">
                      {(selectedAsset.type === PCKAssetType.SKIN || selectedAsset.type === PCKAssetType.CAPE || selectedAsset.type === PCKAssetType.SKIN_DATA) ? (
                        <SkinPreview3D key={selectedAsset.id} asset={selectedAsset} previewUrl={assetPreviewUrl || undefined} className="w-full h-full" />
                      ) : (
                        <img src={assetPreviewUrl} className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
                      )}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-2 py-1 rounded text-[10px] text-white/60 pointer-events-none uppercase tracking-widest">
                        {selectedAsset.type === PCKAssetType.SKIN ? "3D Skin View" : selectedAsset.type === PCKAssetType.CAPE ? "3D Cape View" : "Texture Preview"}
                      </div>
                    </div>
                  )}

                  <div className="space-y-6 flex-1">
                    <div>
                      <div className="flex justify-between items-end mb-2 px-1">
                        <div className="text-white/40 text-[10px] uppercase tracking-widest text-[#FFFF55]/60">Metadata Properties</div>
                        <button
                          onClick={handleAddProperty}
                          className="text-[#FFFF55] text-[10px] uppercase hover:underline"
                        >
                          + Add Property
                        </button>
                      </div>
                      <div className="space-y-4">
                        {selectedAsset.properties.map((prop, idx) => (
                          <div key={idx} className="flex flex-col gap-1 group/prop">
                            <div className="flex justify-between items-center px-1">
                              <input
                                type="text"
                                value={prop.key}
                                onChange={(e) => handlePropertyEdit(idx, e.target.value, true)}
                                className="bg-transparent text-white/40 text-[10px] outline-none hover:text-white/60 focus:text-[#FFFF55] w-2/3"
                              />
                              <button
                                onClick={() => handleRemoveProperty(idx)}
                                className="text-red-500/0 group-hover/prop:text-red-500/40 hover:text-red-500 transition-colors text-[10px] uppercase"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="relative">
                              <input
                                type="text"
                                value={prop.value}
                                onChange={(e) => handlePropertyEdit(idx, e.target.value)}
                                className="w-full bg-black/40 p-2 text-white border border-[#373737] text-sm focus:border-[#FFFF55] outline-none transition-colors"
                              />
                            </div>

                            {prop.key === "ANIM" && (
                              <div className="mt-2 p-3 bg-black/30 border border-[#373737]/50 grid grid-cols-2 gap-x-4 gap-y-2">
                                {[
                                  { label: "Slim Format", flag: 1 << 19 },
                                  { label: "Modern Wide", flag: 1 << 18 },
                                  { label: "Hide Hat", flag: 1 << 16 },
                                  { label: "Hide Head", flag: 1 << 10 },
                                  { label: "Hide Body", flag: 1 << 13 },
                                  { label: "Hide Right Arm", flag: 1 << 11 },
                                  { label: "Hide Left Arm", flag: 1 << 12 },
                                  { label: "Hide Right Leg", flag: 1 << 14 },
                                  { label: "Hide Left Leg", flag: 1 << 15 },
                                  { label: "Hide Jacket", flag: 1 << 24 },
                                  { label: "Hide Right Sleeve", flag: 1 << 21 },
                                  { label: "Hide Left Sleeve", flag: 1 << 20 },
                                  { label: "Hide Right Pant", flag: 1 << 23 },
                                  { label: "Hide Left Pant", flag: 1 << 22 },
                                  { label: "Zombie Arms", flag: 1 << 1 },
                                  { label: "Upside Down", flag: 1 << 31 },
                                ].map((item) => {
                                  const currentVal = parseInt(prop.value) || 0;
                                  const isChecked = (currentVal & item.flag) !== 0;
                                  return (
                                    <label key={item.label} className="flex items-center gap-2 cursor-pointer group/flag">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          const newVal = e.target.checked
                                            ? currentVal | item.flag
                                            : currentVal & ~item.flag;
                                          handlePropertyEdit(idx, `0x${newVal.toString(16).toUpperCase().padStart(8, "0")}`);
                                        }}
                                        className="hidden"
                                      />
                                      <div className={`w-3 h-3 border transition-colors ${isChecked ? "bg-[#FFFF55] border-[#FFFF55]" : "border-white/20 group-hover/flag:border-white/40"}`} />
                                      <span className={`text-[9px] uppercase tracking-tight ${isChecked ? "text-[#FFFF55]" : "text-white/40 group-hover/flag:text-white/60"}`}>
                                        {item.label}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                        {selectedAsset.properties.length === 0 && (
                          <div className="text-white/20 italic text-sm px-1 py-4 border-2 border-dashed border-[#373737] text-center">No metadata properties</div>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 flex flex-col gap-3 mt-auto">
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleExportAsset(selectedAsset)}
                          className="py-2 text-white mc-text-shadow text-sm transition-all hover:text-[#FFFF55]"
                          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                        >
                          Export
                        </button>
                        <button
                          onClick={() => replaceInputRef.current?.click()}
                          className="py-2 text-white mc-text-shadow text-sm transition-all hover:text-[#FFFF55]"
                          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                        >
                          Replace
                        </button>
                      </div>
                      <button
                        onClick={() => handleDeleteAsset(selectedAsset.id)}
                        className="w-full py-2 text-red-500/80 mc-text-shadow text-sm transition-all hover:text-red-500 hover:scale-[1.02]"
                        style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                      >
                        Delete This Asset
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          playBackSound();
          setActiveView("devtools");
        }}
        className="w-72 h-14 flex items-center justify-center transition-colors text-2xl mc-text-shadow mt-6 outline-none border-none hover:text-[#FFFF55] text-white"
        style={{
          backgroundImage: "url('/images/Button_Background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        Back
      </button>

      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed top-12 right-12 z-[110] p-6 flex flex-col items-center justify-center min-w-[240px]"
            style={{
              backgroundImage: "url('/images/frame_background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated"
            }}
          >
            <span className="text-white text-lg mc-text-shadow font-bold tracking-widest uppercase">
              {notification.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTypeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowTypeModal(null)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md p-8 flex flex-col items-center"
              style={{
                backgroundImage: "url('/images/frame_background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated"
              }}
            >
              <h3 className="text-2xl text-[#FFFF55] mc-text-shadow font-bold mb-6 tracking-widest uppercase">Select Asset Type</h3>
              <div className="grid grid-cols-2 gap-4 w-full">
                {Object.keys(PCKAssetType)
                  .filter(k => isNaN(Number(k)))
                  .map((typeName) => (
                    <button
                      key={typeName}
                      onClick={() => confirmAddAsset(PCKAssetType[typeName as keyof typeof PCKAssetType])}
                      className="py-3 px-4 text-white mc-text-shadow text-sm transition-all hover:text-[#FFFF55] border-2 border-transparent hover:border-[#FFFF55]/30 bg-black/40"
                    >
                      {typeName.replace(/_/g, " ")}
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setShowTypeModal(null)}
                className="mt-8 px-8 py-2 text-white/60 mc-text-shadow text-sm hover:text-white transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

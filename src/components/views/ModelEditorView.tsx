import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";
import { ModelFile, ModelPart, ModelBox, Vec3, Vec2 } from "../../types/model";
import { ModelService } from "../../services/ModelService";
import ModelPreview3D from "../common/ModelPreview3D";
type SelectionType = "model" | "part" | "box";
interface Selection {
  type: SelectionType;
  modelIdx: number;
  partIdx?: number;
  boxIdx?: number;
}

export default function ModelEditorView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { animationsEnabled } = useConfig();
  const [models, setModels] = useState<ModelFile[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedTexture, setSelectedTexture] = useState<string | null>(null);
  const [showBounds, setShowBounds] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: { label: string; action: () => void }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null);
  const [expandedModels, setExpandedModels] = useState<Set<number>>(new Set());
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [editingPart, setEditingPart] = useState<{
    modelIdx: number;
    partIdx: number;
  } | null>(null);
  const [editingBox, setEditingBox] = useState<{
    modelIdx: number;
    partIdx: number;
    boxIdx: number;
  } | null>(null);

  const showNotify = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const activeModel = useMemo(() => {
    if (!selection) return null;
    return models[selection.modelIdx] || null;
  }, [selection, models]);

  const activeTextures = useMemo(() => {
    if (!activeModel?.textures) return [];
    return activeModel.textures;
  }, [activeModel]);

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    playPressSound();
    const buffer = await file.arrayBuffer();
    try {
      if (file.name.endsWith(".bbmodel")) {
        const model = await ModelService.importFromBBModel(buffer);
        setModels((prev) => [...prev, model]);
        const idx = models.length;
        setExpandedModels((prev) => new Set(prev).add(idx));
        setSelection({ type: "model", modelIdx: idx });
        showNotify(`Imported: ${model.name}`);
      } else {
        const text = new TextDecoder("utf-8").decode(buffer);
        const imported = ModelService.importFromJSON(text);
        setModels((prev) => [...prev, ...imported]);
        showNotify(`Loaded ${imported.length} model(s)`);
      }
    } catch (err: unknown) {
      showNotify(
        err instanceof Error ? err.message : "Failed to parse",
        "error",
      );
    }
    e.target.value = "";
  };

  const handleAddTexture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selection) return;
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    const name = file.name.replace(/\.[^.]+$/, "");
    const mi = selection.modelIdx;
    setModels((prev) => {
      const next = [...prev];
      const model = { ...next[mi] };
      const textures = [...(model.textures ?? []), { name, data: dataUrl }];
      next[mi] = { ...model, textures };
      return next;
    });
    showNotify(`Added texture: ${name}`);
    e.target.value = "";
  };

  const handleNewModel = () => {
    playPressSound();
    const name = `model_${models.length + 1}`;
    const model = ModelService.createDefaultModel(name);
    const idx = models.length;
    setModels((prev) => [...prev, model]);
    setExpandedModels((prev) => new Set(prev).add(idx));
    setSelection({ type: "model", modelIdx: idx });
    showNotify(`Created: ${name}`);
  };

  const handleExport = () => {
    if (activeModel === null) return;
    playPressSound();
    try {
      const buffer = ModelService.exportToBBModel(activeModel);
      const blob = new Blob([buffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeModel.name}.bbmodel`;
      a.click();
      URL.revokeObjectURL(url);
      showNotify(`Exported: ${activeModel.name}.bbmodel`);
    } catch {
      showNotify("Export failed", "error");
    }
  };

  const handleSave = () => {
    if (!activeModel) return;
    handleExport();
  };

  const handleDeleteModel = (idx: number) => {
    playBackSound();
    setModels((prev) => prev.filter((_, i) => i !== idx));
    if (selection?.modelIdx === idx) setSelection(null);
    showNotify("Model deleted");
  };

  const handleDeletePart = (modelIdx: number, partIdx: number) => {
    playBackSound();
    setModels((prev) => {
      const next = [...prev];
      next[modelIdx] = {
        ...next[modelIdx],
        parts: next[modelIdx].parts.filter((_, i) => i !== partIdx),
      };
      return next;
    });
    if (
      selection?.type === "part" &&
      selection.modelIdx === modelIdx &&
      selection.partIdx === partIdx
    )
      setSelection({ type: "model", modelIdx });
  };

  const handleDeleteBox = (
    modelIdx: number,
    partIdx: number,
    boxIdx: number,
  ) => {
    playBackSound();
    setModels((prev) => {
      const next = [...prev];
      const parts = [...next[modelIdx].parts];
      parts[partIdx] = {
        ...parts[partIdx],
        boxes: parts[partIdx].boxes.filter((_, i) => i !== boxIdx),
      };
      next[modelIdx] = { ...next[modelIdx], parts };
      return next;
    });
    if (
      selection?.type === "box" &&
      selection.modelIdx === modelIdx &&
      selection.partIdx === partIdx &&
      selection.boxIdx === boxIdx
    )
      setSelection({ type: "part", modelIdx, partIdx });
  };

  const handleAddPart = (modelIdx: number) => {
    playPressSound();
    setModels((prev) => {
      const next = [...prev];
      next[modelIdx] = {
        ...next[modelIdx],
        parts: [
          ...next[modelIdx].parts,
          { name: `part_${next[modelIdx].parts.length + 1}`, boxes: [] },
        ],
      };
      return next;
    });
  };

  const handleAddBox = (modelIdx: number, partIdx: number) => {
    playPressSound();
    setModels((prev) => {
      const next = [...prev];
      const parts = [...next[modelIdx].parts];
      parts[partIdx] = {
        ...parts[partIdx],
        boxes: [
          ...parts[partIdx].boxes,
          {
            pos: { X: -4, Y: 0, Z: -4 },
            size: { X: 8, Y: 8, Z: 8 },
            uv: { X: 0, Y: 0 },
          },
        ],
      };
      next[modelIdx] = { ...next[modelIdx], parts };
      return next;
    });
  };

  const updatePart = (
    modelIdx: number,
    partIdx: number,
    field: keyof ModelPart,
    value: string | Vec3 | undefined,
  ) => {
    setModels((prev) => {
      const next = [...prev];
      const parts = [...next[modelIdx].parts];
      parts[partIdx] = { ...parts[partIdx], [field]: value };
      next[modelIdx] = { ...next[modelIdx], parts };
      return next;
    });
  };

  const updateBox = (
    modelIdx: number,
    partIdx: number,
    boxIdx: number,
    field: keyof ModelBox,
    value: Vec3 | Vec2 | number | boolean | undefined,
  ) => {
    setModels((prev) => {
      const next = [...prev];
      const parts = [...next[modelIdx].parts];
      const boxes = [...parts[partIdx].boxes];
      boxes[boxIdx] = { ...boxes[boxIdx], [field]: value };
      parts[partIdx] = { ...parts[partIdx], boxes };
      next[modelIdx] = { ...next[modelIdx], parts };
      return next;
    });
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, items: { label: string; action: () => void }[]) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [],
  );

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "Escape" || e.key === "Backspace") {
        playBackSound();
        setActiveView("devtools");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playBackSound, setActiveView]);

  const toggleModel = (idx: number) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const togglePart = (key: string) => {
    setExpandedParts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col w-full h-[85vh] max-w-7xl relative"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileLoad}
        className="hidden"
        accept=".bbmodel,.json"
      />
      <input
        type="file"
        ref={textureInputRef}
        onChange={handleAddTexture}
        className="hidden"
        accept="image/png,image/gif"
      />

      <div className="flex items-center justify-between mb-4 px-4 shrink-0">
        <h2 className="text-2xl text-white mc-text-shadow tracking-widest uppercase font-bold">
          Model Editor
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-1.5 text-white mc-text-shadow text-sm"
            style={{
              backgroundImage: "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
            }}
          >
            Import
          </button>
          <button
            onClick={handleExport}
            disabled={!activeModel}
            className={`px-5 py-1.5 text-white mc-text-shadow text-sm ${!activeModel ? "opacity-40 grayscale" : ""}`}
            style={{
              backgroundImage: "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
            }}
          >
            Export
          </button>
          <button
            onClick={handleSave}
            disabled={!activeModel}
            className={`px-5 py-1.5 text-white mc-text-shadow text-sm ${!activeModel ? "opacity-40 grayscale" : ""}`}
            style={{
              backgroundImage: "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
            }}
          >
            Save
          </button>
          <div className="w-px h-6 bg-[#373737]" />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setShowBounds(!showBounds)}
              className={`w-4 h-4 border-2 transition-colors ${showBounds ? "bg-[#FFFF55] border-[#FFFF55]" : "bg-black/40 border-[#373737]"}`}
            />
            <span className="text-white/50 text-[10px] uppercase tracking-widest">
              Bounds
            </span>
          </label>
        </div>
      </div>

      {models.length === 0 ? (
        <div
          className="flex-1 w-full flex flex-col items-center justify-center p-12"
          style={{
            backgroundImage: "url('/images/frame_background.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        >
          <h3 className="text-2xl text-white/40 mc-text-shadow italic">
            Import a .bbmodel or .json file to begin
          </h3>
          <button
            onClick={handleNewModel}
            className="mt-6 px-8 py-3 text-white mc-text-shadow text-lg hover:text-[#FFFF55] transition-colors"
            style={{
              backgroundImage: "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
            }}
          >
            Start with Default Model
          </button>
        </div>
      ) : (
        <div
          className="flex-1 w-full flex overflow-hidden"
          style={{
            backgroundImage: "url('/images/frame_background.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        >
          <div className="w-72 min-w-72 border-r-2 border-[#373737] flex flex-col overflow-hidden">
            <div className="p-3 pt-4 pl-5 border-b-2 border-[#373737] flex items-center justify-between">
              <span className="text-white/60 uppercase text-xs tracking-widest font-bold pl-1">
                Models ({models.length})
              </span>
              <button
                onClick={handleNewModel}
                className="text-[#FFFF55] text-sm hover:opacity-80 pr-1"
              >
                + Add
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 pl-5">
              {models.map((model, mi) => (
                <div key={mi} className="flex flex-col">
                  <div
                    onClick={() => {
                      toggleModel(mi);
                      setSelection({ type: "model", modelIdx: mi });
                    }}
                    onContextMenu={(e) =>
                      handleContextMenu(e, [
                        {
                          label: "Export",
                          action: () => {
                            setSelection({ type: "model", modelIdx: mi });
                            setTimeout(handleExport, 0);
                          },
                        },
                        {
                          label: "Remove",
                          action: () => handleDeleteModel(mi),
                        },
                      ])
                    }
                    className={`flex items-center gap-2 p-2 cursor-pointer transition-all border-l-2 ${selection?.type === "model" && selection.modelIdx === mi ? "bg-[#FFFF55]/10 border-[#FFFF55] text-[#FFFF55]" : "border-transparent text-white"}`}
                  >
                    <img
                      src={
                        expandedModels.has(mi)
                          ? "/images/Settings_Arrow_Down.png"
                          : "/images/Settings_Arrow_Right.png"
                      }
                      className="w-3 h-3 object-contain opacity-80 shrink-0"
                      style={{ imageRendering: "pixelated" }}
                    />
                    <div className="w-4 h-4 bg-black/40 border border-[#5555FF] flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 bg-[#5555FF]/40" />
                    </div>
                    <span className="truncate text-sm mc-text-shadow">
                      {model.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteModel(mi);
                      }}
                      className="ml-auto text-[9px] opacity-30 hover:text-red-500 hover:opacity-100"
                    >
                      DEL
                    </button>
                  </div>
                  {expandedModels.has(mi) && (
                    <div className="flex flex-col ml-4">
                      <div
                        className="flex items-center justify-between px-2 py-1 opacity-50"
                        onClick={() => handleAddPart(mi)}
                      >
                        <span className="text-[10px] uppercase tracking-widest text-white/40">
                          Parts ({model.parts.length})
                        </span>
                        <span className="text-[#FFFF55] text-xs cursor-pointer">
                          + Add
                        </span>
                      </div>
                      {model.parts.map((part, pi) => {
                        const partKey = `${mi}-${pi}`;
                        const isPartExpanded = expandedParts.has(partKey);
                        return (
                          <div key={partKey} className="flex flex-col">
                            <div
                              onClick={() => {
                                togglePart(partKey);
                                setSelection({
                                  type: "part",
                                  modelIdx: mi,
                                  partIdx: pi,
                                });
                              }}
                              onContextMenu={(e) =>
                                handleContextMenu(e, [
                                  {
                                    label: "Edit",
                                    action: () =>
                                      setEditingPart({
                                        modelIdx: mi,
                                        partIdx: pi,
                                      }),
                                  },
                                  {
                                    label: "Remove",
                                    action: () => handleDeletePart(mi, pi),
                                  },
                                ])
                              }
                              className={`flex items-center gap-2 p-2 cursor-pointer transition-all border-l-2 ${selection?.type === "part" && selection.modelIdx === mi && selection.partIdx === pi ? "bg-[#FFFF55]/10 border-[#FFFF55] text-[#FFFF55]" : "border-transparent text-white/80"}`}
                            >
                              <img
                                src={
                                  isPartExpanded
                                    ? "/images/Settings_Arrow_Down.png"
                                    : "/images/Settings_Arrow_Right.png"
                                }
                                className="w-2 h-2 object-contain opacity-60 shrink-0"
                                style={{ imageRendering: "pixelated" }}
                              />
                              <span className="truncate text-xs mc-text-shadow">
                                {part.name}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePart(mi, pi);
                                }}
                                className="ml-auto text-[8px] opacity-30 hover:text-red-500 hover:opacity-100"
                              >
                                DEL
                              </button>
                            </div>
                            {isPartExpanded && (
                              <div className="flex flex-col ml-4">
                                <div
                                  className="flex items-center justify-between px-2 py-1 opacity-50"
                                  onClick={() => handleAddBox(mi, pi)}
                                >
                                  <span className="text-[9px] uppercase tracking-widest text-white/40">
                                    Boxes ({part.boxes.length})
                                  </span>
                                  <span className="text-[#FFFF55] text-[10px] cursor-pointer">
                                    + Add
                                  </span>
                                </div>
                                {part.boxes.map((_box, bi) => (
                                  <div
                                    key={bi}
                                    onClick={() =>
                                      setSelection({
                                        type: "box",
                                        modelIdx: mi,
                                        partIdx: pi,
                                        boxIdx: bi,
                                      })
                                    }
                                    onContextMenu={(e) =>
                                      handleContextMenu(e, [
                                        {
                                          label: "Edit",
                                          action: () =>
                                            setEditingBox({
                                              modelIdx: mi,
                                              partIdx: pi,
                                              boxIdx: bi,
                                            }),
                                        },
                                        {
                                          label: "Remove",
                                          action: () =>
                                            handleDeleteBox(mi, pi, bi),
                                        },
                                      ])
                                    }
                                    className={`flex items-center gap-2 p-1.5 cursor-pointer transition-all border-l-2 ${selection?.type === "box" && selection.modelIdx === mi && selection.partIdx === pi && selection.boxIdx === bi ? "bg-[#FFFF55]/10 border-[#FFFF55] text-[#FFFF55]" : "border-transparent text-white/60"}`}
                                  >
                                    <div className="w-2 h-2 rounded-sm border border-white/20 shrink-0" />
                                    <span className="truncate text-[10px] mc-text-shadow">
                                      Box {bi + 1}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteBox(mi, pi, bi);
                                      }}
                                      className="ml-auto text-[7px] opacity-30 hover:text-red-500 hover:opacity-100"
                                    >
                                      DEL
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {activeModel ? (
              <>
                <div className="flex-1 bg-black/20 relative">
                  <ModelPreview3D
                    model={activeModel}
                    selectedPart={
                      selection?.type === "part"
                        ? (activeModel.parts[selection.partIdx!]?.name ?? null)
                        : null
                    }
                    showBounds={showBounds}
                    className="w-full h-full"
                  />
                </div>
                <div className="h-44 shrink-0 border-t-2 border-[#373737] bg-black/10 overflow-y-auto custom-scrollbar">
                  <div className="p-2 border-b border-[#373737]/50 flex items-center justify-between">
                    <span className="text-white/40 text-[10px] uppercase tracking-widest font-bold">
                      Textures ({activeTextures.length})
                    </span>
                    <button
                      onClick={() => textureInputRef.current?.click()}
                      className="text-white/40 hover:text-white text-xs uppercase tracking-widest transition-colors pr-2"
                    >
                      Add
                    </button>
                  </div>
                  {activeTextures.length === 0 ? (
                    <div className="flex items-center justify-center h-20">
                      <span className="text-white/20 text-xs italic">
                        No textures
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3 p-3">
                      {activeTextures.map((tex, ti) => (
                        <div
                          key={ti}
                          onClick={() => setSelectedTexture(tex.name)}
                          className={`flex items-center gap-2 p-2 cursor-pointer transition-all border ${selectedTexture === tex.name ? "border-[#FFFF55] bg-[#FFFF55]/10" : "border-transparent hover:border-[#373737]"}`}
                        >
                          <div className="w-10 h-10 bg-black/40 border border-[#373737] overflow-hidden shrink-0">
                            <img
                              src={tex.data}
                              alt={tex.name}
                              className="w-full h-full object-contain"
                              style={{ imageRendering: "pixelated" }}
                            />
                          </div>
                          <span className="text-xs text-white/60 truncate max-w-28">
                            {tex.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-white/20 mc-text-shadow text-lg italic">
                  Select a model to preview
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center mt-6 h-14 shrink-0">
        <button
          onClick={() => {
            playBackSound();
            setActiveView("devtools");
          }}
          className="w-72 h-full flex items-center justify-center transition-colors text-2xl mc-text-shadow outline-none border-none hover:text-[#FFFF55] text-white"
          style={{
            backgroundImage: "url('/images/Button_Background.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        >
          Back
        </button>
      </div>

      <AnimatePresence>
        {editingPart && (
          <PartEditModal
            part={models[editingPart.modelIdx].parts[editingPart.partIdx]}
            onClose={() => setEditingPart(null)}
            onConfirm={(updated) => {
              updatePart(
                editingPart.modelIdx,
                editingPart.partIdx,
                "name",
                updated.name,
              );
              updatePart(
                editingPart.modelIdx,
                editingPart.partIdx,
                "translation",
                updated.translation,
              );
              setEditingPart(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editingBox && (
          <BoxEditModal
            box={
              models[editingBox.modelIdx].parts[editingBox.partIdx].boxes[
                editingBox.boxIdx
              ]
            }
            onClose={() => setEditingBox(null)}
            onConfirm={(updated) => {
              updateBox(
                editingBox.modelIdx,
                editingBox.partIdx,
                editingBox.boxIdx,
                "pos",
                updated.pos,
              );
              updateBox(
                editingBox.modelIdx,
                editingBox.partIdx,
                editingBox.boxIdx,
                "size",
                updated.size,
              );
              updateBox(
                editingBox.modelIdx,
                editingBox.partIdx,
                editingBox.boxIdx,
                "uv",
                updated.uv,
              );
              updateBox(
                editingBox.modelIdx,
                editingBox.partIdx,
                editingBox.boxIdx,
                "inflate",
                updated.inflate,
              );
              updateBox(
                editingBox.modelIdx,
                editingBox.partIdx,
                editingBox.boxIdx,
                "mirror",
                updated.mirror,
              );
              setEditingBox(null);
            }}
          />
        )}
      </AnimatePresence>
      {contextMenu && (
        <div
          className="fixed z-[200] min-w-[140px] py-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundImage: "url('/images/frame_background.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        >
          {contextMenu.items.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                item.action();
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:text-[#FFFF55] hover:bg-white/5 transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className="fixed top-12 right-12 z-[100] p-6 flex flex-col items-center justify-center min-w-[240px]"
            style={{
              backgroundImage: "url('/images/frame_background.png')",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            <span className="text-white text-lg mc-text-shadow font-bold tracking-widest uppercase">
              {notification.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PartEditModal({
  part,
  onClose,
  onConfirm,
}: {
  part: ModelPart;
  onClose: () => void;
  onConfirm: (updated: { name: string; translation: Vec3 | undefined }) => void;
}) {
  const [name, setName] = useState(part.name);
  const [tx, setTx] = useState(part.translation?.X ?? 0);
  const [ty, setTy] = useState(part.translation?.Y ?? 0);
  const [tz, setTz] = useState(part.translation?.Z ?? 0);
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-md p-8 flex flex-col"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <h3 className="text-2xl text-[#FFFF55] mc-text-shadow font-bold mb-6 tracking-widest uppercase">
          Edit Part
        </h3>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-white/40 text-[10px] uppercase tracking-widest mb-1 block">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/40 border-2 border-[#373737] text-white px-4 py-2 outline-none focus:border-[#FFFF55] transition-colors"
              autoFocus
            />
          </div>
          <div>
            <label className="text-white/40 text-[10px] uppercase tracking-widest mb-1 block">
              Translation
            </label>
            <div className="flex gap-3">
              {(["X", "Y", "Z"] as const).map((axis) => (
                <div key={axis} className="flex-1 flex items-center gap-2">
                  <span className="text-white/40 text-xs font-mono">
                    {axis}
                  </span>
                  <input
                    type="number"
                    step={0.5}
                    value={axis === "X" ? tx : axis === "Y" ? ty : tz}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      if (axis === "X") setTx(v);
                      else if (axis === "Y") setTy(v);
                      else setTz(v);
                    }}
                    className="w-full bg-black/40 border border-[#373737] text-white px-2 py-1 outline-none focus:border-[#FFFF55] text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-4 mt-6">
          <button
            onClick={onClose}
            className="px-6 py-2 text-white/60 hover:text-white transition-colors uppercase tracking-widest text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onConfirm({
                name,
                translation:
                  tx !== 0 || ty !== 0 || tz !== 0
                    ? { X: tx, Y: ty, Z: tz }
                    : undefined,
              })
            }
            className="px-8 py-2 text-white mc-text-shadow transition-all hover:text-[#FFFF55] text-lg outline-none"
            style={{
              backgroundImage: "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
            }}
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function BoxEditModal({
  box,
  onClose,
  onConfirm,
}: {
  box: ModelBox;
  onClose: () => void;
  onConfirm: (updated: ModelBox) => void;
}) {
  const [posX, setPosX] = useState(box.pos.X);
  const [posY, setPosY] = useState(box.pos.Y);
  const [posZ, setPosZ] = useState(box.pos.Z);
  const [sizeX, setSizeX] = useState(box.size.X);
  const [sizeY, setSizeY] = useState(box.size.Y);
  const [sizeZ, setSizeZ] = useState(box.size.Z);
  const [uvX, setUvX] = useState(box.uv.X);
  const [uvY, setUvY] = useState(box.uv.Y);
  const [inflate, setInflate] = useState(box.inflate ?? 0);
  const [mirror, setMirror] = useState(box.mirror ?? false);
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-lg p-8 flex flex-col"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <h3 className="text-2xl text-[#FFFF55] mc-text-shadow font-bold mb-6 tracking-widest uppercase">
          Edit Box
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div className="col-span-2">
            <label className="text-white/40 text-[10px] uppercase tracking-widest mb-1 block">
              Position
            </label>
            <div className="flex gap-3">
              {(["X", "Y", "Z"] as const).map((axis) => (
                <div key={axis} className="flex-1 flex items-center gap-2">
                  <span className="text-white/40 text-xs font-mono">
                    {axis}
                  </span>
                  <input
                    type="number"
                    step={0.5}
                    value={axis === "X" ? posX : axis === "Y" ? posY : posZ}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      if (axis === "X") setPosX(v);
                      else if (axis === "Y") setPosY(v);
                      else setPosZ(v);
                    }}
                    className="w-full bg-black/40 border border-[#373737] text-white px-2 py-1 outline-none focus:border-[#FFFF55] text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <label className="text-white/40 text-[10px] uppercase tracking-widest mb-1 block">
              Size
            </label>
            <div className="flex gap-3">
              {(["X", "Y", "Z"] as const).map((axis) => (
                <div key={axis} className="flex-1 flex items-center gap-2">
                  <span className="text-white/40 text-xs font-mono">
                    {axis}
                  </span>
                  <input
                    type="number"
                    step={0.5}
                    min={0.01}
                    value={axis === "X" ? sizeX : axis === "Y" ? sizeY : sizeZ}
                    onChange={(e) => {
                      const v = Math.max(0.01, parseFloat(e.target.value) || 0);
                      if (axis === "X") setSizeX(v);
                      else if (axis === "Y") setSizeY(v);
                      else setSizeZ(v);
                    }}
                    className="w-full bg-black/40 border border-[#373737] text-white px-2 py-1 outline-none focus:border-[#FFFF55] text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <label className="text-white/40 text-[10px] uppercase tracking-widest mb-1 block">
              UV Offset
            </label>
            <div className="flex gap-3">
              {(["X", "Y"] as const).map((axis) => (
                <div key={axis} className="flex-1 flex items-center gap-2">
                  <span className="text-white/40 text-xs font-mono">
                    {axis}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={axis === "X" ? uvX : uvY}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 0;
                      if (axis === "X") setUvX(v);
                      else setUvY(v);
                    }}
                    className="w-full bg-black/40 border border-[#373737] text-white px-2 py-1 outline-none focus:border-[#FFFF55] text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-white/40 text-[10px] uppercase tracking-widest">
              Inflate
            </label>
            <input
              type="number"
              step={0.1}
              value={inflate}
              onChange={(e) => setInflate(parseFloat(e.target.value) || 0)}
              className="w-20 bg-black/40 border border-[#373737] text-white px-2 py-1 outline-none focus:border-[#FFFF55] text-sm"
            />
          </div>
          <div className="flex items-center gap-3 justify-end">
            <label className="text-white/40 text-[10px] uppercase tracking-widest">
              Mirror UV
            </label>
            <div
              onClick={() => setMirror(!mirror)}
              className={`w-10 h-6 border-2 transition-colors cursor-pointer ${mirror ? "bg-[#FFFF55] border-[#FFFF55]" : "bg-black/40 border-[#373737]"}`}
            />
          </div>
        </div>
        <div className="flex justify-end gap-4 mt-6">
          <button
            onClick={onClose}
            className="px-6 py-2 text-white/60 hover:text-white transition-colors uppercase tracking-widest text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onConfirm({
                pos: { X: posX, Y: posY, Z: posZ },
                size: { X: sizeX, Y: sizeY, Z: sizeZ },
                uv: { X: uvX, Y: uvY },
                inflate,
                mirror,
              })
            }
            className="px-8 py-2 text-white mc-text-shadow transition-all hover:text-[#FFFF55] text-lg outline-none"
            style={{
              backgroundImage: "url('/images/Button_Background.png')",
              backgroundSize: "100% 100%",
            }}
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}

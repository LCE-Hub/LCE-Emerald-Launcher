import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";
import { GrfService } from "../../services/GrfService";
import { GrfFile, GrfNode, GrfFileEntry } from "../../types/grf";
export default function GrfEditorView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { animationsEnabled } = useConfig();
  const [grf, setGrf] = useState<GrfFile | null>(null);
  const [filename, setFilename] = useState("game_rules.grf");
  const [notification, setNotification] = useState<{ message: string, type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"rules" | "files">("rules");
  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    playPressSound();
    const buffer = await file.arrayBuffer();
    try {
      const parsedGrf = GrfService.readGRF(buffer);
      setGrf(parsedGrf);
      setFilename(file.name);
      showNotification(`Loaded ${file.name}`);
    } catch (err: any) {
      console.error("Failed to parse GRF", err);
      showNotification(err.message || "Failed to parse GRF", "error");
    }
    e.target.value = "";
  };

  const handleNewGrf = () => {
    playPressSound();
    setGrf(GrfService.createDefaultGRF());
    setFilename("new_rules.grf");
    showNotification("New GRF Created");
  };

  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !grf) return;
    playPressSound();
    const buffer = await file.arrayBuffer();
    const newFile: GrfFileEntry = {
      filename: file.name,
      data: new Uint8Array(buffer)
    };
    setGrf({
      ...grf,
      files: [...grf.files, newFile]
    });
    showNotification(`Added ${file.name}`);
    e.target.value = "";
  };

  const handleDeleteFile = (index: number) => {
    if (!grf) return;
    playPressSound();
    const newFiles = [...grf.files];
    const removed = newFiles.splice(index, 1)[0];
    setGrf({ ...grf, files: newFiles });
    showNotification(`Removed ${removed.filename}`);
  };

  const handleUpdateParameter = (nodePath: string[], paramIndex: number, value: string) => {
    if (!grf) return;
    const updateNode = (node: GrfNode, path: string[]): GrfNode => {
      if (path.length === 0) {
        if (!node.parameters[paramIndex]) return node;
        const newParams = [...node.parameters];
        newParams[paramIndex] = { ...newParams[paramIndex], value };
        return { ...node, parameters: newParams };
      }
      const [next, ...rest] = path;
      return {
        ...node,
        children: node.children.map(child => child.name === next ? updateNode(child, rest) : child)
      };
    };
    setGrf({
      ...grf,
      root: updateNode(grf.root, nodePath)
    });
  };

  const handleSaveGrf = () => {
    if (!grf) return;
    playPressSound();
    try {
      const buffer = GrfService.serializeGRF(grf);
      const blob = new Blob([buffer as any]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showNotification("GRF Saved Successfully");
    } catch (err: any) {
      console.error("Failed to save GRF", err);
      showNotification(err.message || "Failed to save GRF", "error");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col w-full h-[85vh] max-w-7xl relative"
    >
      <input type="file" ref={fileInputRef} onChange={handleFileLoad} className="hidden" accept=".grf" />
      <input type="file" ref={addFileInputRef} onChange={handleAddFile} className="hidden" />
      <div className="flex items-center justify-between mb-6 px-4">
        <div className="flex items-center gap-6">
          <h2 className="text-3xl text-white mc-text-shadow tracking-widest uppercase font-bold">GRF Editor</h2>
          {grf && <span className="text-white/40 mc-text-shadow italic">editing: <span className="text-[#ffff00]">{filename}</span></span>}
        </div>
        <div className="flex gap-4">
          <button
            onClick={handleNewGrf}
            className="px-6 py-2 text-white mc-text-shadow text-lg"
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            New GRF
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
            className="px-6 py-2 text-white mc-text-shadow text-lg transition-all hover:text-[#ffff00]"
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Open GRF
          </button>
          <button
            onClick={handleSaveGrf}
            disabled={!grf}
            onMouseEnter={(e) => !(!grf) && (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
            className={`px-6 py-2 text-white mc-text-shadow text-lg transition-all hover:text-[#ffff00] ${!grf ? "opacity-50 grayscale" : ""}`}
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Save GRF
          </button>
        </div>
      </div>

      {!grf ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-12"
          style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <h3 className="text-2xl text-white/40 mc-text-shadow italic">Open a GRF file to begin editing</h3>
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col overflow-hidden" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <div className="flex gap-1 p-2 pt-4 border-b-2 border-[#373737]">
            <button
              onClick={() => { playPressSound(); setActiveTab("rules"); }}
              className={`flex items-center gap-3 px-6 py-2 transition-all mc-text-shadow ${activeTab === "rules" ? "text-[#ffff00] opacity-100 scale-105" : "text-white opacity-40 hover:opacity-100"}`}
            >
              <span className="text-lg">Game Rules</span>
            </button>
            <button
              onClick={() => { playPressSound(); setActiveTab("files"); }}
              className={`flex items-center gap-3 px-6 py-2 transition-all mc-text-shadow ${activeTab === "files" ? "text-[#ffff00] opacity-100 scale-105" : "text-white opacity-40 hover:opacity-100"}`}
            >
              <span className="text-lg">Files ({grf.files.length})</span>
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 custom-scrollbar">
            {activeTab === "rules" && (
              <div className="flex flex-col gap-2">
                {grf.root.children.map((node, i) => (
                  <GrfNodeView key={i} node={node} level={0} path={[]} onUpdate={handleUpdateParameter} />
                ))}
                {grf.root.children.length === 0 && <span className="text-white/40 italic">No rules found</span>}
              </div>
            )}
            {activeTab === "files" && (
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => addFileInputRef.current?.click()}
                  className="self-start px-6 py-2 text-white mc-text-shadow text-sm"
                  style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                >
                  Add File
                </button>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#252525]">
                    <tr className="border-b-2 border-[#373737]">
                      <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold">Filename</th>
                      <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold text-right">Size</th>
                      <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grf.files.length === 0 && (
                      <tr><td colSpan={3} className="p-4 text-center text-white/40">No files in GRF</td></tr>
                    )}
                    {grf.files.map((f, i) => (
                      <tr key={i} className="border-b border-[#373737]/30 hover:bg-white/5 transition-colors">
                        <td className="p-3 text-white font-medium">{f.filename}</td>
                        <td className="p-3 text-white/60 text-right text-xs">{(f.data.length / 1024).toFixed(2)} KB</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteFile(i)}
                            className="text-[#FF5555] hover:text-[#FF8888] transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center mt-6 h-14">
        <button
          onClick={() => { playBackSound(); setActiveView("devtools"); }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
          className="w-40 h-10 flex items-center justify-center transition-colors text-xl mc-text-shadow outline-none border-none hover:text-[#ffff00] text-white"
          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}
        >
          Back
        </button>
      </div>

      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className="fixed top-12 right-12 z-[100] p-6 flex flex-col items-center justify-center min-w-[240px]"
            style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}
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

function GrfNodeView({ node, level, path, onUpdate }: { node: GrfNode, level: number, path: string[], onUpdate: (path: string[], paramIdx: number, val: string) => void }) {
  const [expanded, setExpanded] = useState(level < 1);
  const currentPath = [...path, node.name];

  return (
    <div className="flex flex-col mb-1 select-none">
      <div
        className="flex items-center gap-2 p-2 hover:bg-white/10 cursor-pointer transition-colors"
        style={{ paddingLeft: `${level * 24 + 8}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {node.children.length > 0 ? (
          <img
            src={expanded ? "/images/Settings_Arrow_Down.png" : "/images/Settings_Arrow_Right.png"}
            className="w-3 h-3 object-contain opacity-80"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <div className="w-3" />
        )}
        <img
          src={node.children.length > 0 ? "/images/Folder_Icon.png" : "/images/tools/grf.png"}
          className="w-4 h-4 object-contain grayscale opacity-60"
          style={{ imageRendering: "pixelated" }}
          onError={(e) => (e.currentTarget.src = "/images/tools/pck.png")}
        />
        <span className="text-[#ffff00] font-bold">{node.name}</span>
        {node.parameters.length > 0 && <span className="text-white/40 text-xs ml-2">[{node.parameters.length} props]</span>}
      </div>
      {expanded && (
        <div className="flex flex-col border-l-2 border-[#373737] ml-2 pl-2">
          {node.parameters.length > 0 && (
            <div className="flex flex-col bg-black/20 p-2 mb-2 ml-4">
              {node.parameters.map((p, i) => (
                <div key={i} className="flex gap-4 border-b border-[#373737]/30 py-2 text-sm items-center">
                  <span className="text-[#AAAAAA] w-1/3 truncate">{p.name}</span>
                  <input
                    type="text"
                    value={p.value}
                    onChange={(e) => onUpdate(currentPath, i, e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 px-2 py-1 text-white outline-none focus:border-[#FFFF55]/50 font-mono transition-colors"
                  />
                </div>
              ))}
            </div>
          )}
          {node.children.map((child, i) => (
            <GrfNodeView key={i} node={child} level={level + 1} path={currentPath} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

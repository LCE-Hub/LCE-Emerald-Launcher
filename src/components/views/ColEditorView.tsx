import { useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";
import { ColService } from "../../services/ColService";
import { ColFile } from "../../types/col";
function argbToHex(argb: number) {
  return (argb >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function hexToArgb(hex: string) {
  const cleanHex = hex.replace("#", "");
  return parseInt(cleanHex, 16) >>> 0;
}

export default function ColEditorView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { animationsEnabled } = useConfig();
  const [col, setCol] = useState<ColFile | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [notification, setNotification] = useState<{ message: string, type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"colors" | "worldColors">("colors");
  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const currentColors = useMemo(() => {
    if (!col) return [];
    return col.colors.map((c, i) => ({ ...c, originalIdx: i }))
      .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [col, searchTerm]);

  const currentWorldColors = useMemo(() => {
    if (!col) return [];
    return col.worldColors.map((c, i) => ({ ...c, originalIdx: i }))
      .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [col, searchTerm]);

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    playPressSound();
    const buffer = await file.arrayBuffer();
    try {
      const parsedCol = ColService.readCOL(buffer);
      setCol(parsedCol);
      showNotification(`Loaded ${file.name}`);
    } catch (err: any) {
      console.error("Failed to parse COL", err);
      showNotification(err.message || "Failed to parse COL", "error");
    }
    e.target.value = "";
  };

  const handleSaveCol = () => {
    if (!col) return;
    playPressSound();
    try {
      const buffer = ColService.serializeCOL(col);
      const blob = new Blob([buffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "colours.col";
      a.click();
      URL.revokeObjectURL(url);
      showNotification("COL Saved Successfully");
    } catch (err: any) {
      console.error("Failed to save COL", err);
      showNotification(err.message || "Failed to save COL", "error");
    }
  };

  const handleUpdateColor = (idx: number, field: string, val: string | number) => {
    if (!col) return;
    const newCol = { ...col, colors: [...col.colors] };
    newCol.colors[idx] = { ...newCol.colors[idx], [field]: val };
    setCol(newCol);
  };

  const handleUpdateWorldColor = (idx: number, field: string, val: string | number) => {
    if (!col) return;
    const newCol = { ...col, worldColors: [...col.worldColors] };
    newCol.worldColors[idx] = { ...newCol.worldColors[idx], [field]: val };
    setCol(newCol);
  };

  const handleAddColor = () => {
    if (!col) return;
    playPressSound();
    setCol({
      ...col,
      colors: [{ name: "NewColor", color: 0xFFFFFFFF }, ...col.colors]
    });
    showNotification("Color Added");
  };

  const handleAddWorldColor = () => {
    if (!col) return;
    playPressSound();
    setCol({
      ...col,
      worldColors: [{ name: "NewWorldColor", waterColor: 0xFFFFFFFF, underwaterColor: 0xFFFFFFFF, fogColor: 0xFFFFFFFF }, ...col.worldColors]
    });
    showNotification("World Color Added");
  };

  const handleDeleteColor = (idx: number) => {
    if (!col) return;
    playBackSound();
    const newCol = { ...col, colors: [...col.colors] };
    newCol.colors.splice(idx, 1);
    setCol(newCol);
  };

  const handleDeleteWorldColor = (idx: number) => {
    if (!col) return;
    playBackSound();
    const newCol = { ...col, worldColors: [...col.worldColors] };
    newCol.worldColors.splice(idx, 1);
    setCol(newCol);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col w-full h-[85vh] max-w-7xl relative"
    >
      <input type="file" ref={fileInputRef} onChange={handleFileLoad} className="hidden" accept=".col" />
      <div className="flex items-center justify-between mb-6 px-4">
        <div className="flex items-center gap-6">
          <h2 className="text-3xl text-white mc-text-shadow tracking-widest uppercase font-bold">COL Editor</h2>
          {col && <span className="text-white/40 mc-text-shadow italic">Version: <span className="text-[#ffff00]">{col.version}</span></span>}
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
            className="px-6 py-2 text-white mc-text-shadow text-lg transition-all hover:text-[#ffff00]"
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Open COL
          </button>
          <button
            onClick={handleSaveCol}
            disabled={!col}
            onMouseEnter={(e) => !(!col) && (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
            className={`px-6 py-2 text-white mc-text-shadow text-lg transition-all hover:text-[#ffff00] ${!col ? "opacity-50 grayscale" : ""}`}
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Save COL
          </button>
        </div>
      </div>

      {!col ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-12"
          style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <h3 className="text-2xl text-white/40 mc-text-shadow italic">Open a COL file to begin editing</h3>
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col overflow-hidden" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <div className="flex gap-1 p-2 pt-4 border-b-2 border-[#373737]">
            <button
              onClick={() => { playPressSound(); setActiveTab("colors"); }}
              className={`flex items-center gap-3 px-6 py-2 transition-all mc-text-shadow ${activeTab === "colors" ? "text-[#ffff00] opacity-100 scale-105" : "text-white opacity-40 hover:opacity-100"}`}
            >
              <span className="text-lg">Colors ({col.colors.length})</span>
            </button>
            <button
              onClick={() => { playPressSound(); setActiveTab("worldColors"); }}
              disabled={col.version === 0}
              className={`flex items-center gap-3 px-6 py-2 transition-all mc-text-shadow ${activeTab === "worldColors" ? "text-[#ffff00] opacity-100 scale-105" : "text-white opacity-40 hover:opacity-100"} ${col.version === 0 ? "opacity-20 cursor-not-allowed" : ""}`}
            >
              <span className="text-lg">World Colors ({col.worldColors.length})</span>
            </button>
          </div>

          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="mb-4 flex gap-4">
              <input
                type="text"
                placeholder="Search colors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 bg-black/40 border-2 border-[#373737] text-white px-4 py-2 outline-none focus:border-[#ffff00] transition-colors"
              />
              <button
                onClick={activeTab === "colors" ? handleAddColor : handleAddWorldColor}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
                className="px-6 py-2 text-white mc-text-shadow text-sm transition-all hover:text-[#ffff00]"
                style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
              >
                Add {activeTab === "colors" ? "Color" : "World Color"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#252525] z-10 w-full mb-2">
                  <tr className="border-b-2 border-[#373737]">
                    <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold w-1/4">Name</th>
                    {activeTab === "colors" && <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold">Color (ARGB)</th>}
                    {activeTab === "worldColors" && (
                      <>
                        <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold">Water (ARGB)</th>
                        <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold">Underwater (ARGB)</th>
                        <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold">Fog (ARGB)</th>
                      </>
                    )}
                    <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold text-right w-16">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTab === "colors" && currentColors.map((c) => (
                    <tr key={c.originalIdx} className="border-b border-[#373737]/30 hover:bg-white/5 transition-colors group">
                      <td className="p-2">
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => handleUpdateColor(c.originalIdx, "name", e.target.value)}
                          className="w-full bg-black/40 border border-[#373737] px-2 py-1 outline-none focus:border-[#ffff00] text-white text-sm"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={`#${argbToHex(c.color).substring(2, 8)}`}
                            onChange={(e) => {
                              const rgb = e.target.value.substring(1).toUpperCase();
                              const alpha = argbToHex(c.color).substring(0, 2);
                              const newArgb = hexToArgb(`${alpha}${rgb}`);
                              handleUpdateColor(c.originalIdx, "color", newArgb);
                            }}
                            className="w-8 h-8 p-0 cursor-pointer shrink-0 border border-[#373737] rounded-sm bg-transparent"
                          />
                          <input
                            type="text"
                            value={argbToHex(c.color)}
                            onChange={(e) => {
                              const s = e.target.value.replace(/[^0-9A-Fa-f]/g, '');
                              if (s.length <= 8) {
                                const parsed = parseInt(s, 16);
                                if (!isNaN(parsed)) handleUpdateColor(c.originalIdx, "color", parsed >>> 0);
                              }
                            }}
                            className="bg-black/40 border border-[#373737] w-24 px-2 py-1 outline-none focus:border-[#ffff00] text-white font-mono text-sm uppercase"
                            maxLength={8}
                          />
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <button onClick={() => handleDeleteColor(c.originalIdx)} className="p-1 hover:text-red-500 opacity-60 hover:opacity-100 transition-colors">
                          <img src="/images/Trash_Bin_Icon.png" className="w-5 h-5 object-contain" style={{ imageRendering: "pixelated" }} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {activeTab === "worldColors" && currentWorldColors.map((w) => (
                    <tr key={w.originalIdx} className="border-b border-[#373737]/30 hover:bg-white/5 transition-colors group">
                      <td className="p-2">
                        <input
                          type="text"
                          value={w.name}
                          onChange={(e) => handleUpdateWorldColor(w.originalIdx, "name", e.target.value)}
                          className="w-full bg-black/40 border border-[#373737] px-2 py-1 outline-none focus:border-[#ffff00] text-white text-sm"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={`#${argbToHex(w.waterColor).substring(2, 8)}`}
                            onChange={(e) => {
                              const rgb = e.target.value.substring(1).toUpperCase();
                              const alpha = argbToHex(w.waterColor).substring(0, 2);
                              handleUpdateWorldColor(w.originalIdx, "waterColor", hexToArgb(`${alpha}${rgb}`));
                            }}
                            className="w-6 h-6 p-0 cursor-pointer shrink-0 border border-[#373737] rounded-sm bg-transparent"
                          />
                          <input
                            type="text"
                            value={argbToHex(w.waterColor)}
                            onChange={(e) => {
                              const s = e.target.value.replace(/[^0-9A-Fa-f]/g, '');
                              if (s.length <= 8) {
                                const parsed = parseInt(s, 16);
                                if (!isNaN(parsed)) handleUpdateWorldColor(w.originalIdx, "waterColor", parsed >>> 0);
                              }
                            }}
                            className="bg-black/40 border border-[#373737] w-20 px-2 py-1 outline-none focus:border-[#ffff00] text-white font-mono text-xs uppercase"
                            maxLength={8}
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={`#${argbToHex(w.underwaterColor).substring(2, 8)}`}
                            onChange={(e) => {
                              const rgb = e.target.value.substring(1).toUpperCase();
                              const alpha = argbToHex(w.underwaterColor).substring(0, 2);
                              handleUpdateWorldColor(w.originalIdx, "underwaterColor", hexToArgb(`${alpha}${rgb}`));
                            }}
                            className="w-6 h-6 p-0 cursor-pointer shrink-0 border border-[#373737] rounded-sm bg-transparent"
                          />
                          <input
                            type="text"
                            value={argbToHex(w.underwaterColor)}
                            onChange={(e) => {
                              const s = e.target.value.replace(/[^0-9A-Fa-f]/g, '');
                              if (s.length <= 8) {
                                const parsed = parseInt(s, 16);
                                if (!isNaN(parsed)) handleUpdateWorldColor(w.originalIdx, "underwaterColor", parsed >>> 0);
                              }
                            }}
                            className="bg-black/40 border border-[#373737] w-20 px-2 py-1 outline-none focus:border-[#ffff00] text-white font-mono text-xs uppercase"
                            maxLength={8}
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={`#${argbToHex(w.fogColor).substring(2, 8)}`}
                            onChange={(e) => {
                              const rgb = e.target.value.substring(1).toUpperCase();
                              const alpha = argbToHex(w.fogColor).substring(0, 2);
                              handleUpdateWorldColor(w.originalIdx, "fogColor", hexToArgb(`${alpha}${rgb}`));
                            }}
                            className="w-6 h-6 p-0 cursor-pointer shrink-0 border border-[#373737] rounded-sm bg-transparent"
                          />
                          <input
                            type="text"
                            value={argbToHex(w.fogColor)}
                            onChange={(e) => {
                              const s = e.target.value.replace(/[^0-9A-Fa-f]/g, '');
                              if (s.length <= 8) {
                                const parsed = parseInt(s, 16);
                                if (!isNaN(parsed)) handleUpdateWorldColor(w.originalIdx, "fogColor", parsed >>> 0);
                              }
                            }}
                            className="bg-black/40 border border-[#373737] w-20 px-2 py-1 outline-none focus:border-[#ffff00] text-white font-mono text-xs uppercase"
                            maxLength={8}
                          />
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <button onClick={() => handleDeleteWorldColor(w.originalIdx)} className="p-1 hover:text-red-500 opacity-60 hover:opacity-100 transition-colors">
                          <img src="/images/Trash_Bin_Icon.png" className="w-5 h-5 object-contain" style={{ imageRendering: "pixelated" }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

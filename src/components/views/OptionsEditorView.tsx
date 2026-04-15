import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";
import { OptionsService } from "../../services/OptionsService";
import { OptionsFile } from "../../types/options";
const BUTTONS: Record<number, string> = {
  0x00: "NONE", 0x01: "A", 0x02: "B", 0x03: "X", 0x04: "Y",
  0x05: "D-Pad Left", 0x06: "D-Pad Right", 0x07: "D-Pad Up", 0x08: "D-Pad Down",
  0x09: "RB", 0x0A: "LB", 0x0B: "RT", 0x0C: "LT",
  0x0D: "RS", 0x0E: "LS"
};

export default function OptionsEditorView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { animationsEnabled } = useConfig();
  const [opt, setOpt] = useState<OptionsFile | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"settings" | "skins" | "actions">("settings");
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
      const parsed = OptionsService.readOptions(buffer);
      setOpt(parsed);
      showNotification(`Loaded options.dat`);
    } catch (err: any) {
      console.error("Failed to parse Options", err);
      showNotification(err.message || "Failed to parse Options", "error");
    }
    e.target.value = "";
  };

  const handleSaveOptions = () => {
    if (!opt) return;
    playPressSound();
    try {
      const buffer = OptionsService.serializeOptions(opt);
      const blob = new Blob([buffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "options.dat";
      a.click();
      URL.revokeObjectURL(url);
      showNotification("Options Saved");
    } catch (err: any) {
      showNotification("Failed to save", "error");
    }
  };

  const updateSetting = (field: keyof OptionsFile, value: any) => {
    if (!opt) return;
    setOpt({ ...opt, [field]: value });
  };

  const updateAction = (field: keyof OptionsFile["actions"], value: number) => {
    if (!opt) return;
    setOpt({ ...opt, actions: { ...opt.actions, [field]: value } });
  };

  const updateFavSkin = (idx: number, value: number) => {
    if (!opt) return;
    const newFav = [...opt.favoriteSkins];
    newFav[idx] = value;
    setOpt({ ...opt, favoriteSkins: newFav });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col w-full h-[85vh] max-w-7xl relative"
    >
      <input type="file" ref={fileInputRef} onChange={handleFileLoad} className="hidden" accept=".dat,.bin" />
      <div className="flex items-center justify-between mb-6 px-4">
        <div className="flex items-center gap-6">
          <h2 className="text-3xl text-white mc-text-shadow tracking-widest uppercase font-bold">Options Editor</h2>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 text-white mc-text-shadow text-lg"
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Open settings.dat
          </button>
          <button
            onClick={handleSaveOptions}
            disabled={!opt}
            className={`px-6 py-2 text-white mc-text-shadow text-lg ${!opt ? "opacity-50 grayscale" : ""}`}
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Save settings.dat
          </button>
        </div>
      </div>

      {!opt ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-12"
          style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <h3 className="text-2xl text-white/40 mc-text-shadow italic">Open settings.dat to begin</h3>
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col overflow-hidden" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <div className="flex gap-1 p-2 pt-4 border-b-2 border-[#373737]">
            {(["settings", "skins", "actions"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { playPressSound(); setActiveTab(tab); }}
                className={`flex items-center gap-3 px-6 py-2 transition-all mc-text-shadow ${activeTab === tab ? "text-[#FFFF55] opacity-100 scale-105" : "text-white opacity-40 hover:opacity-100"}`}
              >
                <span className="text-lg capitalize">{tab}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
            {activeTab === "settings" && (
              <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                {Object.keys(opt).filter(k => k !== "actions" && k !== "rawData" && k !== "chosenSkin" && k !== "playerCape" && k !== "favoriteSkins" && k !== "endianness").map((k) => {
                  const val = opt[k as keyof OptionsFile];
                  if (typeof val === "boolean") {
                    return (
                      <label key={k} className="flex items-center justify-between cursor-pointer group">
                        <span className="text-white/80 uppercase text-sm tracking-widest">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <div className={`w-12 h-6 border-2 transition-colors ${val ? "bg-[#55FF55] border-[#55FF55]" : "bg-black/40 border-[#373737]"}`} onClick={() => { playPressSound(); updateSetting(k as keyof OptionsFile, !val); }} />
                      </label>
                    );
                  } else if (typeof val === "number") {
                    return (
                      <div key={k} className="flex flex-col gap-2">
                        <span className="text-white/80 uppercase text-sm tracking-widest">{k.replace(/([A-Z])/g, ' $1').trim()}: {val}</span>
                        <input
                          type="range" min="0" max={k.includes("Size") || k === "difficulty" ? 3 : 255}
                          value={val}
                          onChange={(e) => updateSetting(k as keyof OptionsFile, parseInt(e.target.value))}
                          className="w-full accent-[#FFFF55]"
                        />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {activeTab === "skins" && (
              <div className="flex flex-col gap-8 max-w-xl mx-auto">
                <div className="flex flex-col gap-2">
                  <span className="text-white/80 uppercase tracking-widest">Chosen Skin ID</span>
                  <input
                    type="number" value={opt.chosenSkin} onChange={(e) => updateSetting("chosenSkin", parseInt(e.target.value) || 0)}
                    className="bg-black/40 border border-[#373737] p-2 text-white outline-none focus:border-[#FFFF55] font-mono text-lg"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-white/80 uppercase tracking-widest">Player Cape ID</span>
                  <input
                    type="number" value={opt.playerCape} onChange={(e) => updateSetting("playerCape", parseInt(e.target.value) || 0)}
                    className="bg-black/40 border border-[#373737] p-2 text-white outline-none focus:border-[#FFFF55] font-mono text-lg"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-white/80 uppercase tracking-widest">Favorite Skins</span>
                  {opt.favoriteSkins.map((s, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <span className="text-white/40 w-8">{i + 1}.</span>
                      <input
                        type="number" value={s} onChange={(e) => updateFavSkin(i, parseInt(e.target.value) || 0)}
                        className="bg-black/40 flex-1 border border-[#373737] p-2 text-white outline-none focus:border-[#FFFF55] font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "actions" && (
              <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                {Object.keys(opt.actions).map((k) => {
                  const val = opt.actions[k as keyof typeof opt.actions];
                  return (
                    <div key={k} className="flex justify-between items-center group">
                      <span className="text-white/80 uppercase text-sm tracking-widest">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <select
                        value={val}
                        onChange={(e) => updateAction(k as keyof typeof opt.actions, parseInt(e.target.value))}
                        className="bg-black/40 border border-[#373737] p-2 text-white outline-none focus:border-[#FFFF55] min-w-[120px] cursor-pointer"
                      >
                        {Object.entries(BUTTONS).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center mt-6 h-14">
        <button
          onClick={() => { playBackSound(); setActiveView("devtools"); }}
          className="w-72 h-full flex items-center justify-center transition-colors text-2xl mc-text-shadow outline-none border-none hover:text-[#FFFF55] text-white"
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

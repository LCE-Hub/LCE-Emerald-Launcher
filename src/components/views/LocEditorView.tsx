import { useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";
import { ArcService } from "../../services/ArcService";
import { LocFile, LocLanguage } from "../../types/arc";
export default function LocEditorView() {
  const { t } = useTranslation();
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { animationsEnabled } = useConfig();
  const [loc, setLoc] = useState<LocFile | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLocLangIdx, setSelectedLocLangIdx] = useState<number>(0);
  const [notification, setNotification] = useState<{ message: string, type: "success" | "error" } | null>(null);
  const [isLocEditModalOpen, setIsLocEditModalOpen] = useState<{ langIdx: number, strIdx: number, isNew: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentLocLang = useMemo(() => {
    if (!loc) return null;
    return loc.languages[selectedLocLangIdx] || null;
  }, [loc, selectedLocLangIdx]);

  const filteredLocStrings = useMemo(() => {
    if (!currentLocLang) return [];
    return currentLocLang.strings.map((s, i) => ({ ...s, originalIdx: i }))
      .filter(s => (s.key?.toLowerCase().includes(searchTerm.toLowerCase()) || s.value.toLowerCase().includes(searchTerm.toLowerCase())));
  }, [currentLocLang, searchTerm]);

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
      const parsedLoc = ArcService.parseLOC(new Uint8Array(buffer));
      setLoc(parsedLoc);
      setSelectedLocLangIdx(0);
      showNotification(t("locEditor.loaded", { name: file.name }));
    } catch (err) {
      console.error("Failed to parse LOC", err);
      showNotification(t("locEditor.failedToParse"), "error");
    }
    e.target.value = "";
  };

  const handleSaveLoc = () => {
    if (!loc) return;
    playPressSound();
    const buffer = ArcService.serializeLOC(loc);
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "languages.loc";
    a.click();
    URL.revokeObjectURL(url);
    showNotification(t("locEditor.savedSuccessfully"));
  };

  const handleLocStringEdit = (langIdx: number, strIdx: number, isNew: boolean, key: string, value: string) => {
    if (!loc) return;
    playPressSound();
    setLoc({
      ...loc,
      languages: loc.languages.map((lang, lIdx) => {
        if (lIdx !== langIdx) return lang;
        if (isNew) {
          return {
            ...lang,
            strings: [...lang.strings, lang.isStatic ? { value } : { key, value }]
          };
        }
        return {
          ...lang,
          strings: lang.strings.map((str, sIdx) =>
            sIdx !== strIdx ? str : { ...str, ...(!lang.isStatic ? { key } : {}), value }
          )
        };
      })
    });
    setIsLocEditModalOpen(null);
    showNotification(isNew ? t("locEditor.stringAdded") : t("locEditor.stringUpdated"));
  };

  const handleLocStringDelete = (langIdx: number, strIdx: number) => {
    if (!loc) return;
    playBackSound();
    setLoc({
      ...loc,
      languages: loc.languages.map((lang, lIdx) =>
        lIdx !== langIdx ? lang : { ...lang, strings: lang.strings.filter((_, sIdx) => sIdx !== strIdx) }
      )
    });
    showNotification(t("locEditor.stringDeleted"));
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col w-full h-full max-w-7xl relative"
    >
      <input type="file" ref={fileInputRef} onChange={handleFileLoad} className="hidden" accept=".loc" />
      <div className="flex items-center justify-between mb-6 px-4">
        <div className="flex items-center gap-6">
          <h2 className="text-3xl text-white mc-text-shadow tracking-widest uppercase font-bold">{t("locEditor.title")}</h2>
          {loc && <span className="text-white/40 mc-text-shadow italic">{t("locEditor.editingLoadedLoc")}</span>}
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 text-white mc-text-shadow text-lg"
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            {t("locEditor.openLoc")}
          </button>
          <button
            onClick={handleSaveLoc}
            disabled={!loc}
            className={`px-6 py-2 text-white mc-text-shadow text-lg ${!loc ? "opacity-50 grayscale" : ""}`}
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            {t("locEditor.saveLoc")}
          </button>
        </div>
      </div>
      {!loc ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-12"
          style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <img src="/images/tools/loc.png" className="w-32 h-32 mb-8 opacity-20 grayscale" style={{ imageRendering: "pixelated" }} />
          <h3 className="text-2xl text-white/40 mc-text-shadow italic">{t("locEditor.openToBegin")}</h3>
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col overflow-hidden" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="mb-4 flex gap-4 items-center">
              <select
                value={selectedLocLangIdx}
                onChange={(e) => setSelectedLocLangIdx(parseInt(e.target.value))}
                className="bg-black/40 border-2 border-[#373737] text-white px-4 py-2 outline-none focus:border-[#FFFF55] transition-colors"
              >
                {loc.languages.map((lang, idx) => (
                  <option key={idx} value={idx}>{lang.id} {lang.isStatic ? `[${t("locEditor.static")}]` : `[${t("locEditor.keyed")}]`}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t("locEditor.searchStrings")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 bg-black/40 border-2 border-[#373737] text-white px-4 py-2 outline-none focus:border-[#FFFF55] transition-colors"
              />
              <button
                onClick={() => setIsLocEditModalOpen({ langIdx: selectedLocLangIdx, strIdx: -1, isNew: true })}
                className="px-6 py-2 text-white mc-text-shadow text-sm"
                style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
              >
                {t("locEditor.addString")}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#252525] z-10">
                  <tr className="border-b-2 border-[#373737]">
                    <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold">{t("locEditor.keyOrIndex")}</th>
                    <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold">{t("locEditor.value")}</th>
                    <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold text-right">{t("locEditor.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLocStrings.map((str) => (
                    <tr key={str.originalIdx} className="border-b border-[#373737]/30 group">
                      <td className="p-3 text-[#FFFF55] font-mono text-sm max-w-[200px] truncate">
                        {currentLocLang?.isStatic ? str.originalIdx : str.key}
                      </td>
                      <td className="p-3 text-white text-sm whitespace-pre-wrap">{str.value}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setIsLocEditModalOpen({ langIdx: selectedLocLangIdx, strIdx: str.originalIdx, isNew: false })}
                            className="px-2 py-1 text-[10px] bg-white/10 hover:bg-[#FFFF55]/20 hover:text-[#FFFF55] border border-white/20 uppercase"
                          >
                            {t("locEditor.edit")}
                          </button>
                          <button onClick={() => handleLocStringDelete(selectedLocLangIdx, str.originalIdx)} className="p-1 hover:text-red-500 opacity-60">
                            <img src="/images/Trash_Bin_Icon.png" className="w-4 h-4 object-contain" style={{ imageRendering: "pixelated" }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-center mt-6 h-14 shrink-0">
        <button
          onClick={() => { playBackSound(); setActiveView("devtools"); }}
          className="w-72 h-full shrink-0 flex items-center justify-center transition-colors text-2xl mc-text-shadow outline-none border-none hover:text-[#FFFF55] text-white"
          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}
        >
          {t("locEditor.back")}
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
      {isLocEditModalOpen && (
        <LocEditModal
          data={isLocEditModalOpen}
          lang={loc?.languages[isLocEditModalOpen.langIdx]!}
          onClose={() => setIsLocEditModalOpen(null)}
          onConfirm={handleLocStringEdit}
        />
      )}
    </motion.div>
  );
}

function LocEditModal({ data, lang, onClose, onConfirm }: { data: { langIdx: number, strIdx: number, isNew: boolean }, lang: LocLanguage, onClose: () => void, onConfirm: (langIdx: number, strIdx: number, isNew: boolean, key: string, val: string) => void }) {
  const { t } = useTranslation();
  const [key, setKey] = useState(!data.isNew ? (lang.strings[data.strIdx].key || "") : "");
  const [val, setVal] = useState(!data.isNew ? lang.strings[data.strIdx].value : "");
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl p-8" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
        <h3 className="text-2xl text-[#FFFF55] mc-text-shadow mb-6 uppercase tracking-widest">{data.isNew ? t("locEditor.add") : t("locEditor.edit")} {t("locEditor.stringTitle")}</h3>
        <div className="flex flex-col gap-4">
          {!lang.isStatic ? (
            <div>
              <label className="text-white/40 text-xs uppercase mb-2 block">{t("locEditor.stringKey")}</label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full bg-black/40 border-2 border-[#373737] text-white px-4 py-3 outline-none focus:border-[#FFFF55] transition-colors font-mono"
              />
            </div>
          ) : (
            <div className="text-white/40 italic mb-2">{t("locEditor.staticEntry", { index: data.isNew ? lang.strings.length : data.strIdx })}</div>
          )}
          <div>
            <label className="text-white/40 text-xs uppercase mb-2 block">{t("locEditor.stringValue")}</label>
            <textarea
              value={val}
              onChange={(e) => setVal(e.target.value)}
              rows={6}
              className="w-full bg-black/40 border-2 border-[#373737] text-white px-4 py-3 outline-none focus:border-[#FFFF55] transition-colors resize-none"
            />
          </div>
          <div className="flex justify-end gap-4 mt-6">
            <button onClick={onClose} className="px-6 py-2 text-white/60 hover:text-white transition-colors uppercase tracking-widest">{t("locEditor.cancel")}</button>
            <button
              onClick={() => onConfirm(data.langIdx, data.strIdx, data.isNew, key, val)}
              className="px-8 py-2 text-white mc-text-shadow"
              style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
            >
              {data.isNew ? t("locEditor.add") : t("locEditor.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

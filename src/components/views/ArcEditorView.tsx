import { useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";
import { ArcService } from "../../services/ArcService";
import { ArcFile, ArcEntry, LocFile, LocLanguage } from "../../types/arc";
import { TauriService } from "../../services/TauriService";

export const ArcEditorView: React.FC = () => {
  const { t } = useTranslation();
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { animationsEnabled } = useConfig();
  const [arc, setArc] = useState<ArcFile | null>(null);
  const [openedPath, setOpenedPath] = useState<string | null>(null);
  const [loc, setLoc] = useState<LocFile | null>(null);
  const [activeTab, setActiveTab] = useState<"arc" | "loc">("arc");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEntryIdx, setSelectedEntryIdx] = useState<number | null>(null);
  const [selectedLocLangIdx, setSelectedLocLangIdx] = useState<number>(0);
  const [notification, setNotification] = useState<{ message: string, type: "success" | "error" } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isLocEditModalOpen, setIsLocEditModalOpen] = useState<{ langIdx: number, strIdx: number, isNew: boolean } | null>(null);
  const injectInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const filteredEntries = useMemo(() => {
    if (!arc) return [];
    return arc.entries.map((e, i) => ({ ...e, originalIdx: i }))
      .filter(e => e.filename.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [arc, searchTerm]);

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

  const handleFileLoad = async () => {
    try {
      const path = await TauriService.pickFile(t("arcEditor.openArc"), ["arc"]);
      if (!path) return;
      playPressSound();
      const bytes = await TauriService.readBinaryFile(path);
      const parsed = await ArcService.readARC(bytes.buffer as ArrayBuffer);
      parsed.name = path.split(/[\/\\]/).pop() || "archive.arc";
      setArc(parsed);
      setOpenedPath(path);
      
      const locEntry = parsed.entries.find(entry => entry.filename.toLowerCase() === "languages.loc");
      if (locEntry) {
        try {
          const parsedLoc = ArcService.parseLOC(locEntry.data);
          setLoc(parsedLoc);
        } catch (err) {
          console.warn("Could not parse languages.loc", err);
          setLoc(null);
        }
      } else {
        setLoc(null);
      }
      setSelectedEntryIdx(null);
      showNotification(t("arcEditor.loaded", { name: parsed.name }));
    } catch (err: unknown) {
      if (err !== "CANCELED") {
        console.error("Failed to parse ARC", err);
        showNotification(t("arcEditor.failedToParse"), "error");
      }
    }
  };

  const handleSaveArc = async () => {
    if (!arc) return;
    playPressSound();
    const buffer = ArcService.serializeARC(arc);
    const data = new Uint8Array(buffer);

    try {
      let targetPath = openedPath;
      if (!targetPath) {
        targetPath = await TauriService.saveFileDialog(t("arcEditor.saveArcDialog"), arc.name || "archive.arc", ["arc"]);
      }
      
      if (targetPath) {
        await TauriService.writeBinaryFile(targetPath, data);
        setOpenedPath(targetPath);
        showNotification(t("arcEditor.arcSaved"));
      }
    } catch (err: unknown) {
      if (err !== "CANCELED") showNotification(t("arcEditor.saveFailed"), "error");
    }
  };

  const handleExtractEntry = async (entry: ArcEntry) => {
    try {
      const fileName = entry.filename.split("/").pop() || "asset";
      const path = await TauriService.saveFileDialog(t("arcEditor.exportAssetDialog"), fileName, []);
      if (!path) return;
      playPressSound();
      await TauriService.writeBinaryFile(path, entry.data);
      showNotification(t("arcEditor.extracted", { name: entry.filename }));
    } catch (err: unknown) {
      if (err !== "CANCELED") showNotification(t("arcEditor.extractionFailed"), "error");
    }
  };

  const handleDeleteEntry = (idx: number) => {
    if (!arc) return;
    playBackSound();
    const name = arc.entries[idx].filename;
    const newEntries = [...arc.entries];
    newEntries.splice(idx, 1);
    setArc({ ...arc, entries: newEntries });
    setSelectedEntryIdx(null);
    showNotification(t("arcEditor.deleted", { name }));
  };

  const handleSaveLocToArc = () => {
    if (!loc || !arc) return;
    playPressSound();
    const data = ArcService.serializeLOC(loc);
    const locIdx = arc.entries.findIndex(e => e.filename.toLowerCase() === "languages.loc");
    const newEntries = [...arc.entries];
    if (locIdx >= 0) {
      newEntries[locIdx] = { ...newEntries[locIdx], data, size: data.length };
      showNotification(t("arcEditor.locUpdatedInArchive"));
    } else {
      newEntries.push({ filename: "languages.loc", ptr: 0, size: data.length, isCompressed: false, data });
      showNotification(t("arcEditor.locAddedToArchive"));
    }
    setArc({ ...arc, entries: newEntries });
  };

  const handleAddEntry = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!arc) return;
    const file = e.target.files?.[0];
    if (!file) return;
    playPressSound();
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const newEntry: ArcEntry = {
      filename: file.name,
      ptr: 0,
      size: data.length,
      isCompressed: false,
      data
    };
    setArc({ ...arc, entries: [...arc.entries, newEntry] });
    e.target.value = "";
    showNotification(t("arcEditor.entryAdded"));
    setIsAddModalOpen(false);
  };

  const handleReplaceEntry = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!arc || selectedEntryIdx === null) return;
    const file = e.target.files?.[0];
    if (!file) return;
    playPressSound();
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const newEntries = [...arc.entries];
    newEntries[selectedEntryIdx] = { ...newEntries[selectedEntryIdx], data, size: data.length };
    setArc({ ...arc, entries: newEntries });
    e.target.value = "";
    showNotification(t("arcEditor.entryReplaced"));
    setIsReplaceModalOpen(false);
  };

  const handleRenameEntry = (newPath: string, isCompressed: boolean) => {
    if (!arc || selectedEntryIdx === null) return;
    playPressSound();
    const newEntries = [...arc.entries];
    newEntries[selectedEntryIdx] = { ...newEntries[selectedEntryIdx], filename: newPath, isCompressed };
    setArc({ ...arc, entries: newEntries });
    setIsRenameModalOpen(false);
    showNotification(t("arcEditor.entryRenamed"));
  };

  const handleLocStringEdit = (langIdx: number, strIdx: number, isNew: boolean, key: string, value: string) => {
    if (!loc) return;
    playPressSound();
    const newLoc = { ...loc };
    const lang = newLoc.languages[langIdx];
    if (isNew) {
      lang.strings.push(lang.isStatic ? { value } : { key, value });
    } else {
      if (!lang.isStatic) lang.strings[strIdx].key = key;
      lang.strings[strIdx].value = value;
    }
    setLoc(newLoc);
    setIsLocEditModalOpen(null);
    showNotification(isNew ? t("arcEditor.stringAdded") : t("arcEditor.stringUpdated"));
  };

  const handleLocStringDelete = (langIdx: number, strIdx: number) => {
    if (!loc) return;
    playBackSound();
    const newLoc = { ...loc };
    newLoc.languages[langIdx].strings.splice(strIdx, 1);
    setLoc(newLoc);
    showNotification(t("arcEditor.stringDeleted"));
  };

  const treeData = useMemo(() => {
    const root: Record<string, any> = { name: "<root>", children: {}, isFolder: true };
    filteredEntries.forEach((entry) => {
      const parts = entry.filename.split(/\//);
      let current = root;
      parts.forEach((part, i) => {
        const isLast = i === parts.length - 1;
        if (!current.children[part]) {
          current.children[part] = isLast
            ? { ...entry, isFolder: false }
            : { name: part, children: {}, isFolder: true };
        }
        current = current.children[part];
      });
    });
    return root;
  }, [filteredEntries]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["<root>"]));
  const toggleNode = (path: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(path)) newExpanded.delete(path);
    else newExpanded.add(path);
    setExpandedNodes(newExpanded);
  };

  const renderTree = (node: Record<string, any>, path: string = "") => {
    const nodePath = path ? `${path}/${node.name}` : node.name;
    const isExpanded = expandedNodes.has(nodePath);

    if (!node.isFolder) {
      const isSelected = selectedEntryIdx === node.originalIdx;
      return (
        <div
          key={node.originalIdx}
          onClick={() => { playPressSound(); setSelectedEntryIdx(node.originalIdx); }}
          className={`group flex items-center gap-2 px-2 py-1 cursor-pointer ${isSelected ? "bg-[#FFFF55]/20 text-[#FFFF55]" : "text-white/80"}`}
        >
          <img src="/images/Download_Icon.png" className="w-3 h-3 opacity-40" style={{ imageRendering: "pixelated" }} />
          <span className="truncate text-sm font-medium tracking-tight">
            {node.filename.split("/").pop()}
          </span>
          {node.isCompressed && (
            <span className="ml-auto text-[8px] opacity-40 border border-white/20 px-1">{t("arcEditor.zlib")}</span>
          )}
        </div>
      );
    }

    return (
      <div key={nodePath} className="flex flex-col">
        <div
          onClick={() => { playPressSound(); toggleNode(nodePath); }}
          className="flex items-center gap-2 px-2 py-1.5 cursor-pointer text-white/50 group"
        >
          <motion.span
            animate={{ rotate: isExpanded ? 90 : 0 }}
            className="text-[10px]"
          >
            ▶
          </motion.span>
          <img src="/images/tools/arc.png" className="w-4 h-4 opacity-40 grayscale" style={{ imageRendering: "pixelated" }} />
          <span className="text-xs uppercase tracking-widest font-bold group-hover:text-white/80 transition-colors">
            {node.name}
          </span>
        </div>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="ml-4 border-l border-white/10 overflow-hidden"
            >
              {Object.values(node.children as Record<string, any>).map((child: Record<string, any>) => renderTree(child, nodePath))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const handleExportAll = async () => {
    if (!arc || arc.entries.length === 0) return;
    try {
      const baseFolder = await TauriService.pickFolder();
      if (!baseFolder) return;
      playPressSound();
      showNotification(t("arcEditor.exportingAll"));
      
      for (const entry of arc.entries) {
        const fileName = entry.filename.replace(/\//g, "_");
        await TauriService.writeBinaryFile(`${baseFolder}/${fileName}`, entry.data);
      }
      showNotification(t("arcEditor.allEntriesExported"));
    } catch (err: unknown) {
      if (err !== "CANCELED") showNotification(t("arcEditor.exportFailed"), "error");
    }
  };

  const selectedEntry = selectedEntryIdx !== null ? arc?.entries[selectedEntryIdx] : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-7xl h-full outline-none"
    >
      <div className="w-full flex justify-between items-center mb-4 px-8">
        <h2 className="text-2xl text-white mc-text-shadow border-b-2 border-[#373737] pb-1 tracking-widest uppercase font-bold">
          {t("arcEditor.title")}
        </h2>
        <div className="flex gap-4">
          <button
            onClick={handleFileLoad}
            className="px-6 py-2 text-white mc-text-shadow transition-all hover:text-[#FFFF55] text-lg outline-none"
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            {t("arcEditor.openArc")}
          </button>
          <button
            onClick={handleExportAll}
            disabled={!arc || arc.entries.length === 0}
            className={`px-6 py-2 text-white mc-text-shadow transition-all hover:text-[#FFFF55] text-lg outline-none ${(!arc || arc.entries.length === 0) ? "opacity-50 grayscale" : ""}`}
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            {t("arcEditor.exportAll")}
          </button>
          <button
            onClick={handleSaveArc}
            disabled={!arc}
            className={`px-6 py-2 text-white mc-text-shadow transition-all hover:text-[#FFFF55] text-lg outline-none ${!arc ? "opacity-50 grayscale" : ""}`}
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            {t("arcEditor.saveArc")}
          </button>
        </div>
      </div>

      <input type="file" ref={injectInputRef} onChange={handleAddEntry} className="hidden" />
      <input type="file" ref={replaceInputRef} onChange={handleReplaceEntry} className="hidden" />

      {!arc ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-12"
          style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <img src="/images/tools/arc.png" className="w-32 h-32 mb-8 opacity-20 grayscale" style={{ imageRendering: "pixelated" }} />
          <h3 className="text-2xl text-white/40 mc-text-shadow italic">{t("arcEditor.openArcFile")}</h3>
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col overflow-hidden" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <div className="flex gap-1 p-2 pt-4 border-b-2 border-[#373737]">
            <button
              onClick={() => { playPressSound(); setActiveTab("arc"); }}
              className={`flex items-center gap-3 px-6 py-2 mc-text-shadow ${activeTab === "arc" ? "text-[#FFFF55] opacity-100" : "text-white opacity-40"}`}
            >
              <img src="/images/tools/arc.png" className={`w-5 h-5 object-contain ${activeTab === "arc" ? "" : "grayscale opacity-50"}`} style={{ imageRendering: "pixelated" }} />
              <span className="text-lg uppercase tracking-wider font-bold">{t("arcEditor.archive")}</span>
            </button>
            <button
              onClick={() => { playPressSound(); setActiveTab("loc"); }}
              className={`flex items-center gap-3 px-6 py-2 mc-text-shadow ${activeTab === "loc" ? "text-[#FFFF55] opacity-100" : "text-white opacity-40"}`}
            >
              <img src="/images/tools/loc.png" className={`w-5 h-5 object-contain ${activeTab === "loc" ? "" : "grayscale opacity-50"}`} style={{ imageRendering: "pixelated" }} />
              <span className="text-lg uppercase tracking-wider font-bold">{t("arcEditor.languagesLoc")}</span>
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === "arc" ? (
              <div className="flex h-full overflow-hidden">
                <div className="w-2/3 flex flex-col p-4 border-r-2 border-black/20">
                  <div className="mb-4 flex gap-4">
                    <input
                      type="text"
                      placeholder={t("arcEditor.searchEntries")}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="flex-1 bg-black/40 border-2 border-[#373737] text-white px-4 py-2 outline-none focus:border-[#FFFF55] transition-colors"
                    />
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="px-6 py-2 text-white mc-text-shadow text-sm"
                      style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                    >
                      {t("arcEditor.addEntry")}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {renderTree(treeData)}
                  </div>
                </div>
                <div className="w-1/3 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                  {selectedEntry ? (
                    <div className="flex flex-col gap-6">
                      <div className="p-4 bg-black/40 border-2 border-[#373737]">
                        <h4 className="text-[#FFFF55] mc-text-shadow font-bold text-sm uppercase tracking-widest mb-1">{t("arcEditor.entryDetails")}</h4>
                        <p className="text-white text-xs break-all font-mono opacity-80">{selectedEntry.filename}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="bg-black/20 p-3">
                          <span className="block text-[10px] text-white/40 uppercase tracking-tighter text-left">{t("arcEditor.size")}</span>
                          <span className="text-white text-sm">{(selectedEntry.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="bg-black/20 p-3">
                          <span className="block text-[10px] text-white/40 uppercase tracking-tighter text-left">{t("arcEditor.format")}</span>
                          <span className="text-white text-sm uppercase">{selectedEntry.isCompressed ? t("arcEditor.compressed") : t("arcEditor.raw")}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => handleExtractEntry(selectedEntry)}
                          className="w-full py-2 text-white mc-text-shadow text-sm transition-all hover:text-[#FFFF55]"
                          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                        >
                          {t("arcEditor.exportFile")}
                        </button>
                        <button
                          onClick={() => setIsReplaceModalOpen(true)}
                          className="w-full py-2 text-white mc-text-shadow text-sm transition-all hover:text-[#FFFF55]"
                          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                        >
                          {t("arcEditor.replaceData")}
                        </button>
                        <button
                          onClick={() => setIsRenameModalOpen(true)}
                          className="w-full py-2 text-white mc-text-shadow text-sm transition-all hover:text-[#FFFF55]"
                          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                        >
                          {t("arcEditor.renamePath")}
                        </button>
                        <button
                          onClick={() => {
                            if (!arc) return;
                            const newEntries = [...arc.entries];
                            newEntries[selectedEntryIdx!] = { ...selectedEntry, isCompressed: !selectedEntry.isCompressed };
                            setArc({ ...arc, entries: newEntries });
                            showNotification(!selectedEntry.isCompressed ? t("arcEditor.compressionEnabled") : t("arcEditor.compressionDisabled"));
                          }}
                          className={`w-full py-2 text-white mc-text-shadow text-sm transition-all ${selectedEntry.isCompressed ? "text-[#FFFF55]" : "opacity-60"}`}
                          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                        >
                          {selectedEntry.isCompressed ? t("arcEditor.zlibCompressed") : t("arcEditor.uncompressed")}
                        </button>
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <button
                            onClick={() => handleDeleteEntry(selectedEntryIdx!)}
                            className="w-full py-2 text-red-500/80 mc-text-shadow text-sm hover:text-red-500"
                            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                          >
                            {t("arcEditor.deleteEntry")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-20 italic">
                      <img src="/images/tools/arc.png" className="w-16 h-16 mb-4 grayscale" style={{ imageRendering: "pixelated" }} />
                      <p className="text-white">{t("arcEditor.selectEntry")}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col p-4 overflow-hidden h-full">
                {!loc ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <h4 className="text-xl text-white/40 mc-text-shadow italic mb-4">{t("arcEditor.noLocFound")}</h4>
                    <button
                      onClick={() => {
                        setLoc({ version: 0, languages: [{ id: "en_US", version: 1, isStatic: false, langId: "en_US", strings: [] }] });
                        showNotification(t("arcEditor.createdNewLocaleStructure"));
                      }}
                      className="px-6 py-2 text-white mc-text-shadow text-lg"
                      style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                    >
                      {t("arcEditor.createLoc")}
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="mb-4 flex gap-4 items-center">
                      <select
                        value={selectedLocLangIdx}
                        onChange={(e) => setSelectedLocLangIdx(parseInt(e.target.value))}
                        className="bg-black/40 border-2 border-[#373737] text-white px-4 py-2 outline-none focus:border-[#FFFF55] transition-colors"
                      >
                        {loc.languages.map((lang, idx) => (
                          <option key={idx} value={idx}>{lang.id} {lang.isStatic ? `[${t("arcEditor.static")}]` : `[${t("arcEditor.keyed")}]`}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder={t("arcEditor.searchStrings")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 bg-black/40 border-2 border-[#373737] text-white px-4 py-2 outline-none focus:border-[#FFFF55] transition-colors"
                      />
                      <button
                        onClick={() => setIsLocEditModalOpen({ langIdx: selectedLocLangIdx, strIdx: -1, isNew: true })}
                        className="px-6 py-2 text-white mc-text-shadow text-sm"
                        style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                      >
                        {t("arcEditor.addString")}
                      </button>
                      <button
                        onClick={handleSaveLocToArc}
                        className="px-6 py-2 text-[#FFFF55] mc-text-shadow text-sm"
                        style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                      >
                        {t("arcEditor.writeToArc")}
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-[#252525] z-10">
                          <tr className="border-b-2 border-[#373737]">
                            <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold">{t("arcEditor.keyOrIndex")}</th>
                            <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold">{t("arcEditor.value")}</th>
                            <th className="p-3 text-white/40 uppercase text-xs tracking-widest font-bold text-right">{t("arcEditor.actions")}</th>
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
                                    {t("arcEditor.edit")}
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
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex justify-center mt-6 h-14 w-full shrink-0">
        <button
          onClick={() => { playBackSound(); setActiveView("devtools"); }}
          className="w-72 h-full shrink-0 flex items-center justify-center transition-colors text-2xl mc-text-shadow outline-none border-none hover:text-[#FFFF55] text-white"
          style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}
        >
          {t("arcEditor.back")}
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
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-8" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
            <h3 className="text-2xl text-[#FFFF55] mc-text-shadow mb-6">{t("arcEditor.addFileToArchive")}</h3>
            <div className="flex flex-col gap-6">
              <button
                onClick={() => injectInputRef.current?.click()}
                className="w-full py-3 text-white mc-text-shadow"
                style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
              >
                {t("arcEditor.selectSourceFile")}
              </button>
              <div className="flex justify-end gap-4 mt-4">
                <button onClick={() => setIsAddModalOpen(false)} className="px-6 py-2 text-white/60 hover:text-white transition-colors">{t("arcEditor.cancel")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isReplaceModalOpen && selectedEntryIdx !== null && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-8" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
            <h3 className="text-2xl text-[#FFFF55] mc-text-shadow mb-4">{t("arcEditor.replaceFileData")}</h3>
            <p className="text-white/60 mb-6 truncate">{arc?.entries[selectedEntryIdx].filename}</p>
            <div className="flex flex-col gap-6">
              <button
                onClick={() => replaceInputRef.current?.click()}
                className="w-full py-3 text-white mc-text-shadow"
                style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
              >
                {t("arcEditor.selectNewFile")}
              </button>
              <div className="flex justify-end gap-4 mt-4">
                <button onClick={() => setIsReplaceModalOpen(false)} className="px-6 py-2 text-white/60 hover:text-white transition-colors">{t("arcEditor.cancel")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isRenameModalOpen && selectedEntryIdx !== null && (
        <RenameModal
          initialName={arc?.entries[selectedEntryIdx].filename || ""}
          initialCompressed={arc?.entries[selectedEntryIdx].isCompressed || false}
          onClose={() => setIsRenameModalOpen(false)}
          onConfirm={handleRenameEntry}
        />
      )}
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

function RenameModal({ initialName, initialCompressed, onClose, onConfirm }: { initialName: string, initialCompressed: boolean, onClose: () => void, onConfirm: (name: string, comp: boolean) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [comp, setComp] = useState(initialCompressed);
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg p-8" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
        <h3 className="text-2xl text-[#FFFF55] mc-text-shadow mb-6 uppercase tracking-widest">{t("arcEditor.renameEntry")}</h3>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-white/40 text-xs uppercase mb-2 block">{t("arcEditor.newArchivePath")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/40 border-2 border-[#373737] text-white px-4 py-3 outline-none focus:border-[#FFFF55] transition-colors"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} className="w-5 h-5 accent-[#FFFF55]" />
            <span className="text-white group-hover:text-[#FFFF55] transition-colors">{t("arcEditor.markAsCompressed")}</span>
          </label>
          <div className="flex justify-end gap-4 mt-6">
            <button onClick={onClose} className="px-6 py-2 text-white/60 hover:text-white transition-colors uppercase tracking-widest">{t("arcEditor.cancel")}</button>
            <button
              onClick={() => onConfirm(name, comp)}
              className="px-8 py-2 text-white mc-text-shadow"
              style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
            >
              {t("arcEditor.rename")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LocEditModal({ data, lang, onClose, onConfirm }: { data: { langIdx: number, strIdx: number, isNew: boolean }, lang: LocLanguage, onClose: () => void, onConfirm: (langIdx: number, strIdx: number, isNew: boolean, key: string, val: string) => void }) {
  const { t } = useTranslation();
  const [key, setKey] = useState(!data.isNew ? (lang.strings[data.strIdx].key || "") : "");
  const [val, setVal] = useState(!data.isNew ? lang.strings[data.strIdx].value : "");
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl p-8" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
        <h3 className="text-2xl text-[#FFFF55] mc-text-shadow mb-6 uppercase tracking-widest">{data.isNew ? t("arcEditor.add") : t("arcEditor.edit")} {t("arcEditor.stringTitle")}</h3>
        <div className="flex flex-col gap-4">
          {!lang.isStatic ? (
            <div>
              <label className="text-white/40 text-xs uppercase mb-2 block">{t("arcEditor.stringKey")}</label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full bg-black/40 border-2 border-[#373737] text-white px-4 py-3 outline-none focus:border-[#FFFF55] transition-colors font-mono"
              />
            </div>
          ) : (
            <div className="text-white/40 italic mb-2">{t("arcEditor.staticEntry", { index: data.isNew ? lang.strings.length : data.strIdx })}</div>
          )}
          <div>
            <label className="text-white/40 text-xs uppercase mb-2 block">{t("arcEditor.stringValue")}</label>
            <textarea
              value={val}
              onChange={(e) => setVal(e.target.value)}
              rows={6}
              className="w-full bg-black/40 border-2 border-[#373737] text-white px-4 py-3 outline-none focus:border-[#FFFF55] transition-colors resize-none"
            />
          </div>
          <div className="flex justify-end gap-4 mt-6">
            <button onClick={onClose} className="px-6 py-2 text-white/60 hover:text-white transition-colors uppercase tracking-widest">{t("arcEditor.cancel")}</button>
            <button
              onClick={() => onConfirm(data.langIdx, data.strIdx, data.isNew, key, val)}
              className="px-8 py-2 text-white mc-text-shadow"
              style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
            >
              {data.isNew ? t("arcEditor.add") : t("arcEditor.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


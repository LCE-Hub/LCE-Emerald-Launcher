import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConfig, useAudio, useUI } from "../../context/LauncherContext";
import { SwfImage, SwfService, SwfTag } from "../../services/SwfService";
export default function SwfView() {
  const { animationsEnabled } = useConfig();
  const { playBackSound, playPressSound } = useAudio();
  const { setActiveView } = useUI();
  const [swfData, setSwfData] = useState<{ version: number, compressed: boolean, frameHeader: Uint8Array, tags: SwfTag[] } | null>(null);
  const [images, setImages] = useState<SwfImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  const [notification, setNotification] = useState<{ message: string, type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const filteredImages = useMemo(() => {
    return images.filter(img =>
      img.id.toString().includes(searchTerm) ||
      (img.name && img.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [images, searchTerm]);

  const selectedImage = useMemo(() => {
    return images.find(img => img.id === selectedImageId) || null;
  }, [images, selectedImageId]);

  const handleBack = useCallback(() => {
    playBackSound();
    setActiveView("devtools");
  }, [playBackSound, setActiveView]);

  const loadUrl = async (img: SwfImage) => {
    if (imageUrls[img.id]) return imageUrls[img.id];
    let url = "";
    if (img.type === "jpeg") {
      const blob = new Blob([img.data as any], { type: "image/jpeg" });
      url = URL.createObjectURL(blob);
    } else if (img.type === "lossless") {
      const rgba = await SwfService.decodeLosslessToRGBA(img);
      const canvas = document.createElement("canvas");
      canvas.width = img.width!;
      canvas.height = img.height!;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const imageData = new ImageData(new Uint8ClampedArray(rgba), img.width!, img.height!);
        ctx.putImageData(imageData, 0, 0);
        url = canvas.toDataURL();
      }
    }
    if (url) {
      setImageUrls(prev => ({ ...prev, [img.id]: url }));
    }
    return url;
  };

  useEffect(() => {
    if (selectedImage) {
      loadUrl(selectedImage);
    }
  }, [selectedImage]);

  const processFile = async (file: File) => {
    setFileName(file.name);
    setImageUrls({});
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const swf = SwfService.parse(bytes);
      setSwfData(swf);
      const extracted = SwfService.extractImages(swf.tags);
      setImages(extracted);
      if (extracted.length > 0) {
        setSelectedImageId(extracted[0].id);
      }
      showNotification(`Loaded ${file.name}`);
    } catch (e: any) {
      console.error(e);
      showNotification("Failed to process SWF", "error");
      setImages([]);
      setSwfData(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDownload = async (img: SwfImage) => {
    playPressSound();
    let blob: Blob;
    let ext = "png";
    if (img.type === "jpeg") {
      blob = new Blob([img.data as any], { type: "image/jpeg" });
      ext = "jpg";
    } else if (img.type === "lossless") {
      const rgba = await SwfService.decodeLosslessToRGBA(img);
      const canvas = document.createElement("canvas");
      canvas.width = img.width!;
      canvas.height = img.height!;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const imageData = new ImageData(new Uint8ClampedArray(rgba), img.width!, img.height!);
        ctx.putImageData(imageData, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        const res = await fetch(dataUrl);
        blob = await res.blob();
      } else {
        blob = new Blob([rgba as any], { type: "application/octet-stream" });
        ext = "bin";
      }
    } else {
      blob = new Blob([img.data as any], { type: "application/octet-stream" });
      ext = "bin";
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${img.name || `image_${img.id}`}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification(`Exported: ${img.name || img.id}`);
  };

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!swfData || !selectedImageId || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    playPressSound();
    const buffer = await file.arrayBuffer();
    const newData = new Uint8Array(buffer);
    const newTags = SwfService.updateImageTag(
      swfData.tags,
      selectedImageId,
      newData,
      selectedImage?.type || "unknown"
    );

    const newSwfData = { ...swfData, tags: newTags };
    setSwfData(newSwfData);
    const extracted = SwfService.extractImages(newTags);
    setImages(extracted);
    setImageUrls(prev => {
      const next = { ...prev };
      delete next[selectedImageId];
      return next;
    });

    showNotification("Image Replaced", "success");
    e.target.value = "";
  };

  const handleSaveSwf = () => {
    if (!swfData) return;
    playPressSound();
    const result = SwfService.serialize(swfData.version, swfData.compressed, swfData.frameHeader, swfData.tags);
    const blob = new Blob([result as any], { type: "application/x-shockwave-flash" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "output.swf";
    a.click();
    URL.revokeObjectURL(url);
    showNotification("SWF Saved Successfully");
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-6xl h-[85vh] outline-none"
    >
      <div className="w-full flex justify-between items-center mb-4 px-8">
        <h2 className="text-2xl text-white mc-text-shadow border-b-2 border-[#373737] pb-1 tracking-widest uppercase font-bold">
          SWF Editor
        </h2>
        <div className="flex gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
            className="px-6 py-2 text-white mc-text-shadow transition-all hover:text-[#ffff00] text-lg outline-none"
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Open SWF
          </button>
          <button
            onClick={handleSaveSwf}
            disabled={!swfData}
            onMouseEnter={(e) => !(!swfData) && (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
            className={`px-6 py-2 text-white mc-text-shadow transition-all hover:text-[#ffff00] text-lg outline-none ${!swfData ? "opacity-50 grayscale" : ""}`}
            style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
          >
            Save SWF
          </button>
        </div>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".swf" />
      <input type="file" ref={replaceInputRef} onChange={handleReplace} className="hidden" />

      {!swfData ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-12"
          style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
          <img src="/images/tools/arc.png" className="w-32 h-32 mb-8 opacity-20 grayscale" style={{ imageRendering: "pixelated" }} />
          <h3 className="text-2xl text-white/40 mc-text-shadow italic">Open an SWF file to begin editing</h3>
        </div>
      ) : (
        <div className="flex-1 w-full flex gap-4 overflow-hidden">
          <div className="w-1/3 flex flex-col p-4" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search assets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/40 border-2 border-[#373737] text-white px-4 py-2 outline-none focus:border-[#ffff00] transition-colors"
              />
            </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-1">
              {filteredImages.map(img => (
                <div
                  key={img.id}
                  onClick={() => { playPressSound(); setSelectedImageId(img.id); }}
                  className={`flex items-center gap-3 p-3 cursor-pointer transition-all border-l-4 ${selectedImageId === img.id
                    ? "bg-[#ffff00]/10 border-[#ffff00] text-[#ffff00]"
                    : "border-transparent hover:bg-white/5 text-white/60 hover:text-white"
                    }`}
                >
                  <img src="/images/tools/arc.png" className={`w-5 h-5 object-contain ${selectedImageId === img.id ? "" : "grayscale"}`} style={{ imageRendering: "pixelated" }} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold truncate">ID: {img.id} {img.name ? `- ${img.name}` : ""}</span>
                    <span className="text-[10px] uppercase opacity-60">{img.type} {img.width ? `(${img.width}x${img.height})` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-2/3 flex flex-col p-6 overflow-y-auto" style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}>
            <AnimatePresence mode="wait">
              {!selectedImage ? (
                <div className="flex-1 flex flex-col items-center justify-center text-white/20 italic gap-4">
                  <span>Select an image to view details</span>
                </div>
              ) : (
                <motion.div
                  key={selectedImage.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col h-full"
                >
                  <div className="flex justify-between items-start mb-6 border-b border-[#373737] pb-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-[#ffff00] text-2xl mc-text-shadow">
                        {selectedImage.name || `Bitmap ${selectedImage.id}`}
                      </h3>
                      <div className="flex gap-4 text-xs uppercase tracking-widest text-white/40">
                        <span>Character ID: <span className="text-white/80">{selectedImage.id}</span></span>
                        <span>Type: <span className="text-white/80">{selectedImage.type}</span></span>
                        {selectedImage.width && <span>Size: <span className="text-white/80">{selectedImage.width}x{selectedImage.height}</span></span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 bg-black/40 border-2 border-[#373737] mb-6 flex items-center justify-center overflow-hidden relative group pattern-checkerboard">
                    {imageUrls[selectedImage.id] ? (
                      <img
                        src={imageUrls[selectedImage.id]}
                        className="max-w-full max-h-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                        alt={`Bitmap ${selectedImage.id}`}
                      />
                    ) : (
                      <div className="text-white/20 italic">Loading Preview...</div>
                    )}
                  </div>

                  <div className="flex gap-4 mt-auto">
                    <button
                      onClick={() => handleDownload(selectedImage)}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
                      className="flex-1 py-3 text-white mc-text-shadow text-lg transition-all hover:text-[#ffff00]"
                      style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                    >
                      Export Bitmap
                    </button>
                    <button
                      onClick={() => replaceInputRef.current?.click()}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
                      className="flex-1 py-3 text-white mc-text-shadow text-lg transition-all hover:text-[#ffff00]"
                      style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%" }}
                    >
                      Replace Bitmap
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <button
        onClick={handleBack}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundImage = "url('/images/button_highlighted.png')")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundImage = "url('/images/Button_Background.png')")}
        className="w-72 h-14 flex items-center justify-center transition-colors text-2xl mc-text-shadow mt-6 outline-none border-none hover:text-[#ffff00] text-white"
        style={{ backgroundImage: "url('/images/Button_Background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}
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
            style={{ backgroundImage: "url('/images/frame_background.png')", backgroundSize: "100% 100%", imageRendering: "pixelated" }}
          >
            <span className="text-white text-lg mc-text-shadow font-bold tracking-widest uppercase">
              {notification.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .pattern-checkerboard {
            background-color: #2a2a2a;
            background-image: linear-gradient(45deg, #1a1a1a 25%, transparent 25%, transparent 75%, #1a1a1a 75%, #1a1a1a), 
                              linear-gradient(45deg, #1a1a1a 25%, transparent 25%, transparent 75%, #1a1a1a 75%, #1a1a1a);
            background-size: 16px 16px;
            background-position: 0 0, 8px 8px;
        }
      `}</style>
    </motion.div>
  );
}

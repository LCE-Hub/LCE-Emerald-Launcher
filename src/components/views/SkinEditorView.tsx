import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useUI, useAudio, useConfig, useSkin } from "../../context/LauncherContext";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { TauriService } from "../../services/TauriService";
import SkinEditorPreview from "../common/SkinEditorPreview";

type Tool = "pencil" | "eraser" | "eyedropper" | "fill";

interface SavedSkin {
  id: string;
  name: string;
  url: string;
  isSlim?: boolean;
}

const DYE_COLORS = [
  "#F9FFFE", "#9D9D97", "#474F52", "#1D1D21",
  "#835432", "#B02E26", "#F9801D", "#FED83D",
  "#80C71F", "#5E7C16", "#169C9C", "#3AB3DA",
  "#3C44AA", "#8932B8", "#C74EBD", "#F38BAA",
  "#FFE0BD", "#E0AC69", "#C68642", "#8D5524",
  "#5C3317", "#B5804A", "#3C8C8F", "#4C4C4C",
];

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
    a: Math.round(alpha * 255),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function drawLine(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (true) {
    plot(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

function fillRegion(data: Uint8ClampedArray, w: number, h: number, x: number, y: number, color: { r: number; g: number; b: number; a: number }) {
  const idx = (px: number, py: number) => (py * w + px) * 4;
  const i = idx(x, y);
  const tr = data[i], tg = data[i + 1], tb = data[i + 2], ta = data[i + 3];
  if (tr === color.r && tg === color.g && tb === color.b && ta === color.a) return;
  const stack = [[x, y]];
  const seen = new Uint8Array(w * h);
  while (stack.length) {
    const popped = stack.pop();
    if (!popped) break;
    const [px, py] = popped;
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const si = py * w + px;
    if (seen[si]) continue;
    const pi = idx(px, py);
    if (data[pi] !== tr || data[pi + 1] !== tg || data[pi + 2] !== tb || data[pi + 3] !== ta) continue;
    seen[si] = 1;
    data[pi] = color.r;
    data[pi + 1] = color.g;
    data[pi + 2] = color.b;
    data[pi + 3] = color.a;
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

const SkinEditorView = memo(function SkinEditorView() {
  const { t } = useTranslation();
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { animationsEnabled, username } = useConfig();
  const { skinUrl, setSkinUrl, skinIsSlim, setSkinIsSlim } = useSkin();
  const [storedSkins, setStoredSkins] = useLocalStorage<SavedSkin[]>("lce-custom-skins", []);

  const cvsRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const undoStack = useRef<ImageData[]>([]);
  const isPainting = useRef(false);
  const lastPx = useRef<{ x: number; y: number } | null>(null);
  const colorRef = useRef("#8B8B8B");
  const alphaRef = useRef(1);
  const toolRef = useRef<Tool>("pencil");
  const pickerRef = useRef<HTMLDivElement>(null);
  const satValCvsRef = useRef<HTMLCanvasElement>(null);
  const hueCvsRef = useRef<HTMLCanvasElement>(null);
  const isDraggingSatVal = useRef(false);
  const isDraggingHue = useRef(false);
  const rafRef = useRef<number | null>(null);

  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#8B8B8B");
  const [hexValue, setHexValue] = useState("8B8B8B");
  const [hsv, setHsv] = useState(() => rgbToHsv(139, 139, 139));
  const [showPicker, setShowPicker] = useState(false);
  const [alpha, setAlpha] = useState(1);
  const [slim, setSlim] = useState(skinIsSlim);
  const [showGrid, setShowGrid] = useState(true);
  const [previewTick, setPreviewTick] = useState(0);
  const [texHeight, setTexHeight] = useState(64);
  const [previewCvs, setPreviewCvs] = useState<HTMLCanvasElement | null>(null);
  const [focusBtn, setFocusBtn] = useState<string | null>(null);

  const setColorFromHsv = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    const { r, g, b } = hsvToRgb(next.h, next.s, next.v);
    setColor(rgbToHex(r, g, b));
  };

  const setColorFromHex = (hex: string) => {
    const normalized = hex.startsWith("#") ? hex : `#${hex}`;
    setColor(normalized);
    const { r, g, b } = hexToRgba(normalized, 1);
    setHsv(rgbToHsv(r, g, b));
  };

  colorRef.current = color;
  alphaRef.current = alpha;
  toolRef.current = tool;

  useEffect(() => {
    setHexValue(color.replace("#", "").toUpperCase());
  }, [color]);

  const requestTick = () => { //dotn hit setSkinUrl from here, it would spam pck gen
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setPreviewTick((n) => n + 1);
    });
  };

  const pushUndo = () => {
    const cvs = cvsRef.current;
    const ctx = cvs?.getContext("2d");
    if (!cvs || !ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, cvs.width, cvs.height));
    if (undoStack.current.length > 50) undoStack.current.shift();
  };

  const redrawGrid = useCallback(() => {
    const cvs = cvsRef.current;
    const grid = gridRef.current;
    if (!cvs || !grid) return;
    const ctx = grid.getContext("2d");
    if (!ctx) return;
    const scale = grid.width / cvs.width;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, grid.width, grid.height);
    ctx.drawImage(cvs, 0, 0, grid.width, grid.height);
    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= cvs.width; i++) {
        ctx.beginPath();
        ctx.moveTo(i * scale + 0.5, 0);
        ctx.lineTo(i * scale + 0.5, grid.height);
        ctx.stroke();
      }
      for (let i = 0; i <= cvs.height; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * scale + 0.5);
        ctx.lineTo(grid.width, i * scale + 0.5);
        ctx.stroke();
      }
    }
  }, [showGrid]);

  useEffect(() => {
    let cancelled = false;
    const cvs = document.createElement("canvas");
    cvsRef.current = cvs;
    undoStack.current = [];
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      cvs.width = 64;
      cvs.height = img.height === 32 ? 32 : 64;
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.drawImage(img, 0, 0);
      setTexHeight(cvs.height);
      setPreviewCvs(cvs);
      requestTick();
    };
    img.src = skinUrl || "/images/Default.png";
    return () => { cancelled = true; };
  }, [skinUrl]);

  useEffect(() => {
    redrawGrid();
  }, [showGrid, previewTick, texHeight, redrawGrid]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showPicker) return;
    const closePicker = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setShowPicker(false);
    };
    window.addEventListener("mousedown", closePicker);
    return () => window.removeEventListener("mousedown", closePicker);
  }, [showPicker]);

  useEffect(() => {
    const satVal = satValCvsRef.current;
    if (!satVal) return;
    const ctx = satVal.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < satVal.height; y++) {
      for (let x = 0; x < satVal.width; x++) {
        const { r, g, b } = hsvToRgb(hsv.h, x / (satVal.width - 1), 1 - y / (satVal.height - 1));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [hsv.h, showPicker]);

  useEffect(() => {
    const hueBar = hueCvsRef.current;
    if (!hueBar) return;
    const ctx = hueBar.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let x = 0; x < hueBar.width; x++) {
      const { r, g, b } = hsvToRgb((x / (hueBar.width - 1)) * 360, 1, 1);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 1, hueBar.height);
    }
  }, [showPicker]);

  const handleSatValPick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = satValCvsRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    setColorFromHsv({ ...hsv, s, v });
  };

  const handleHuePick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = hueCvsRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const h = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * 360;
    setColorFromHsv({ ...hsv, h });
  };

  const getGridPixel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const grid = gridRef.current;
    const cvs = cvsRef.current;
    if (!grid || !cvs) return null;
    const rect = grid.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * cvs.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * cvs.height);
    if (x < 0 || y < 0 || x >= cvs.width || y >= cvs.height) return null;
    return { x, y };
  };

  const paintPixel = (x: number, y: number, erase: boolean) => {
    const ctx = cvsRef.current?.getContext("2d");
    if (!ctx) return;
    if (erase) {
      ctx.clearRect(x, y, 1, 1);
      return;
    }
    const { r, g, b, a } = hexToRgba(colorRef.current, alphaRef.current);
    ctx.clearRect(x, y, 1, 1);
    ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
    ctx.fillRect(x, y, 1, 1);
  };

  const applyTool = (x: number, y: number) => {
    const cvs = cvsRef.current;
    const ctx = cvs?.getContext("2d");
    if (!cvs || !ctx) return;
    const currentTool = toolRef.current;
    if (currentTool === "eyedropper") {
      const p = ctx.getImageData(x, y, 1, 1).data;
      const hex = "#" + [p[0], p[1], p[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
      setColor(hex);
      setHsv(rgbToHsv(p[0], p[1], p[2]));
      setAlpha(p[3] / 255);
      return;
    }
    if (currentTool === "fill") {
      const img = ctx.getImageData(0, 0, cvs.width, cvs.height);
      fillRegion(img.data, cvs.width, cvs.height, x, y, hexToRgba(colorRef.current, alphaRef.current));
      ctx.putImageData(img, 0, 0);
      return;
    }
    paintPixel(x, y, currentTool === "eraser");
  };

  const handleGridDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const p = getGridPixel(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pushUndo();
    isPainting.current = toolRef.current !== "eyedropper" && toolRef.current !== "fill";
    applyTool(p.x, p.y);
    lastPx.current = p;
    requestTick();
  };

  const handleGridMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPainting.current) return;
    const p = getGridPixel(e);
    if (!p) return;
    const last = lastPx.current;
    const erase = toolRef.current === "eraser";
    if (last) drawLine(last.x, last.y, p.x, p.y, (x, y) => paintPixel(x, y, erase));
    else paintPixel(p.x, p.y, erase);
    lastPx.current = p;
    requestTick();
  };

  const handleGridUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isPainting.current = false;
    lastPx.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleUndo = useCallback(() => {
    const snap = undoStack.current.pop();
    const ctx = cvsRef.current?.getContext("2d");
    if (!snap || !ctx) return;
    ctx.putImageData(snap, 0, 0);
    requestTick();
  }, []);

  const handleSave = () => {
    const cvs = cvsRef.current;
    if (!cvs) return;
    playPressSound();
    const dataUrl = cvs.toDataURL("image/png");
    const existing = storedSkins.find((s) => s.url === skinUrl);
    if (existing) {
      setStoredSkins(storedSkins.map((s) => (s.id === existing.id ? { ...s, url: dataUrl, isSlim: slim } : s)));
    } else {
      setStoredSkins([...storedSkins, { id: Date.now().toString(), name: t("skinEditor.customSkin"), url: dataUrl, isSlim: slim }]);
    }
    setSkinUrl(dataUrl);
    setSkinIsSlim(slim);
    setActiveView("skins");
  };

  const handleExport = async () => {
    const cvs = cvsRef.current;
    if (!cvs) return;
    playPressSound();
    try {
      const safeName = (username || "skin").replace(/[^a-zA-Z0-9_-]/g, "") || "skin";
      const fileName = `${safeName}.png`;
      const path = await TauriService.saveFileDialog(t("skinEditor.exportSkin"), fileName, []);
      if (!path) return;
      const outPath = path.toLowerCase().endsWith(".png") ? path : `${path}.png`;
      const res = await fetch(cvs.toDataURL("image/png"));
      const data = new Uint8Array(await res.arrayBuffer());
      await TauriService.writeBinaryFile(outPath, data);
    } catch (err: unknown) {
      if (err !== "CANCELED") console.error("Failed to export skin", err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showPicker) {
          setShowPicker(false);
          return;
        }
        playBackSound();
        setActiveView("skins");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "b" || e.key === "B") setTool("pencil");
      else if (e.key === "e" || e.key === "E") setTool("eraser");
      else if (e.key === "i" || e.key === "I") setTool("eyedropper");
      else if (e.key === "g" || e.key === "G") setTool("fill");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playBackSound, setActiveView, handleUndo, showPicker]);

  const tools: { id: Tool; label: string }[] = [
    { id: "pencil", label: t("skinEditor.pencil") },
    { id: "eraser", label: t("skinEditor.eraser") },
    { id: "eyedropper", label: t("skinEditor.pick") },
    { id: "fill", label: t("skinEditor.fill") },
  ];

  const gridScale = 8;
  const gridW = 64 * gridScale;
  const gridH = texHeight * gridScale;
  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const pixelated: React.CSSProperties = { imageRendering: "pixelated" };
  const fillBg = (src: string): React.CSSProperties => ({
    backgroundImage: `url('${src}')`,
    backgroundSize: "100% 100%",
    imageRendering: "pixelated",
  });
  const slot: React.CSSProperties = {
    boxShadow: "inset 2px 2px 0 #000, inset -2px -2px 0 #8b8b8b",
    imageRendering: "pixelated",
  };
  const checker: React.CSSProperties = {
    ...pixelated,
    backgroundImage: "repeating-conic-gradient(#3f3f3f 0% 25%, #2b2b2b 0% 50%)",
    backgroundSize: "8px 8px",
    inset: 3,
  };
  const getBtnStyle = (active: boolean) =>
    fillBg(active ? "/images/button_highlighted.png" : "/images/Button_Background.png");
  const sliderBg = fillBg("/images/Button_Background2.png");
  const btnClass = (id: string) =>
    `text-2xl mc-text-shadow ${focusBtn === id ? "text-[#FFFF55]" : "text-white"}`;
  const toolClass = (active: boolean) =>
    `h-10 text-lg mc-text-shadow ${active ? "text-[#FFFF55]" : "text-white"}`;

  const renderToolBtn = (id: string, label: string, active: boolean, onClick: () => void) => (
    <button
      onMouseEnter={() => setFocusBtn(id)}
      onMouseLeave={() => setFocusBtn(null)}
      onClick={onClick}
      className={toolClass(active || focusBtn === id)}
      style={getBtnStyle(active || focusBtn === id)}
    >
      {label}
    </button>
  );

  const renderSlider = (label: string, value: number, max: number, onChange: (n: number) => void) => (
    <div className="relative w-full h-8 flex items-center justify-center" style={sliderBg}>
      <span className="absolute z-10 text-sm text-white mc-text-shadow tracking-widest pointer-events-none">
        {label} {value}
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={playPressSound}
        className="mc-slider-custom w-[calc(100%+8px)] h-full z-20"
      />
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-5xl h-full"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 pb-2 w-[60%] 
        text-center tracking-widest uppercase opacity-80 font-bold border-b-2 border-[#373737]">
        {t("skinEditor.title")}
      </h2>

      <div className="flex flex-1 min-h-0 w-full gap-4 px-4 overflow-hidden">
        <div className="flex flex-col gap-2 w-44 shrink-0">
          {tools.map((t) =>
            renderToolBtn(t.id, t.label, tool === t.id, () => {
              playPressSound();
              setTool(t.id);
            }),
          )}

          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              title={t("skinEditor.color")}
              onClick={() => {
                playPressSound();
                setShowPicker((open) => !open);
              }}
              className="relative w-full h-10 overflow-hidden bg-[#8b8b8b]"
              style={slot}
            >
              <span className="absolute" style={checker} />
              <span className="absolute" style={{ inset: 3, backgroundColor: color, opacity: alpha }} />
            </button>

            {showPicker && (
              <div
                className="absolute left-full top-0 z-50 flex flex-col w-56 ml-2 p-3 gap-2"
                style={fillBg("/images/frame_background.png")}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="relative">
                  <canvas
                    ref={satValCvsRef}
                    width={32}
                    height={32}
                    className="w-full aspect-square cursor-crosshair"
                    style={slot}
                    onPointerDown={(e) => {
                      isDraggingSatVal.current = true;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      handleSatValPick(e);
                    }}
                    onPointerMove={(e) => { if (isDraggingSatVal.current) handleSatValPick(e); }}
                    onPointerUp={(e) => {
                      isDraggingSatVal.current = false;
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                  />
                  <span
                    className="absolute w-2 h-2 border-2 border-white pointer-events-none"
                    style={{ left: `calc(${hsv.s * 100}% - 4px)`, top: `calc(${(1 - hsv.v) * 100}% - 4px)`, boxShadow: "0 0 0 1px #000" }}
                  />
                </div>

                <div className="relative h-6">
                  <canvas
                    ref={hueCvsRef}
                    width={64}
                    height={8}
                    className="w-full h-6 cursor-pointer"
                    style={slot}
                    onPointerDown={(e) => {
                      isDraggingHue.current = true;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      handleHuePick(e);
                    }}
                    onPointerMove={(e) => { if (isDraggingHue.current) handleHuePick(e); }}
                    onPointerUp={(e) => {
                      isDraggingHue.current = false;
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                  />
                  <span
                    className="absolute top-0 w-1 h-6 bg-white pointer-events-none"
                    style={{ left: `calc(${(hsv.h / 360) * 100}% - 2px)`, boxShadow: "0 0 0 1px #000" }}
                  />
                </div>

                {(["r", "g", "b"] as const).map((channel) =>
                  renderSlider(channel.toUpperCase(), rgb[channel], 255, (n) => {
                    const next = { ...rgb, [channel]: n };
                    setColorFromHex(rgbToHex(next.r, next.g, next.b));
                  }),
                )}
              </div>
            )}
          </div>

          <div
            className="grid grid-cols-8 gap-0.5 p-0.5 bg-[#8b8b8b]"
            style={{ boxShadow: "inset 2px 2px 0 #000, inset -2px -2px 0 #c6c6c6" }}
          >
            {DYE_COLORS.map((hex) => {
              const selected = color.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  title={hex}
                  onClick={() => {
                    playPressSound();
                    setColorFromHex(hex);
                  }}
                  className="w-full aspect-square"
                  style={{
                    ...pixelated,
                    backgroundColor: hex,
                    boxShadow: selected ? "inset 0 0 0 2px #FFFF55" : "inset 1px 1px 0 #00000055, inset -1px -1px 0 #ffffff44",
                  }}
                />
              );
            })}
          </div>

          <div
            className="flex items-center h-8 bg-black/50 focus-within:outline focus-within:outline-2 focus-within:outline-[#FFFF55]"
            style={{ boxShadow: "inset 2px 2px 0 #000, inset -1px -1px 0 #555" }}
          >
            <span className="pl-2 text-white/50 text-sm mc-text-shadow">#</span>
            <input
              type="text"
              value={hexValue}
              maxLength={6}
              spellCheck={false}
              onChange={(e) => {
                const hex = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                setHexValue(hex.toUpperCase());
                if (hex.length === 6) setColorFromHex(`#${hex}`);
              }}
              className="w-full h-full px-1 text-sm text-white tracking-widest uppercase mc-text-shadow bg-transparent"
            />
          </div>

          <div className="relative w-full h-10 flex items-center justify-center" style={sliderBg}>
            <span className="absolute z-10 text-sm text-white mc-text-shadow tracking-widest pointer-events-none">
              {t("skinEditor.alpha")} {Math.round(alpha * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(alpha * 100)}
              onChange={(e) => setAlpha(Number(e.target.value) / 100)}
              onMouseUp={playPressSound}
              className="mc-slider-custom w-[calc(100%+8px)] h-full z-20"
            />
          </div>
          {renderToolBtn("slim", slim ? t("skinEditor.alex") : t("skinEditor.steve"), slim, () => { playPressSound(); setSlim((v) => !v); })}
          {renderToolBtn("grid", t("skinEditor.grid"), showGrid, () => { playPressSound(); setShowGrid((v) => !v); })}
          {renderToolBtn("undo", t("skinEditor.undo"), false, () => { playPressSound(); handleUndo(); })}
        </div>

        <div className="flex flex-1 items-center justify-center min-w-0 min-h-0 mt-[-200px]">
          <canvas
            ref={gridRef}
            width={gridW}
            height={gridH}
            onPointerDown={handleGridDown}
            onPointerMove={handleGridMove}
            onPointerUp={handleGridUp}
            onPointerCancel={handleGridUp}
            className="max-h-full w-auto cursor-crosshair border-2 border-[#373737]"
            style={{
              ...pixelated,
              backgroundImage: "repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%)",
              backgroundSize: "16px 16px",
            }}
          />
        </div>

        <div className="w-60 h-[400px] mt-[-250px] shrink-0 self-center">
          <SkinEditorPreview canvas={previewCvs} slim={slim} previewTick={previewTick} />
        </div>
      </div>

      <div className="flex gap-4 mt-3 mb-2">
        {[
          { id: "save", label: t("skinEditor.save"), onClick: handleSave },
          { id: "export", label: t("skinEditor.export"), onClick: handleExport },
          { id: "back", label: t("skinEditor.back"), onClick: () => { playBackSound(); setActiveView("skins"); } },
        ].map((b) => (
          <button
            key={b.id}
            onMouseEnter={() => setFocusBtn(b.id)}
            onMouseLeave={() => setFocusBtn(null)}
            onClick={b.onClick}
            className={`w-40 h-12 ${btnClass(b.id)}`}
            style={getBtnStyle(focusBtn === b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
});

export default SkinEditorView;

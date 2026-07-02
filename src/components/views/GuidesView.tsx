import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useUI, useAudio, useConfig } from "../../context/LauncherContext";
import { TauriService } from "../../services/TauriService";
const API_BASE = "https://api.github.com/repos/LCE-Hub/Guides/contents";
const RAW_BASE = "https://raw.githubusercontent.com/LCE-Hub/Guides/main";
interface GuideEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

export default function GuidesView() {
  const { setActiveView } = useUI();
  const { playPressSound, playBackSound } = useAudio();
  const { animationsEnabled } = useConfig();
  const [guides, setGuides] = useState<GuideEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide] = useState<GuideEntry | null>(null);
  const [guideContent, setGuideContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const BACK_BUTTON_INDEX = guides.length;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(API_BASE, {
      headers: { Accept: "application/vnd.github.v3+json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
        return res.json();
      })
      .then((data: GuideEntry[]) => {
        if (!cancelled) {
          const items = data.filter((e) => e.name.endsWith(".md"));
          items.sort((a, b) => a.name.localeCompare(b.name));
          setGuides(items);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchContent = useCallback(async (guide: GuideEntry) => {
    if (guide.type === "dir") return;
    setContentLoading(true);
    setGuideContent(null);
    setSelectedGuide(guide);
    try {
      const url = `${RAW_BASE}/${guide.path}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch guide: ${res.status}`);
      const text = await res.text();
      setGuideContent(text);
    } catch (err: any) {
      setGuideContent(`**Error:** ${err.message}`);
    } finally {
      setContentLoading(false);
    }
  }, []);

  const goBack = useCallback(() => {
    if (selectedGuide) {
      setSelectedGuide(null);
      setGuideContent(null);
    } else {
      playBackSound();
      setActiveView("devtools");
    }
  }, [selectedGuide, playBackSound, setActiveView]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        goBack();
        return;
      }
      if (selectedGuide) return;
      if (e.key === "ArrowDown") {
        setFocusIndex((p) => (p >= BACK_BUTTON_INDEX ? 0 : p + 1));
      } else if (e.key === "ArrowUp") {
        setFocusIndex((p) => (p <= 0 ? BACK_BUTTON_INDEX : p - 1));
      } else if (e.key === "Enter") {
        if (focusIndex === BACK_BUTTON_INDEX) {
          goBack();
        } else {
          playPressSound();
          fetchContent(guides[focusIndex]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusIndex,
    guides,
    selectedGuide,
    goBack,
    playPressSound,
    BACK_BUTTON_INDEX,
  ]);

  useEffect(() => {
    const el = containerRef.current?.querySelector(
      `[data-index="${focusIndex}"]`,
    ) as HTMLElement;
    if (el) el.focus();
  }, [focusIndex]);

  const renderContent = () => {
    if (!selectedGuide) return null;
    if (contentLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <span className="text-white mc-text-shadow text-lg">
            Loading guide...
          </span>
        </div>
      );
    }
    if (guideContent === null) return null;
    return (
      <div className="w-full h-full overflow-y-auto p-6 space-y-4">
        <button
          onClick={() => {
            setSelectedGuide(null);
            setGuideContent(null);
          }}
          className="text-[#FFFF55] mc-text-shadow text-sm hover:underline mb-2 block"
        >
          &larr; Back to guides
        </button>
        <h2 className="text-2xl text-white mc-text-shadow font-bold border-b border-[#373737] pb-2">
          {selectedGuide.name.replace(/\.md$/i, "")}
        </h2>
        <div className="text-white mc-text-shadow leading-relaxed workshop-markdown text-base">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema]]}
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    if (href) TauriService.openUrl(href);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {children}
                </a>
              ),
            }}
          >
            {guideContent}
          </ReactMarkdown>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      ref={containerRef}
      tabIndex={-1}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-5xl outline-none"
    >
      <h2 className="text-2xl text-white mc-text-shadow mt-2 mb-4 border-b-2 border-[#373737] pb-2 w-[60%] max-w-75 text-center tracking-widest uppercase opacity-80 font-bold">
        {selectedGuide
          ? selectedGuide.name.replace(/\.md$/i, "")
          : "Community Guides"}
      </h2>

      <div
        className="w-full max-w-5xl h-[42rem] mb-4 p-8 shadow-2xl flex flex-col items-center"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        {selectedGuide ? (
          renderContent()
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-white mc-text-shadow text-lg">
              Loading guides...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <span className="text-red-400 mc-text-shadow text-lg">
              Failed to load guides
            </span>
            <span className="text-[#AAAAAA] mc-text-shadow text-sm text-center px-8">
              {error}
            </span>
          </div>
        ) : guides.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <span className="text-[#AAAAAA] mc-text-shadow text-lg">
              No guides found
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 w-full h-full overflow-y-auto pt-4 px-2 content-start">
            {guides.map((guide, i) => (
              <div
                key={guide.path}
                data-index={i}
                tabIndex={0}
                onMouseEnter={() => setFocusIndex(i)}
                onClick={() => {
                  if (guide.type === "dir") return;
                  playPressSound();
                  fetchContent(guide);
                }}
                className={`flex flex-col items-center gap-3 p-5 cursor-pointer transition-all outline-none border-2 ${
                  focusIndex === i
                    ? "border-[#FFFF55] bg-white/5"
                    : "border-[#373737] bg-black/20 hover:border-[#555]"
                } ${guide.type === "dir" ? "opacity-60 pointer-events-none" : ""}`}
              >
                <div className="w-16 h-16 bg-black/40 border-2 border-[#373737] flex items-center justify-center">
                  <img
                    src="/images/tools/guides.png"
                    className="w-12 h-12 object-contain opacity-50 grayscale"
                  ></img>
                </div>
                <span
                  className={`text-center text-base mc-text-shadow leading-tight ${
                    focusIndex === i ? "text-[#FFFF55]" : "text-white"
                  }`}
                >
                  {guide.name.replace(/\.md$/i, "")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        data-index={BACK_BUTTON_INDEX}
        onMouseEnter={() => setFocusIndex(BACK_BUTTON_INDEX)}
        onClick={goBack}
        className={`w-72 h-14 flex items-center justify-center transition-colors text-2xl mc-text-shadow mt-2 outline-none border-none ${
          focusIndex === BACK_BUTTON_INDEX ? "text-[#FFFF55]" : "text-white"
        }`}
        style={{
          backgroundImage:
            focusIndex === BACK_BUTTON_INDEX
              ? "url('/images/button_highlighted.png')"
              : "url('/images/Button_Background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        Back
      </button>
    </motion.div>
  );
}

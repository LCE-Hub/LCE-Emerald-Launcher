import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  TauriService,
  PlaytimeResponse,
  PlaytimeDayEntry,
} from "../../services/TauriService";
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

function PlaytimeChart({ data }: { data: PlaytimeDayEntry[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 320;
    const h = 120;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const maxSecs = Math.max(...data.map((d) => d.seconds), 1);
    const pad = { top: 8, bottom: 20, left: 6, right: 6 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const barW = Math.min(28, (chartW - (data.length - 1) * 4) / data.length);
    const gap = (chartW - barW * data.length) / (data.length - 1);
    data.forEach((entry, i) => {
      const x = pad.left + i * (barW + gap);
      const barH = (entry.seconds / maxSecs) * chartH;
      const y = pad.top + chartH - barH;
      ctx.fillStyle = "#FFFF55";
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "9px Mojangles, monospace";
      ctx.textAlign = "center";
      ctx.fillText(formatShort(entry.seconds), x + barW / 2, y - 3);
      ctx.fillStyle = "#AAAAAA";
      ctx.fillText(entry.label, x + barW / 2, h - 4);
    });
  }, [data]);

  return <canvas ref={canvasRef} className="w-full max-w-[320px] mx-auto" />;
}

export default function PlaytimeModal({
  isOpen,
  onClose,
  instanceId,
  instanceName,
  playBackSound,
}: {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  instanceName: string;
  playBackSound: (s?: string) => void;
}) {
  const { t } = useTranslation();
  const [playtime, setPlaytime] = useState<PlaytimeResponse | null>(null);
  const [dailyData, setDailyData] = useState<PlaytimeDayEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartDays, setChartDays] = useState(7);
  useEffect(() => {
    if (!isOpen) {
      setPlaytime(null);
      setDailyData([]);
      return;
    }
    setLoading(true);
    Promise.all([
      TauriService.getPlaytime(instanceId),
      TauriService.getPlaytimeDaily(instanceId, chartDays),
    ])
      .then(([pt, daily]) => {
        setPlaytime(pt);
        setDailyData(daily);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, instanceId, chartDays]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        playBackSound("close_click.wav");
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, playBackSound]);

  if (!isOpen) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 w-screen h-screen z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md outline-none border-none"
    >
      <div
        className="relative w-[380px] p-6 flex flex-col items-center shadow-2xl"
        style={{
          backgroundImage: "url('/images/frame_background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <h2 className="text-[#FFFF55] text-2xl mc-text-shadow mb-4 border-b-2 border-[#373737] pb-2 w-full text-center uppercase">
          {t("modals.playtime.title")}
        </h2>

        <p className="text-white text-sm mc-text-shadow mb-4 text-center">
          {instanceName}
        </p>

        {loading ? (
          <div className="text-gray-400 text-sm mc-text-shadow mb-4">
            {t("modals.playtime.loading")}
          </div>
        ) : playtime ? (
          <>
            <div className="w-full flex flex-col gap-2 mb-4">
              <div className="flex justify-between items-center bg-black/30 px-4 py-2 border border-[#373737]">
                <span className="text-[#AAAAAA] text-sm mc-text-shadow uppercase tracking-wider">
                  {t("modals.playtime.total")}
                </span>
                <span className="text-white text-lg mc-text-shadow font-bold">
                  {formatTime(playtime.totalSeconds)}
                </span>
              </div>
              <div className="flex justify-between items-center bg-black/30 px-4 py-2 border border-[#373737]">
                <span className="text-[#AAAAAA] text-sm mc-text-shadow uppercase tracking-wider">
                  {t("modals.playtime.thisWeek")}
                </span>
                <span className="text-white text-lg mc-text-shadow font-bold">
                  {formatTime(playtime.weekSeconds)}
                </span>
              </div>
              <div className="flex justify-between items-center bg-black/30 px-4 py-2 border border-[#373737]">
                <span className="text-[#AAAAAA] text-sm mc-text-shadow uppercase tracking-wider">
                  {t("modals.playtime.today")}
                </span>
                <span className="text-white text-lg mc-text-shadow font-bold">
                  {formatTime(playtime.daySeconds)}
                </span>
              </div>
            </div>

            {dailyData.length > 0 && (
              <div className="w-full mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#888] text-[10px] mc-text-shadow uppercase tracking-widest">
                    {t("modals.playtime.dailyBreakdown")}
                  </span>
                  <div className="flex gap-1">
                    {[3, 7, 14].map((d) => (
                      <button
                        key={d}
                        onClick={() => setChartDays(d)}
                        className={`text-[9px] px-1.5 py-0.5 border transition-colors ${
                          chartDays === d
                            ? "border-[#FFFF55] text-[#FFFF55] bg-black/40"
                            : "border-[#555] text-[#888] bg-black/20"
                        } mc-text-shadow uppercase tracking-wider`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-black/20 border border-[#373737] p-2">
                  <PlaytimeChart data={dailyData} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-red-400 text-sm mc-text-shadow mb-4">
            {t("modals.playtime.failedToLoad")}
          </div>
        )}

        <button
          onClick={() => {
            playBackSound("close_click.wav");
            onClose();
          }}
          className="w-32 h-10 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none text-white"
          style={{
            backgroundImage: "url('/images/button_highlighted.png')",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        >
          {t("modals.playtime.close")}
        </button>
      </div>
    </motion.div>
  );
}

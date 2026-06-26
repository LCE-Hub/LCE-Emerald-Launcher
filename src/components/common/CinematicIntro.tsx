import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
interface CinematicIntroProps {
  onComplete: () => void;
  startMusic: () => void;
}

type Phase = "black" | "white-lceteam" | "white-esrb" | "out";
const TIMINGS = {
  black: 800,
  "white-lceteam": 3000,
  "white-esrb": 3000,
  out: 800,
};

export function CinematicIntro({
  onComplete,
  startMusic,
}: CinematicIntroProps) {
  const [phase, setPhase] = useState<Phase>("black");
  const skipped = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const skip = () => {
    if (skipped.current) return;
    skipped.current = true;
    onComplete();
  };

  useEffect(() => {
    startMusic();
    const run = async () => {
      await new Promise((r) => setTimeout(r, TIMINGS.black));
      if (skipped.current) return;
      setPhase("white-lceteam");
      await new Promise((r) => setTimeout(r, TIMINGS["white-lceteam"]));
      if (skipped.current) return;
      setPhase("white-esrb");
      await new Promise((r) => setTimeout(r, TIMINGS["white-esrb"]));
      if (skipped.current) return;
      setPhase("out");
      await new Promise((r) => setTimeout(r, TIMINGS.out));
      if (skipped.current) return;
      onComplete();
    };

    run();
    const container = containerRef.current;
    if (container) container.focus();
  }, [onComplete, startMusic]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onClick={skip}
      onKeyDown={skip}
      className="absolute inset-0 z-50 bg-black outline-none"
    >
      <AnimatePresence initial={false}>
        {phase === "black" && (
          <motion.div
            key="black"
            className="absolute inset-0 bg-black"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          />
        )}

        {(phase === "white-lceteam" ||
          phase === "white-esrb" ||
          phase === "out") && (
          <motion.div
            key="white-bg"
            className="absolute inset-0 bg-white flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "out" ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: phase === "out" ? 0.8 : 0.6 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {phase === "white-lceteam" && (
                <motion.img
                  key="lceteam"
                  src="/images/LCE Team.png"
                  className="max-w-3xl object-contain"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8 }}
                />
              )}

              {(phase === "white-esrb" || phase === "out") && (
                <motion.img
                  key="esrb"
                  src="/images/esrb_warning.png"
                  className="w-full max-w-6xl object-contain px-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8 }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

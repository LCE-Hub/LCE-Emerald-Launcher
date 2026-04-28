import React, { useEffect, useState } from "react";
const SGA_CHARS = "abcdefghijklmnopqrstuvwxyz".split("");
interface Particle {
  id: number;
  char: string;
  x: number;
  y: number;
  vX: number;
  vY: number;
  rotation: number;
}

export const ClickParticles: React.FC = React.memo(() => {
  const [bursts, setBursts] = useState<Particle[]>([]);
  useEffect(() => {
    const handlePressSound = (e: MouseEvent) => {
      const newParticles: Particle[] = [];
      const particleCount = 8;
      for (let i = 0; i < particleCount; i++) {
        newParticles.push({
          id: Date.now() + Math.random(),
          char: SGA_CHARS[Math.floor(Math.random() * SGA_CHARS.length)],
          x: e.clientX,
          y: e.clientY,
          vX: (Math.random() - 0.5) * 200,
          vY: (Math.random() - 0.5) * 200,
          rotation: Math.random() * 360,
        });
      }

      setBursts((prev) => [...prev, ...newParticles]);
      setTimeout(() => {
        setBursts((prev) => prev.filter(p => !newParticles.find(np => np.id === p.id)));
      }, 1000);
    };

    window.addEventListener("mousedown", handlePressSound);
    return () => window.removeEventListener("mousedown", handlePressSound);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {bursts.map((p) => (
        <img
          key={p.id}
          src={`/images/sga_${p.char}.png`}
          className="absolute particle-burst pointer-events-none"
          style={{
            left: p.x,
            top: p.y,
            width: "24px",
            height: "24px",
            imageRendering: "pixelated",
            "--vX": `${p.vX}px`,
            "--vY": `${p.vY}px`,
            "--rot": `${p.rotation}deg`,
          } as React.CSSProperties}
          alt="magic-particle"
        />
      ))}
    </div>
  );
});
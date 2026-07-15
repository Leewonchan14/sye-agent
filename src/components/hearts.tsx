"use client";

import { useEffect, useState } from "react";

const HEART_COLORS = ["#ff6b8a", "#ff8fab", "#ffb3c6", "#ff4d6d", "#ff758f", "#ff99ac"];

const HEARTS = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  delay: `${Math.random() * 2}s`,
  duration: `${2 + Math.random() * 3}s`,
  size: `${12 + Math.random() * 24}px`,
  color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
  drift: `${(Math.random() - 0.5) * 100}px`,
}));

interface HeartsOverlayProps {
  show: boolean;
  onDone: () => void;
}

export const HeartsOverlay = ({ show, onDone }: HeartsOverlayProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onDone();
    }, 3500);
    return () => clearTimeout(timer);
  }, [show, onDone]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {HEARTS.map((h) => (
        <span
          key={h.id}
          className="animate-heart-float absolute"
          style={{
            left: h.left,
            bottom: "-30px",
            fontSize: h.size,
            color: h.color,
            animationDelay: h.delay,
            animationDuration: h.duration,
            ["--drift" as string]: h.drift,
          }}
        >
          ♥
        </span>
      ))}
    </div>
  );
};

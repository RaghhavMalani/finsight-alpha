import { useMemo } from "react";
import type { Tick } from "@/lib/market";

export function MiniSparkline({
  history,
  up,
  prevClose,
  pctRange,
  width = 60,
  height = 18,
  color,
}: {
  history: Tick[];
  up: boolean;
  prevClose?: number;
  /** Shared full-scale %-range so tiny moves look flat and big moves look dramatic */
  pctRange?: number;
  width?: number;
  height?: number;
  /** Override stroke color; defaults to neutral gray */
  color?: string;
}) {
  const { pts, centerY } = useMemo(() => {
    if (!history.length) return { pts: "", centerY: height / 2 };
    if (prevClose && pctRange) {
      const range = (prevClose * pctRange) / 100; // full-scale dollars
      const cy = height / 2;
      const clamp = (y: number) => Math.max(0.5, Math.min(height - 0.5, y));
      const s = history
        .map((h, i) => {
          const x = (i / (history.length - 1)) * width;
          const y = clamp(cy - ((h.p - prevClose) / range) * (height / 2 - 1));
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      return { pts: s, centerY: cy };
    }
    const min = Math.min(...history.map((h) => h.p));
    const max = Math.max(...history.map((h) => h.p));
    const s = history
      .map((h, i) => {
        const x = (i / (history.length - 1)) * width;
        const y = height - ((h.p - min) / (max - min || 1)) * (height - 2) - 1;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { pts: s, centerY: height / 2 };
  }, [history, width, height, prevClose, pctRange]);

  // Neutral gray by default — color discipline lives on the Δ column
  const stroke = color ?? "#636C74";
  void up;

  return (
    <svg width={width} height={height} className="block">
      {prevClose != null && (
        <line
          x1="0"
          x2={width}
          y1={centerY}
          y2={centerY}
          stroke="#232830"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      )}
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}


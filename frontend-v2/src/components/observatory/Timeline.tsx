import { useEffect, useRef, type ReactNode } from "react";

export type RibbonPainter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/** One bar under the stage: play, a 20px ribbon of the replayed evidence, the scrubber, a status line. */
export function Timeline({
  count,
  value,
  playing,
  reduced,
  label,
  status,
  axis,
  paint,
  onScrub,
  onPlay,
}: {
  count: number;
  value: number;
  playing: boolean;
  reduced: boolean;
  label: string;
  status: ReactNode;
  axis: [ReactNode, ReactNode, ReactNode];
  paint: RibbonPainter | null;
  onScrub: (index: number) => void;
  onPlay: () => void;
}) {
  const ribbon = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ribbon.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(devicePixelRatio, 2),
        w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      paint?.(ctx, w, h);
      ctx.globalAlpha = 1;
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paint]);
  const max = Math.max(1, count - 1);
  return (
    <footer className="obs-timeline">
      <button
        type="button"
        className="obs-play"
        aria-label={playing ? `Pause ${label} replay` : `Replay ${label}`}
        title={reduced ? "Replay is off while reduced motion is requested" : undefined}
        disabled={reduced || count < 2}
        onClick={onPlay}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          {playing ? <path d="M2 1h3v10H2zM7 1h3v10H7z" /> : <path d="M2 1l9 5-9 5z" />}
        </svg>
      </button>
      <div className="obs-track">
        <canvas className="obs-ribbon" ref={ribbon} aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          aria-label={`${label} step`}
          aria-valuetext={`${label} ${value + 1} of ${count}`}
          style={{ ["--p" as string]: `${(value / max) * 100}%` }}
          onChange={(e) => onScrub(Number(e.target.value))}
        />
        <div className="obs-ribbon-ax">
          {axis.map((item, i) => (
            <span key={i}>{item}</span>
          ))}
        </div>
      </div>
      <div className="obs-tl-label" aria-live="off">
        {status}
      </div>
    </footer>
  );
}

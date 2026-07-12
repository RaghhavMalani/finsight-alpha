import { useEffect, useRef, useState } from "react";

export function ReplayScrubber({
  onReplay,
}: {
  onReplay: (t: number | null) => void; // 0..1, null = live
}) {
  const [t, setT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 4 | 16>(4);
  const raf = useRef<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    onReplay(t);
     
  }, [t]);

  useEffect(() => {
    if (!playing) return;
    function step(now: number) {
      if (!last.current) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      setT((prev) => {
        const cur = prev ?? 0;
        const next = cur + (dt * speed) / 60; // reach 1.0 in ~60s at 1x
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    }
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = 0;
    };
  }, [playing, speed]);

  function fmtSession(v: number) {
    // 09:30 -> 16:00 = 390 minutes
    const mins = Math.round(v * 390);
    const h = 9 + Math.floor((mins + 30) / 60);
    const m = (mins + 30) % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  return (
    <div className="mono-caps flex items-center gap-2 border-t border-divider bg-panel px-3 py-1.5 text-[9px] text-muted-foreground">
      <span className={t !== null ? "text-info" : "text-primary"}>REPLAY</span>
      <button
        onClick={() => {
          if (t === null) setT(0);
          setPlaying((p) => !p);
        }}
        className={`border border-border px-1.5 py-0.5 hover:border-primary hover:text-primary ${
          playing ? "bg-primary/10 text-primary" : ""
        }`}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      {([1, 4, 16] as const).map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          className={`border px-1.5 py-0.5 ${speed === s ? "border-primary text-primary" : "border-border hover:text-foreground"}`}
        >
          {s}×
        </button>
      ))}
      <div className="relative flex-1">
        <input
          type="range"
          min={0}
          max={1000}
          value={t === null ? 1000 : Math.round(t * 1000)}
          onChange={(e) => {
            const v = Number(e.target.value) / 1000;
            setT(v);
            setPlaying(false);
          }}
          className="w-full accent-[color:var(--info)]"
        />
      </div>
      <span className="font-mono text-[10px] text-foreground w-12 text-right">
        {t === null ? "16:00" : fmtSession(t)}
      </span>
      <button
        onClick={() => {
          setT(null);
          setPlaying(false);
        }}
        className="border border-border px-1.5 py-0.5 hover:border-up hover:text-up"
        title="Jump to live"
      >
        LIVE ↦
      </button>
    </div>
  );
}


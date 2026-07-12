import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from "d3-force";
import { correlationMatrix } from "@/lib/market";

type Node = SimulationNodeDatum & { id: string; vol: number };
type Edge = { source: string; target: string; rho: number };

export function CorrelationWeb({
  symbols,
  onFocus,
}: {
  symbols: string[];
  onFocus?: (sym: string) => void;
}) {
  const m = useMemo(() => correlationMatrix(symbols), [symbols]);
  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        out.push({ source: symbols[i], target: symbols[j], rho: m[i][j] });
      }
    }
    return out;
  }, [symbols, m]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<any>(null);
  const dragRef = useRef<{ id: string } | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  // Measure reliably: layout effect + rAF + ResizeObserver.
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(r.width));
      const h = Math.max(0, Math.floor(r.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    measure();
    const raf1 = requestAnimationFrame(measure);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(measure));

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, []);

  // (Re)build the simulation whenever we get a real size or symbols change.
  useEffect(() => {
    if (size.w < 40 || size.h < 40) return;

    const cx = size.w / 2;
    const cy = size.h / 2;
    const radius = Math.min(size.w, size.h) * 0.32;

    const initial: Node[] = symbols.map((s, i) => ({
      id: s,
      vol: 0.4 + ((s.charCodeAt(0) + i) % 10) / 15,
      x: cx + Math.cos((i / symbols.length) * Math.PI * 2) * radius,
      y: cy + Math.sin((i / symbols.length) * Math.PI * 2) * radius,
    }));
    setNodes(initial);

    const links = edges.map((e) => ({ ...e }));
    const sim = forceSimulation(initial as any)
      .force(
        "link",
        forceLink(links as any)
          .id((d: any) => d.id)
          .distance((l: any) => 40 + (1 - Math.abs(l.rho)) * Math.min(220, radius * 1.4))
          .strength((l: any) => Math.abs(l.rho) * 0.7),
      )
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(cx, cy))
      .force("collide", forceCollide().radius(28))
      .alpha(1)
      .alphaDecay(0.03)
      .on("tick", () => {
        setNodes([...(sim.nodes() as Node[])]);
      });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [size.w, size.h, symbols, edges]);

  function pointerDown(id: string) {
    dragRef.current = { id };
    simRef.current?.alphaTarget(0.3).restart();
  }
  function pointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const n = (simRef.current?.nodes() as Node[] | undefined)?.find(
      (n) => n.id === dragRef.current!.id,
    );
    if (n) {
      n.fx = e.clientX - rect.left;
      n.fy = e.clientY - rect.top;
    }
  }
  function pointerUp() {
    if (dragRef.current) {
      const n = (simRef.current?.nodes() as Node[] | undefined)?.find(
        (n) => n.id === dragRef.current!.id,
      );
      if (n) {
        n.fx = null;
        n.fy = null;
      }
      simRef.current?.alphaTarget(0);
      dragRef.current = null;
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ready = size.w >= 40 && size.h >= 40 && nodes.length > 0;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full min-h-[240px] overflow-hidden"
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerLeave={pointerUp}
    >
      {ready && (
        <svg width={size.w} height={size.h} className="absolute inset-0">
          <g>
            {edges.map((e) => {
              const s = nodeById.get(e.source as string);
              const t = nodeById.get(e.target as string);
              if (!s || !t || s.x == null || t.x == null) return null;
              const isRelated = !hover || hover === e.source || hover === e.target;
              const color = e.rho >= 0 ? "#42C98B" : "#F06464";
              return (
                <line
                  key={`${e.source}-${e.target}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={color}
                  strokeOpacity={isRelated ? 0.15 + Math.abs(e.rho) * 0.55 : 0.05}
                  strokeWidth={Math.max(0.5, Math.abs(e.rho) * 3)}
                />
              );
            })}
          </g>
          <g>
            {nodes.map((n) => {
              const r = 10 + n.vol * 16;
              const dim = hover && hover !== n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                  onPointerDown={() => pointerDown(n.id)}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onDoubleClick={() => onFocus?.(n.id)}
                  style={{ cursor: "grab", opacity: dim ? 0.3 : 1, transition: "opacity 180ms" }}
                >
                  <circle r={r + 4} fill="#F0A929" opacity={0.18} />
                  <circle r={r} fill="#0A0C0E" stroke="#F0A929" strokeWidth={1.5} />
                  <text
                    textAnchor="middle"
                    dy={4}
                    className="mono-caps"
                    fontSize={10}
                    fill="#E7EAEC"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {n.id}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {!ready && (
        <div className="mono-caps absolute inset-0 flex items-center justify-center text-[10px] text-faint">
          BUILDING GRAPH…
        </div>
      )}
      <div className="mono-caps pointer-events-none absolute bottom-2 left-3 text-[9px] text-faint">
        DRAG NODES · DOUBLE-CLICK FOR DOSSIER · GREEN = +ρ · RED = -ρ
      </div>
    </div>
  );
}


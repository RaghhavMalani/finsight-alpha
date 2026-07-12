import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum } from "d3-force";
import { depsOf, DEP_COLOR, DEP_LABEL, type DepEdge, type DepType } from "@/lib/dependencies";

type Node = SimulationNodeDatum & { id: string; type: DepType | "center"; strength: number };
type Link = { source: string; target: string; strength: number };

const TYPE_ORDER: DepType[] = ["supplier", "customer", "competitor", "sector", "index"];

export function DependenciesGraph({ symbol, onFocus }: { symbol: string; onFocus?: (sym: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<any>(null);
  const dragRef = useRef<{ id: string } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  const edges = useMemo<DepEdge[]>(() => depsOf(symbol), [symbol]);

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
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  useEffect(() => {
    if (size.w < 40 || size.h < 40) return;
    const cx = size.w / 2, cy = size.h / 2;
    const radius = Math.min(size.w, size.h) * 0.35;
    const centerNode: Node = { id: symbol, type: "center", strength: 1, fx: cx, fy: cy, x: cx, y: cy };
    // Position outer nodes radially by type sector
    const initial: Node[] = [centerNode];
    edges.forEach((e, i) => {
      const typeIdx = TYPE_ORDER.indexOf(e.type);
      const baseAngle = (typeIdx / TYPE_ORDER.length) * Math.PI * 2;
      const spread = (i * 0.35) - edges.length * 0.05;
      const angle = baseAngle + spread;
      initial.push({
        id: e.id,
        type: e.type,
        strength: e.strength,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    });
    setNodes(initial);

    const links: Link[] = edges.map((e) => ({ source: symbol, target: e.id, strength: e.strength }));
    const sim = forceSimulation(initial as any)
      .force("link", forceLink(links as any).id((d: any) => d.id)
        .distance((l: any) => 60 + (1 - l.strength) * (radius * 0.9))
        .strength((l: any) => 0.3 + l.strength * 0.5))
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(cx, cy))
      .force("collide", forceCollide().radius(28))
      .alpha(1)
      .alphaDecay(0.04)
      .on("tick", () => setNodes([...(sim.nodes() as Node[])]));
    simRef.current = sim;
    return () => { sim.stop(); simRef.current = null; };
  }, [size.w, size.h, symbol, edges]);

  function pointerDown(id: string) { dragRef.current = { id }; simRef.current?.alphaTarget(0.3).restart(); }
  function pointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const n = (simRef.current?.nodes() as Node[] | undefined)?.find((n) => n.id === dragRef.current!.id);
    if (n) { n.fx = e.clientX - rect.left; n.fy = e.clientY - rect.top; }
  }
  function pointerUp() {
    if (dragRef.current) {
      const n = (simRef.current?.nodes() as Node[] | undefined)?.find((n) => n.id === dragRef.current!.id);
      if (n && n.id !== symbol) { n.fx = null; n.fy = null; }
      simRef.current?.alphaTarget(0);
      dragRef.current = null;
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ready = size.w >= 40 && nodes.length > 0;
  const hoveredEdge = hover ? edges.find((e) => e.id === hover) : null;

  return (
    <div className="grid h-full grid-cols-[1fr_260px] overflow-hidden">
      <div
        ref={wrapRef}
        className="relative h-full min-h-[240px] overflow-hidden"
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={pointerUp}
      >
        {ready && (
          <svg width={size.w} height={size.h} className="absolute inset-0">
            <g>
              {edges.map((e) => {
                const s = nodeById.get(symbol);
                const t = nodeById.get(e.id);
                if (!s || !t || s.x == null || t.x == null) return null;
                const active = !hover || hover === e.id;
                return (
                  <line
                    key={e.id}
                    x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke={DEP_COLOR[e.type]}
                    strokeOpacity={active ? 0.20 + e.strength * 0.55 : 0.06}
                    strokeWidth={Math.max(0.75, e.strength * 3.5)}
                  />
                );
              })}
            </g>
            <g>
              {nodes.map((n) => {
                const isCenter = n.type === "center";
                const r = isCenter ? 26 : 14 + n.strength * 10;
                const color = isCenter ? "#F0A929" : DEP_COLOR[n.type as DepType];
                const dim = hover && hover !== n.id && !isCenter;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                    onPointerDown={() => pointerDown(n.id)}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onDoubleClick={() => !isCenter && onFocus?.(n.id)}
                    style={{ cursor: isCenter ? "default" : "grab", opacity: dim ? 0.3 : 1, transition: "opacity 180ms" }}
                  >
                    {isCenter && <circle r={r + 6} fill={color} opacity={0.15} />}
                    <circle r={r} fill="#0A0C0E" stroke={color} strokeWidth={isCenter ? 2 : 1.5} />
                    <text textAnchor="middle" dy={4} className="mono-caps" fontSize={isCenter ? 11 : 9} fill="#E7EAEC"
                      style={{ pointerEvents: "none", userSelect: "none" }}>{n.id}</text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {/* Legend */}
        <div className="mono-caps absolute bottom-2 left-3 flex flex-wrap gap-3 text-[9px]">
          {TYPE_ORDER.map((t) => (
            <span key={t} className="flex items-center gap-1 text-faint">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: DEP_COLOR[t] }} />
              {DEP_LABEL[t]}
            </span>
          ))}
        </div>
      </div>

      {/* Side rail */}
      <div className="border-l border-divider bg-panel/40 overflow-y-auto">
        <div className="mono-caps sticky top-0 border-b border-divider bg-panel px-3 py-1.5 text-[9px] text-primary">
          DEPENDENCIES · {symbol} · {edges.length}
        </div>
        {edges.length === 0 && (
          <div className="mono-caps p-4 text-center text-[10px] text-faint">No curated deps for {symbol}.</div>
        )}
        {edges.map((e) => {
          const highlight = hover === e.id;
          return (
            <button
              key={e.id}
              onMouseEnter={() => setHover(e.id)}
              onMouseLeave={() => setHover(null)}
              onDoubleClick={() => onFocus?.(e.id)}
              className={`interactive block w-full border-b border-divider/60 px-3 py-2 text-left transition ${highlight ? "bg-raised" : ""}`}
            >
              <div className="mono-caps flex items-center justify-between text-[9px] text-faint">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: DEP_COLOR[e.type] }} />
                  <span className="text-primary">{e.id}</span>
                  <span>· {DEP_LABEL[e.type]}</span>
                </span>
                <span className="tabular-nums text-foreground">{(e.strength * 100).toFixed(0)}</span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-foreground">{e.note}</div>
              <div className="mt-1 h-[2px] bg-background">
                <div className="h-full" style={{ width: `${e.strength * 100}%`, background: DEP_COLOR[e.type] }} />
              </div>
            </button>
          );
        })}
        {hoveredEdge && (
          <div className="mono-caps border-t border-primary bg-primary/10 px-3 py-2 text-[9px] text-primary">
            {hoveredEdge.id} · {DEP_LABEL[hoveredEdge.type]} · Double-click to recenter
          </div>
        )}
      </div>
    </div>
  );
}


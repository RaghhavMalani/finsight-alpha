import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { HudKicker, HudLabel } from "@/visual/HudLabel";
import { LiveDot } from "@/visual/LiveDot";
import {
  Hash,
  Num,
  ProvenanceProvider,
  RunProvenance,
  Src,
  Stamp,
  type SourceFile,
} from "@/visual/Num";
import { tokenStyle, type ColorName } from "@/visual/tokens";
import { useReducedMotion } from "@/visual/useReducedMotion";
import { webglAvailable } from "@/visual/webgl";
import { SceneBus } from "./bus";
import type { Fact, GraphNode, ResearchGraph } from "./contract";
import Fallback2D from "./Fallback2D";
import { layoutFor, LOOK_LABEL, LOOKS, type Look } from "./layouts";
import { useResearchGraph } from "./load";
import {
  buildReplay,
  KIND_LABEL,
  stateColor,
  stateLabel,
  STATE_LABEL,
  stepAt,
  viewsAt,
} from "./model";
import type { Insets } from "./ResearchScene";
import "./research.css";

const ResearchScene = lazy(() => import("./ResearchScene"));

export default function ResearchPage({ look, renderer }: { look: Look; renderer: "auto" | "2d" }) {
  const load = useResearchGraph();
  const probe = useSyntheticProbe(load.status === "ok" ? load.graph : null);
  return (
    <ForgeShell bleed>
      <div
        className="rs"
        style={tokenStyle()}
        data-research-root
        data-status={load.status}
        data-look={look}
      >
        {load.status === "loading" && (
          <div className="rs-wait" role="status">
            <LiveDot state="stale" label="Verifying sealed evidence" />
          </div>
        )}
        {load.status === "unavailable" && <Unavailable reason={load.reason} />}
        {load.status === "ok" && (
          <Workspace
            key={probe ? "synthetic" : "sealed"}
            graph={probe ?? load.graph}
            sha256={load.sha256}
            url={load.url}
            look={look}
            renderer={renderer}
          />
        )}
      </div>
    </ForgeShell>
  );
}

/** Verifier-only: swaps in a scale probe when the test harness asked for one before load. */
function useSyntheticProbe(graph: ResearchGraph | null) {
  const [probe, setProbe] = useState<ResearchGraph | null>(null);
  useEffect(() => {
    const ask = window.__researchSynthetic;
    if (!graph || !ask) return;
    void import("./perf-synthetic").then((m) => setProbe(m.synthesize(graph, ask.nodes)));
  }, [graph]);
  return probe;
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="rs-unavailable" data-unavailable role="alert">
      <div className="rs-void-ring" aria-hidden="true" />
      <HudKicker tone="red">Research evidence unavailable</HudKicker>
      <p className="rs-unavailable-reason">{reason}</p>
      <p className="rs-unavailable-note">
        Nothing is drawn rather than drawing evidence this build cannot verify.
      </p>
    </div>
  );
}

function useStageSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

const ORDER: GraphNode["kind"][] = [
  "hypothesis",
  "question",
  "experiment",
  "counterfactual",
  "finding",
  "verifier",
  "check",
  "skeptic",
];
/** Source attributes for raw evidence labels drawn outside a provenance button. */
const prov = (sources: Record<string, SourceFile>, src: string) => ({
  "data-prov": "label",
  "data-src": sources[src]?.path ?? "",
  "data-sha": sources[src]?.sha256 ?? "",
});
/** Short names for the anchors that keep a label on the graph. */
const PINNED: Record<string, string> = {
  H: "hypothesis",
  F: "finding",
  SK: "skeptic",
  CAL: "calibration",
  MUT: "mutation tests",
  REP: "repeat run",
  TESTS: "test suite",
};

function Workspace({
  graph,
  sha256,
  url,
  look,
  renderer,
}: {
  graph: ResearchGraph;
  sha256: string;
  url: string;
  look: Look;
  renderer: "auto" | "2d";
}) {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const stage = useStageSize();
  const narrow = stage.w < 700;
  const portrait = stage.w / Math.max(1, stage.h) < 0.85;
  const layout = useMemo(
    () => layoutFor(look, graph, portrait ? 0.5 : 1.6),
    [look, graph, portrait],
  );
  const replay = useMemo(() => buildReplay(graph), [graph]);
  const bus = useRef(new SceneBus()).current;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [focus, setFocus] = useState(-1);
  const [gl, setGl] = useState<boolean | null>(null);
  const started = useRef(false);
  const total = graph.timeline.length;

  useEffect(() => setGl(renderer === "2d" ? false : webglAvailable()), [renderer]);
  // First visit plays the recorded order once; reduced motion starts at the sealed end.
  useEffect(() => {
    bus.reduced = reduced;
    if (started.current) return;
    started.current = true;
    // The hook starts conservative (reduced) until it reads the media query; read it here.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      bus.t = replay.duration;
      bus.step = total;
      setStep(total);
    } else setPlaying(true);
  }, [reduced, bus, replay, total]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0,
      last = performance.now();
    const tick = (now: number) => {
      bus.t = Math.min(replay.duration, bus.t + (now - last) / 1000);
      last = now;
      const s = stepAt(replay, bus.t);
      if (s !== bus.step) {
        bus.step = s;
        setStep(s);
      }
      if (bus.t >= replay.duration) {
        bus.step = total;
        setStep(total);
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, bus, replay, total]);

  const seek = useCallback(
    (s: number) => {
      setPlaying(false);
      const clamped = Math.max(0, Math.min(total, s));
      bus.step = clamped;
      bus.t = clamped === 0 ? 0 : replay.times[clamped - 1] + 0.001;
      setStep(clamped);
    },
    [bus, replay, total],
  );
  const play = () => {
    if (step >= total) {
      bus.t = 0;
      bus.step = 0;
      setStep(0);
    }
    setPlaying((p) => !p);
  };

  useEffect(() => {
    bus.selected = selected;
    bus.touch();
  }, [selected, bus]);
  useEffect(() => {
    bus.focus = focus;
  }, [focus, bus]);

  // DOM layer positioned by whichever renderer is mounted.
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const pins = useRef<(HTMLSpanElement | null)[]>([]);
  const hover = useRef<HTMLDivElement>(null);
  const projected = useRef<Float32Array | null>(null);
  useEffect(() => {
    bus.onProject = (nodes, lbls) => {
      projected.current = nodes;
      buttons.current.forEach((b, i) => {
        if (!b) return;
        b.style.transform = `translate(${nodes[i * 3]}px, ${nodes[i * 3 + 1]}px)`;
        b.style.visibility = nodes[i * 3 + 2] ? "visible" : "hidden";
        const pin = pins.current[i];
        if (pin) pin.style.transform = `translate(${nodes[i * 3]}px, ${nodes[i * 3 + 1]}px)`;
      });
      labels.current.forEach((l, i) => {
        if (l) l.style.transform = `translate(${lbls[i * 3]}px, ${lbls[i * 3 + 1]}px)`;
      });
      if (hover.current && bus.focus >= 0)
        hover.current.style.transform = `translate(${nodes[bus.focus * 3]}px, ${nodes[bus.focus * 3 + 1]}px)`;
    };
    return () => {
      bus.onProject = null;
    };
  }, [bus]);
  useEffect(() => {
    const p = projected.current;
    if (hover.current && p && focus >= 0)
      hover.current.style.transform = `translate(${p[focus * 3]}px, ${p[focus * 3 + 1]}px)`;
  }, [focus]);

  const views = useMemo(() => viewsAt(graph, replay, step), [graph, replay, step]);
  const tabOrder = useMemo(
    () =>
      graph.nodes
        .map((n, i) => [n, i] as const)
        .sort((a, b) => ORDER.indexOf(a[0].kind) - ORDER.indexOf(b[0].kind) || a[1] - b[1]),
    [graph],
  );
  const close = useCallback(() => {
    setSelected((s) => {
      if (s >= 0) buttons.current[s]?.focus();
      return -1;
    });
  }, []);
  useEffect(() => {
    if (selected < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  const insets: Insets = useMemo(
    () =>
      narrow
        ? { top: 196, bottom: 150, left: 8, right: 8 }
        : { top: 132, bottom: 150, left: 24, right: 24 },
    [narrow],
  );
  const sources: Record<string, SourceFile> = useMemo(
    () => ({
      ...graph.sources,
      projection: { path: url.slice(1), sha256, sealed_by: "pin compiled into this route" },
    }),
    [graph, url, sha256],
  );
  const study = useMemo(
    () => ({
      preregistration: graph.study.preregistration_hash,
      asOf: graph.study.evidence_cutoff,
      frozenAt: graph.study.frozen_at,
    }),
    [graph],
  );
  const current = step > 0 ? graph.timeline[step - 1] : null;
  const currentNode = current ? graph.nodes.find((n) => n.id === current.node) : null;
  const node = selected >= 0 ? graph.nodes[selected] : null;
  const flagship = graph.nodes.find((n) => n.id === "F")!;
  const skeptic = graph.nodes.find((n) => n.id === "SK")!;
  const questions = graph.nodes.filter((n) => n.kind === "question");
  const fact = (n: GraphNode, k: string) => n.facts.find((f) => f.k === k);
  // Scorecard values appear only once the replay has reached the event that sealed them.
  const findingState = views[graph.nodes.indexOf(flagship)].state;
  const findingShown = findingState !== "dormant";
  const gateClosed = findingState === "challenged";

  return (
    <ProvenanceProvider sources={sources} study={study}>
      <div
        className={`rs-stage ${narrow ? "is-narrow" : ""}`}
        ref={stage.ref}
        data-replay={playing ? "playing" : step >= total ? "done" : "paused"}
        data-step={step}
        data-renderer={gl == null ? "pending" : gl ? "webgl" : "2d"}
        data-selected={selected >= 0}
      >
        <div className="rs-canvas">
          {gl === true && (
            <Suspense fallback={null}>
              <ResearchScene
                key={look}
                graph={graph}
                layout={layout}
                replay={replay}
                bus={bus}
                insets={insets}
                onFail={() => setGl(false)}
              />
            </Suspense>
          )}
          {gl === false && (
            <Fallback2D graph={graph} layout={layout} replay={replay} bus={bus} insets={insets} />
          )}
        </div>

        <div className="rs-layer" aria-label="Research graph" role="group">
          {layout.labels.map((l, i) => (
            <span
              key={`${look}-${l.text}`}
              ref={(el) => {
                labels.current[i] = el;
              }}
              className={`rs-glabel is-${l.align}`}
              style={{ color: `var(--vx-${l.tone})` }}
              aria-hidden="true"
            >
              {l.text}
            </span>
          ))}
          {graph.nodes.map((n, i) =>
            PINNED[n.id] ? (
              <span
                key={`pin-${n.id}`}
                ref={(el) => {
                  pins.current[i] = el;
                }}
                className={`rs-pin rs-pin-${n.kind} ${layout.pinAbove?.includes(n.id) ? "is-above" : ""}`}
                aria-hidden="true"
                style={{ color: `var(--vx-${stateColor(views[i].state)})` }}
              >
                <span className="rs-pin-in">
                  <b>{PINNED[n.id]}</b>
                  <small>{stateLabel(views[i])}</small>
                </span>
              </span>
            ) : null,
          )}
          {tabOrder.map(([n, i]) => (
            <button
              key={n.id}
              type="button"
              ref={(el) => {
                buttons.current[i] = el;
              }}
              className={`rs-node rs-node-${n.kind}`}
              data-node-id={n.id}
              data-state={views[i].state}
              aria-label={`${KIND_LABEL[n.kind]}: ${n.label.t}. ${stateLabel(views[i])}.`}
              aria-expanded={selected === i}
              onClick={() => setSelected(i)}
              onPointerEnter={() => setFocus(i)}
              onPointerLeave={() => setFocus((f) => (f === i ? -1 : f))}
              onFocus={() => setFocus(i)}
              onBlur={() => setFocus((f) => (f === i ? -1 : f))}
            />
          ))}
          <div
            ref={hover}
            className="rs-hover"
            aria-hidden="true"
            hidden={focus < 0 || focus === selected}
          >
            {focus >= 0 && (
              <>
                <b
                  style={{ color: `var(--vx-${stateColor(views[focus].state)})` }}
                  {...prov(graph.sources, graph.nodes[focus].label.src)}
                >
                  {graph.nodes[focus].label.t}
                </b>
                <span>
                  {KIND_LABEL[graph.nodes[focus].kind]} · {stateLabel(views[focus])}
                </span>
              </>
            )}
          </div>
        </div>

        {"synthetic" in graph && (
          <div className="rs-synthetic" data-synthetic role="note">
            Synthetic scale probe · not evidence
          </div>
        )}
        <header className="rs-mast">
          <HudKicker>Research · replay of sealed evidence</HudKicker>
          <h1>
            <Src t={graph.study.title} label="Hypothesis" />
          </h1>
          <p className="rs-mast-sub">
            <Src t={graph.study.series} label="Series" /> <i>·</i>{" "}
            <Src t={graph.study.evidence_mode} label="Evidence mode" /> <i>·</i> prereg{" "}
            <Hash h={graph.study.preregistration_hash} label="Preregistration hash" /> <i>·</i>{" "}
            frozen <Stamp s={graph.study.frozen_at} label="Frozen at" />
          </p>
        </header>

        <div className="rs-status">
          <div className="rs-looks" role="group" aria-label="Visual direction">
            {LOOKS.map((l) => (
              <a
                key={l}
                href={`?look=${l}`}
                aria-current={l === look ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  void navigate({ to: "/research", search: { look: l } as never, replace: true });
                }}
              >
                {LOOK_LABEL[l]}
              </a>
            ))}
          </div>
          <div className="rs-live">
            <span className="rs-live-row">
              <LiveDot state="fresh" label="Replay" />
              <span className="rs-live-detail" data-copy>
                sha-256{" "}
                <Hash h={{ v: sha256, src: "projection", ptr: "" }} label="Projection SHA-256" />{" "}
                verified
              </span>
            </span>
            <span className="rs-live-row">
              <LiveDot state="dead" label="Live" />
              <span className="rs-live-detail" data-copy>
                unavailable · runs start in Q2/Q5
              </span>
            </span>
          </div>
        </div>

        <aside className="rs-score" aria-label="Scorecard">
          {questions.map((q) => {
            const i = graph.nodes.indexOf(q);
            const shown = views[i].state !== "dormant";
            return (
              <div key={q.id} className="rs-score-row" data-shown={shown}>
                <span className="rs-score-k">{q.label.t}</span>
                <span style={{ color: `var(--vx-${stateColor(views[i].state)})` }}>
                  {shown && q.verdict ? (
                    <Src t={q.verdict} label={q.label.t ?? "Verdict"} />
                  ) : (
                    "pending"
                  )}
                </span>
              </div>
            );
          })}
          <div className="rs-score-row rs-score-sk" data-shown={gateClosed}>
            <span className="rs-score-k">skeptic</span>
            <span>
              {gateClosed ? (
                <>
                  <Num n={fact(skeptic, "Settings passed")!.n!} label="Skeptic settings passed" />{" "}
                  of <Num n={fact(skeptic, "Settings total")!.n!} label="Skeptic settings total" />{" "}
                  settings · <Src t={fact(skeptic, "Old gate")!.t!} label="Engine gate" />
                </>
              ) : (
                "pending"
              )}
            </span>
          </div>
          <div className="rs-score-row" data-shown={findingShown}>
            <span className="rs-score-k">holdouts</span>
            <span>
              {findingShown ? (
                <>
                  <Num n={fact(flagship, "Holdout openings")!.n!} label="Holdout openings" /> opened
                  once each
                </>
              ) : (
                "pending"
              )}
            </span>
          </div>
        </aside>

        <div className="rs-timeline">
          <button
            type="button"
            className="rs-play"
            onClick={play}
            aria-label={
              playing ? "Pause replay" : step >= total ? "Replay from the start" : "Play replay"
            }
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="rs-track">
            <div className="rs-ticks" aria-hidden="true">
              {graph.timeline.map((e, i) => (
                <i
                  key={i}
                  className={`k-${e.kind}`}
                  data-on={i < step}
                  style={{ left: `${(replay.times[i] / replay.duration) * 100}%` }}
                />
              ))}
              <b
                className="rs-head"
                style={{
                  left: `${((step > 0 ? replay.times[step - 1] : 0) / replay.duration) * 100}%`,
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={total}
              step={1}
              value={step}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Replay position, one recorded event per step"
              aria-valuetext={
                current
                  ? `${current.label}: ${currentNode?.label.t ?? ""}`
                  : "before the first recorded event"
              }
            />
          </div>
          <div className="rs-now" aria-live="polite">
            {current ? (
              <>
                <span className={`rs-now-k k-${current.kind}`}>{current.label}</span>
                <span
                  className="rs-now-node"
                  {...(currentNode ? prov(graph.sources, currentNode.label.src) : {})}
                >
                  {currentNode?.label.t}
                </span>
                <Stamp
                  s={{ v: current.at, src: current.src, ptr: current.ptr }}
                  label={current.label}
                />
              </>
            ) : (
              <span className="rs-now-node">Before the first recorded event</span>
            )}
          </div>
        </div>

        <Composer />

        {node && (
          <NodeHud
            key={node.id}
            node={node}
            state={views[selected].state}
            graph={graph}
            onClose={close}
          />
        )}
      </div>
    </ProvenanceProvider>
  );
}

function Composer() {
  return (
    <form
      className="rs-composer"
      aria-label="New research run"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="rs-c-hyp">
        <span>Hypothesis</span>
        <input disabled placeholder="State a falsifiable hypothesis" />
      </label>
      <label>
        <span>As of</span>
        <input disabled placeholder="evidence cutoff" />
      </label>
      <label>
        <span>Universe</span>
        <input disabled placeholder="instruments" />
      </label>
      <label>
        <span>Budget</span>
        <input disabled placeholder="compute" />
      </label>
      <label>
        <span>Rigor</span>
        <input disabled placeholder="preregistered" />
      </label>
      <button type="submit" disabled>
        Run
      </button>
      <p className="rs-c-note" data-copy>
        Runs start in Q2/Q5. This build replays sealed evidence only.
      </p>
    </form>
  );
}

function FactRow({ f }: { f: Fact }) {
  const long = f.t?.t != null && f.t.t.length > 44;
  return (
    <HudLabel k={f.k} wide={long}>
      {f.n ? <Num n={f.n} label={f.k} /> : f.t ? <Src t={f.t} label={f.k} /> : "unavailable"}
    </HudLabel>
  );
}

function NodeHud({
  node,
  state,
  graph,
  onClose,
}: {
  node: GraphNode;
  state: ReturnType<typeof viewsAt>[number]["state"];
  graph: ResearchGraph;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const tone: ColorName = stateColor(state);
  const events = graph.timeline.filter((e) => e.node === node.id);
  return (
    <RunProvenance run={node.run_id}>
      <section
        ref={ref}
        className="rs-hud"
        role="dialog"
        aria-label={`${KIND_LABEL[node.kind]} ${node.label.t}`}
        tabIndex={-1}
        data-hud={node.id}
        style={{ ["--hud-tone" as string]: `var(--vx-${tone})` }}
      >
        <div className="rs-hud-top">
          <span className="rs-hud-kind">{KIND_LABEL[node.kind]}</span>
          <button type="button" onClick={onClose} aria-label="Close node details">
            ESC
          </button>
        </div>
        <h2>
          <Src t={node.label} label="Node" />
        </h2>
        <div className="rs-hud-verdict" style={{ color: `var(--vx-${tone})` }}>
          <i aria-hidden="true" />
          {STATE_LABEL[state]}
          {node.verdict && state !== "dormant" && (
            <>
              {" · "}
              <Src t={node.verdict} label="Verdict" />
            </>
          )}
        </div>

        <HudKicker>Evidence</HudKicker>
        {node.facts.length ? (
          node.facts.map((f, i) => <FactRow key={i} f={f} />)
        ) : (
          <p className="rs-none">No recorded fields.</p>
        )}

        <HudKicker tone="amber">Cost</HudKicker>
        {node.cost?.length ? (
          node.cost.map((f, i) => <FactRow key={i} f={f} />)
        ) : (
          <p className="rs-none">Not recorded for this node; only trials record wall time.</p>
        )}

        <HudKicker tone="cyanSoft">Model · world</HudKicker>
        <HudLabel k="Model">
          {node.model ? <Src t={node.model} label="Model" /> : "not recorded"}
        </HudLabel>
        <HudLabel k="Run id">
          {node.run_id ? <Hash h={node.run_id} label="Run id" /> : "not a run"}
        </HudLabel>
        <HudLabel k="Artifact">
          {node.hash ? <Hash h={node.hash} label="Artifact hash" /> : "not recorded"}
        </HudLabel>
        <HudLabel k="World">
          {node.world ? <Hash h={node.world} label="World hash" /> : "not recorded"}
        </HudLabel>

        <HudKicker tone={node.verdicts?.length ? "cyan" : "muted"}>Verifier verdicts</HudKicker>
        {node.verdicts?.length ? (
          node.verdicts.map((f, i) => <FactRow key={i} f={f} />)
        ) : (
          <p className="rs-none">No per-node verifier output; see the verifier nodes.</p>
        )}

        <HudKicker tone="muted">Recorded transitions</HudKicker>
        <ol className="rs-hud-events">
          {events.map((e, i) => (
            <li key={i}>
              <span className={`k-${e.kind}`}>{e.label}</span>
              <Stamp s={{ v: e.at, src: e.src, ptr: e.ptr }} label={e.label} />
            </li>
          ))}
        </ol>
      </section>
    </RunProvenance>
  );
}

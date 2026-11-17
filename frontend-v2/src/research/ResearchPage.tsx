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
    // Only a build made with VITE_PERF_PROBE=true honours the probe; production ignores it.
    if (import.meta.env.VITE_PERF_PROBE !== "true" || import.meta.env.MODE !== "perf") return;
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

/** Anchor labels in priority order: when two collide, the later one is hidden. */
const PIN_ORDER = ["H", "F", "SK", "R:US:PRIMARY", "R:INDIA:PRIMARY", "CAL", "MUT", "TESTS", "REP"];
function declutter(els: (HTMLElement | null | undefined)[]) {
  const taken: DOMRect[] = [];
  for (const el of els) {
    if (!el) continue;
    el.style.visibility = "visible";
    const box = (el.firstElementChild as HTMLElement | null) ?? el;
    const r = box.getBoundingClientRect();
    if (!r.width) continue;
    const hit = taken.some(
      (t) =>
        r.left < t.right + 4 &&
        r.right > t.left - 4 &&
        r.top < t.bottom + 2 &&
        r.bottom > t.top - 2,
    );
    if (hit) el.style.visibility = "hidden";
    else taken.push(r);
  }
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
  "R:US:PRIMARY": "US primary",
  "R:INDIA:PRIMARY": "India primary",
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
  const nodeIndex = useMemo(() => new Map(graph.nodes.map((n, i) => [n.id, i])), [graph]);
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
      declutter([
        ...PIN_ORDER.map((id) => pins.current[nodeIndex.get(id) ?? -1]),
        ...labels.current,
      ]);
      if (hover.current && bus.focus >= 0)
        hover.current.style.transform = `translate(${nodes[bus.focus * 3]}px, ${nodes[bus.focus * 3 + 1]}px)`;
    };
    return () => {
      bus.onProject = null;
    };
  }, [bus, nodeIndex]);
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
        ? { top: 428, bottom: 150, left: 8, right: 8 }
        : { top: 96, bottom: 112, left: 480, right: selected >= 0 ? 420 : 24 },
    [narrow, selected],
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
              <span
                {...(l.src ? prov(graph.sources, l.src) : {})}
                {...(l.copy ? { "data-copy": "" } : {})}
              >
                {l.text}
              </span>
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
                  {n.t && n.t.v != null ? (
                    <small {...prov(graph.sources, n.t.src)}>t {n.t.v.toFixed(3)}</small>
                  ) : (
                    <small>{stateLabel(views[i], n)}</small>
                  )}
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
              aria-label={`${KIND_LABEL[n.kind]}: ${n.label.t}. ${stateLabel(views[i], n)}.`}
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
                  {KIND_LABEL[graph.nodes[focus].kind]} ·{" "}
                  {stateLabel(views[focus], graph.nodes[focus])}
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
          <Hero graph={graph} />
          <Readout graph={graph} look={look} />
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
            {"synthetic" in graph ? (
              <span className="rs-live-row">
                <LiveDot state="dead" label="Synthetic" />
                <span className="rs-live-detail">not verified · scale probe</span>
              </span>
            ) : (
              <span className="rs-live-row">
                <LiveDot state="fresh" label="Replay" />
                <span className="rs-live-detail" data-copy>
                  sha-256{" "}
                  <Hash h={{ v: sha256, src: "projection", ptr: "" }} label="Projection SHA-256" />{" "}
                  verified
                </span>
              </span>
            )}
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
                  <Num n={fact(flagship, "Holdout openings")!.n!} label="Holdout openings" />{" "}
                  holdout openings
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

        <Legend look={look} />
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

/** The study verdict in one line, every part from a sealed field. */
function Hero({ graph }: { graph: ResearchGraph }) {
  const q = graph.nodes.find((n) => n.id === "Q:STATISTICAL");
  const us = graph.nodes.find((n) => n.id === "R:US:PRIMARY"),
    india = graph.nodes.find((n) => n.id === "R:INDIA:PRIMARY");
  const holm = (n?: GraphNode) => n?.verdicts?.find((x) => x.k.startsWith("Holm"))?.n;
  const t = (n: GraphNode | undefined, label: string) =>
    n?.t ? <Num n={n.t} label={label} /> : "unavailable";
  const hu = holm(us),
    hi = holm(india);
  const met = us?.rule?.met && india?.rule?.met;
  const sk = graph.nodes.find((n) => n.id === "SK")?.facts.find((f) => f.k === "Old gate")?.t;
  return (
    <p className="rs-hero">
      {q?.verdict ? <Src t={q.verdict} label="Statistical verdict" /> : "unavailable"}
      <i>·</i> US t {t(us, "US primary t")} <i>·</i> IN t {t(india, "India primary t")} <i>·</i>{" "}
      Holm p {hu ? <Num n={hu} label="US Holm p" /> : "unavailable"} /{" "}
      {hi ? <Num n={hi} label="India Holm p" /> : "unavailable"} <i>·</i> acceptance rule{" "}
      {met ? "met" : "not met"}
      {sk && (
        <>
          {" "}
          <i>·</i> skeptic <Num n={graph.study.settings_passed} label="Skeptic settings passed" />{" "}
          of <Num n={graph.study.settings_total} label="Skeptic settings total" /> settings passed,
          gate <Src t={sk} label="Engine gate" />
        </>
      )}
    </p>
  );
}

/** Every visual channel, named. Anything not listed here is constant. */
function Legend({ look }: { look: Look }) {
  const dot = (c: string, label: string, ring = false) => (
    <span className="rs-lg-i">
      <i className={ring ? "is-ring" : ""} style={{ color: `var(--vx-${c})` }} />
      {label}
    </span>
  );
  return (
    <aside className="rs-legend" aria-label="Legend" data-copy>
      <div>
        {dot("fg", "frozen hypothesis")}
        {dot("cyan", "verified by its source / rule met")}
        {dot("teal", "rule not met")}
        {dot("cyanSoft", "control held")}
        {dot("muted", "recorded, no rule")}
        {dot("muted", "no result", true)}
        {dot("amber", "running / state change")}
        {dot("red", "failed")}
        {dot("magenta", "skeptic")}
      </div>
      <div>
        size = node kind · fan dot = one case, mutant or setting · lines: hypothesis→trial,
        trial→finding (Holm family), check→hub · brightness = {look === "depth" ? "depth" : "state"}
      </div>
      {look === "bloom" && (
        <div>
          radius = 6 + 1.25·t (inside t = 0: negative; floor t = −2.8) · critical rings are before
          Holm · v0.1.1 audit: asymptotic size failed in most settings
        </div>
      )}
      <div>
        ticks: amber start, holdout or gate · cyan sealed · red failed · magenta skeptic · tall =
        freeze, challenge, gate
      </div>
    </aside>
  );
}

/** A single prompt line in the command bar's language; inert until runs exist. */
function Composer() {
  return (
    <form
      className="rs-composer"
      aria-label="New research run"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="rs-c-line">
        <span className="rs-c-caret" aria-hidden="true">
          ›
        </span>
        <span className="vx-sr">Research prompt</span>
        <input
          disabled
          placeholder="hypothesis · as-of · universe · budget · rigor"
          aria-describedby="rs-c-note"
        />
      </label>
      <button type="submit" disabled aria-disabled="true">
        Run
      </button>
      <p id="rs-c-note" className="rs-c-note" data-copy>
        Inert: runs start in Q2/Q5; this build replays sealed evidence.
      </p>
    </form>
  );
}

/**
 * The sealed numbers for the two primary trials, always on screen. Every value is a Num
 * with its source; t is derived from the record's CI with its formula one click away.
 */
function Readout({ graph, look }: { graph: ResearchGraph; look: Look }) {
  const rows = ["R:US:PRIMARY", "R:INDIA:PRIMARY"]
    .map((id) => graph.nodes.find((n) => n.id === id))
    .filter((n): n is GraphNode => !!n);
  const f = (n: GraphNode, k: string) => n.facts.find((x) => x.k === k)?.n;
  const v = (n: GraphNode, k: string, label: string) => {
    const x = f(n, k);
    return x ? <Num n={x} label={`${n.label.t} ${label}`} /> : "unavailable";
  };
  const holm = (n: GraphNode) => n.verdicts?.find((x) => x.k.startsWith("Holm"))?.n;
  return (
    <div className="rs-readout" role="table" aria-label="Primary trials, sealed values">
      <div className="rs-ro-row rs-ro-head" role="row" data-copy>
        <span role="columnheader">trial</span>
        <span role="columnheader">t</span>
        <span role="columnheader">estimate</span>
        <span role="columnheader">95% CI</span>
        <span role="columnheader">Holm p</span>
        <span role="columnheader">n</span>
        <span role="columnheader">power</span>
        <span role="columnheader">MDE</span>
      </div>
      {rows.map((n) => (
        <div className="rs-ro-row" role="row" key={n.id}>
          <span role="cell" className="rs-ro-name">
            {n.country}
          </span>
          <span role="cell">{n.t ? <Num n={n.t} label={`${n.label.t} t`} /> : "unavailable"}</span>
          <span role="cell">{v(n, "Estimate · monthly intercept", "estimate")}</span>
          <span role="cell">
            {v(n, "95% CI lower", "CI lower")}
            <i>…</i>
            {v(n, "95% CI upper", "CI upper")}
          </span>
          <span role="cell">
            {holm(n) ? <Num n={holm(n)!} label={`${n.label.t} Holm p`} /> : "unavailable"}
          </span>
          <span role="cell">{v(n, "Observations", "n")}</span>
          <span role="cell">{v(n, "Prospective power", "power")}</span>
          <span role="cell">{v(n, "MDE at 80% power", "MDE")}</span>
        </div>
      ))}
      <div className="rs-ro-foot">
        holdouts used <Num n={graph.study.holdout_openings} label="Holdout openings" /> · α{" "}
        <Num n={graph.study.alpha} label="Primary test alpha" />
        {look === "bloom" && (
          <>
            {" "}
            · radius from the hypothesis = t · outer ring = critical z{" "}
            <Num n={graph.study.z_crit} label="One-sided critical value" />
          </>
        )}
      </div>
    </div>
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
        <i className="rs-hud-grab" aria-hidden="true" />
        <div className="rs-hud-top">
          <span className="rs-hud-kind">{KIND_LABEL[node.kind]}</span>
          <button
            type="button"
            className="rs-hud-close"
            onClick={onClose}
            aria-label="Close node details"
          >
            <span className="rs-hud-esc">ESC</span>
            <span className="rs-hud-x" aria-hidden="true">
              ×
            </span>
          </button>
        </div>
        <h2>
          <Src t={node.label} label="Node" />
        </h2>
        <div className="rs-hud-verdict" style={{ color: `var(--vx-${tone})` }}>
          <i aria-hidden="true" />
          {stateLabel({ state, running: false, flareAt: -2, flareKind: null }, node)}
          {node.verdict && state !== "dormant" && (
            <>
              {" · "}
              <Src t={node.verdict} label="Verdict" />
            </>
          )}
        </div>

        {node.rule && (
          <>
            <HudKicker tone={node.rule.met ? "cyan" : "amber"}>State rule</HudKicker>
            <p className="rs-rule" {...prov(graph.sources, node.rule.src)}>
              {node.rule.text}
            </p>
            {node.rule.inputs.map((x, i) => (
              <FactRow key={i} f={x} />
            ))}
            <HudLabel k="Result">{node.rule.met ? "met" : "not met"}</HudLabel>
          </>
        )}
        {node.t && (
          <HudLabel k="t (estimate ÷ SE)">
            <Num n={node.t} label="t statistic" />
          </HudLabel>
        )}
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

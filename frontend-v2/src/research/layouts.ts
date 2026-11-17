import type { ColorName } from "@/visual/tokens";
import type { ResearchGraph } from "./contract";

/**
 * Three ways to stand in front of the same evidence. Each is a pure function of the graph
 * (and the stage's aspect): positions, edge control points, camera and structural guides.
 */
import type { Look } from "./looks";
export { LOOKS, LOOK_LABEL, type Look } from "./looks";
export type Vec3 = [number, number, number];
export type Layout = {
  look: Look;
  pos: Vec3[];
  /** Per-node light multiplier (depth fog). */
  dim: number[];
  /** Cubic control points per edge, in graph edge order. */
  ctrl: [Vec3, Vec3][];
  camera: { dir: Vec3; target: Vec3; fov: number };
  labels: {
    text: string;
    at: Vec3;
    tone: ColorName;
    align: "left" | "right" | "center";
    /** Source key when the label carries an evidence number; copy marks a scale constant. */
    src?: string;
    copy?: boolean;
  }[];
  /** Faint structural polylines (layer frames, orbit guides). */
  guides: Vec3[][];
  /** Thinner, straighter, smaller: the constellation reading. */
  star: boolean;
  orbit: boolean;
  /** Anchors whose label sits above the node because their children fan out below. */
  pinAbove?: string[];
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, mul(sub(b, a), t));
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
/** Deterministic pseudo-random in [0,1) from an integer, for small jitter. */
const hash01 = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const ring = (c: Vec3, r: number, a0: number, a1: number, n: number, z = 0): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const a = n === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * i) / (n - 1);
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2] + z];
  });
const circle = (c: Vec3, r: number, n = 72): Vec3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2]];
  });
const deg = Math.PI / 180;

type Groups = {
  idx: Map<string, number>;
  runs: Record<"US" | "INDIA", { trials: number[]; placebos: number[] }>;
  questions: number[];
  calCases: number[];
  mutants: number[];
  settings: number[];
};
function groups(graph: ResearchGraph): Groups {
  const idx = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const g: Groups = {
    idx,
    runs: { US: { trials: [], placebos: [] }, INDIA: { trials: [], placebos: [] } },
    questions: [],
    calCases: [],
    mutants: [],
    settings: [],
  };
  graph.nodes.forEach((n, i) => {
    if (n.kind === "experiment" || n.kind === "counterfactual") {
      const c = n.country === "INDIA" ? "INDIA" : "US";
      (n.kind === "counterfactual" ? g.runs[c].placebos : g.runs[c].trials).push(i);
    } else if (n.kind === "question") g.questions.push(i);
    else if (n.id.startsWith("CAL:")) g.calCases.push(i);
    else if (n.id.startsWith("MUT:")) g.mutants.push(i);
    else if (n.id.startsWith("SK:") && n.id !== "SK:guard") g.settings.push(i);
  });
  return g;
}

function curveDefault(a: Vec3, b: Vec3, bow: number): [Vec3, Vec3] {
  const d = sub(b, a),
    l = len(d) || 1,
    perp: Vec3 = [-d[1] / l, d[0] / l, 0];
  return [add(lerp(a, b, 0.33), mul(perp, l * bow)), add(lerp(a, b, 0.66), mul(perp, l * bow))];
}

/** Radial neural bloom: the hypothesis blooms into trials; evidence streams to the finding. */
/** Bloom's radial scale: no effect at the base ring, 1.25 world units per unit of t. */
export const T_FLOOR = -2.8;
export const radiusOfT = (t: number) => 6 + 1.25 * Math.max(T_FLOOR, t);
/** Trials with no result sit on their own arc outside the t scale. */
export const NO_RESULT_R = 11;

/** Labels sit on their own ring strokes, at the angle where the rings are clear of trials. */
function ringLabels(H: Vec3, zc: number | null, z2: number | null): Layout["labels"] {
  const on = (r: number, a: number): Vec3 => [H[0] + r * Math.cos(a), H[1] + r * Math.sin(a), 0];
  const a = -3 * deg;
  const out: Layout["labels"] = [
    { text: "t = 0", at: on(radiusOfT(0), a), tone: "muted", align: "left", copy: true },
    { text: "t = 1", at: on(radiusOfT(1), -9 * deg), tone: "muted", align: "left", copy: true },
    { text: "NO RESULT", at: on(NO_RESULT_R, 180 * deg), tone: "muted", align: "right" },
  ];
  if (zc != null)
    out.push({
      text: `t = ${zc.toFixed(3)} one-sided`,
      at: on(radiusOfT(zc), 6 * deg),
      tone: "amber",
      align: "left",
      src: "v0.1/preregistration.json",
    });
  if (z2 != null)
    out.push(
      {
        text: `|t| = ${z2.toFixed(2)} · two-sided`,
        at: on(radiusOfT(z2), -18 * deg),
        tone: "cyanSoft",
        align: "left",
        src: "v0.1/preregistration.json",
      },
      {
        text: `t = −${z2.toFixed(2)}`,
        at: on(radiusOfT(-z2), 40 * deg),
        tone: "cyanSoft",
        align: "left",
        src: "v0.1/preregistration.json",
      },
    );
  return out;
}
const tick = (c: Vec3, r: number): Vec3[] => [
  [c[0] + (r - 0.25) * Math.cos(-7 * deg), c[1] + (r - 0.25) * Math.sin(-7 * deg), 0],
  [c[0] + (r + 0.25) * Math.cos(-7 * deg), c[1] + (r + 0.25) * Math.sin(-7 * deg), 0],
];
const arc = (c: Vec3, r: number, a0: number, a1: number): Vec3[] =>
  Array.from({ length: 25 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / 24;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), 0];
  });

function bloom(graph: ResearchGraph, g: Groups): Omit<Layout, "look"> {
  const zc = graph.study.z_crit.v,
    z2 = graph.study.z_crit2.v;
  const pos: Vec3[] = graph.nodes.map(() => [0, 0, 0]);
  const at = (id: string) => g.idx.get(id)!;
  const H: Vec3 = [-7.5, 0, 0],
    F: Vec3 = [6.2, 0, 0],
    SK: Vec3 = [16.2, 0, 0];
  pos[at("H")] = H;
  pos[at("F")] = F;
  pos[at("SK")] = SK;
  ring(H, 2.3, 45 * deg, 315 * deg, g.questions.length).forEach(
    (p, k) => (pos[g.questions[k]] = p),
  );
  for (const [c, sign] of [
    ["US", 1],
    ["INDIA", -1],
  ] as const) {
    const { trials, placebos } = g.runs[c];
    // Radius encodes the sealed record: distance from the hypothesis is the trial's t
    // (estimate ÷ SE). Trials without a result sit on the no-effect ring.
    const place = (i: number, a: number) => {
      const t = graph.nodes[i].t?.v,
        r = t == null ? NO_RESULT_R : radiusOfT(t);
      pos[i] = [H[0] + r * Math.cos(a), H[1] + r * Math.sin(a), (hash01(i + 7) - 0.5) * 0.6];
    };
    trials.forEach((i, k) =>
      place(i, sign * (36 + (104 * k) / Math.max(1, trials.length - 1)) * deg),
    );
    placebos.forEach((i, k) =>
      place(i, sign * (150 + (28 * k) / Math.max(1, placebos.length - 1)) * deg),
    );
  }
  const CAL: Vec3 = [10.4, 3.5, 0],
    MUT: Vec3 = [11.6, -4.1, 0],
    REP: Vec3 = [6.2, 3.6, 0],
    TESTS: Vec3 = [6.2, -3.6, 0];
  pos[at("CAL")] = CAL;
  pos[at("MUT")] = MUT;
  pos[at("REP")] = REP;
  pos[at("TESTS")] = TESTS;
  ring(CAL, 1.7, 15 * deg, 165 * deg, g.calCases.length).forEach(
    (p, k) => (pos[g.calCases[k]] = p),
  );
  ring(MUT, 1.9, -175 * deg, -5 * deg, g.mutants.length).forEach((p, k) => (pos[g.mutants[k]] = p));
  ring(SK, 3.0, -118 * deg, 118 * deg, g.settings.length, 0).forEach((p, k) => {
    pos[g.settings[k]] = [p[0], p[1], (hash01(k) - 0.5) * 0.8];
  });
  pos[at("SK:guard")] = [SK[0] - 2.2, SK[1] + 3.3, 0];

  const ctrl = graph.edges.map((e): [Vec3, Vec3] => {
    const a = pos[at(e.from)],
      b = pos[at(e.to)];
    if (e.from === "H") {
      const d = sub(b, a),
        l = len(d),
        perp: Vec3 = [-d[1] / l, d[0] / l, 0];
      return [
        add(add(a, mul(d, 0.28)), add(mul(perp, l * 0.16), [0, 0, 0.9])),
        add(add(a, mul(d, 0.72)), add(mul(perp, l * 0.06), [0, 0, 0.4])),
      ];
    }
    if (e.kind === "HOLM_FAMILY") {
      const out = sub(a, H),
        s = Math.sign(a[1]) || 1;
      return [add(a, mul(out, 0.32)), add(b, [-4.2, s * 2.1, 0])];
    }
    if (e.kind === "VERDICT") return [add(a, [2.5, 0, 0.6]), add(b, [-3.5, 0, 0.3])];
    if (e.kind === "CHALLENGES") return [add(a, [-2, 5.2, 1]), add(b, [2, 5.2, 1])];
    return curveDefault(a, b, 0.08);
  });
  const labels: Layout["labels"] = [
    { text: "US TRIALS", at: [H[0] - 1.5, H[1] + 8.1, 0], tone: "muted", align: "center" },
    { text: "INDIA TRIALS", at: [H[0] - 1.5, H[1] - 8.3, 0], tone: "muted", align: "center" },
    {
      text: "PLACEBOS",
      at: [H[0] - radiusOfT(0) - 1.6, H[1] + 2.4, 0],
      tone: "muted",
      align: "right",
    },
    ...ringLabels(H, zc, z2),
  ];
  const guides = [
    circle(H, radiusOfT(0), 120),
    ...(zc == null ? [] : [circle(H, radiusOfT(zc), 120)]),
    ...(z2 == null ? [] : [circle(H, radiusOfT(z2), 120), circle(H, radiusOfT(-z2), 120)]),
    tick(H, radiusOfT(1)),
    arc(H, NO_RESULT_R, 150 * deg, 210 * deg),
  ];
  return {
    pos,
    dim: pos.map(() => 1),
    ctrl,
    camera: { dir: [0.0, -0.28, 1], target: [3.3, 0, 0], fov: 34 },
    labels,
    guides,
    star: false,
    orbit: true,
    pinAbove: ["MUT"],
  };
}

/** Portrait stages turn the composition a quarter so it reads top to bottom. */
const turn = (p: Vec3): Vec3 => [-p[1], -p[0], p[2]];

export function layoutFor(look: Look, graph: ResearchGraph, aspect: number): Layout {
  const g = groups(graph);
  const base = bloom(graph, g);
  // Centre the composition on its own bounds so the camera target is the middle.
  const xs = base.pos.map((p) => p[0]),
    ys = base.pos.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const shift = (p: Vec3): Vec3 => [p[0] - cx, p[1] - cy, p[2]];
  const portrait = aspect < 0.85;
  const f = (p: Vec3) => (portrait ? turn(shift(p)) : shift(p));
  return {
    ...base,
    look,
    pos: base.pos.map(f),
    ctrl: base.ctrl.map(([a, b]) => [f(a), f(b)]),
    labels: base.labels.map((l) => ({ ...l, at: f(l.at) })),
    guides: base.guides.map((line) => line.map(f)),
    camera: {
      ...base.camera,
      target: f(base.camera.target),
      dir: portrait
        ? [base.camera.dir[1], base.camera.dir[0], base.camera.dir[2]]
        : base.camera.dir,
    },
  };
}

/** Sample a cubic Bézier for line geometry and 2D drawing. */
export function bezier(a: Vec3, c1: Vec3, c2: Vec3, b: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
    u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
    u * u * u * a[2] + 3 * u * u * t * c1[2] + 3 * u * t * t * c2[2] + t * t * t * b[2],
  ];
}

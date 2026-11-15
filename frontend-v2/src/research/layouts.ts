import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
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
  labels: { text: string; at: Vec3; tone: ColorName; align: "left" | "right" | "center" }[];
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
function bloom(graph: ResearchGraph, g: Groups): Omit<Layout, "look"> {
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
    trials.forEach((i, k) => {
      const a = sign * (38 + (142 * k) / Math.max(1, trials.length - 1)) * deg,
        r = 5.4 + (k % 2) * 0.55 + hash01(i) * 0.2;
      pos[i] = [H[0] + r * Math.cos(a), H[1] + r * Math.sin(a), (hash01(i + 7) - 0.5) * 1.6];
    });
    placebos.forEach((i, k) => {
      const a = sign * (60 + (110 * k) / Math.max(1, placebos.length - 1)) * deg,
        r = 7.3;
      pos[i] = [H[0] + r * Math.cos(a), H[1] + r * Math.sin(a), (hash01(i + 3) - 0.5) * 1.2];
    });
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
    { text: "PLACEBO RING", at: [H[0] - 7.9, H[1] + 2.3, 0], tone: "muted", align: "right" },
  ];
  const guides = [circle(H, 5.65, 96), circle(H, 7.3, 96)];
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

/**
 * Depth field: four parallel sheets seen at an angle, like layers of a network. The past
 * (preregistration) is farthest and dimmest; the skeptic stands nearest the viewer.
 */
function depth(graph: ResearchGraph, g: Groups): Omit<Layout, "look"> {
  const pos: Vec3[] = graph.nodes.map(() => [0, 0, 0]);
  const at = (id: string) => g.idx.get(id)!;
  const Z = { pre: -16, trials: -5, finding: 6, skeptic: 16 };
  const P: Vec3 = [0, 0, Z.pre],
    Fz: Vec3 = [0, 0, Z.finding],
    S: Vec3 = [0, 0, Z.skeptic];
  pos[at("H")] = P;
  ring(P, 2.6, 45 * deg, 315 * deg, g.questions.length).forEach(
    (p, k) => (pos[g.questions[k]] = p),
  );
  const rows: [number[], number][] = [
    [g.runs.US.placebos, 3.6],
    [g.runs.US.trials, 1.3],
    [g.runs.INDIA.trials, -1.3],
    [g.runs.INDIA.placebos, -3.6],
  ];
  for (const [ids, y] of rows)
    ids.forEach((i, k) => (pos[i] = [-6.5 + (13 * k) / Math.max(1, ids.length - 1), y, Z.trials]));
  pos[at("F")] = Fz;
  const CAL: Vec3 = add(Fz, [-5.2, 3.1, 0]),
    MUT: Vec3 = add(Fz, [5.2, 3.1, 0]),
    REP: Vec3 = add(Fz, [-5.2, -3.1, 0]),
    TESTS: Vec3 = add(Fz, [5.2, -3.1, 0]);
  pos[at("CAL")] = CAL;
  pos[at("MUT")] = MUT;
  pos[at("REP")] = REP;
  pos[at("TESTS")] = TESTS;
  ring(CAL, 1.5, 60 * deg, 200 * deg, g.calCases.length).forEach(
    (p, k) => (pos[g.calCases[k]] = p),
  );
  ring(MUT, 1.7, -20 * deg, 140 * deg, g.mutants.length).forEach((p, k) => (pos[g.mutants[k]] = p));
  pos[at("SK")] = S;
  ring(S, 3.4, 0, 2 * Math.PI * (1 - 1 / g.settings.length), g.settings.length).forEach(
    (p, k) => (pos[g.settings[k]] = p),
  );
  pos[at("SK:guard")] = add(S, [-1.3, 1.3, 0]);
  const ctrl = graph.edges.map((e): [Vec3, Vec3] => {
    const a = pos[at(e.from)],
      b = pos[at(e.to)],
      dz = (b[2] - a[2]) * 0.5;
    if (Math.abs(dz) < 0.01) return curveDefault(a, b, 0.1);
    return [add(a, [0, 0, dz]), sub(b, [0, 0, dz])];
  });
  const frame = (z: number, w: number, h: number): Vec3[] => [
    [-w, -h, z],
    [w, -h, z],
    [w, h, z],
    [-w, h, z],
    [-w, -h, z],
  ];
  const sheets: [number, number, number, string, ColorName][] = [
    [Z.pre, 3.6, 3.6, "PREREGISTRATION", "muted"],
    [Z.trials, 7.6, 4.6, "TRIALS", "muted"],
    [Z.finding, 7.4, 5, "FINDING", "muted"],
    [Z.skeptic, 4.4, 4.4, "SKEPTIC", "magenta"],
  ];
  const guides = sheets.map(([z, w, h]) => frame(z, w, h));
  const labels: Layout["labels"] = sheets.map(([z, w, h, text, tone]) => ({
    text,
    at: [-w, h + 0.7, z] as Vec3,
    tone,
    align: "left" as const,
  }));
  const dim = pos.map(
    (p) => 0.4 + 0.6 * Math.min(1, Math.max(0, (p[2] - Z.pre) / (Z.skeptic - Z.pre))) ** 0.8,
  );
  return {
    pos,
    dim,
    ctrl,
    camera: { dir: [-1, 0.42, 0.8], target: [0, 0, 0], fov: 30 },
    labels,
    guides,
    star: false,
    orbit: true,
  };
}

type Sim = {
  id: string;
  i: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  vx?: number;
  vy?: number;
};
/** Constellation: a seeded force layout, flat, thin and starlit. */
function constellation(graph: ResearchGraph, g: Groups): Omit<Layout, "look"> {
  // Anchors are pinned so the flow reads left to right; everything else finds its place.
  const fixed: Record<string, [number, number]> = {
    H: [-12, 0],
    F: [2.5, 0],
    SK: [14, 0],
    CAL: [5.5, 4.6],
    MUT: [5.5, -4.6],
    REP: [0.5, 3.4],
    TESTS: [0.5, -3.4],
  };
  const nodes: Sim[] = graph.nodes.map((n, i) => ({
    id: n.id,
    i,
    ...(fixed[n.id]
      ? { fx: fixed[n.id][0], fy: fixed[n.id][1], x: fixed[n.id][0], y: fixed[n.id][1] }
      : {}),
  }));
  const links = graph.edges.map((e) => ({ source: e.from, target: e.to, kind: e.kind }));
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const sim = forceSimulation(nodes)
    .randomSource(random)
    .force(
      "link",
      forceLink<Sim, (typeof links)[number]>(links)
        .id((d) => d.id)
        .distance((l) =>
          l.kind === "HOLM_FAMILY"
            ? 9
            : l.kind === "VERDICT"
              ? 8
              : l.kind === "CHALLENGES"
                ? 9
                : l.kind === "QUESTION"
                  ? 2.4
                  : 2.6,
        )
        .strength((l) => (l.kind === "HOLM_FAMILY" ? 0.04 : l.kind === "VERDICT" ? 0.05 : 0.5)),
    )
    .force("charge", forceManyBody<Sim>().strength(-1.6).distanceMax(9))
    .force("collide", forceCollide<Sim>(0.62))
    .force("y", forceY<Sim>(0).strength(0.035))
    .force(
      "x",
      forceX<Sim>((d) => {
        const n = graph.nodes[d.i];
        return n.kind === "experiment" || n.kind === "counterfactual" || n.kind === "question"
          ? -6
          : 0;
      }).strength((d) =>
        graph.nodes[d.i].kind === "experiment" || graph.nodes[d.i].kind === "counterfactual"
          ? 0.05
          : 0,
      ),
    )
    .stop();
  for (let k = 0; k < 420; k++) sim.tick();
  const pos: Vec3[] = nodes.map((n) => [n.x ?? 0, n.y ?? 0, 0]);
  const at = (id: string) => g.idx.get(id)!;
  const ctrl = graph.edges.map((e): [Vec3, Vec3] => {
    const a = pos[at(e.from)],
      b = pos[at(e.to)];
    if (e.kind === "HOLM_FAMILY" || e.kind === "VERDICT")
      return curveDefault(a, b, a[1] >= 0 ? -0.12 : 0.12);
    if (e.kind === "CHALLENGES") return curveDefault(a, b, -0.35);
    return [lerp(a, b, 0.33), lerp(a, b, 0.66)];
  });
  const centroid = (ids: number[]): Vec3 => {
    const s = ids.reduce((acc, i) => add(acc, pos[i]), [0, 0, 0] as Vec3);
    return mul(s, 1 / Math.max(1, ids.length));
  };
  const top = (ids: number[]) => Math.max(...ids.map((i) => pos[i][1]));
  const bottom = (ids: number[]) => Math.min(...ids.map((i) => pos[i][1]));
  const us = [...g.runs.US.trials, ...g.runs.US.placebos],
    india = [...g.runs.INDIA.trials, ...g.runs.INDIA.placebos];
  const labels: Layout["labels"] = [
    {
      text: "THE TRIALS",
      at: [centroid([...us, ...india])[0], top([...us, ...india]) + 1.1, 0],
      tone: "muted",
      align: "center",
    },
    {
      text: "CALIBRATION",
      at: [centroid(g.calCases)[0], top(g.calCases) + 0.9, 0],
      tone: "muted",
      align: "center",
    },
    {
      text: "MUTATION",
      at: [centroid(g.mutants)[0], bottom(g.mutants) - 0.9, 0],
      tone: "muted",
      align: "center",
    },
    {
      text: "SKEPTIC SETTINGS",
      at: [centroid(g.settings)[0], bottom(g.settings) - 1.0, 0],
      tone: "magenta",
      align: "center",
    },
  ];
  return {
    pos,
    dim: pos.map(() => 1),
    ctrl,
    camera: { dir: [0, 0, 1], target: [0, 0, 0], fov: 22 },
    labels,
    guides: [],
    star: true,
    orbit: false,
  };
}

/** Portrait stages turn the composition a quarter so it reads top to bottom. */
const turn = (p: Vec3): Vec3 => [-p[1], -p[0], p[2]];

export function layoutFor(look: Look, graph: ResearchGraph, aspect: number): Layout {
  const g = groups(graph);
  const base =
    look === "depth"
      ? depth(graph, g)
      : look === "constellation"
        ? constellation(graph, g)
        : bloom(graph, g);
  // Centre the composition on its own bounds so the camera target is the middle.
  const xs = base.pos.map((p) => p[0]),
    ys = base.pos.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const shift = (p: Vec3): Vec3 => [p[0] - cx, p[1] - cy, p[2]];
  const portrait = aspect < 0.85 && look !== "depth";
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

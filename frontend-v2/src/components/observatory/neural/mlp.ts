/**
 * The Observatory's in-browser network: the same algorithm as src/ml/neural.py (He/Xavier
 * initialization, inverted dropout, L2 on weights, Adam, sigmoid output, binary
 * cross-entropy, final-epoch model). It trains only on synthetic lab worlds; real evidence is
 * trained by the backend.
 */
import { gauss, rng } from "../format.ts";

export const ACTIVATIONS = ["relu", "tanh", "gelu", "silu"] as const;
export type Activation = (typeof ACTIVATIONS)[number];
export type Architecture = {
  hidden: number[];
  activation: Activation;
  dropout: number;
  l2: number;
  learning_rate: number;
  epochs: number;
  batch_size: number;
  seed: number;
};
/** Bounds shared with Architecture.parse in src/ml/neural.py. */
export const LIMITS = {
  layers: [1, 4],
  width: [2, 64],
  epochs: [5, 200],
  batch_size: [16, 256],
  learning_rate: [1e-4, 1e-1],
  dropout: [0, 0.6],
  l2: [0, 1e-1],
} as const;
export const DEFAULT_ARCHITECTURE: Architecture = {
  hidden: [32, 16],
  activation: "relu",
  dropout: 0.1,
  l2: 1e-4,
  learning_rate: 3e-3,
  epochs: 60,
  batch_size: 64,
  seed: 42,
};
export const SNAPSHOTS = 25;

/** Problems with an architecture, in the backend's words; empty when it is valid. */
export function architectureErrors(a: Architecture): string[] {
  const errors: string[] = [];
  const within = (v: number, [lo, hi]: readonly [number, number]) =>
    Number.isFinite(v) && v >= lo && v <= hi;
  if (!within(a.hidden.length, LIMITS.layers)) errors.push("A network needs 1-4 hidden layers");
  if (a.hidden.some((w) => !Number.isInteger(w) || !within(w, LIMITS.width)))
    errors.push("Hidden layer width must be between 2 and 64");
  if (!ACTIVATIONS.includes(a.activation)) errors.push("Unknown activation");
  for (const key of ["dropout", "l2", "learning_rate", "epochs", "batch_size"] as const)
    if (!within(a[key], LIMITS[key])) errors.push(`${key} is out of range`);
  if (!Number.isInteger(a.epochs) || !Number.isInteger(a.batch_size))
    errors.push("epochs and batch_size must be integers");
  if (!Number.isInteger(a.seed) || a.seed < 0 || a.seed >= 2 ** 31)
    errors.push("seed must be a non-negative 31-bit integer");
  return errors;
}

export function snapshotEpochs(epochs: number) {
  const n = Math.min(epochs + 1, SNAPSHOTS);
  const set = new Set<number>();
  for (let i = 0; i < n; i++) set.add(Math.round((epochs * i) / (n - 1)));
  return [...set].sort((a, b) => a - b);
}

const K = 0.7978845608028654;
function act(name: Activation, z: number) {
  switch (name) {
    case "relu":
      return z > 0 ? z : 0;
    case "tanh":
      return Math.tanh(z);
    case "gelu":
      return 0.5 * z * (1 + Math.tanh(K * (z + 0.044715 * z * z * z)));
    default:
      return z / (1 + Math.exp(-z));
  }
}
function dact(name: Activation, z: number) {
  switch (name) {
    case "relu":
      return z > 0 ? 1 : 0;
    case "tanh": {
      const t = Math.tanh(z);
      return 1 - t * t;
    }
    case "gelu": {
      const t = Math.tanh(K * (z + 0.044715 * z * z * z));
      return 0.5 * (1 + t) + 0.5 * z * (1 - t * t) * K * (1 + 3 * 0.044715 * z * z);
    }
    default: {
      const s = 1 / (1 + Math.exp(-z));
      return s + z * s * (1 - s);
    }
  }
}
const sigmoid = (z: number) => 0.5 * (1 + Math.tanh(0.5 * z));

/** A dense row-major matrix. */
export type Mat = { rows: number; cols: number; data: Float64Array };
const mat = (rows: number, cols: number): Mat => ({
  rows,
  cols,
  data: new Float64Array(rows * cols),
});

export type Scaler = { mean: Float64Array; scale: Float64Array };
export function fitScaler(x: Mat): Scaler {
  const mean = new Float64Array(x.cols),
    scale = new Float64Array(x.cols);
  for (let i = 0; i < x.rows; i++)
    for (let j = 0; j < x.cols; j++) mean[j] += x.data[i * x.cols + j] / x.rows;
  for (let i = 0; i < x.rows; i++)
    for (let j = 0; j < x.cols; j++) scale[j] += (x.data[i * x.cols + j] - mean[j]) ** 2 / x.rows;
  for (let j = 0; j < x.cols; j++) {
    scale[j] = Math.sqrt(scale[j]);
    if (!Number.isFinite(scale[j]) || scale[j] < 1e-12) scale[j] = 1;
  }
  return { mean, scale };
}
export function transform(x: Mat, s: Scaler): Mat {
  const out = mat(x.rows, x.cols);
  for (let i = 0; i < x.rows; i++)
    for (let j = 0; j < x.cols; j++)
      out.data[i * x.cols + j] = (x.data[i * x.cols + j] - s.mean[j]) / s.scale[j];
  return out;
}

export class Network {
  readonly arch: Architecture;
  readonly sizes: number[];
  readonly weights: Mat[] = [];
  readonly biases: Float64Array[] = [];
  constructor(arch: Architecture, inputs: number) {
    this.arch = arch;
    this.sizes = [inputs, ...arch.hidden, 1];
    const r = rng(arch.seed);
    const gain = arch.activation === "tanh" ? 1 : 2;
    for (let l = 0; l < this.sizes.length - 1; l++) {
      const fanIn = this.sizes[l],
        fanOut = this.sizes[l + 1],
        last = l === this.sizes.length - 2,
        std = Math.sqrt((last ? 1 : gain) / fanIn);
      const w = mat(fanIn, fanOut);
      for (let k = 0; k < w.data.length; k++) w.data[k] = gauss(r) * std;
      this.weights.push(w);
      this.biases.push(new Float64Array(fanOut));
    }
  }

  get parameterCount() {
    return this.weights.reduce((n, w, l) => n + w.data.length + this.biases[l].length, 0);
  }

  /**
   * Forward pass over rows of x. Returns per-layer pre-activations, post-activations (with
   * dropout masks applied when `drop` is given) and output probabilities.
   */
  forward(x: Mat, drop?: () => number) {
    const L = this.weights.length,
      keep = 1 - this.arch.dropout,
      n = x.rows;
    const inputs: Mat[] = [x],
      pre: Mat[] = [],
      masks: (Float64Array | null)[] = [];
    let a = x;
    for (let l = 0; l < L; l++) {
      const w = this.weights[l],
        b = this.biases[l],
        z = mat(n, w.cols);
      for (let i = 0; i < n; i++) {
        const ai = i * a.cols,
          zi = i * w.cols;
        for (let o = 0; o < w.cols; o++) z.data[zi + o] = b[o];
        for (let k = 0; k < a.cols; k++) {
          const v = a.data[ai + k];
          if (v === 0) continue;
          const wk = k * w.cols;
          for (let o = 0; o < w.cols; o++) z.data[zi + o] += v * w.data[wk + o];
        }
      }
      pre.push(z);
      if (l === L - 1) {
        masks.push(null);
        break;
      }
      const h = mat(n, w.cols);
      let mask: Float64Array | null = null;
      if (drop && this.arch.dropout > 0) mask = new Float64Array(h.data.length);
      for (let k = 0; k < h.data.length; k++) {
        let v = act(this.arch.activation, z.data[k]);
        if (mask) {
          mask[k] = drop!() < keep ? 1 / keep : 0;
          v *= mask[k];
        }
        h.data[k] = v;
      }
      masks.push(mask);
      inputs.push(h);
      a = h;
    }
    const logits = pre[L - 1];
    const p = new Float64Array(n);
    for (let i = 0; i < n; i++) p[i] = sigmoid(logits.data[i]);
    return { inputs, pre, masks, p };
  }

  /** Gradients of Σ upstream·logit w.r.t. weights, biases and inputs (upstream = (p−y)/n). */
  backward(cache: ReturnType<Network["forward"]>, upstream: Float64Array) {
    const L = this.weights.length,
      n = upstream.length;
    const gw = this.weights.map((w) => mat(w.rows, w.cols)),
      gb = this.biases.map((b) => new Float64Array(b.length));
    let delta = mat(n, 1);
    delta.data.set(upstream);
    for (let l = L - 1; l >= 0; l--) {
      const a = cache.inputs[l],
        w = this.weights[l];
      for (let i = 0; i < n; i++) {
        const ai = i * a.cols,
          di = i * w.cols;
        for (let o = 0; o < w.cols; o++) gb[l][o] += delta.data[di + o];
        for (let k = 0; k < a.cols; k++) {
          const v = a.data[ai + k];
          if (v === 0) continue;
          const gk = k * w.cols;
          for (let o = 0; o < w.cols; o++) gw[l].data[gk + o] += v * delta.data[di + o];
        }
      }
      const next = mat(n, w.rows);
      for (let i = 0; i < n; i++) {
        const di = i * w.cols,
          ni = i * w.rows;
        for (let k = 0; k < w.rows; k++) {
          let s = 0;
          const wk = k * w.cols;
          for (let o = 0; o < w.cols; o++) s += delta.data[di + o] * w.data[wk + o];
          next.data[ni + k] = s;
        }
      }
      if (l > 0) {
        const z = cache.pre[l - 1],
          mask = cache.masks[l - 1];
        for (let k = 0; k < next.data.length; k++) {
          let g = next.data[k] * dact(this.arch.activation, z.data[k]);
          if (mask) g *= mask[k];
          next.data[k] = g;
        }
      }
      delta = next;
    }
    return { gw, gb, gx: delta };
  }

  /** Mean |∂p/∂x · x| per input, normalized to sum to one. */
  attribution(x: Mat) {
    const cache = this.forward(x);
    const up = cache.p.map((p) => p * (1 - p));
    const { gx } = this.backward(cache, up);
    const out = new Float64Array(x.cols);
    for (let i = 0; i < x.rows; i++)
      for (let j = 0; j < x.cols; j++)
        out[j] += Math.abs(gx.data[i * x.cols + j] * x.data[i * x.cols + j]) / x.rows;
    const total = out.reduce((a, b) => a + b, 0);
    return Array.from(out, (v) => (total > 0 ? v / total : v));
  }

  hidden(x: Mat) {
    return this.forward(x).inputs.slice(1);
  }
}

export function bce(y: ArrayLike<number>, p: ArrayLike<number>) {
  let s = 0;
  for (let i = 0; i < y.length; i++) {
    const q = Math.min(1 - 1e-7, Math.max(1e-7, p[i]));
    s -= y[i] * Math.log(q) + (1 - y[i]) * Math.log(1 - q);
  }
  return s / y.length;
}

/** Mann–Whitney AUC with average ranks for ties; null without both classes. */
export function auc(y: ArrayLike<number>, p: ArrayLike<number>): number | null {
  const n = y.length,
    order = Array.from({ length: n }, (_, i) => i).sort((a, b) => p[a] - p[b]);
  const ranks = new Float64Array(n);
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && p[order[j + 1]] === p[order[i]]) j++;
    for (let k = i; k <= j; k++) ranks[order[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  let pos = 0,
    sum = 0;
  for (let i = 0; i < n; i++)
    if (y[i] === 1) {
      pos++;
      sum += ranks[i];
    }
  const neg = n - pos;
  return pos && neg ? (sum - (pos * (pos + 1)) / 2) / (pos * neg) : null;
}

/** Percentile bootstrap of AUC (2,000 resamples, seed 42), as src/observatory/evidence.py. */
export function bootstrapAuc(y: ArrayLike<number>, p: ArrayLike<number>, resamples = 2000) {
  const r = rng(42),
    n = y.length,
    values: number[] = [];
  const yy = new Float64Array(n),
    pp = new Float64Array(n);
  for (let b = 0; b < resamples; b++) {
    for (let i = 0; i < n; i++) {
      const k = Math.floor(r() * n);
      yy[i] = y[k];
      pp[i] = p[k];
    }
    const a = auc(yy, pp);
    if (a != null) values.push(a);
  }
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const q = (f: number) => {
    const h = (values.length - 1) * f,
      lo = Math.floor(h);
    return values[lo] + (values[Math.min(lo + 1, values.length - 1)] - values[lo]) * (h - lo);
  };
  return { low: q(0.025), high: q(0.975), resamples, valid_resamples: values.length, seed: 42 };
}

const round = (v: number, d = 5) => Math.round(v * 10 ** d) / 10 ** d;

export type EpochRow = {
  epoch: number;
  train_loss: number;
  train_auc: number | null;
  val_loss: number;
  val_auc: number | null;
  weight_norm: number[];
};
export type Snapshot = {
  epoch: number;
  weights: number[][][];
  biases: number[][];
  mean_activation: number[][];
  active_fraction: number[][];
};

export function snapshot(net: Network, epoch: number, xv: Mat): Snapshot {
  const hidden = net.hidden(xv);
  return {
    epoch,
    weights: net.weights.map((w) =>
      Array.from({ length: w.rows }, (_, k) =>
        Array.from(w.data.subarray(k * w.cols, (k + 1) * w.cols), (v) => round(v)),
      ),
    ),
    biases: net.biases.map((b) => Array.from(b, (v) => round(v))),
    mean_activation: hidden.map((h) =>
      Array.from({ length: h.cols }, (_, o) => {
        let s = 0;
        for (let i = 0; i < h.rows; i++) s += h.data[i * h.cols + o];
        return round(s / h.rows);
      }),
    ),
    active_fraction: hidden.map((h) =>
      Array.from({ length: h.cols }, (_, o) => {
        let s = 0;
        for (let i = 0; i < h.rows; i++) if (Math.abs(h.data[i * h.cols + o]) > 1e-6) s++;
        return round(s / h.rows, 4);
      }),
    ),
  };
}

/**
 * Train with Adam; calls onEpoch after every epoch and onSnapshot at snapshot epochs, so a
 * caller can stream the run. Returns the final-epoch network.
 */
export function trainNetwork(
  arch: Architecture,
  xFit: Mat,
  yFit: Float64Array,
  xVal: Mat,
  yVal: Float64Array,
  hooks: {
    onEpoch?: (row: EpochRow) => void;
    onSnapshot?: (s: Snapshot) => void;
    cancelled?: () => boolean;
  } = {},
) {
  const scaler = fitScaler(xFit);
  const xs = transform(xFit, scaler),
    xv = transform(xVal, scaler);
  const net = new Network(arch, xs.cols);
  const params: Float64Array[] = [...net.weights.map((w) => w.data), ...net.biases];
  const m = params.map((p) => new Float64Array(p.length)),
    v = params.map((p) => new Float64Array(p.length));
  const shuffle = rng(arch.seed + 1),
    drop = rng(arch.seed + 2);
  const keep = new Set(snapshotEpochs(arch.epochs));
  hooks.onSnapshot?.(snapshot(net, 0, xv));
  let t = 0;
  const order = Array.from({ length: xs.rows }, (_, i) => i);
  for (let epoch = 1; epoch <= arch.epochs; epoch++) {
    if (hooks.cancelled?.()) return null;
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(shuffle() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let start = 0; start < order.length; start += arch.batch_size) {
      const batch = order.slice(start, start + arch.batch_size);
      const xb = mat(batch.length, xs.cols),
        up = new Float64Array(batch.length);
      batch.forEach((row, i) =>
        xb.data.set(xs.data.subarray(row * xs.cols, (row + 1) * xs.cols), i * xs.cols),
      );
      const cache = net.forward(xb, drop);
      batch.forEach((row, i) => (up[i] = (cache.p[i] - yFit[row]) / batch.length));
      const { gw, gb } = net.backward(cache, up);
      gw.forEach((g, l) => {
        const w = net.weights[l].data;
        for (let k = 0; k < g.data.length; k++) g.data[k] += arch.l2 * w[k];
      });
      const grads = [...gw.map((g) => g.data), ...gb];
      t++;
      const b1 = 0.9,
        b2 = 0.999,
        c1 = 1 - b1 ** t,
        c2 = 1 - b2 ** t;
      grads.forEach((g, i) => {
        const p = params[i],
          mi = m[i],
          vi = v[i];
        for (let k = 0; k < g.length; k++) {
          mi[k] = b1 * mi[k] + (1 - b1) * g[k];
          vi[k] = b2 * vi[k] + (1 - b2) * g[k] * g[k];
          p[k] -= (arch.learning_rate * (mi[k] / c1)) / (Math.sqrt(vi[k] / c2) + 1e-8);
        }
      });
    }
    const pf = net.forward(xs).p,
      pv = net.forward(xv).p;
    hooks.onEpoch?.({
      epoch,
      train_loss: round(bce(yFit, pf), 6),
      train_auc: nullable(auc(yFit, pf)),
      val_loss: round(bce(yVal, pv), 6),
      val_auc: nullable(auc(yVal, pv)),
      weight_norm: net.weights.map((w) => round(Math.sqrt(w.data.reduce((a, b) => a + b * b, 0)))),
    });
    if (keep.has(epoch)) hooks.onSnapshot?.(snapshot(net, epoch, xv));
  }
  return { net, scaler, xs, xv };
}
const nullable = (v: number | null) => (v == null ? null : round(v, 6));

/** Probabilities for raw (unscaled) rows. */
export function predict(net: Network, scaler: Scaler, x: Mat) {
  return net.forward(transform(x, scaler)).p;
}
export { mat };

// Deterministic-ish plausible IV surface per ticker.
// Returns a grid: rows = expiries (in days), cols = strike offsets (% of spot),
// values in IV%.

export type VolSurface = {
  strikes: number[]; // moneyness offsets in % (e.g. -20 .. +20)
  expiries: number[]; // days to expiry
  iv: number[][]; // iv[expiryIdx][strikeIdx] as percent
  atmIv: number;
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

export function generateVolSurface(symbol: string, spot: number): VolSurface {
  const seed = hash(symbol);
  const rng = (n: number) => {
    const x = Math.sin(seed + n) * 43758.5453;
    return x - Math.floor(x);
  };

  const strikes: number[] = [];
  for (let s = -25; s <= 25; s += 2.5) strikes.push(s);
  const expiries = [7, 14, 30, 45, 60, 90, 120, 180, 270, 365];

  // Base ATM IV varies by ticker
  const atmIv = 22 + rng(1) * 40; // 22..62
  const skew = 0.008 + rng(2) * 0.014; // downside skew slope
  const smile = 0.0012 + rng(3) * 0.0018; // curvature
  const termSlope = -0.06 + rng(4) * 0.12; // term structure slope (per year)

  const iv: number[][] = expiries.map((t) => {
    const tYears = t / 365;
    const termAdj = termSlope * (tYears - 0.25) + (1 - Math.exp(-t / 30)) * 2;
    return strikes.map((k) => {
      // k in % moneyness. Downside (k<0) has higher IV.
      const skewComponent = -skew * k * 100;
      const smileComponent = smile * k * k * 100;
      const noise = (rng(t * 31 + k * 7) - 0.5) * 1.2;
      const val = atmIv + termAdj + skewComponent + smileComponent + noise;
      return Math.max(6, val);
    });
  });

  return { strikes, expiries, iv, atmIv };
}

export function viridisRgb(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, number, number][] = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ];
  const idx = t * (stops.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  return [
    (a[0] + (b[0] - a[0]) * f) / 255,
    (a[1] + (b[1] - a[1]) * f) / 255,
    (a[2] + (b[2] - a[2]) * f) / 255,
  ];
}

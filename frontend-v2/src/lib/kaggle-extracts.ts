// Static extracts in the spirit of public Kaggle datasets, bundled so the
// terminal works offline and without API keys. Clearly labeled in the UI.

import type { LivePoint } from "./live-sources";

/** Tesla quarterly vehicle deliveries (public company-reported figures —
 *  same series found in the popular Kaggle "Tesla Deliveries" datasets). */
export const TSLA_DELIVERIES: LivePoint[] = [
  { t: Date.UTC(2022, 2, 31), v: 310_048 },
  { t: Date.UTC(2022, 5, 30), v: 254_695 },
  { t: Date.UTC(2022, 8, 30), v: 343_830 },
  { t: Date.UTC(2022, 11, 31), v: 405_278 },
  { t: Date.UTC(2023, 2, 31), v: 422_875 },
  { t: Date.UTC(2023, 5, 30), v: 466_140 },
  { t: Date.UTC(2023, 8, 30), v: 435_059 },
  { t: Date.UTC(2023, 11, 31), v: 484_507 },
  { t: Date.UTC(2024, 2, 31), v: 386_810 },
  { t: Date.UTC(2024, 5, 30), v: 443_956 },
  { t: Date.UTC(2024, 8, 30), v: 462_890 },
  { t: Date.UTC(2024, 11, 31), v: 495_570 },
];

/** Representative LA/Long Beach port-congestion index extract
 *  (monthly, normalized 100 = 5y average; shape mirrors public port datasets). */
export const PORT_CONGESTION: LivePoint[] = [
  96, 94, 99, 103, 101, 105, 108, 112, 109, 114, 118, 116,
  113, 117, 121, 125, 122, 119, 124, 128, 131, 127, 133, 138,
].map((v, i) => ({ t: Date.UTC(2024, i % 12, 15) + Math.floor(i / 12) * 31_536_000_000, v }));

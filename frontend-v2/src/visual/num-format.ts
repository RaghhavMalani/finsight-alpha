import type { NumFormat } from "./Num";

/** Display formats for provenance values. The popover always shows the raw value. */
export function formatNum(v: number, fmt: NumFormat): string {
  return raw(v, fmt).replace(/^-/, "\u2212");
}
function raw(v: number, fmt: NumFormat): string {
  switch (fmt) {
    case "ret":
      return `${(v * 100).toFixed(2)}%`;
    case "pp":
      return (v * 100).toFixed(2);
    case "p":
    case "rate":
    case "x":
      return v.toFixed(3);
    case "int":
      return Math.round(v).toLocaleString("en-US");
    case "bps":
      return `${v} bps`;
    case "sec":
      return `${v.toFixed(2)} s`;
  }
}
export const short = (h: string) => `${h.slice(0, 8)}…`;
/** UTC to the second; the source keeps full precision. */
export const stamp = (iso: string) =>
  `${new Date(iso).toISOString().slice(0, 19).replace("T", " ")}Z`;

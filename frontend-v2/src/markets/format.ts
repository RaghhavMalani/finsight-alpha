/** Display formatting for Markets numbers. A null is always shown as an em dash, never 0. */

type Num = number | null | undefined;
const DASH = "—";

export function compactNum(v: Num): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(
    v,
  );
}
export function barTime(t: string, timezone: string | null): string {
  if (!t.includes("T")) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  const zone = timezone ?? "UTC";
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  const label =
    zone === "America/New_York"
      ? "ET"
      : zone === "Asia/Kolkata" || zone === "Asia/Calcutta"
        ? "IST"
        : zone;
  return `${time} ${label}`;
}

/** Round to `digits`, folding −0 into 0 so a tiny negative never prints as "-0.00". */
function rounded(v: number, digits: number) {
  const r = Number(v.toFixed(digits));
  return r === 0 ? 0 : r;
}

export function num(v: Num, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return rounded(v, digits).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** A fraction shown as a percentage: 0.0123 → "1.23%". */
export function pct(v: Num, digits = 2, signed = false): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const r = rounded(v * 100, digits);
  return `${signed && r > 0 ? "+" : ""}${r.toFixed(digits)}%`;
}

export function money(v: Num, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const sign = v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** Large reported values: 383285000000 → "$383.29B". */
export function compactMoney(v: Num): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const a = Math.abs(v),
    sign = v < 0 ? "−" : "";
  const [div, unit] =
    a >= 1e12 ? [1e12, "T"] : a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return a < 1e3 ? `${sign}$${a.toFixed(2)}` : `${sign}$${(a / div).toFixed(2)}${unit}`;
}

export function int(v: Num): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return Math.round(v).toLocaleString("en-US");
}

/**
 * "2026-01-02T21:00:00+00:00" → "2026-01-02 21:00 UTC". A timestamp without a zone is shown as
 * written (a bare midnight as its date), never shifted through the reader's local zone.
 */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return DASH;
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso.slice(10))) {
    const [day, time = ""] = iso.split(/[T ]/);
    return /^00:00(:00(\.0+)?)?$/.test(time) || !time ? day : `${day} ${time.slice(0, 5)}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

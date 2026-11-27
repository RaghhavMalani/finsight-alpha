import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatNum, short, stamp } from "./num-format";
import "./visual.css";

/**
 * What kind of source a value has. The popover never claims more than the kind allows:
 * - "sealed": a file in the sealed table handed to ProvenanceProvider (path, SHA-256, sealer).
 * - "replay": a checked Replay artifact. `src` is its URL and `sha256` the digest named by
 *   /replay-manifest.json, which the client verifies before parsing. A check, not a seal.
 * - "live": a local API response. `src` is the endpoint. Never sealed, never hashed.
 */
export type OriginKind = "sealed" | "replay" | "live";

/** Where a value came from: a source and a JSON pointer into it. */
export type Origin = {
  /** Defaults to "sealed" (the Research table). */
  kind?: OriginKind;
  src: string;
  ptr: string;
  /** A second pointer when the value is derived from two fields. */
  ptr2?: string;
  formula?: string;
  note?: string;
  /** Why the value is absent. Missing is never shown as zero. */
  reason?: string;
  /** Replay only: the SHA-256 the checked manifest names for `src`. */
  sha256?: string | null;
  /** Replay only: what names that digest, when it is not /replay-manifest.json (a build-time pin). */
  shaNamedBy?: string;
  /** Replay/live: the artifact or response as-of time, when the source states one. */
  asOf?: string | null;
  /** Live: the record's clocks and stream sequence number, when the source states them. */
  availableAt?: string | null;
  observedAt?: string | null;
  seq?: number | null;
};
export type NumFormat = "ret" | "pp" | "p" | "rate" | "int" | "bps" | "sec" | "x";
export type NumValue = Origin & { v: number | null; fmt: NumFormat };
export type RefValue = Origin & { v: string | null };
export type TextValue = Origin & { t: string | null; repaired?: string };

export type SourceFile = {
  path: string;
  sha256: string;
  bytes?: number;
  sealed_by?: string | null;
  manifest_sha256?: string;
};
export type ProvenanceStudy = {
  preregistration?: RefValue;
  asOf?: RefValue;
  frozenAt?: RefValue;
};

type Open = {
  title: string;
  value: string;
  origin: Origin;
  run?: RefValue;
  anchor: DOMRect;
  return: HTMLElement | null;
};
type Ctx = {
  sources: Record<string, SourceFile>;
  study: ProvenanceStudy;
  open: (o: Open) => void;
};
const ProvenanceContext = createContext<Ctx | null>(null);
/** The run (if any) whose values are being shown, so a popover can name it. */
const RunScope = createContext<RefValue | undefined>(undefined);

export function RunProvenance({ run, children }: { run?: RefValue; children: ReactNode }) {
  return <RunScope.Provider value={run}>{children}</RunScope.Provider>;
}

const NO_SOURCES: Record<string, SourceFile> = {};
const NO_STUDY: ProvenanceStudy = {};

/**
 * Supplies the sealed-file table behind every value, and renders the one origin popover.
 * The popover is a HUD overlay near its value; on narrow screens a bottom sheet.
 * Workspaces without sealed files (Replay, Live) use it with no table.
 */
export function ProvenanceProvider({
  sources = NO_SOURCES,
  study = NO_STUDY,
  children,
}: {
  sources?: Record<string, SourceFile>;
  study?: ProvenanceStudy;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState<Open | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setCurrent((c) => {
      c?.return?.focus();
      return null;
    });
  }, []);
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [current, close]);
  const ctx = useMemo(() => ({ sources, study, open: setCurrent }), [sources, study]);
  const kind = current?.origin.kind ?? "sealed";
  const file = current && kind === "sealed" ? sources[current.origin.src] : undefined;
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  // Placed after measuring: below the value, else above it, else beside it; never over it.
  // On a narrow screen the sheet is at the bottom and the value is scrolled to stay above it.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    setPos(null);
    if (!current || !panel.current) return;
    const h = panel.current.offsetHeight,
      w = panel.current.offsetWidth;
    const anchor = () => current.return?.getBoundingClientRect() ?? current.anchor;
    if (narrow) {
      const r = anchor(),
        room = window.innerHeight - h - 8;
      if (r.bottom > room) window.scrollBy(0, r.bottom - room);
      else if (r.top < 8) window.scrollBy(0, r.top - 8);
      return;
    }
    const r = anchor(),
      vw = window.innerWidth,
      vh = window.innerHeight;
    const clampX = (x: number) => Math.max(12, Math.min(x, vw - w - 12));
    if (r.bottom + 8 + h <= vh - 12) setPos({ left: clampX(r.left), top: r.bottom + 8 });
    else if (r.top - 8 - h >= 12) setPos({ left: clampX(r.left), top: r.top - 8 - h });
    else {
      const right = r.right + 12 + w <= vw - 12;
      setPos({
        left: right ? r.right + 12 : Math.max(12, r.left - 12 - w),
        top: Math.max(12, Math.min(r.top - h / 2, vh - h - 12)),
      });
    }
  }, [current, narrow]);
  // Focus only once the panel is placed: a hidden element cannot take focus.
  useEffect(() => {
    if (current && (narrow || pos)) panel.current?.focus();
  }, [current, narrow, pos]);
  return (
    <ProvenanceContext.Provider value={ctx}>
      {children}
      {current && (
        <div
          ref={panel}
          className={`vx-origin ${narrow ? "vx-sheet" : ""}`}
          style={narrow ? undefined : (pos ?? { left: 12, top: 12, visibility: "hidden" })}
          role="dialog"
          aria-label={`Origin of ${current.title}`}
          tabIndex={-1}
          data-origin-popover
          data-origin-kind={kind}
        >
          <div className="vx-origin-head">
            <span>
              ORIGIN · <span className="vx-origin-kind">{kind.toUpperCase()}</span>
            </span>
            <button
              type="button"
              className="vx-origin-close"
              onClick={close}
              aria-label="Close origin"
            >
              ESC
            </button>
          </div>
          <div className="vx-origin-value">{current.value}</div>
          <div className="vx-origin-title">{current.title}</div>
          <dl>
            {kind === "sealed" && (
              <>
                <dt>File</dt>
                <dd data-origin-file>
                  {file?.path ?? `${current.origin.src} · not in sealed table`}
                </dd>
                <dt>SHA-256</dt>
                <dd className="vx-break" data-origin-sha>
                  {file?.sha256 ?? "unavailable"}
                </dd>
                {file?.sealed_by && (
                  <>
                    <dt>Sealed by</dt>
                    <dd>{file.sealed_by}</dd>
                  </>
                )}
              </>
            )}
            {kind === "replay" && (
              <>
                <dt>Source</dt>
                <dd>checked Replay artifact · not a seal</dd>
                <dt>File</dt>
                <dd className="vx-break" data-origin-file>
                  {current.origin.src}
                </dd>
                <dt>SHA-256</dt>
                <dd className="vx-break" data-origin-sha>
                  {current.origin.sha256
                    ? `${current.origin.sha256} (named by ${current.origin.shaNamedBy ?? "/replay-manifest.json"}, verified on load)`
                    : "unavailable · the Replay manifest names no digest"}
                </dd>
              </>
            )}
            {kind === "live" && (
              <>
                <dt>Source</dt>
                <dd>live API · not sealed</dd>
                <dt>Endpoint</dt>
                <dd className="vx-break" data-origin-file>
                  {current.origin.src}
                </dd>
                <dt>SHA-256</dt>
                <dd data-origin-sha>none · a live response is not hashed or sealed</dd>
                {current.origin.seq != null && (
                  <>
                    <dt>Seq</dt>
                    <dd>{current.origin.seq}</dd>
                  </>
                )}
                {current.origin.observedAt && (
                  <>
                    <dt>Observed</dt>
                    <dd>{current.origin.observedAt}</dd>
                  </>
                )}
                <dt>Available</dt>
                <dd>{current.origin.availableAt ?? "not stated by the source"}</dd>
              </>
            )}
            <dt>Pointer</dt>
            <dd className="vx-break">
              {current.origin.ptr}
              {current.origin.ptr2 ? ` and ${current.origin.ptr2}` : ""}
            </dd>
            {current.origin.formula && (
              <>
                <dt>Formula</dt>
                <dd>{current.origin.formula}</dd>
              </>
            )}
            {current.origin.reason && (
              <>
                <dt>Why absent</dt>
                <dd>{current.origin.reason}</dd>
              </>
            )}
            {current.origin.note && (
              <>
                <dt>Note</dt>
                <dd>{current.origin.note}</dd>
              </>
            )}
            {kind === "sealed" ? (
              <>
                <dt>Run id</dt>
                <dd className="vx-break">{current.run?.v ?? "not run-specific"}</dd>
                <dt>Prereg</dt>
                <dd className="vx-break">{study.preregistration?.v ?? "unavailable"}</dd>
                <dt>As of</dt>
                <dd>
                  {study.asOf?.v ? `evidence cutoff ${study.asOf.v}` : "unavailable"}
                  {study.frozenAt?.v ? ` · frozen ${study.frozenAt.v}` : ""}
                </dd>
              </>
            ) : (
              <>
                <dt>As of</dt>
                <dd>{current.origin.asOf ?? "not stated by the source"}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </ProvenanceContext.Provider>
  );
}

function useOrigin() {
  const ctx = useContext(ProvenanceContext);
  const run = useContext(RunScope);
  return { ctx, run };
}

/** The digest a value may name: a sealed file's, or the one a checked Replay manifest names. */
function digestOf(origin: Origin, sources: Record<string, SourceFile> | undefined) {
  const kind = origin.kind ?? "sealed";
  if (kind === "sealed") return sources?.[origin.src]?.sha256 ?? "";
  if (kind === "replay") return origin.sha256 ?? "";
  return "";
}

function OriginButton({
  title,
  display,
  full,
  origin,
  className,
  kind,
  inert,
  missing,
}: {
  title: string;
  display: ReactNode;
  full: string;
  origin: Origin;
  className: string;
  kind: "num" | "hash" | "stamp" | "text";
  /** A non-interactive span (for values inside a link); the origin is in the tooltip. */
  inert?: boolean;
  missing?: boolean;
}) {
  const { ctx, run } = useOrigin();
  const originKind = origin.kind ?? "sealed";
  const file = originKind === "sealed" ? ctx?.sources[origin.src] : undefined;
  const where =
    originKind === "live"
      ? `${origin.src} · live API, not sealed`
      : originKind === "replay"
        ? `${origin.src} · checked Replay artifact`
        : (file?.path ?? origin.src);
  const attrs = {
    "data-num": "",
    "data-prov": kind,
    "data-origin-kind": originKind,
    "data-src": originKind === "sealed" ? (file?.path ?? "") : origin.src,
    "data-sha": digestOf(origin, ctx?.sources),
    "data-ptr": origin.ptr,
    "data-na": missing ? "true" : undefined,
    "data-seq": origin.seq ?? undefined,
    "data-available-at": origin.availableAt ?? undefined,
    title: [
      `${title}: ${full}`,
      `${where}${origin.ptr ? ` ${origin.ptr}` : ""}`,
      origin.seq != null ? `seq ${origin.seq}` : "",
      origin.observedAt ? `observed_at ${origin.observedAt}` : "",
      origin.availableAt ? `available_at ${origin.availableAt}` : "",
      origin.asOf ? `as of ${origin.asOf}` : "",
      origin.formula ? `formula ${origin.formula}` : "",
      origin.note ?? "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
  if (inert || !ctx)
    return (
      <span className={className} {...attrs}>
        {display}
      </span>
    );
  return (
    <button
      type="button"
      className={className}
      {...attrs}
      onClick={(e) =>
        ctx.open({
          title,
          value: full,
          origin,
          run,
          anchor: e.currentTarget.getBoundingClientRect(),
          return: e.currentTarget,
        })
      }
    >
      {display}
    </button>
  );
}

type Show = {
  /** The page's own formatting of the same value; the popover always shows the raw value. */
  display?: string;
  inert?: boolean;
  /** Extra classes, e.g. "vx-inherit" to keep the surrounding colour and font. */
  className?: string;
};

/** A number with its origin one click away. Null renders as "unavailable", never zero. */
export function Num({
  n,
  label,
  display,
  inert,
  className = "",
}: { n: NumValue; label: string } & Show) {
  const missing = n.v == null || !Number.isFinite(n.v);
  const text = missing
    ? n.v == null
      ? "unavailable"
      : "n/a"
    : (display ?? formatNum(n.v as number, n.fmt));
  return (
    <OriginButton
      kind="num"
      title={label}
      display={text}
      full={missing ? `unavailable — ${n.reason ?? "no value"}` : String(n.v)}
      origin={n}
      inert={inert}
      missing={missing}
      className={`vx-num ${missing ? "vx-na" : ""} ${className}`}
    />
  );
}

export function Hash({
  h,
  label,
  display,
  inert,
  className = "",
}: { h: RefValue; label: string } & Show) {
  return (
    <OriginButton
      kind="hash"
      title={label}
      display={h.v ? (display ?? short(h.v)) : "unavailable"}
      full={h.v ?? `unavailable — ${h.reason ?? "no value"}`}
      origin={h}
      inert={inert}
      missing={!h.v}
      className={`vx-hash ${className}`}
    />
  );
}

export function Stamp({
  s,
  label,
  display,
  inert,
  className = "",
}: { s: RefValue; label: string } & Show) {
  return (
    <OriginButton
      kind="stamp"
      title={label}
      display={s.v ? (display ?? stamp(s.v)) : "unavailable"}
      full={s.v ?? `unavailable — ${s.reason ?? "no value"}`}
      origin={s}
      inert={inert}
      missing={!s.v}
      className={`vx-stamp ${className}`}
    />
  );
}

/** Evidence text: shown as recorded (repairs disclosed), with its origin. */
export function Src({ t, label }: { t: TextValue; label: string }) {
  if (t.t == null)
    return (
      <OriginButton
        kind="text"
        title={label}
        display="unavailable"
        full={`unavailable — ${t.reason ?? "no value"}`}
        origin={t}
        missing
        className="vx-src vx-na"
      />
    );
  return (
    <OriginButton
      kind="text"
      title={label}
      display={t.t}
      full={t.repaired ? `${t.t} (${t.repaired})` : t.t}
      origin={t.repaired ? { ...t, note: t.repaired } : t}
      className="vx-src"
    />
  );
}

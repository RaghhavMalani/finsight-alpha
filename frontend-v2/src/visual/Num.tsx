import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatNum, short, stamp } from "./num-format";
import "./visual.css";

/** Where a value came from: a sealed file and a JSON pointer into it. */
export type Origin = {
  src: string;
  ptr: string;
  /** A second pointer when the value is derived from two fields. */
  ptr2?: string;
  formula?: string;
  note?: string;
  /** Why the value is absent. Missing is never shown as zero. */
  reason?: string;
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

/**
 * Supplies the sealed-file table behind every value, and renders the one origin popover.
 * The popover is a HUD overlay near its value; on narrow screens a bottom sheet.
 */
export function ProvenanceProvider({
  sources,
  study,
  children,
}: {
  sources: Record<string, SourceFile>;
  study: ProvenanceStudy;
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
    panel.current?.focus();
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
  const file = current ? sources[current.origin.src] : undefined;
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  const pos = current
    ? narrow
      ? undefined
      : {
          left: Math.max(12, Math.min(current.anchor.left, window.innerWidth - 392)),
          top:
            current.anchor.bottom + 340 > window.innerHeight
              ? Math.max(12, current.anchor.top - 338)
              : current.anchor.bottom + 8,
        }
    : undefined;
  return (
    <ProvenanceContext.Provider value={ctx}>
      {children}
      {current && (
        <div
          ref={panel}
          className={`vx-origin ${narrow ? "vx-sheet" : ""}`}
          style={pos}
          role="dialog"
          aria-label={`Origin of ${current.title}`}
          tabIndex={-1}
          data-origin-popover
        >
          <div className="vx-origin-head">
            <span>ORIGIN</span>
            <button type="button" onClick={close} aria-label="Close origin">
              ESC
            </button>
          </div>
          <div className="vx-origin-value">{current.value}</div>
          <div className="vx-origin-title">{current.title}</div>
          <dl>
            <dt>File</dt>
            <dd data-origin-file>{file?.path ?? `${current.origin.src} · not in sealed table`}</dd>
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
            <dt>Run id</dt>
            <dd className="vx-break">{current.run?.v ?? "not run-specific"}</dd>
            <dt>Prereg</dt>
            <dd className="vx-break">{study.preregistration?.v ?? "unavailable"}</dd>
            <dt>As of</dt>
            <dd>
              {study.asOf?.v ? `evidence cutoff ${study.asOf.v}` : "unavailable"}
              {study.frozenAt?.v ? ` · frozen ${study.frozenAt.v}` : ""}
            </dd>
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

function OriginButton({
  title,
  display,
  full,
  origin,
  className,
  kind,
}: {
  title: string;
  display: ReactNode;
  full: string;
  origin: Origin;
  className: string;
  kind: "num" | "hash" | "stamp" | "text";
}) {
  const { ctx, run } = useOrigin();
  const file = ctx?.sources[origin.src];
  return (
    <button
      type="button"
      className={className}
      data-prov={kind}
      data-src={file?.path ?? ""}
      data-sha={file?.sha256 ?? ""}
      data-ptr={origin.ptr}
      title={`${title}: ${full} · ${file?.path ?? origin.src}`}
      onClick={(e) =>
        ctx?.open({
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

/** A number with its origin one click away. Null renders as "unavailable", never zero. */
export function Num({ n, label }: { n: NumValue; label: string }) {
  const text = n.v == null ? "unavailable" : formatNum(n.v, n.fmt);
  return (
    <OriginButton
      kind="num"
      title={label}
      display={text}
      full={n.v == null ? `unavailable — ${n.reason ?? "no value"}` : String(n.v)}
      origin={n}
      className={`vx-num ${n.v == null ? "vx-na" : ""}`}
    />
  );
}

export function Hash({ h, label }: { h: RefValue; label: string }) {
  return (
    <OriginButton
      kind="hash"
      title={label}
      display={h.v ? short(h.v) : "unavailable"}
      full={h.v ?? `unavailable — ${h.reason ?? "no value"}`}
      origin={h}
      className="vx-hash"
    />
  );
}

export function Stamp({ s, label }: { s: RefValue; label: string }) {
  return (
    <OriginButton
      kind="stamp"
      title={label}
      display={s.v ? stamp(s.v) : "unavailable"}
      full={s.v ?? "unavailable"}
      origin={s}
      className="vx-stamp"
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

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Two-row × two-col grid with draggable splitters.
 * `slots` = [topLeft, topRight, botLeft, botRight].
 */
type GridSplit = { colFrac: number; rowFrac: number };
type SplitterKind = "col" | "row";

const DIVIDER_PX = 6;
const MIN_FRACTION = 0.22;
const MAX_FRACTION = 0.78;

function clampFraction(value: number) {
  return Math.max(MIN_FRACTION, Math.min(MAX_FRACTION, value));
}

function loadSplit(storageKey: string | undefined, fallback: GridSplit): GridSplit {
  if (!storageKey || typeof window === "undefined") return fallback;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "null",
    ) as Partial<GridSplit> | null;
    if (stored && Number.isFinite(stored.colFrac) && Number.isFinite(stored.rowFrac)) {
      return {
        colFrac: clampFraction(stored.colFrac as number),
        rowFrac: clampFraction(stored.rowFrac as number),
      };
    }
  } catch {
    /* use defaults when storage is unavailable or invalid */
  }
  return fallback;
}

export function GridStage2x2({
  slots,
  initial = { colFrac: 0.6, rowFrac: 0.55 },
  storageKey,
}: {
  slots: [ReactNode, ReactNode, ReactNode, ReactNode];
  initial?: { colFrac: number; rowFrac: number };
  storageKey?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState<GridSplit>(() => loadSplit(storageKey, initial));
  const [activeSplitter, setActiveSplitter] = useState<SplitterKind | null>(null);
  const dragging = useRef<SplitterKind | null>(null);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(split));
    } catch {
      /* resizing still works */
    }
  }, [split, storageKey]);

  const onDown = useCallback(
    (kind: SplitterKind) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = kind;
      setActiveSplitter(kind);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* parent movement still works */
      }
    },
    [],
  );
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (dragging.current === "col") {
      const available = Math.max(1, rect.width - DIVIDER_PX);
      const f = (e.clientX - rect.left - DIVIDER_PX / 2) / available;
      setSplit((current) => ({ ...current, colFrac: clampFraction(f) }));
    } else {
      const available = Math.max(1, rect.height - DIVIDER_PX);
      const f = (e.clientY - rect.top - DIVIDER_PX / 2) / available;
      setSplit((current) => ({ ...current, rowFrac: clampFraction(f) }));
    }
  }, []);
  const onUp = useCallback(() => {
    dragging.current = null;
    setActiveSplitter(null);
  }, []);
  const reset = () =>
    setSplit({ colFrac: clampFraction(initial.colFrac), rowFrac: clampFraction(initial.rowFrac) });

  const template = {
    gridTemplateColumns: `${split.colFrac}fr ${DIVIDER_PX}px ${1 - split.colFrac}fr`,
    gridTemplateRows: `${split.rowFrac}fr ${DIVIDER_PX}px ${1 - split.rowFrac}fr`,
  };

  return (
    <div
      ref={ref}
      className="grid h-full w-full"
      style={template}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="min-h-0 min-w-0 overflow-hidden">{slots[0]}</div>
      <div
        className={`splitter splitter-col ${activeSplitter === "col" ? "active" : ""}`}
        onPointerDown={onDown("col")}
        onLostPointerCapture={onUp}
        onDoubleClick={reset}
        title="Drag to resize · double-click to reset"
      />
      <div className="min-h-0 min-w-0 overflow-hidden">{slots[1]}</div>
      <div
        className={`splitter splitter-row col-span-3 ${activeSplitter === "row" ? "active" : ""}`}
        onPointerDown={onDown("row")}
        onLostPointerCapture={onUp}
        onDoubleClick={reset}
        title="Drag to resize · double-click to reset"
      />
      <div className="min-h-0 min-w-0 overflow-hidden">{slots[2]}</div>
      <div
        className={`splitter splitter-col ${activeSplitter === "col" ? "active" : ""}`}
        onPointerDown={onDown("col")}
        onLostPointerCapture={onUp}
        onDoubleClick={reset}
        title="Drag to resize · double-click to reset"
      />
      <div className="min-h-0 min-w-0 overflow-hidden">{slots[3]}</div>
    </div>
  );
}

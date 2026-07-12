import { useCallback, useRef, useState, type ReactNode } from "react";

/**
 * Two-row × two-col grid with draggable splitters.
 * `slots` = [topLeft, topRight, botLeft, botRight].
 */
export function GridStage2x2({
  slots,
  initial = { colFrac: 0.6, rowFrac: 0.55 },
}: {
  slots: [ReactNode, ReactNode, ReactNode, ReactNode];
  initial?: { colFrac: number; rowFrac: number };
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [col, setCol] = useState(initial.colFrac);
  const [row, setRow] = useState(initial.rowFrac);
  const dragging = useRef<null | "col" | "row">(null);

  const onDown = useCallback((kind: "col" | "row") => (e: React.PointerEvent) => {
    dragging.current = kind;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (dragging.current === "col") {
      const f = (e.clientX - rect.left) / rect.width;
      setCol(Math.max(0.2, Math.min(0.8, f)));
    } else {
      const f = (e.clientY - rect.top) / rect.height;
      setRow(Math.max(0.2, Math.min(0.8, f)));
    }
  }, []);
  const onUp = useCallback((e: React.PointerEvent) => {
    dragging.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);
  const reset = () => { setCol(initial.colFrac); setRow(initial.rowFrac); };

  const template = {
    gridTemplateColumns: `${col * 100}% 4px 1fr`,
    gridTemplateRows: `${row * 100}% 4px 1fr`,
  };

  return (
    <div
      ref={ref}
      className="grid h-full w-full"
      style={template}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <div className="min-h-0 min-w-0 overflow-hidden">{slots[0]}</div>
      <div className="splitter splitter-col" onPointerDown={onDown("col")} onDoubleClick={reset} title="Drag to resize · dbl-click to reset" />
      <div className="min-h-0 min-w-0 overflow-hidden">{slots[1]}</div>
      <div className="splitter splitter-row col-span-3" onPointerDown={onDown("row")} onDoubleClick={reset} title="Drag to resize · dbl-click to reset" />
      <div className="min-h-0 min-w-0 overflow-hidden">{slots[2]}</div>
      <div className="splitter splitter-col" onPointerDown={onDown("col")} onDoubleClick={reset} title="Drag to resize · dbl-click to reset" />
      <div className="min-h-0 min-w-0 overflow-hidden">{slots[3]}</div>
    </div>
  );
}


import { useEffect, useRef } from "react";

export type ContextItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  separator?: false;
};

export type ContextState = {
  x: number;
  y: number;
  items: ContextItem[];
} | null;

export function ContextMenu({
  state,
  onClose,
}: {
  state: ContextState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!state) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [state, onClose]);
  if (!state) return null;
  return (
    <div
      ref={ref}
      className="fixed z-[110] min-w-[220px] border border-border bg-panel py-1 amber-glow animate-fade-in"
      style={{ left: state.x, top: state.y, borderRadius: 2 }}
    >
      {state.items.map((it, i) => (
        <button
          key={i}
          onClick={() => {
            it.onClick();
            onClose();
          }}
          className={`mono-caps block w-full px-3 py-1.5 text-left text-[10px] transition hover:bg-primary/10 ${
            it.danger ? "text-down hover:text-down" : "text-foreground hover:text-primary"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}


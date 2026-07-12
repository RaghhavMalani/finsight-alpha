export function KeyboardOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: "Global",
      rows: [
        ["⌘K / Ctrl+K", "Open command palette"],
        ["/", "Focus function bar"],
        ["?", "Toggle this help"],
        ["Esc", "Close overlays · restore panel · drop compare"],
        ["TOUR", "Replay the guided tour"],
      ],
    },
    {
      title: "Navigation",
      rows: [
        ["↑ ↓", "Move selection"],
        ["Enter", "Run / open dossier"],
        ["G", "Go — open focus mode"],
        ["1–0", "Jump to function in rail order"],
        ["Right-click", "Context menu on any ticker"],
        ["Double-click header", "Maximize panel · ⛶"],
        ["X VS Y", "Compare two tickers"],
      ],
    },
    {
      title: "Functions",
      rows: [
        ["HOME 1", "Market overview"],
        ["MK 2", "Markets · chart · depth"],
        ["OC 3", "Options + strategy"],
        ["MC 4", "3D probability landscape"],
        ["GR 5", "Greeks surfaces"],
        ["ML 6", "Signals + analyst"],
        ["CX 7", "Correlation / deps"],
        ["VS 8", "3D vol surface"],
        ["BT 9", "Backtest"],
        ["STRAT 0", "Strategy builder"],
        ["RISK -", "Risk manager"],
        ["SIGHT =", "AI research"],
      ],
    },
  ];
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative grid w-[min(860px,92vw)] grid-cols-3 gap-4 border border-border bg-panel p-6 amber-glow animate-fade-in"
      >
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mono-caps mb-3 text-[10px] text-primary">{g.title}</div>
            <div className="space-y-2">
              {g.rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <kbd className="mono-caps border border-border bg-raised px-2 py-0.5 text-[10px] text-foreground">
                    {k}
                  </kbd>
                  <span className="font-mono text-[10px] text-muted-foreground text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


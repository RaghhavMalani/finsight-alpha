import { lazy, Suspense, useEffect, useState } from "react";
import { TrajectoryGraph2D } from "@/forge/runs/TrajectoryGraph2D";
import type { TrajectoryViewModel } from "@/forge/runs/trajectory-model";

const loadTrajectoryGraph3D = () => import("@/forge/runs/TrajectoryGraph3D");
const TrajectoryGraph3D = lazy(loadTrajectoryGraph3D);

export function TrajectoryExplorer({
  model,
  selectedSequence,
  onSelect,
}: {
  model: TrajectoryViewModel;
  selectedSequence: number;
  onSelect: (sequence: number) => void;
}) {
  const [view, setView] = useState<"2D" | "3D">("2D");
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <section aria-label="Trajectory execution graph" className="min-w-0 bg-[#07090B]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1D232B] px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="text-[12px] font-medium text-[#dce0e4]">Trajectory graph</h2>
          <span className="hidden font-mono text-[7px] uppercase tracking-[0.1em] text-[#59636e] sm:inline">
            artifact-backed execution trace
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 font-mono text-[7px] uppercase tracking-[0.08em] text-[#65707c] lg:flex">
            <span className="text-[#FFB000]">● cost</span>
            <span className="text-[#52A8FF]">■ computed</span>
            <span className="text-[#35C78A]">— verified</span>
          </div>
          <div className="flex border border-[#303842]" aria-label="Trajectory view">
            {(["2D", "3D"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                onPointerEnter={item === "3D" ? () => void loadTrajectoryGraph3D() : undefined}
                onFocus={item === "3D" ? () => void loadTrajectoryGraph3D() : undefined}
                aria-pressed={view === item}
                className={`px-2.5 py-1.5 font-mono text-[8px] font-semibold tracking-[0.1em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] ${
                  view === item
                    ? "bg-[#FFB000] text-[#07090B]"
                    : "text-[#8b949e] hover:bg-[#111820] hover:text-[#dce0e4]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </header>

      {view === "2D" || !mounted ? (
        <TrajectoryGraph2D model={model} selectedSequence={selectedSequence} onSelect={onSelect} />
      ) : (
        <Suspense
          fallback={
            <div
              className="grid h-[420px] place-items-center font-mono text-[9px] uppercase tracking-[0.12em] text-[#65707c]"
              role="status"
            >
              Loading spatial trace…
            </div>
          }
        >
          <TrajectoryGraph3D
            model={model}
            selectedSequence={selectedSequence}
            onSelect={onSelect}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      )}
    </section>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { EpistemicBadge, ResearchValue } from "@/epistemic/EpistemicValue";
import type { RealityMetricId } from "@/forge/contracts/observer";
import { realityQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { RealityEvidenceInspector } from "@/forge/reality/RealityEvidenceInspector";
import { RealityTerrain2D } from "@/forge/reality/RealityTerrain2D";
import {
  buildRealityTerrainViewModel,
  formatRealityMetric,
  REALITY_METRIC_LABELS,
  REALITY_METRICS,
  type RealityTerrainViewModel,
} from "@/forge/reality/reality-terrain-model";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

export type RealityMetric = RealityMetricId;
export type RealityView = "2d" | "3d";

const loadRealityTerrain3D = () => import("@/forge/reality/RealityTerrain3D");
const RealityTerrain3D = lazy(loadRealityTerrain3D);

export function RealityLadder({
  artifactId,
  checkpointId,
  metric,
  view,
}: {
  artifactId: string;
  checkpointId?: string;
  metric: RealityMetric;
  view: RealityView;
}) {
  const query = useQuery(realityQuery(artifactId));
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (view !== "3d" || webglAvailable !== null) return;
    const canvas = document.createElement("canvas");
    const available = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    setWebglAvailable(available);
  }, [view, webglAvailable]);

  if (query.isPending) {
    return (
      <ForgeShell>
        <LoadingState label="Reality Terrain" />
      </ForgeShell>
    );
  }
  if (query.error || !query.data) {
    return (
      <ForgeShell>
        <UnavailableState
          title="Reality Ladder could not be validated"
          error={query.error}
          retry={() => void query.refetch()}
        />
      </ForgeShell>
    );
  }

  const reality = query.data;
  const terrain = buildRealityTerrainViewModel(reality, metric);
  const selected = terrain.stages.find((stage) => stage.id === checkpointId) ?? terrain.stages[0];

  const selectCheckpoint = (checkpoint: string) => {
    void navigate({
      to: "/reality/$artifactId",
      params: { artifactId },
      search: { checkpoint, metric, view },
    });
  };

  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow="Reality Ladder · frozen v0.2.4.1"
        title="Reality Terrain"
        description={reality.finding}
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusMark status="PASS" label={reality.binding.integrityStatus} />
            <StatusMark
              status={reality.systemReleaseEligible ? "PASS" : "INFO"}
              label={
                reality.systemReleaseEligible ? "C4 SYSTEM RELEASE" : "CERTIFICATION UNAVAILABLE"
              }
            />
          </div>
        }
      />

      <section
        className="mt-4 grid gap-px border border-[#1D232B] bg-[#1D232B] sm:grid-cols-3"
        aria-label="Reality Gap summary"
      >
        <SummaryMetric label="Screened Sharpe" metric={terrain.stages[0].value} />
        <SummaryMetric label="Alpha survival" metric={terrain.alphaSurvival} tone="amber" />
        <SummaryMetric
          label="Largest decay"
          metric={terrain.largestDegradation.change}
          tone="red"
          signed
        />
      </section>

      <div className="mt-3 flex flex-col gap-px border border-[#1D232B] bg-[#1D232B] lg:flex-row lg:items-stretch lg:justify-between">
        <nav
          aria-label="Reality metric"
          className="flex min-w-0 flex-1 overflow-x-auto bg-[#0B0E11]"
        >
          {REALITY_METRICS.map((item) => (
            <Link
              key={item}
              to="/reality/$artifactId"
              params={{ artifactId }}
              search={{ checkpoint: selected.id, metric: item, view }}
              aria-current={metric === item ? "page" : undefined}
              className={`shrink-0 border-r border-[#1D232B] px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                metric === item
                  ? "bg-[#15150F] text-[#FFB000]"
                  : "text-[#8F99A3] hover:bg-[#111820] hover:text-[#DCE0E4]"
              }`}
            >
              {REALITY_METRIC_LABELS[item]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Reality representation" className="flex bg-[#0B0E11]">
          {(["2d", "3d"] as const).map((item) => (
            <Link
              key={item}
              to="/reality/$artifactId"
              params={{ artifactId }}
              search={{ checkpoint: selected.id, metric, view: item }}
              onPointerEnter={item === "3d" ? () => void loadRealityTerrain3D() : undefined}
              onFocus={item === "3d" ? () => void loadRealityTerrain3D() : undefined}
              aria-current={view === item ? "page" : undefined}
              className={`border-l border-[#1D232B] px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                view === item
                  ? "bg-[#FFB000] text-[#07090B]"
                  : "text-[#A1AAB3] hover:bg-[#111820] hover:text-[#E6E8EB]"
              }`}
            >
              {item === "2d" ? "2D truth" : "3D terrain"}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(38rem,1fr)_22rem]">
        <InstrumentPanel
          title="Measured degradation landscape"
          code={`${terrain.metricLabel.toUpperCase()} · ${view.toUpperCase()}`}
        >
          {view === "3d" && mounted && webglAvailable ? (
            <TerrainErrorBoundary
              key={`${artifactId}-${metric}`}
              fallback={
                <TerrainFallback
                  message="The WebGL terrain failed closed. The same evidence remains available in 2D below."
                  model={terrain}
                  selectedId={selected.id}
                  onSelect={selectCheckpoint}
                />
              }
            >
              <Suspense fallback={<TerrainLoading />}>
                <RealityTerrain3D
                  model={terrain}
                  selectedId={selected.id}
                  onSelect={selectCheckpoint}
                  reducedMotion={reducedMotion}
                />
              </Suspense>
            </TerrainErrorBoundary>
          ) : view === "3d" && mounted && webglAvailable === false ? (
            <TerrainFallback
              message="WebGL is unavailable. Showing the authoritative 2D projection."
              model={terrain}
              selectedId={selected.id}
              onSelect={selectCheckpoint}
            />
          ) : (
            <RealityTerrain2D
              model={terrain}
              selectedId={selected.id}
              onSelect={selectCheckpoint}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1D232B] px-3 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#6F7A85]">
            <span>X / execution realism →</span>
            <span>
              {metric === "sharpe"
                ? "Y / 3 regimes × 5 frozen seeds"
                : "Aggregate ridge · no unsupported regime metric"}
            </span>
          </div>
        </InstrumentPanel>

        <InstrumentPanel title="Evidence inspector" code={selected.label}>
          <RealityEvidenceInspector model={terrain} stage={selected} />
        </InstrumentPanel>
      </div>

      <RealityGapTable
        artifactId={artifactId}
        model={terrain}
        selectedId={selected.id}
        metric={metric}
        view={view}
      />
    </ForgeShell>
  );
}

function SummaryMetric({
  label,
  metric,
  tone = "default",
  signed = false,
}: {
  label: string;
  metric: RealityTerrainViewModel["alphaSurvival"];
  tone?: "default" | "amber" | "red";
  signed?: boolean;
}) {
  const color =
    tone === "amber" ? "text-[#FFB000]" : tone === "red" ? "text-[#FF5A57]" : "text-[#E6E8EB]";
  return (
    <div className="bg-[#0B0E11] px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#65707C]">{label}</div>
      <div className={`mt-1 font-mono text-[19px] font-semibold tabular-nums ${color}`}>
        {formatRealityMetric(metric, signed)}
      </div>
    </div>
  );
}

function TerrainLoading() {
  return (
    <div className="grid h-[520px] place-items-center bg-[#07090B]" role="status">
      <div className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-[#7B8792]">
        Loading optional spatial projection…
      </div>
    </div>
  );
}

function TerrainFallback({
  message,
  model,
  selectedId,
  onSelect,
}: {
  message: string;
  model: RealityTerrainViewModel;
  selectedId: string;
  onSelect: (checkpointId: string) => void;
}) {
  return (
    <div>
      <div
        className="border-b border-[#745F31] bg-[#151108] px-3 py-2.5 text-[11px] text-[#D8B86A]"
        role="status"
      >
        {message}
      </div>
      <RealityTerrain2D model={model} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}

class TerrainErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Canvas errors fail closed into the authoritative DOM/SVG projection.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function RealityGapTable({
  artifactId,
  model,
  selectedId,
  metric,
  view,
}: {
  artifactId: string;
  model: RealityTerrainViewModel;
  selectedId: string;
  metric: RealityMetric;
  view: RealityView;
}) {
  return (
    <InstrumentPanel
      title="Reality Gap decomposition"
      code="STAGE VALUE · INCREMENT · CUMULATIVE · PROVENANCE"
      className="mt-3"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] border-collapse text-left">
          <caption className="sr-only">
            Artifact-backed Reality Gap decomposition by execution stage
          </caption>
          <thead className="bg-[#090C0F] font-mono text-[9px] uppercase tracking-[0.1em] text-[#6F7A85]">
            <tr className="border-b border-[#1D232B]">
              <th scope="col" className="px-3 py-3 font-medium">
                Stage
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Engine / cert
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                {model.metricLabel}
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                Δ prior
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                Cumulative
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Provenance
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#171D23]">
            {model.stages.map((stage) => {
              const selected = stage.id === selectedId;
              const stress = stage.id === "L4_COUNTERFACTUAL_STRESS";
              return (
                <tr key={stage.id} className={selected ? "bg-[#14140F]" : "hover:bg-[#0E1216]"}>
                  <th scope="row" className="px-3 py-3.5">
                    <Link
                      to="/reality/$artifactId"
                      params={{ artifactId }}
                      search={{ checkpoint: stage.id, metric, view }}
                      aria-current={selected ? "step" : undefined}
                      className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
                    >
                      <span
                        className={`block font-mono text-[10px] font-semibold tracking-[0.1em] ${stress ? "text-[#FF6C68]" : selected ? "text-[#FFB000]" : "text-[#DCE0E4]"}`}
                      >
                        {stage.label}
                      </span>
                      <span className="mt-1 block text-[11px] font-normal text-[#7F8993]">
                        {stage.checkpointLabel}
                      </span>
                    </Link>
                  </th>
                  <td className="px-3 py-3.5">
                    <div className="font-mono text-[10px] font-medium text-[#C8CFD5]">
                      {stage.engine}
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-[#52A8FF]">
                      {stage.certificationLevel ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <ResearchValue metric={stage.value} compact />
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    {stage.deltaFromPrior ? (
                      <ResearchValue metric={stage.deltaFromPrior} compact />
                    ) : (
                      <span className="font-mono text-[13px] text-[#59636E]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <ResearchValue metric={stage.cumulativeDecay} compact />
                  </td>
                  <td className="max-w-[20rem] px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <EpistemicBadge type={stage.value.provenance.epistemicType} />
                      <span
                        className="truncate font-mono text-[9px] text-[#68737E]"
                        title={stage.value.provenance.fieldPath}
                      >
                        {stage.value.provenance.fieldPath}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-[#4B3B1E] bg-[#100F0B]">
            <tr>
              <th
                colSpan={4}
                className="px-3 py-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#B7A779]"
              >
                Alpha survival
              </th>
              <td className="px-3 py-3 text-right font-mono text-[16px] font-semibold tabular-nums text-[#FFB000]">
                {formatRealityMetric(model.alphaSurvival)}
              </td>
              <td className="px-3 py-3 font-mono text-[9px] text-[#756B54]">
                {model.decompositionConvention}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </InstrumentPanel>
  );
}

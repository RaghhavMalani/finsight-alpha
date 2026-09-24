import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HashValue, ResearchValue } from "@/epistemic/EpistemicValue";
import type { RealityCheckpoint, ResearchMetric } from "@/forge/contracts/observer";
import { realityQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

export type RealityMetric = "sharpe" | "maxDrawdown" | "runtime";

function checkpointMetric(checkpoint: RealityCheckpoint, metric: RealityMetric): ResearchMetric {
  if (metric === "maxDrawdown") return checkpoint.maxDrawdown;
  if (metric === "runtime") return checkpoint.runtime;
  return checkpoint.sharpe;
}

export function RealityLadder({
  artifactId,
  checkpointId,
  metric,
}: {
  artifactId: string;
  checkpointId?: string;
  metric: RealityMetric;
}) {
  const query = useQuery(realityQuery(artifactId));
  if (query.isPending)
    return (
      <ForgeShell>
        <LoadingState label="Reality Ladder" />
      </ForgeShell>
    );
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
  const selected =
    reality.checkpoints.find((item) => item.id === checkpointId) ?? reality.checkpoints[0];
  const values = reality.checkpoints.map((item) => checkpointMetric(item, metric).value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow="Reality Ladder · aggregate"
        title="Where alpha meets friction"
        description={reality.finding}
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusMark status="INFO" label={reality.binding.integrityStatus} />
            <span className="border border-[#594589] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#A67CFF]">
              2D evidence view
            </span>
          </div>
        }
      />

      <nav
        aria-label="Reality metric"
        className="mt-4 flex flex-wrap border border-[#1D232B] bg-[#0B0E11]"
      >
        {(["sharpe", "maxDrawdown", "runtime"] as const).map((item) => (
          <Link
            key={item}
            to="/reality/$artifactId"
            params={{ artifactId }}
            search={{ checkpoint: selected?.id, metric: item }}
            aria-current={metric === item ? "page" : undefined}
            className={`border-r border-[#1D232B] px-3 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
              metric === item
                ? "bg-[#111820] text-[#FFB000]"
                : "text-[#8b949e] hover:text-[#dce0e4]"
            }`}
          >
            {item === "maxDrawdown" ? "Max drawdown" : item}
          </Link>
        ))}
      </nav>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.7fr)]">
        <InstrumentPanel title="Checkpoint descent" code={metric.toUpperCase()}>
          <ol
            className="grid gap-1 p-4 sm:p-5"
            aria-label={`${metric} by Reality Ladder checkpoint`}
          >
            {reality.checkpoints.map((checkpoint) => {
              const value = checkpointMetric(checkpoint, metric);
              const width = 22 + ((value.value - min) / span) * 78;
              const active = checkpoint.id === selected?.id;
              return (
                <li key={checkpoint.id}>
                  <Link
                    to="/reality/$artifactId"
                    params={{ artifactId }}
                    search={{ checkpoint: checkpoint.id, metric }}
                    aria-current={active ? "step" : undefined}
                    className={`grid gap-2 border-l px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] sm:grid-cols-[9rem_minmax(10rem,1fr)_10rem] sm:items-center ${
                      active
                        ? "border-[#FFB000] bg-[#111820]"
                        : "border-[#2a323a] hover:bg-[#0d1115]"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium text-[#dce0e4]">
                        {checkpoint.label}
                      </span>
                      <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.1em] text-[#65707c]">
                        {checkpoint.realityLevel}
                      </span>
                    </span>
                    <span className="h-1.5 bg-[#171d23]" aria-hidden="true">
                      <span
                        className={`block h-full ${checkpoint.realityLevel.includes("COUNTERFACTUAL") ? "bg-[#A67CFF]" : "bg-[#52A8FF]"}`}
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <ResearchValue metric={value} compact className="sm:justify-self-end" />
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="border-t border-[#1D232B] px-4 py-3 font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707c]">
            Increasing realism → exact artifact order
          </div>
        </InstrumentPanel>

        <div className="grid content-start gap-4">
          {selected && (
            <InstrumentPanel title={selected.label} code={selected.engine}>
              <div className="grid gap-px bg-[#1D232B] sm:grid-cols-2 xl:grid-cols-1">
                {[
                  selected.sharpe,
                  selected.maxDrawdown,
                  selected.slippage,
                  selected.latencyCost,
                  selected.runtime,
                ].map((item) => (
                  <ResearchValue key={item.id} metric={item} className="bg-[#0B0E11] p-3" />
                ))}
              </div>
            </InstrumentPanel>
          )}
          <InstrumentPanel title="Counterfactual result" code="ARTIFACT-BOUND">
            <div className="grid gap-px bg-[#1D232B] sm:grid-cols-2 xl:grid-cols-1">
              <ResearchValue metric={reality.alphaSurvival} className="bg-[#0B0E11] p-3" />
              <ResearchValue
                metric={reality.largestDegradation.change}
                className="bg-[#0B0E11] p-3"
              />
            </div>
            <p className="border-t border-[#1D232B] p-3 text-sm leading-6 text-[#8b949e]">
              {reality.largestDegradation.label}
            </p>
          </InstrumentPanel>
          <InstrumentPanel title="Provenance" code={reality.primaryMetric}>
            <div className="grid gap-3 p-3">
              <HashValue label="artifact" value={reality.binding.artifactHash} />
              {reality.certificationArtifactHash && (
                <HashValue label="certification" value={reality.certificationArtifactHash} />
              )}
              <div className="font-mono text-[9px] leading-5 text-[#65707c]">
                {reality.binding.sourceSchemaVersion}
              </div>
            </div>
          </InstrumentPanel>
        </div>
      </div>

      <InstrumentPanel
        title="Canonical checkpoint table"
        code="SAME DATA · NON-CANVAS"
        className="mt-4"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-left">
            <caption className="sr-only">All Reality Ladder checkpoint values</caption>
            <thead>
              <tr className="border-b border-[#1D232B] font-mono text-[8px] uppercase tracking-[0.1em] text-[#65707c]">
                <th scope="col" className="px-3 py-3 font-medium">
                  Checkpoint
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Engine
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Sharpe
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Max drawdown
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Slippage
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Latency cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#171d23]">
              {reality.checkpoints.map((checkpoint) => (
                <tr key={checkpoint.id} className="align-top hover:bg-[#0d1115]">
                  <th scope="row" className="px-3 py-4 text-sm font-medium text-[#dce0e4]">
                    {checkpoint.label}
                  </th>
                  <td className="px-3 py-4 font-mono text-[9px] text-[#8b949e]">
                    {checkpoint.engine}
                  </td>
                  {[
                    checkpoint.sharpe,
                    checkpoint.maxDrawdown,
                    checkpoint.slippage,
                    checkpoint.latencyCost,
                  ].map((item) => (
                    <td key={item.id} className="px-3 py-4">
                      <ResearchValue metric={item} compact />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InstrumentPanel>
    </ForgeShell>
  );
}

import type {
  IdentifiabilityArtifact,
  IdentifiabilityFrontierRow,
} from "@/dynamics/identifiability-contracts";
import { StatusMark } from "@/forge/shared/SurfacePrimitives";

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function metric(value: number | null, digits = 2): string {
  return value === null ? "UNRESOLVED" : value.toFixed(digits);
}

function cellTone(value: number): string {
  if (value >= 0.8) return "border-[#506B38] bg-[#182212] text-[#B7D995]";
  if (value >= 0.5) return "border-[#6A5528] bg-[#211A0C] text-[#D7B968]";
  if (value > 0) return "border-[#6A3F32] bg-[#21120F] text-[#D68D78]";
  return "border-[#3B2B2B] bg-[#140D0D] text-[#A87575]";
}

function FrontierGrid({
  title,
  effectLabel,
  rows,
}: {
  title: string;
  effectLabel: string;
  rows: IdentifiabilityFrontierRow[];
}) {
  const observations = [...new Set(rows.map((row) => row.observations))].sort((a, b) => a - b);
  const effects = [...new Set(rows.map((row) => row.effect))].sort((a, b) => a - b);
  return (
    <article className="min-w-0 border border-[#27343B] bg-[#090D10]">
      <header className="border-b border-[#27343B] px-3 py-3">
        <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#769456]">
          {title}
        </div>
        <p className="mt-1 text-[10px] text-[#69777E]">Measured correct-selection probability</p>
      </header>
      <div className="overflow-x-auto p-3">
        <div
          className="grid min-w-[420px] gap-1"
          style={{ gridTemplateColumns: `6rem repeat(${observations.length}, minmax(4rem, 1fr))` }}
        >
          <div className="px-2 py-2 font-mono text-[7px] uppercase text-[#59666D]">
            {effectLabel}
          </div>
          {observations.map((sample) => (
            <div key={sample} className="px-2 py-2 text-center font-mono text-[8px] text-[#77848B]">
              n={sample}
            </div>
          ))}
          {effects.flatMap((effect) => {
            const label = (
              <div
                key={`label-${effect}`}
                className="px-2 py-3 font-mono text-[9px] text-[#9AA6AC]"
              >
                {effect.toFixed(2)}
              </div>
            );
            const cells = observations.map((sample) => {
              const row = rows.find(
                (candidate) => candidate.effect === effect && candidate.observations === sample,
              );
              return row ? (
                <div
                  key={`${effect}-${sample}`}
                  className={`border px-2 py-2.5 text-center font-mono text-[10px] ${cellTone(row.correctSelectionProbability)}`}
                  title={`${row.identifiability}; detection ${pct(row.nonlinearDetectionProbability)}; abstain ${pct(row.abstentionProbability)}`}
                >
                  <span className="block font-semibold">
                    {pct(row.correctSelectionProbability)}
                  </span>
                  <span className="mt-1 block text-[7px] uppercase opacity-70">
                    {row.identifiability}
                  </span>
                </div>
              ) : (
                <div key={`${effect}-${sample}`} className="border border-[#1A242A] bg-[#080C0F]" />
              );
            });
            return [label, ...cells];
          })}
        </div>
      </div>
    </article>
  );
}

function pathFor(
  points: Array<{ state: number; truePotential: number; inferredPotential: number }>,
  key: "truePotential" | "inferredPotential",
): string {
  if (points.length === 0) return "";
  const width = 420;
  const height = 170;
  const xValues = points.map((point) => point.state);
  const yValues = points.flatMap((point) => [point.truePotential, point.inferredPotential]);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  return points
    .map((point, index) => {
      const x = 12 + ((point.state - xMin) / Math.max(xMax - xMin, 1e-9)) * (width - 24);
      const y = height - 12 - ((point[key] - yMin) / Math.max(yMax - yMin, 1e-9)) * (height - 24);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function LandscapeComparison({ artifact }: { artifact: IdentifiabilityArtifact }) {
  const landscape = artifact.representativeLandscape;
  if (!landscape) return null;
  return (
    <article className="border border-[#27343B] bg-[#090D10]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#27343B] px-3 py-3">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#769456]">
            Potential topology / double well control
          </div>
          <p className="mt-1 text-[10px] text-[#69777E]">
            True landscape against the estimator-selected landscape
          </p>
        </div>
        <StatusMark
          status={landscape.topologyMatch ? "PASS" : "FAIL"}
          label={landscape.topologyMatch ? "TOPOLOGY MATCH" : "TOPOLOGY MISS"}
        />
      </header>
      <div className="grid gap-px bg-[#27343B] lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="bg-[#070A0C] p-3">
          <svg
            viewBox="0 0 420 170"
            role="img"
            aria-label="True and inferred effective potential lines"
            className="h-48 w-full"
          >
            <path
              d={pathFor(landscape.points, "truePotential")}
              fill="none"
              stroke="#9FCB72"
              strokeWidth="2"
            />
            <path
              d={pathFor(landscape.points, "inferredPotential")}
              fill="none"
              stroke="#D2AC57"
              strokeDasharray="5 4"
              strokeWidth="2"
            />
          </svg>
          <div className="flex gap-4 font-mono text-[8px] uppercase text-[#738087]">
            <span className="text-[#9FCB72]">True potential</span>
            <span className="text-[#D2AC57]">Inferred potential</span>
          </div>
        </div>
        <dl className="divide-y divide-[#182228] bg-[#090D10]">
          <TopologyRow label="True basins" value={String(landscape.expectedStablePoints.length)} />
          <TopologyRow label="Found basins" value={String(landscape.inferredStablePoints.length)} />
          <TopologyRow
            label="True barriers"
            value={String(landscape.expectedUnstablePoints.length)}
          />
          <TopologyRow
            label="Found barriers"
            value={String(landscape.inferredUnstablePoints.length)}
          />
        </dl>
      </div>
    </article>
  );
}

function TopologyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3">
      <dt className="font-mono text-[8px] uppercase text-[#647178]">{label}</dt>
      <dd className="font-mono text-[11px] text-[#CDD6DA]">{value}</dd>
    </div>
  );
}

function CapabilityMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#090D10] px-3 py-3">
      <div className="font-mono text-[7px] uppercase tracking-[0.08em] text-[#637078]">{label}</div>
      <div className="mt-1 font-mono text-base font-semibold tabular-nums text-[#D5DDE0]">
        {value}
      </div>
    </div>
  );
}

export function PowerObservatory({ artifact }: { artifact: IdentifiabilityArtifact }) {
  const card = artifact.capabilityCard;
  const market = artifact.realMarketContext;
  return (
    <section className="mt-3 border border-[#334149] bg-[#070A0C]" aria-labelledby="d031-title">
      <header className="grid border-b border-[#334149] xl:grid-cols-[1fr_auto]">
        <div className="px-4 py-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#86A95D]">
            Dynamics Lab / D0.3.1 / nonlinear identifiability
          </div>
          <h2
            id="d031-title"
            className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#E0E6E8]"
          >
            Map the boundary of what the detector can know.
          </h2>
          <p className="mt-2 max-w-4xl text-[11px] leading-5 text-[#849098]">{artifact.question}</p>
        </div>
        <div className="grid min-w-[320px] grid-cols-2 gap-px bg-[#334149]">
          <div className="bg-[#0B1013] px-4 py-3">
            <div className="font-mono text-[7px] uppercase text-[#647178]">Capability card</div>
            <div className="mt-2 font-mono text-sm font-semibold text-[#D7AF58]">{card.status}</div>
          </div>
          <div className="bg-[#0B1013] px-4 py-3">
            <div className="font-mono text-[7px] uppercase text-[#647178]">Frozen worlds</div>
            <div className="mt-2 font-mono text-sm font-semibold text-[#DDE4E7]">
              {artifact.runs}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-px border-b border-[#334149] bg-[#334149] sm:grid-cols-2 xl:grid-cols-6">
        <CapabilityMetric label="Linear specificity" value={pct(card.linearSpecificity)} />
        <CapabilityMetric
          label="Strong NL detection"
          value={pct(card.detectionByEffectBand.strong)}
        />
        <CapabilityMetric
          label="State diffusion"
          value={pct(card.stateDependentDiffusionDetection)}
        />
        <CapabilityMetric label="Basin precision" value={pct(card.basinPrecision)} />
        <CapabilityMetric label="Basin recall" value={pct(card.basinRecall)} />
        <CapabilityMetric label="Topology accuracy" value={pct(card.potentialTopologyAccuracy)} />
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-2">
        <FrontierGrid
          title="Nonlinear drift frontier"
          effectLabel="cubic b"
          rows={artifact.frontiers.nonlinearDrift}
        />
        <FrontierGrid
          title="State diffusion frontier"
          effectLabel="gamma"
          rows={artifact.frontiers.stateDependentDiffusion}
        />
      </div>

      <div className="grid gap-3 border-t border-[#334149] p-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <LandscapeComparison artifact={artifact} />
        <article className="border border-[#27343B] bg-[#090D10]">
          <header className="border-b border-[#27343B] px-3 py-3">
            <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#769456]">
              Frozen real-market interpretation
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] text-[#CDD6DA]">{market.pairId}</span>
              <StatusMark status="INFO" label={`IDENTIFIABILITY ${market.identifiability}`} />
            </div>
          </header>
          <dl className="divide-y divide-[#182228]">
            <TopologyRow label="Observations" value={String(market.observations)} />
            <TopologyRow label="D0.3 selected" value={market.d03SelectedModel} />
            <TopologyRow label="Nonlinear verdict" value={market.d03NonlinearVerdict} />
            <TopologyRow label="Drift error" value={metric(card.medianDriftReconstructionError)} />
            <TopologyRow
              label="Diffusion error"
              value={metric(card.medianDiffusionReconstructionError)}
            />
          </dl>
          <p className="border-t border-[#27343B] px-3 py-3 text-[10px] leading-5 text-[#8B969C]">
            {market.claim}
          </p>
        </article>
      </div>

      <footer className="grid gap-3 border-t border-[#334149] px-4 py-3 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#647178]">
            Frozen boundary
          </div>
          <p className="mt-1 text-[10px] text-[#818D93]">
            {artifact.estimatorProtocol.mutationPolicy}
          </p>
        </div>
        <div className="font-mono text-[8px] uppercase text-[#56636A]">
          artifact {artifact.artifactHash.slice(0, 16)}...
        </div>
      </footer>
    </section>
  );
}

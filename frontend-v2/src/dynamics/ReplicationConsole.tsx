import type {
  DecisionPattern,
  EvidenceCompleteReplication,
  ReplicationClassification,
  ReplicationMetric,
} from "@/dynamics/replication-contracts";
import { StatusMark } from "@/forge/shared/SurfacePrimitives";

const METRIC_LABELS: Record<string, string> = {
  linear_specificity: "Linear specificity",
  false_nonlinear_discovery_rate: "False nonlinear discovery",
  false_basin_discovery_rate: "False basin discovery",
  double_well_detection: "Double-well detection",
  basin_precision: "Basin precision",
  basin_recall: "Basin recall",
  potential_topology_accuracy: "Topology accuracy",
  state_diffusion_detection: "State-diffusion detection",
  numerical_failure_rate: "Numerical failure",
};

const WATERFALL_ORDER = [
  "oracle_support_topology",
  "full_field_topology",
  "root_cluster_triplet",
  "minimum_cluster_occupancy",
  "sealed_holdout_gain",
  "root_persistence",
  "stability_support",
  "sign_topology",
  "barrier_support",
  "certificate_score",
  "final_topology_gate",
  "exact_topology_match",
];

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("+", " + ");
}

function percent(value: number | null, digits = 1): string {
  return value === null ? "Not defined" : `${(value * 100).toFixed(digits)}%`;
}

function decimal(value: number | null, digits = 3): string {
  return value === null ? "Not defined" : value.toFixed(digits);
}

function interval(value: [number, number] | null): string {
  return value === null ? "No interval" : `${percent(value[0])}–${percent(value[1])}`;
}

function classificationTone(value: ReplicationClassification): string {
  if (value === "CAPABILITY_SUPPORTED") return "border-[#28694F] text-[#35C78A]";
  if (value === "LIMITATION_REPLICATED") return "border-[#763B3A] text-[#FF766F]";
  return "border-[#745F31] text-[#D8A43A]";
}

function Classification({ value }: { value: ReplicationClassification }) {
  return (
    <span
      className={`inline-flex border px-1.5 py-1 font-mono text-[7px] font-semibold uppercase tracking-[0.08em] ${classificationTone(value)}`}
    >
      {label(value)}
    </span>
  );
}

function MetricRow({ metric }: { metric: ReplicationMetric }) {
  const gate = metric.gate
    ? `${metric.gate.comparator} ${percent(metric.gate.threshold)}`
    : "No frozen gate";
  const delta = metric.absoluteDelta === null ? "Not defined" : percent(metric.absoluteDelta);
  return (
    <tr className="border-t border-[#202830] align-top">
      <th scope="row" className="min-w-48 px-3 py-2.5 text-left font-normal">
        <div className="text-[11px] font-medium text-[#DDE2E6]">
          {METRIC_LABELS[metric.metric] ?? label(metric.metric)}
        </div>
        <div className="mt-1 max-w-xs text-[8px] leading-3 text-[#66727D]">{metric.definition}</div>
      </th>
      <td className="px-3 py-2.5 font-mono text-[10px] text-[#8D98A2]">
        <div>{percent(metric.confirmation.estimate)}</div>
        <div className="mt-1 text-[8px] text-[#59646F]">
          {interval(metric.confirmation.wilson95)}
        </div>
      </td>
      <td className="bg-[#0D1216] px-3 py-2.5 font-mono text-[10px] text-[#E4C677]">
        <div>{percent(metric.estimate)}</div>
        <div className="mt-1 text-[8px] text-[#85764E]">{interval(metric.wilson95)}</div>
        <div className="mt-1 text-[7px] text-[#59646F]">
          {metric.numerator}/{metric.denominator}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[9px] text-[#AEB6BD]">
        <div>{delta}</div>
        <div className="mt-1 text-[7px] uppercase text-[#63707A]">
          {label(metric.uncertaintyInterpretation)}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[9px] text-[#AEB6BD]">{gate}</td>
      <td className="px-3 py-2.5">
        <Classification value={metric.classification} />
        <div className="mt-1.5 max-w-56 text-[8px] leading-3 text-[#68747E]">
          {metric.classificationReason}
        </div>
      </td>
    </tr>
  );
}

function PatternList({ rows }: { rows: DecisionPattern[] }) {
  if (rows.length === 0) {
    return <div className="py-3 font-mono text-[8px] text-[#60707B]">No observed cases</div>;
  }
  return (
    <ol className="divide-y divide-[#202830]">
      {rows.map((row) => (
        <li key={row.pattern} className="grid grid-cols-[1fr_auto] gap-3 py-2">
          <span className="break-words font-mono text-[8px] leading-3 text-[#A9B3BA]">
            {label(row.pattern)}
          </span>
          <span className="font-mono text-[9px] font-semibold text-[#E4C677]">{row.count}</span>
        </li>
      ))}
    </ol>
  );
}

function EvidenceSeal({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#5F6C76]">{name}</div>
      <div className="mt-1 truncate font-mono text-[8px] text-[#9CA7AF]" title={value}>
        {value}
      </div>
    </div>
  );
}

export function ReplicationConsole({ artifact }: { artifact: EvidenceCompleteReplication }) {
  const completeness = artifact.execution.admittedWorlds / artifact.execution.executedWorlds;
  const errorGroups = Object.entries(artifact.classificationErrors);
  const diffusionRows = artifact.diffusionPatterns.state_diffusion ?? [];

  return (
    <article className="overflow-hidden border border-[#31404A] bg-[#080B0E]">
      <header className="grid gap-px bg-[#31404A] lg:grid-cols-[minmax(22rem,1.35fr)_repeat(3,minmax(10rem,0.65fr))]">
        <div className="bg-[#10100D] px-4 py-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C09A43]">
            D0.3.4 / evidence-complete replication
          </div>
          <h2 className="mt-2 text-balance text-xl font-semibold tracking-[-0.025em] text-[#F0D697]">
            Capability vector, not a victory score
          </h2>
          <p className="mt-2 max-w-xl text-[10px] leading-4 text-[#8B8170]">
            Untouched seeds, frozen equations, and complete causal traces across every admitted
            world.
          </p>
        </div>
        <div className="bg-[#0D1412] px-4 py-4">
          <div className="font-mono text-[7px] uppercase text-[#688078]">Program result</div>
          <div className="mt-2 break-words font-mono text-[11px] font-semibold leading-4 text-[#77D8AE]">
            {label(artifact.programStatus)}
          </div>
          <div className="mt-2 font-mono text-[7px] text-[#5D746B]">NO SCALAR PASS / FAIL</div>
        </div>
        <div className="bg-[#0B1014] px-4 py-4">
          <div className="font-mono text-[7px] uppercase text-[#687783]">Evidence admission</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#E5E9EC]">
            {artifact.execution.admittedWorlds}/{artifact.execution.executedWorlds}
          </div>
          <div className="mt-1 font-mono text-[7px] text-[#6A7780]">
            {percent(completeness)} COMPLETE
          </div>
        </div>
        <div className="bg-[#15120B] px-4 py-4">
          <div className="font-mono text-[7px] uppercase text-[#8B743E]">Claim boundary</div>
          <div className="mt-2">
            <StatusMark status="ABSTAIN" label={`MARKET ${artifact.marketClaim}`} />
          </div>
          <div className="mt-2 font-mono text-[7px] text-[#71613C]">NO MARKET RERUN</div>
        </div>
      </header>

      <section aria-labelledby="replication-metrics-title" className="border-t border-[#25313A]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h3 id="replication-metrics-title" className="text-sm font-medium text-[#E0E4E7]">
              D0.3.3 confirmation vs D0.3.4 replication
            </h3>
            <p className="mt-1 text-[9px] text-[#65727C]">
              Wilson 95% intervals; independent seed ledgers; no paired-effect claim.
            </p>
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#697680]">
            400 WORLDS / 32 ROOT BOOTSTRAPS
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse tabular-nums">
            <thead className="border-t border-[#202830] bg-[#0C1014]">
              <tr className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#65717B]">
                <th className="px-3 py-2 text-left">Capability</th>
                <th className="px-3 py-2 text-left">D0.3.3 / 95% CI</th>
                <th className="px-3 py-2 text-left">D0.3.4 / 95% CI</th>
                <th className="px-3 py-2 text-left">Delta</th>
                <th className="px-3 py-2 text-left">Frozen gate</th>
                <th className="px-3 py-2 text-left">Classification</th>
              </tr>
            </thead>
            <tbody>
              {artifact.metrics.map((metric) => (
                <MetricRow key={metric.metric} metric={metric} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-px border-t border-[#25313A] bg-[#25313A] xl:grid-cols-[1.1fr_0.9fr]">
        <div className="bg-[#090C0F] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-[#DCE1E5]">Topology waterfall</h3>
              <p className="mt-1 text-[9px] text-[#65727C]">
                Double-well worlds retained at each causal stage.
              </p>
            </div>
            <span className="font-mono text-[8px] text-[#6C7881]">N=100</span>
          </div>
          <ol className="mt-3 space-y-2">
            {WATERFALL_ORDER.map((stage) => {
              const row = artifact.topologyWaterfall[stage];
              if (!row) return null;
              return (
                <li key={stage} className="grid grid-cols-[11rem_1fr_3rem] items-center gap-3">
                  <span className="truncate font-mono text-[8px] uppercase text-[#8C979F]">
                    {label(stage)}
                  </span>
                  <span className="h-1.5 bg-[#182027]" aria-hidden="true">
                    <span
                      className="block h-full bg-[#C59A3D]"
                      style={{ width: `${(row.rate ?? 0) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-mono text-[9px] tabular-nums text-[#D5B464]">
                    {row.count}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="bg-[#090C0F] px-4 py-4">
          <h3 className="text-sm font-medium text-[#DCE1E5]">Diffusion conjunction patterns</h3>
          <p className="mt-1 text-[9px] text-[#65727C]">
            Exact failed-gate combinations for the 100 state-diffusion worlds.
          </p>
          <div className="mt-3">
            <PatternList rows={diffusionRows} />
          </div>
        </div>
      </section>

      <section className="border-t border-[#25313A] px-4 py-4">
        <h3 className="text-sm font-medium text-[#DCE1E5]">
          False-negative and false-positive mechanisms
        </h3>
        <p className="mt-1 text-[9px] text-[#65727C]">
          Counts use mutually exclusive exact patterns; zero-count patterns are not invented.
        </p>
        <div className="mt-3 grid gap-px bg-[#25313A] sm:grid-cols-2 xl:grid-cols-4">
          {errorGroups.map(([name, rows]) => (
            <div key={name} className="min-w-0 bg-[#090C0F] px-3 py-3">
              <div className="min-h-7 font-mono text-[8px] uppercase leading-3 text-[#8D99A2]">
                {label(name)}
              </div>
              <PatternList rows={rows} />
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[#25313A] px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-[#DCE1E5]">SINDy structural stability</h3>
            <p className="mt-1 text-[9px] text-[#65727C]">
              Raw-scale coefficient bootstraps, exact support, signs, and true/false term
              separation.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 font-mono text-[8px]">
            <div>
              <span className="block text-[#63707A]">TRUE TERM FREQ</span>
              <span className="mt-1 block text-[#77D8AE]">
                {percent(artifact.sindyAggregate.trueTermInclusionFrequency)}
              </span>
            </div>
            <div>
              <span className="block text-[#63707A]">FALSE TERM FREQ</span>
              <span className="mt-1 block text-[#FF8A7F]">
                {percent(artifact.sindyAggregate.falseTermInclusionFrequency)}
              </span>
            </div>
            <div>
              <span className="block text-[#63707A]">SEPARATION</span>
              <span className="mt-1 block text-[#E4C677]">
                {decimal(artifact.sindyAggregate.frequencySeparation)}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse font-mono text-[8px] tabular-nums">
            <thead className="border-y border-[#202830] bg-[#0C1014] uppercase text-[#65717B]">
              <tr>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-right">True recall</th>
                <th className="px-3 py-2 text-right">Structural precision</th>
                <th className="px-3 py-2 text-right">False selection</th>
                <th className="px-3 py-2 text-right">Exact support</th>
                <th className="px-3 py-2 text-right">Sign correct</th>
                <th className="px-3 py-2 text-right">Coeff. error / median</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(artifact.sindyByRole).map(([role, row]) => (
                <tr key={role} className="border-b border-[#202830] text-[#AAB4BB]">
                  <th scope="row" className="px-3 py-2.5 text-left font-medium text-[#DCE1E5]">
                    {label(role)}
                  </th>
                  <td className="px-3 py-2.5 text-right">{percent(row.trueTermRecall)}</td>
                  <td className="px-3 py-2.5 text-right">{percent(row.structuralPrecision)}</td>
                  <td className="px-3 py-2.5 text-right">{percent(row.falseTermSelectionRate)}</td>
                  <td className="px-3 py-2.5 text-right">{percent(row.exactSupportRate)}</td>
                  <td className="px-3 py-2.5 text-right">{percent(row.signCorrectness)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {decimal(row.coefficientRelativeError?.median ?? null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-px border-t border-[#25313A] bg-[#25313A] lg:grid-cols-[1.3fr_0.7fr]">
        <div className="bg-[#151108] px-4 py-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#9B7C37]">
            Market interpretation preserved
          </div>
          <p className="mt-2 max-w-3xl text-[10px] leading-5 text-[#D9BE82]">
            {artifact.marketInterpretation}
          </p>
        </div>
        <div className="bg-[#0A0E11] px-4 py-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#687680]">
            Execution controls
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[8px]">
            <div>
              <dt className="text-[#5F6C76]">Development worlds</dt>
              <dd className="mt-1 text-[#B8C1C7]">{artifact.execution.developmentWorlds}</dd>
            </div>
            <div>
              <dt className="text-[#5F6C76]">Tuning events</dt>
              <dd className="mt-1 text-[#B8C1C7]">{artifact.execution.tuningEvents}</dd>
            </div>
            <div>
              <dt className="text-[#5F6C76]">Stopped early</dt>
              <dd className="mt-1 text-[#B8C1C7]">
                {artifact.execution.stoppedEarly ? "YES" : "NO"}
              </dd>
            </div>
            <div>
              <dt className="text-[#5F6C76]">Raw evidence in API</dt>
              <dd className="mt-1 text-[#B8C1C7]">
                {artifact.rawWorldEvidenceExposed ? "YES" : "NO"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <footer className="grid gap-3 border-t border-[#25313A] px-4 py-3 sm:grid-cols-3">
        <EvidenceSeal label="Artifact content address" value={artifact.artifactHash} />
        <EvidenceSeal label="Artifact file SHA-256" value={artifact.fileSha256} />
        <EvidenceSeal label="Projection content address" value={artifact.projectionHash} />
      </footer>
    </article>
  );
}

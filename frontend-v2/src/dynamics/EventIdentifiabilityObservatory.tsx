import { useId, useMemo, useState, type ReactNode } from "react";
import type {
  HawkesIdentifiability,
  IdentifiabilityWorld,
  Matrix,
} from "@/dynamics/hawkes-identifiability-contracts";
import { StatusMark } from "@/forge/shared/SurfacePrimitives";

const line = "border-[#25313A]";
const muted = "text-[#7D8992]";
const names: Record<string, string> = {
  inverse_hessian: "Inverse Hessian",
  event_attribution: "Fixed attribution",
  parametric_bootstrap: "Parametric refit",
  profile_likelihood: "Profile likelihood",
};
const label = (v: string) => v.replaceAll("_", " ");
const decimal = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(3));
const percent = (v: number | null | undefined) => (v == null ? "—" : `${(100 * v).toFixed(1)}%`);

export function EventIdentifiabilityObservatory({ artifact }: { artifact: HawkesIdentifiability }) {
  const [selectedId, setSelectedId] = useState(artifact.worlds[0].id);
  const selected = artifact.worlds.find((world) => world.id === selectedId) ?? artifact.worlds[0];
  const passes = Object.values(artifact.gates).filter(Boolean).length;
  return (
    <article
      className={`border ${line} bg-[#080C0F] text-[#D9E0E4]`}
      aria-labelledby="identifiability-title"
    >
      <header className={`border-b ${line} px-4 py-5 sm:px-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className={`font-mono text-[9px] uppercase tracking-[0.15em] ${muted}`}>
              D0.4.1 / Frozen synthetic evidence
            </div>
            <h2 id="identifiability-title" className="mt-2 text-2xl font-semibold tracking-tight">
              Event Identifiability Observatory
            </h2>
            <p className={`mt-2 max-w-4xl text-[11px] leading-5 ${muted}`}>{artifact.question}</p>
          </div>
          <StatusMark
            status={passes === Object.keys(artifact.gates).length ? "PASS" : "ABSTAIN"}
            label={artifact.status}
          />
        </div>
        <div className="mt-4 grid gap-px bg-[#25313A] sm:grid-cols-2 xl:grid-cols-4">
          <Datum name="New worlds" value={`${artifact.worldCount} / ${artifact.worldCount}`} />
          <Datum name="Refit & profile audit" value={`${artifact.auditCount} worlds`} />
          <Datum
            name="Preregistered gates"
            value={`${passes} / ${Object.keys(artifact.gates).length}`}
          />
          <Datum name="Claims" value="SYNTHETIC STRUCTURE ONLY" />
        </div>
      </header>

      <section className={`grid border-b ${line} lg:grid-cols-[15rem_minmax(0,1fr)]`}>
        <nav
          aria-label="Representative synthetic worlds"
          className={`border-b ${line} lg:border-b-0 lg:border-r`}
        >
          <div className={`px-3 py-3 font-mono text-[9px] uppercase ${muted}`}>
            10 preregistered representatives
          </div>
          {artifact.worlds.map((world) => (
            <button
              key={world.id}
              type="button"
              aria-pressed={world.id === selected.id}
              onClick={() => setSelectedId(world.id)}
              className={`block w-full border-t ${line} px-3 py-3 text-left text-[10px] leading-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B9D47A] ${world.id === selected.id ? "bg-[#152014] text-[#B9D47A]" : "text-[#89959F] hover:bg-[#10171C]"}`}
            >
              <span className="block font-mono">{label(world.regime)}</span>
              <span className="mt-1 block text-[9px]">
                {world.information} · N={world.counts.reduce((a, b) => a + b, 0)}
              </span>
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          <div
            className={`flex flex-wrap justify-between gap-3 border-b ${line} px-4 py-3 font-mono text-[10px]`}
          >
            <span>
              N {selected.counts.reduce((a, b) => a + b, 0)} · ρ TRUE {decimal(selected.trueRho)} ·
              ρ FIT {decimal(selected.fittedRho)}
            </span>
            <span className={selected.exactGraph ? "text-[#B9D47A]" : "text-[#DCB760]"}>
              {selected.directionClass} · FIT {selected.fitSuccess ? "CONVERGED" : "FAILED"}
            </span>
          </div>
          <div className={`grid border-b ${line} md:grid-cols-2`}>
            <EvidenceGraph world={selected} truth />
            <EvidenceGraph world={selected} />
          </div>
          <div className="grid xl:grid-cols-2">
            <EdgeEvidence world={selected} />
            <BranchingComparison world={selected} />
          </div>
          <div className={`border-t ${line} px-4 py-3 text-[10px] leading-5 ${muted}`}>
            Each edge is conditional temporal excitation, not causality. Fixed-attribution support
            conditions on one fit; it is not posterior probability or a calibrated confidence claim.
            Residual check:{" "}
            <span className={selected.residualCalibrated ? "text-[#B9D47A]" : "text-[#DCB760]"}>
              {selected.residualCalibrated ? "CALIBRATED" : "UNRESOLVED"}
            </span>
            .<div className="mt-1 break-all font-mono text-[8px]">World seal {selected.hash}</div>
          </div>
        </div>
      </section>

      <section
        className={`grid border-b ${line} xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]`}
      >
        <CoverageComparison artifact={artifact} />
        <CriticalityCalibration artifact={artifact} />
      </section>
      <DirectionFrontier artifact={artifact} />
      <section className={`grid border-t ${line} md:grid-cols-2`}>
        <Panel title="Decomposed graph recovery · all 180 directional worlds">
          <dl className="grid grid-cols-2 gap-3 font-mono text-[10px]">
            {[
              ["Precision", "precision"],
              ["Recall", "recall"],
              ["F1", "f1"],
              ["Exact graph", "exact_graph_rate"],
              ["Direction given detection", "conditional_direction_accuracy"],
              ["Missed edge", "missed_edge_rate"],
              ["False edge among discoveries", "false_edge_rate"],
              ["Reversed edge", "reversed_edge_rate"],
              ["Abstention", "abstention_rate"],
            ].map(([name, key]) => (
              <div key={key}>
                <dt className={muted}>{name}</dt>
                <dd className="mt-1 text-base">{percent(artifact.graphMetrics[key])}</dd>
              </div>
            ))}
          </dl>
          <p className={`mt-4 text-[10px] leading-5 ${muted}`}>
            A reversed edge and a missed relationship are different errors. Exact-graph scoring
            includes off-diagonal edges only; self-excitation is displayed separately above.
          </p>
        </Panel>
        <Panel title="Promotion gates · no scalar score">
          <dl className="space-y-2 font-mono text-[10px]">
            {Object.entries(artifact.gates).map(([name, passed]) => (
              <div key={name} className="flex justify-between gap-3">
                <dt className={muted}>{label(name)}</dt>
                <dd className={passed ? "text-[#B9D47A]" : "text-[#DCB760]"}>
                  {passed ? "SUPPORTED" : "UNRESOLVED"}
                </dd>
              </div>
            ))}
          </dl>
          <div className={`mt-4 border-t ${line} pt-3 font-mono text-[10px]`}>
            Control false excitation (including self):{" "}
            {percent(artifact.metrics.control_false_excitation_rate)}
            <br />
            Numerical failures: {artifact.metrics.numerical_failures} / {artifact.worldCount}
            <br />
            Parametric refit failures: {artifact.metrics.parametric_refit_failures}
          </div>
        </Panel>
      </section>
      <footer className={`grid border-t ${line} md:grid-cols-2`}>
        <Panel title="Capability boundary">
          <dl className="space-y-2 font-mono text-[10px]">
            {artifact.capabilities.map((item) => (
              <div key={item.name} className="flex flex-wrap justify-between gap-2">
                <dt className={muted}>{item.name}</dt>
                <dd>{item.status}</dd>
              </div>
            ))}
          </dl>
          <p className={`mt-4 text-[10px] leading-5 ${muted}`}>
            No market data, predictive validation, economic backtest, or causal identification. D0.4
            remains immutable; this milestone does not authorize D0.4.2.
          </p>
        </Panel>
        <Panel title="Evidence seals">
          <dl className="space-y-3 break-all font-mono text-[8px]">
            {[
              ["D0.4.1 canonical", artifact.hash],
              ["Artifact bytes", artifact.fileHash],
              ["D0.4 immutable parent", artifact.parentHash],
            ].map(([name, value]) => (
              <div key={name}>
                <dt className={muted}>{name}</dt>
                <dd className="mt-1">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </footer>
    </article>
  );
}

function Datum({ name, value }: { name: string; value: string }) {
  return (
    <div className="bg-[#0A0E11] px-3 py-3">
      <div className={`font-mono text-[8px] uppercase ${muted}`}>{name}</div>
      <div className="mt-1 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 border-b ${line} px-4 py-4`}>
      <h3 className={`mb-4 font-mono text-[9px] uppercase tracking-wider ${muted}`}>{title}</h3>
      {children}
    </section>
  );
}

function EvidenceGraph({ world, truth = false }: { world: IdentifiabilityWorld; truth?: boolean }) {
  const marker = useId().replaceAll(":", "");
  const nodes = useMemo(
    () =>
      world.channels.length === 1
        ? [{ x: 150, y: 100 }]
        : world.channels.length === 2
          ? [
              { x: 75, y: 100 },
              { x: 225, y: 100 },
            ]
          : [
              { x: 65, y: 135 },
              { x: 235, y: 135 },
              { x: 150, y: 50 },
            ],
    [world.channels.length],
  );
  const edges = useMemo(() => {
    const values = truth ? world.truth : world.fitted;
    return values.flatMap((row, target) =>
      row.flatMap((weight, source) =>
        weight > 0.035 || (!truth && world.edgeSupport[target][source] === 1)
          ? [
              {
                source,
                target,
                weight,
                supported: truth || world.edgeSupport[target][source] === 1,
              },
            ]
          : [],
      ),
    );
  }, [world, truth]);
  return (
    <Panel
      title={
        truth ? "Known synthetic graph" : "Inferred graph · solid supported / dashed unresolved"
      }
    >
      <svg
        viewBox="0 0 300 195"
        className="w-full max-h-52"
        role="img"
        aria-label={truth ? "Known excitation graph" : "Frozen inferred excitation graph"}
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const from = nodes[edge.source],
            to = nodes[edge.target];
          let path: string;
          if (edge.source === edge.target)
            path = `M ${from.x - 15} ${from.y - 17} C ${from.x - 65} ${from.y - 75}, ${from.x + 65} ${from.y - 75}, ${from.x + 15} ${from.y - 17}`;
          else {
            const dx = to.x - from.x,
              dy = to.y - from.y,
              distance = Math.hypot(dx, dy),
              ux = dx / distance,
              uy = dy / distance;
            path = `M ${from.x + ux * 25} ${from.y + uy * 25} Q ${(from.x + to.x) / 2 - uy * 30} ${(from.y + to.y) / 2 + ux * 30} ${to.x - ux * 29} ${to.y - uy * 29}`;
          }
          return (
            <path
              key={`${edge.source}-${edge.target}`}
              d={path}
              fill="none"
              stroke={edge.supported ? "#B9D47A" : "#DCB760"}
              strokeWidth="1.7"
              strokeDasharray={edge.supported ? undefined : "4 5"}
              markerEnd={`url(#${marker})`}
            >
              <title>
                {world.channels[edge.source]} → {world.channels[edge.target]}:{" "}
                {decimal(edge.weight)}, {edge.supported ? "supported" : "unresolved"}
              </title>
            </path>
          );
        })}
        {nodes.map((node, index) => (
          <g key={world.channels[index]}>
            <circle cx={node.x} cy={node.y} r="24" fill="#0C1318" stroke="#43515B" />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fill="#D9E0E4"
              fontFamily="monospace"
              fontSize="13"
            >
              {world.channels[index]}
            </text>
          </g>
        ))}
        {edges.length === 0 && (
          <text x="150" y="183" textAnchor="middle" fill="#7D8992" fontSize="9">
            NO SUPPORTED EXCITATION EDGES
          </text>
        )}
      </svg>
    </Panel>
  );
}

function EdgeEvidence({ world }: { world: IdentifiabilityWorld }) {
  return (
    <Panel title="Edge uncertainty · fixed-fit attribution instrument">
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-[9px]">
          <caption className="sr-only">
            Branching estimates, intervals, support and decision per edge
          </caption>
          <thead className={muted}>
            <tr>
              <th className="pb-2">Edge</th>
              <th>G fit</th>
              <th>95% interval</th>
              <th>Support</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {world.channels.flatMap((targetName, target) =>
              world.channels.map((sourceName, source) => (
                <tr key={`${source}-${target}`} className={`border-t ${line}`}>
                  <th className="py-2 font-normal">
                    {sourceName}→{targetName}
                  </th>
                  <td>{decimal(world.fitted[target][source])}</td>
                  <td>
                    [{decimal(world.interval.lower[target][source])},{" "}
                    {decimal(world.interval.upper[target][source])}]
                  </td>
                  <td>{percent(world.supportProbability[target][source])}</td>
                  <td
                    className={
                      world.edgeSupport[target][source] ? "text-[#B9D47A]" : "text-[#DCB760]"
                    }
                  >
                    {world.edgeSupport[target][source] ? "SUPPORTED" : "UNRESOLVED"}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <p className={`mt-3 text-[10px] leading-5 ${muted}`}>
        Support = centered bootstrap draws above G=0.035. The edge decision requires its lower
        interval bound &gt;0.035. OOS edge ΔLL: NOT TESTED.
      </p>
    </Panel>
  );
}
function BranchingComparison({ world }: { world: IdentifiabilityWorld }) {
  return (
    <Panel title="Branching matrix · row target / column source">
      <div className="grid grid-cols-2 gap-4">
        <MatrixTable matrix={world.truth} channels={world.channels} name="Truth" />
        <MatrixTable matrix={world.fitted} channels={world.channels} name="Fit" />
      </div>
    </Panel>
  );
}
function MatrixTable({
  matrix,
  channels,
  name,
}: {
  matrix: Matrix;
  channels: string[];
  name: string;
}) {
  return (
    <table className="w-full text-center font-mono text-[10px]">
      <caption className={`mb-2 text-left ${muted}`}>{name}</caption>
      <thead>
        <tr>
          <th aria-label="Target" />
          {channels.map((channel) => (
            <th key={channel}>{channel}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row, target) => (
          <tr key={channels[target]}>
            <th className={muted}>{channels[target]}</th>
            {row.map((value, source) => (
              <td
                key={channels[source]}
                className={`border ${line} px-1 py-3`}
                style={{ backgroundColor: `rgba(185,212,122,${Math.min(value, 1) * 0.25})` }}
              >
                {decimal(value)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function CoverageComparison({ artifact }: { artifact: HawkesIdentifiability }) {
  return (
    <Panel title="Interval calibration · nominal 95%, not a method tournament">
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-[10px]">
          <caption className="sr-only">Uncertainty method coverage, width and error</caption>
          <thead className={muted}>
            <tr>
              <th className="pb-3">Instrument / n</th>
              <th>Coverage</th>
              <th>Mean / median width</th>
              <th>Bias / RMSE</th>
              <th>ρ coverage</th>
              <th>Failures</th>
            </tr>
          </thead>
          <tbody>
            {artifact.methods.map((method) => (
              <tr key={method.method} className={`border-t ${line}`}>
                <th className="py-3 pr-3 font-normal">
                  {names[method.method]}
                  <span className={`mt-1 block text-[8px] ${muted}`}>
                    {method.worlds} worlds · {method.parameters} nonzero terms
                  </span>
                </th>
                <td
                  className={
                    method.coverage !== null && method.coverage >= 0.85
                      ? "text-[#B9D47A]"
                      : "text-[#DCB760]"
                  }
                >
                  {percent(method.coverage)}
                </td>
                <td>
                  {decimal(method.meanWidth)} / {decimal(method.medianWidth)}
                </td>
                <td>
                  {decimal(method.bias)} / {decimal(method.rmse)}
                </td>
                <td>{percent(method.rhoCoverage)}</td>
                <td>{method.failures}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-3 text-[10px] leading-5 ${muted}`}>
        Hessian/attribution use all worlds; refit/profile use the preregistered 44-world univariate
        audit. Different populations must not be ranked directly. Bias/RMSE use the same incumbent
        point fit within each method's eligible subset. Coverage above counts true contributions
        &gt;0.035; ρ coverage also includes zero-excitation worlds.
      </p>
    </Panel>
  );
}
function CriticalityCalibration({ artifact }: { artifact: HawkesIdentifiability }) {
  const x = (value: number) => 35 + ((value - 0.65) / 0.35) * 220;
  const y = (value: number) => 165 - value * 140;
  return (
    <Panel title="Criticality calibration · 16 worlds per true ρ">
      <svg
        viewBox="0 0 285 200"
        className="w-full"
        role="img"
        aria-label="True versus mean estimated spectral radius, whiskers show RMSE not confidence intervals"
      >
        <path
          d={`M ${x(0.65)} ${y(0.65)} L ${x(1)} ${y(1)}`}
          stroke="#53616B"
          strokeDasharray="4 4"
          fill="none"
        />
        <path d="M35 20 V165 H260" stroke="#25313A" fill="none" />
        {[0, 0.5, 1].map((tick) => (
          <text key={tick} x="29" y={y(tick) + 3} textAnchor="end" fill="#7D8992" fontSize="8">
            {tick.toFixed(1)}
          </text>
        ))}
        {artifact.calibration.map((point) => (
          <g key={point.truth}>
            <line
              x1={x(point.truth)}
              x2={x(point.truth)}
              y1={y(Math.min(1, point.mean + point.rmse))}
              y2={y(Math.max(0, point.mean - point.rmse))}
              stroke="#DCB760"
            />
            <circle cx={x(point.truth)} cy={y(point.mean)} r="3.5" fill="#B9D47A" />
            <text x={x(point.truth)} y="181" textAnchor="middle" fill="#7D8992" fontSize="8">
              {point.truth.toFixed(2)}
            </text>
            <title>
              True {point.truth}; mean {decimal(point.mean)}; RMSE {decimal(point.rmse)}
            </title>
          </g>
        ))}
        <text x="145" y="197" textAnchor="middle" fill="#7D8992" fontSize="8">
          TRUE ρ · WHISKERS = ±RMSE, CLIPPED TO AXIS
        </text>
      </svg>
      <div className={`font-mono text-[9px] leading-5 ${muted}`}>
        Near-critical accuracy {percent(artifact.metrics.near_critical_accuracy)}
        <br />
        False alarms {percent(artifact.metrics.false_near_critical_alarm_rate)}
        <br />ρ bias {decimal(artifact.metrics.spectral_radius_bias)} / RMSE{" "}
        {decimal(artifact.metrics.spectral_radius_rmse)}
      </div>
    </Panel>
  );
}
function DirectionFrontier({ artifact }: { artifact: HawkesIdentifiability }) {
  return (
    <Panel title="Direction identifiability frontier · exact graph vs information">
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-[10px]">
          <caption className="sr-only">Topology and edge asymmetry by information regime</caption>
          <thead className={muted}>
            <tr>
              <th className="pb-3">Topology / |G AB − G BA|</th>
              {[100, 300, 1000, 3000].map((n) => (
                <th key={n}>Target N {n}</th>
              ))}
              <th>First ≥80%</th>
            </tr>
          </thead>
          <tbody>
            {artifact.frontier.map((row) => (
              <tr key={row.regime} className={`border-t ${line}`}>
                <th className="py-3 pr-3 font-normal">
                  {label(row.regime)}
                  <span className={`ml-2 ${muted}`}>{decimal(row.asymmetry)}</span>
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.information}
                    className={
                      cell.rate !== null && cell.rate >= 0.8 ? "text-[#B9D47A]" : "text-[#DCB760]"
                    }
                  >
                    <span>
                      {cell.rate !== null && cell.rate >= 0.8 ? "✓" : "?"} {percent(cell.rate)}
                    </span>
                    <span className={`ml-1 text-[8px] ${muted}`}>n={cell.worlds}</span>
                  </td>
                ))}
                <td className={muted}>{row.frontier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-3 text-[10px] leading-5 ${muted}`}>
        ? = this cell has not met the frozen 80% exact-graph criterion, not proof that each
        individual world is unidentifiable. Five worlds per cell are descriptive, not a precise
        power estimate. Target event count is not realized count. For observed Z, the shown
        asymmetry is A/B only; recovery scores the complete three-node graph.
      </p>
    </Panel>
  );
}

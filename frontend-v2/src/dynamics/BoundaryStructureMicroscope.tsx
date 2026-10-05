import { useId, useState, type ReactNode } from "react";
import type { BoundaryArtifact, BoundaryWorld } from "@/dynamics/hawkes-boundary-contracts";
import { StatusMark } from "@/forge/shared/SurfacePrimitives";

const line = "border-[#25313A]";
const muted = "text-[#8A969F]";
const label = (s: string) => s.replaceAll("_", " ");
const channel = (i: number) => ["A", "B", "Z"][i];
const dec = (n: number | null | undefined) => (n == null ? "Unavailable" : n.toFixed(3));
const pct = (n: number | null | undefined) =>
  n == null ? "Unavailable" : `${(n * 100).toFixed(1)}%`;
const methods: Record<string, string> = {
  inverse_hessian: "Inverse Hessian",
  event_attribution: "Fixed attribution",
  parametric_bootstrap: "Parametric refit",
  profile_likelihood: "Profile likelihood",
};

export function BoundaryStructureMicroscope({ artifact }: { artifact: BoundaryArtifact }) {
  const [protocol, setProtocol] = useState("ZERO");
  const [worldId, setWorldId] = useState(artifact.worlds[0].id);
  const [axis, setAxis] = useState("information");
  const world = artifact.worlds.find((w) => w.id === worldId) ?? artifact.worlds[0];
  const row = world.rows.find((r) => r.name === protocol) ?? world.rows[0];
  const confusion = artifact.confusion.find((r) => r.protocol === protocol)!;
  const categories = artifact.categories.find((r) => r.protocol === protocol)!;
  const geometry = artifact.geometry.find((r) => r.protocol === protocol)!;
  const states = artifact.states.find((r) => r.protocol === protocol)!;
  const coverage = artifact.coverage.filter((r) => r.protocol === protocol && r.axis === axis);
  return (
    <article
      className={`border ${line} bg-[#080C0F] text-[#D9E0E4]`}
      aria-labelledby="boundary-title"
    >
      <header className={`border-b ${line} px-4 py-5 sm:px-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={`font-mono text-[9px] uppercase tracking-[0.15em] ${muted}`}>
              D0.4.1.1 / Frozen matched diagnostic
            </p>
            <h2
              id="boundary-title"
              className="mt-2 text-balance text-2xl font-semibold tracking-tight"
            >
              Boundary / Structure Microscope
            </h2>
            <p className={`mt-2 max-w-3xl text-[11px] leading-5 ${muted}`}>
              One realized event window, nine observation protocols. Locate lost information without
              repairing the estimator or promoting structural claims.
            </p>
          </div>
          <StatusMark status="ABSTAIN" label="DIAGNOSTIC ONLY" />
        </div>
        <dl className={`mt-4 grid gap-px bg-[#25313A] sm:grid-cols-2`}>
          <Datum name="Independent latent realizations" value={String(artifact.worldCount)} />
          <Datum name="Matched protocol fits" value={String(artifact.fitCount)} />
        </dl>
        <div className="mt-4">
          <Select
            label="Observation protocol"
            value={protocol}
            options={artifact.protocols}
            onChange={setProtocol}
          />
        </div>
      </header>
      <section className={`border-b ${line} bg-[#151A10] px-4 py-5 sm:px-5`}>
        <p className="font-mono text-[9px] uppercase tracking-wider text-[#A3B876]">
          Preregistered terminal decision
        </p>
        <h3 className="mt-2 break-words font-mono text-sm font-semibold text-[#C6D99D]">
          {label(artifact.decision.value)}
        </h3>
        <p className={`mt-2 max-w-3xl text-[11px] leading-5 ${muted}`}>
          This warrants at most a future independent investigation. No repair was implemented.
          Remaining oracle error is not proof of intrinsic non-identifiability.
        </p>
        <div className="mt-3 grid gap-4 text-[10px] sm:grid-cols-2">
          <dl className="space-y-2">
            <Pair
              name="Successful near-critical triples"
              value={`${artifact.decision.pairs} / 60`}
            />
            <Pair
              name="Known / oracle RMSE reduction"
              value={`${pct(artifact.decision.reductions.KNOWN)} / ${pct(artifact.decision.reductions.ORACLE)}`}
            />
            <Pair
              name="Oracle improved fraction / mean gain"
              value={`${pct(artifact.decision.fraction)} / ${dec(artifact.decision.gain)}`}
            />
            <Pair name="Boundary predicate" value={String(artifact.decision.boundary)} />
          </dl>
          <dl className="space-y-2">
            {artifact.decision.groups.map((g) => (
              <Pair
                key={g.name}
                name={`Known graph ${g.name.toLowerCase()} condition`}
                value={`n=${g.n} · error ${pct(g.error)}`}
              />
            ))}
            <Pair name="Abstention predicate" value={String(artifact.decision.abstention)} />
            <Pair
              name="Prediction / economics / causality"
              value="NOT TESTED / NOT TESTED / NOT ESTABLISHED"
            />
          </dl>
        </div>
      </section>
      <section className={`grid border-b ${line} xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]`}>
        <Panel title="Matched criticality trajectories">
          <RhoPlot artifact={artifact} protocol={protocol} />
          <p className={`mt-3 text-[10px] leading-5 ${muted}`}>
            Each point pools 20 latent worlds across four information targets. Lines are matched
            comparisons, not independent samples. Initialization at stationary mean plus 128
            half-lives is not an exactly stationary distribution.
          </p>
        </Panel>
        <Panel title={`Topology confusion · ${label(protocol)}`}>
          <Table
            caption="A/B subgraph: rows are truth, columns are inferred topology"
            headers={["True / inferred", ...confusion.labels.map(label)]}
          >
            {confusion.matrix.map((r, i) => (
              <tr key={confusion.labels[i]}>
                <th scope="row" className="p-2 text-left text-[#9AA6AE]">
                  {label(confusion.labels[i])}
                </th>
                {r.map((n, j) => (
                  <td
                    key={j}
                    className={`p-2 ${i === j ? "bg-[#152014] text-[#BCD294]" : "text-[#D5B57B]"}`}
                  >
                    {n}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
          <p className={`mt-3 text-[10px] leading-5 ${muted}`}>
            {confusion.worlds} graph latents. Observed-Z edges remain in the full-graph evidence;
            this matrix scores A/B only.
          </p>
        </Panel>
      </section>
      <section className={`grid border-b ${line} lg:grid-cols-2`}>
        <Panel title={`False-edge evidence · ${categories.total} edges`}>
          <dl className="space-y-3 text-[10px]">
            {categories.counts.map((c) => (
              <Pair key={c.name} name={label(c.name)} value={String(c.count)} />
            ))}
          </dl>
          <p className={`mt-4 text-[10px] leading-5 ${muted}`}>
            Counts use the first applicable category in preregistered order. Multiple compatible
            tags are retained per edge. These are evidence-compatible patterns, not identified
            causes.
          </p>
        </Panel>
        <Panel title="Structural identifiability · truth-required labels">
          <dl className="space-y-3 text-[10px]">
            {states.counts.map((c) => (
              <Pair key={c.name} name={c.name} value={String(c.count)} />
            ))}
          </dl>
          <p className={`mt-4 text-[10px] leading-5 ${muted}`}>
            These mechanical diagnostic states require synthetic truth and are not a deployable
            abstention policy. Process calibration remains separate.
          </p>
        </Panel>
      </section>
      <Panel title="Conditional uncertainty envelope">
        <Select
          label="Coverage stratum"
          value={axis}
          options={[
            "information",
            "rho_eta",
            "event_count",
            "events_per_half_life",
            "half_life",
            "edge_magnitude",
            "condition",
            "all",
          ]}
          onChange={setAxis}
        />
        <div className="mt-4">
          <Table
            caption="Coverage counts only true contributions above .035; rho coverage is separate"
            headers={[
              "Method / stratum",
              "Worlds",
              "Covered / terms",
              "Coverage",
              "Mean width",
              "Rho coverage",
            ]}
          >
            {coverage.map((r) => (
              <tr key={`${r.method}-${r.stratum}`}>
                <th scope="row" className="p-2 text-left font-normal">
                  {methods[r.method]}
                  <span className={`block text-[9px] ${muted}`}>{label(r.stratum)}</span>
                </th>
                <td className="p-2">{r.worlds}</td>
                <td className="p-2">
                  {r.covered} / {r.parameters}
                </td>
                <td className="p-2">{pct(r.coverage)}</td>
                <td className="p-2">{dec(r.meanWidth)}</td>
                <td className="p-2">{pct(r.rhoCoverage)}</td>
              </tr>
            ))}
          </Table>
        </div>
        <p className={`mt-3 max-w-4xl text-[10px] leading-5 ${muted}`}>
          Fixed attribution deliberately retains the historical zero-history responsibility rule
          even for history-aware point fits. Support fractions are not posterior probabilities.
          Parametric refit and profile likelihood exist only for the 20 ZERO audit worlds; other
          combinations are outside the audit, not failures or zero coverage.
        </p>
      </Panel>
      <section className={`grid border-y ${line} lg:grid-cols-2`}>
        <Panel title="Likelihood geometry · inverse-curvature approximation">
          <Table
            caption="Descriptive groups; all primary fits are retained"
            headers={[
              "Condition group",
              "Fits",
              "Graph error",
              "Abs rho error",
              "Optimizer failure",
            ]}
          >
            {geometry.groups.map((g) => (
              <tr key={g.name}>
                <th scope="row" className="p-2 text-left">
                  {g.name}
                </th>
                <td className="p-2">{g.fits}</td>
                <td className="p-2">{pct(g.graphError)}</td>
                <td className="p-2">{dec(g.rhoError)}</td>
                <td className="p-2">{pct(g.failure)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Association with log10 condition">
          <dl className="space-y-3 text-[10px]">
            {geometry.correlations.map((c) => (
              <Pair key={c.name} name={label(c.name)} value={`r=${dec(c.pearson)} · n=${c.n}`} />
            ))}
          </dl>
          <p className={`mt-4 text-[10px] leading-5 ${muted}`}>
            L-BFGS inverse curvature is not observed Fisher information. These associations do not
            establish a causal mechanism.
          </p>
        </Panel>
      </section>
      <Panel title="Matched realization inspector">
        <Select
          label="Preregistered representative"
          value={world.id}
          options={artifact.worlds.map((w) => w.id)}
          onChange={setWorldId}
        />
        <p className={`mt-3 break-words text-[10px] leading-5 ${muted}`}>
          Seed {world.seed} · {world.information} · N={world.counts.reduce((a, b) => a + b, 0)} ·
          true rho {dec(world.rho)} · half-life {dec(world.halfLife)} · horizon {dec(world.horizon)}
        </p>
        <WorldTable world={world} protocol={protocol} />
        <div className={`mt-4 grid gap-4 border-t ${line} pt-4 sm:grid-cols-2`}>
          <Matrix title="True branching G" matrix={world.matrix} />
          <Matrix title={`Fitted G · ${label(protocol)}`} matrix={row.matrix} />
        </div>
        <div className="mt-4">
          <Table
            caption={`${label(protocol)}: every false or missed cross edge in this realization`}
            headers={[
              "Edge",
              "Kind",
              "Truth / fit",
              "Support interval",
              "Support fraction",
              "Ablation ΔLL",
              "Evidence-compatible tags",
            ]}
          >
            {row.edges.map((e) => (
              <tr key={`${e.source}-${e.target}`}>
                <th scope="row" className="p-2 text-left">
                  {channel(e.source)} → {channel(e.target)}
                </th>
                <td className="p-2">
                  {e.kind}
                  {e.reversed ? " / REVERSED" : ""}
                </td>
                <td className="p-2">
                  {dec(e.truth)} / {dec(e.estimate)}
                </td>
                <td className="p-2">
                  [{dec(e.lower)}, {dec(e.upper)}]
                </td>
                <td className="p-2">{pct(e.support)}</td>
                <td className="p-2">{dec(e.ll)}</td>
                <td className="max-w-xs whitespace-normal p-2">
                  {e.tags.length ? e.tags.map(label).join("; ") : "No false-edge tag"}
                </td>
              </tr>
            ))}
          </Table>
          {row.edges.length === 0 ? (
            <p className={`mt-2 text-[10px] ${muted}`}>
              No false or missed cross edges for this protocol and realization.
            </p>
          ) : null}
        </div>
        <p className={`mt-3 text-[10px] leading-5 ${muted}`}>
          Edge ablations hold all other parameters fixed and use the same protocol. They are
          in-sample contributions, not out-of-sample evidence. Available uncertainty:{" "}
          {row.methods
            .filter((m) => m.available)
            .map((m) => methods[m.name])
            .join(", ")}
          .{" "}
          {row.methods.some((m) => !m.available)
            ? `${row.methods
                .filter((m) => !m.available)
                .map((m) => `${methods[m.name]}: ${label(m.reason ?? "UNAVAILABLE")}`)
                .join("; ")}.`
            : null}
        </p>
        <p className={`mt-3 break-all font-mono text-[8px] ${muted}`}>
          Matched latent seal {world.hash}
        </p>
      </Panel>
      <footer className={`space-y-2 border-t ${line} px-4 py-4 font-mono text-[8px] ${muted}`}>
        <p className="break-all">Artifact {artifact.hash}</p>
        <p className="break-all">File bytes {artifact.fileHash}</p>
        <p className="break-all">
          Frozen D0.4.1 parent {artifact.parentHash} · PARTIALLY CHARACTERIZED unchanged
        </p>
        <p>Market eligible: false · Causal eligible: false · No market ingestion · No D0.4.2</p>
      </footer>
    </article>
  );
}

function Select({
  label: name,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid max-w-full gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <label htmlFor={id} className={`font-mono text-[10px] ${muted}`}>
        {name}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`min-w-0 max-w-full border ${line} bg-[#10171B] px-3 py-2 font-mono text-[10px] text-[#D4DDDF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#BCD294]`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </select>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 px-4 py-5 sm:px-5">
      <h3 className="mb-4 text-[12px] font-semibold text-[#D1DADF]">{title}</h3>
      {children}
    </section>
  );
}
function Datum({ name, value }: { name: string; value: string }) {
  return (
    <div className="bg-[#0A1013] px-4 py-4">
      <dt className={`font-mono text-[9px] ${muted}`}>{name}</dt>
      <dd className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
function Pair({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <dt className={muted}>{name}</dt>
      <dd className="font-mono tabular-nums text-[#C8D4D6]">{value}</dd>
    </div>
  );
}
function Table({
  caption,
  headers,
  children,
}: {
  caption: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full border-collapse whitespace-nowrap text-left font-mono text-[10px] tabular-nums">
        <caption className={`mb-3 text-left text-[9px] leading-4 ${muted}`}>{caption}</caption>
        <thead className={`border-b ${line} text-[9px] text-[#8A969F]`}>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="p-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#19252C]">{children}</tbody>
      </table>
    </div>
  );
}
function Matrix({ title, matrix }: { title: string; matrix: number[][] }) {
  return (
    <Table
      caption={`${title} · rows target, columns source`}
      headers={["Target / source", ...matrix.map((_, i) => channel(i))]}
    >
      {matrix.map((r, i) => (
        <tr key={i}>
          <th scope="row" className="p-2">
            {channel(i)}
          </th>
          {r.map((v, j) => (
            <td key={j} className="p-2">
              {dec(v)}
            </td>
          ))}
        </tr>
      ))}
    </Table>
  );
}
function WorldTable({ world, protocol }: { world: BoundaryWorld; protocol: string }) {
  return (
    <div className="mt-4">
      <Table
        caption="Identical retained events across all rows; error gain is ZERO absolute error minus protocol error"
        headers={[
          "Protocol",
          "Fitted rho",
          "Error gain",
          "Support changes",
          "Common-model ΔLL",
          "Condition",
          "Structure",
          "Process",
          "Optimizer",
        ]}
      >
        {world.rows.map((r) => (
          <tr key={r.name} className={r.name === protocol ? "bg-[#152014]" : ""}>
            <th scope="row" className="p-2 text-left">
              {label(r.name)}
            </th>
            <td className="p-2">{dec(r.rho)}</td>
            <td className="p-2">{dec(r.errorGain)}</td>
            <td className="p-2">{r.changed}</td>
            <td className="p-2">{dec(r.likelihoodDelta)}</td>
            <td className="p-2">
              {r.condition == null ? "Unavailable" : r.condition.toExponential(2)}
            </td>
            <td className="p-2">{r.state}</td>
            <td className="p-2">{r.calibrated ? "CALIBRATED" : "UNRESOLVED"}</td>
            <td className="p-2">{r.success ? "CONVERGED" : "FAILED"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
function RhoPlot({ artifact, protocol }: { artifact: BoundaryArtifact; protocol: string }) {
  const protocols = [...new Set(["ZERO", "KNOWN", "ORACLE", protocol])];
  const colors = ["#ABB6BF", "#B9D47A", "#DCB760", "#799C9C"];
  const x = (v: number) => 40 + ((v - 0.7) / 0.29) * 350;
  const y = (v: number) => 220 - v * 190;
  return (
    <>
      <svg
        viewBox="0 0 420 255"
        className="block w-full"
        role="img"
        aria-label="Mean fitted spectral radius across matched boundary protocols"
      >
        <title>Matched criticality trajectories</title>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1="40" x2="390" y1={y(t)} y2={y(t)} stroke="#263139" />
            <text x="8" y={y(t) + 3} fill="#8A969F" fontSize="10">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        <path
          d={`M${x(0.7)},${y(0.7)} L${x(0.99)},${y(0.99)}`}
          stroke="#56646D"
          strokeDasharray="4 4"
          fill="none"
        />
        {protocols.map((name, i) => {
          const points = artifact.curves.filter((p) => p.protocol === name);
          return (
            <g key={name}>
              <path
                d={points
                  .map((p, j) => `${j ? "L" : "M"}${x(p.truth).toFixed(2)},${y(p.mean).toFixed(2)}`)
                  .join(" ")}
                stroke={colors[i]}
                fill="none"
                strokeWidth="2"
              />
              {points.map((p) => (
                <circle key={p.truth} cx={x(p.truth)} cy={y(p.mean)} r="3" fill={colors[i]}>
                  <title>
                    {name} · truth {p.truth} · mean {dec(p.mean)} · n={p.n} · RMSE {dec(p.rmse)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
        {artifact.curves
          .filter((p) => p.protocol === "ZERO")
          .map((p) => (
            <text
              key={p.truth}
              x={x(p.truth)}
              y="246"
              textAnchor="middle"
              fill="#8A969F"
              fontSize="10"
            >
              {p.truth}
            </text>
          ))}
      </svg>
      <div className="flex flex-wrap gap-4 font-mono text-[9px]">
        {protocols.map((name, i) => (
          <span key={name} className="inline-flex items-center gap-2">
            <svg width="14" height="4" aria-hidden="true">
              <path d="M0,2H14" stroke={colors[i]} strokeWidth="2" />
            </svg>
            {label(name)}
          </span>
        ))}
      </div>
    </>
  );
}

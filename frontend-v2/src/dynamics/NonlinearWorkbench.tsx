import { useState } from "react";
import type {
  NonlinearFieldPoint,
  NonlinearLabPayload,
  NonlinearModelCode,
} from "@/dynamics/nonlinear-contracts";
import { StatusMark } from "@/forge/shared/SurfacePrimitives";

const MODEL_ORDER: NonlinearModelCode[] = ["M0", "M1", "M2", "M3"];

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function numeric(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function pathFor(
  points: NonlinearFieldPoint[],
  width: number,
  height: number,
  accessor: (point: NonlinearFieldPoint) => number,
  domain?: [number, number],
): string {
  const values = points.map(accessor);
  const low = domain?.[0] ?? Math.min(...values);
  const high = domain?.[1] ?? Math.max(...values);
  const span = Math.max(high - low, 1e-9);
  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((accessor(point) - low) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function bandFor(
  points: NonlinearFieldPoint[],
  width: number,
  height: number,
  lower: (point: NonlinearFieldPoint) => number,
  upper: (point: NonlinearFieldPoint) => number,
): string {
  const values = points.flatMap((point) => [lower(point), upper(point)]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, 1e-9);
  const project = (value: number) => height - ((value - low) / span) * height;
  const top = points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    return `${x.toFixed(2)},${project(upper(point)).toFixed(2)}`;
  });
  const bottom = [...points].reverse().map((point, reverseIndex) => {
    const index = points.length - 1 - reverseIndex;
    const x = (index / Math.max(points.length - 1, 1)) * width;
    return `${x.toFixed(2)},${project(lower(point)).toFixed(2)}`;
  });
  return [...top, ...bottom].join(" ");
}

function FieldPlot({
  title,
  formula,
  points,
  value,
  lower,
  upper,
  tone,
  zero = false,
}: {
  title: string;
  formula: string;
  points: NonlinearFieldPoint[];
  value: (point: NonlinearFieldPoint) => number;
  lower: (point: NonlinearFieldPoint) => number;
  upper: (point: NonlinearFieldPoint) => number;
  tone: string;
  zero?: boolean;
}) {
  const width = 420;
  const height = 176;
  const values = points.flatMap((point) => [lower(point), upper(point), value(point)]);
  const low = Math.min(...values, zero ? 0 : Number.POSITIVE_INFINITY);
  const high = Math.max(...values, zero ? 0 : Number.NEGATIVE_INFINITY);
  const span = Math.max(high - low, 1e-9);
  const zeroY = height - ((0 - low) / span) * height;
  const states = points.map((point) => point.state);

  return (
    <article className="border border-[#27343B] bg-[#080C0F]">
      <header className="flex items-start justify-between gap-3 border-b border-[#27343B] px-3 py-2.5">
        <div>
          <h3 className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#D7DFE2]">
            {title}
          </h3>
          <p className="mt-1 font-mono text-[8px] text-[#718087]">{formula}</p>
        </div>
        <span className="font-mono text-[7px] uppercase text-[#56636A]">90% boot band</span>
      </header>
      <div className="p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-48 w-full"
          role="img"
          aria-label={`${title} across the supported state grid`}
        >
          <rect width={width} height={height} fill="#070A0C" />
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1="0"
              x2={width}
              y1={height * fraction}
              y2={height * fraction}
              stroke="#172127"
              strokeWidth="1"
            />
          ))}
          {zero && zeroY >= 0 && zeroY <= height ? (
            <line x1="0" x2={width} y1={zeroY} y2={zeroY} stroke="#58656C" strokeDasharray="4 4" />
          ) : null}
          <polygon
            points={bandFor(points, width, height, lower, upper)}
            fill={tone}
            fillOpacity="0.12"
          />
          <path
            d={pathFor(points, width, height, value, [low, high])}
            fill="none"
            stroke={tone}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="flex justify-between border-t border-[#172127] pt-2 font-mono text-[8px] text-[#59666D]">
          <span>{numeric(Math.min(...states), 3)}</span>
          <span>STATE / SUPPORTED RANGE</span>
          <span>{numeric(Math.max(...states), 3)}</span>
        </div>
      </div>
    </article>
  );
}

function CriterionGrid({
  code,
  promotion,
}: {
  code: "M2" | "M3";
  promotion: NonlinearLabPayload["experiment"]["promotion"]["M2"];
}) {
  return (
    <article className="border border-[#27343B] bg-[#090D10]">
      <header className="flex items-center justify-between border-b border-[#27343B] px-3 py-2.5">
        <div className="font-mono text-[9px] font-semibold text-[#D9E0E3]">
          {code} PROMOTION GATE
        </div>
        <StatusMark
          status={promotion.verdict === "PROMOTE" ? "PASS" : "FAIL"}
          label={promotion.verdict}
        />
      </header>
      <dl className="divide-y divide-[#182228]">
        {Object.entries(promotion.criteria).map(([criterion, passed]) => (
          <div key={criterion} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
            <dt className="font-mono text-[8px] uppercase text-[#748087]">
              {criterion.replaceAll("_", " ")}
            </dt>
            <dd className={passed ? "text-[#9FCB72]" : "text-[#D56A63]"}>
              {passed ? "PASS" : "FAIL"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-3 gap-px border-t border-[#27343B] bg-[#27343B]">
        <GateMetric label="NLL / OU" value={numeric(promotion.adjustedNllGainOverOu)} />
        <GateMetric label="BOOT DOM" value={pct(promotion.pairedBootstrapDominanceOverOu)} />
        <GateMetric label="g MAX/MIN" value={numeric(promotion.diffusionMaxMinRatio, 2)} />
      </div>
    </article>
  );
}

function GateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#080C0F] px-2 py-2.5">
      <div className="font-mono text-[7px] uppercase text-[#5D6A71]">{label}</div>
      <div className="mt-1 font-mono text-[11px] tabular-nums text-[#CDD5D9]">{value}</div>
    </div>
  );
}

export function NonlinearWorkbench({ payload }: { payload: NonlinearLabPayload }) {
  const { experiment, certification } = payload;
  const [activeModel, setActiveModel] = useState<NonlinearModelCode>(
    experiment.verdicts.selectedModel,
  );
  const active = experiment.models.find((model) => model.code === activeModel);
  const field = experiment.fields[activeModel];
  const certifiedPoints = field.fixedPoints.filter((point) => point.certifiedForDisplay);

  return (
    <section className="mt-3 border border-[#334149] bg-[#070A0C]" aria-labelledby="d03-title">
      <header className="grid border-b border-[#334149] xl:grid-cols-[1fr_auto]">
        <div className="px-4 py-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#86A95D]">
            Dynamics Lab / D0.3 / nonlinear stochastic dynamics
          </div>
          <h2
            id="d03-title"
            className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#E0E6E8]"
          >
            Earn the nonlinear term.
          </h2>
          <p className="mt-2 max-w-4xl text-[11px] leading-5 text-[#849098]">
            {experiment.decisionSummary}
          </p>
        </div>
        <div className="grid min-w-[320px] grid-cols-2 gap-px bg-[#334149]">
          <div className="bg-[#0B1013] px-4 py-3">
            <div className="font-mono text-[7px] uppercase text-[#647178]">Dynamics verdict</div>
            <div
              className={`mt-2 font-mono text-sm font-semibold ${
                experiment.verdicts.nonlinearDynamics === "ACCEPT"
                  ? "text-[#9FCB72]"
                  : "text-[#D56A63]"
              }`}
            >
              {experiment.verdicts.nonlinearDynamics}
            </div>
          </div>
          <div className="bg-[#0B1013] px-4 py-3">
            <div className="font-mono text-[7px] uppercase text-[#647178]">Market claim</div>
            <div className="mt-2 font-mono text-sm font-semibold text-[#D7AF58]">
              {experiment.verdicts.marketClaim}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-px border-b border-[#334149] bg-[#334149] md:grid-cols-2 xl:grid-cols-6">
        <GateMetric label="PARENT" value={experiment.parent.milestone} />
        <GateMetric label="PAIR" value={experiment.experiment.pairId} />
        <GateMetric label="FUNNEL" value={experiment.parent.candidateCompression} />
        <GateMetric
          label="SPLIT"
          value={`${experiment.split.trainObservations}/${experiment.split.sealedHoldoutObservations}`}
        />
        <GateMetric label="Δt STATES" value={String(experiment.world.uniqueDeltaTimes)} />
        <GateMetric label="SELECTED" value={experiment.verdicts.selectedModel} />
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="grid grid-cols-4 border border-[#27343B] bg-[#27343B]">
            {MODEL_ORDER.map((code) => {
              const model = experiment.models.find((item) => item.code === code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActiveModel(code)}
                  className={`min-w-0 bg-[#090D10] px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#9FCB72] ${
                    activeModel === code ? "bg-[#131A14] text-[#B8D88F]" : "text-[#87939A]"
                  }`}
                  aria-pressed={activeModel === code}
                >
                  <span className="block font-mono text-[10px] font-semibold">{code}</span>
                  <span className="mt-1 block truncate text-[9px]">{model?.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid gap-3 2xl:grid-cols-3">
            <FieldPlot
              title="DRIFT FIELD"
              formula="f(x) / observable per day"
              points={field.points}
              value={(point) => point.drift}
              lower={(point) => point.driftLower90}
              upper={(point) => point.driftUpper90}
              tone="#9FCB72"
              zero
            />
            <FieldPlot
              title="DIFFUSION FIELD"
              formula="g(x) > 0 / observable per √day"
              points={field.points}
              value={(point) => point.diffusion}
              lower={(point) => point.diffusionLower90}
              upper={(point) => point.diffusionUpper90}
              tone="#70AFC5"
            />
            <FieldPlot
              title="EFFECTIVE POTENTIAL"
              formula="Ueff = 2log g − ∫2f/g²"
              points={field.points}
              value={(point) => point.effectivePotential}
              lower={(point) => point.effectivePotentialLower90}
              upper={(point) => point.effectivePotentialUpper90}
              tone="#D2AC57"
            />
          </div>

          <div className="mt-3 overflow-x-auto border border-[#27343B]">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="bg-[#0A0E11] font-mono text-[8px] uppercase text-[#65737A]">
                <tr className="border-b border-[#27343B]">
                  <th className="px-3 py-2.5 font-medium">Model</th>
                  <th className="px-3 py-2.5 text-right font-medium">EDF</th>
                  <th className="px-3 py-2.5 text-right font-medium">NLL + penalty ↓</th>
                  <th className="px-3 py-2.5 text-right font-medium">RMSE ↓</th>
                  <th className="px-3 py-2.5 text-right font-medium">90% cover</th>
                  <th className="px-3 py-2.5 text-right font-medium">Scientific</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182228]">
                {experiment.models.map((model) => (
                  <tr
                    key={model.code}
                    className={
                      model.code === experiment.verdicts.selectedModel
                        ? "bg-[#11180F]"
                        : "bg-[#080C0F]"
                    }
                  >
                    <th className="px-3 py-2.5">
                      <div className="font-mono text-[10px] text-[#D8E0E3]">{model.code}</div>
                      <div className="mt-1 text-[9px] text-[#6F7D84]">{model.label}</div>
                    </th>
                    <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#AAB4B9]">
                      {numeric(model.effectiveParameters, 2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#D5DDE0]">
                      {numeric(model.adjustedHoldoutNll)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#AAB4B9]">
                      {numeric(model.holdoutScore.rmse)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#AAB4B9]">
                      {pct(model.holdoutScore.coverage90)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <StatusMark
                        status={model.scientificVerdict === "ACCEPT" ? "PASS" : "FAIL"}
                        label={model.scientificVerdict}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-3">
          <article className="border border-[#27343B] bg-[#090D10]">
            <header className="border-b border-[#27343B] px-3 py-2.5 font-mono text-[9px] font-semibold uppercase text-[#D6DEE1]">
              Active field / {activeModel}
            </header>
            <dl className="divide-y divide-[#182228]">
              <div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5">
                <dt className="font-mono text-[8px] uppercase text-[#6B787F]">
                  Bootstrap stability
                </dt>
                <dd className="font-mono text-[10px] text-[#CDD6DA]">
                  {pct(field.bootstrap.fieldStability)}
                </dd>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5">
                <dt className="font-mono text-[8px] uppercase text-[#6B787F]">
                  Certified fixed points
                </dt>
                <dd className="font-mono text-[10px] text-[#CDD6DA]">{certifiedPoints.length}</dd>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5">
                <dt className="font-mono text-[8px] uppercase text-[#6B787F]">Bootstrap fits</dt>
                <dd className="font-mono text-[10px] text-[#CDD6DA]">
                  {field.bootstrap.successfulRepetitions}/{field.bootstrap.requestedRepetitions}
                </dd>
              </div>
            </dl>
            <div className="border-t border-[#27343B] px-3 py-3">
              <div className="font-mono text-[7px] uppercase text-[#5F6D74]">Equation</div>
              <p className="mt-2 font-mono text-[9px] leading-4 text-[#9DA8AD]">
                {active?.equation}
              </p>
            </div>
          </article>

          <article className="border border-[#27343B] bg-[#090D10]">
            <header className="border-b border-[#27343B] px-3 py-2.5 font-mono text-[9px] font-semibold uppercase text-[#D6DEE1]">
              Frozen lineage
            </header>
            <dl className="divide-y divide-[#182228]">
              <LineageRow
                label="Internal SHA"
                value={experiment.parent.artifactHash.slice(0, 16)}
              />
              <LineageRow label="Byte SHA" value={experiment.parent.fileSha256.slice(0, 16)} />
              <LineageRow label="World SHA" value={experiment.parent.worldHash.slice(0, 16)} />
              <LineageRow
                label="Rediscovery"
                value={experiment.parent.discoveryRerun ? "YES" : "NO"}
                warn={experiment.parent.discoveryRerun}
              />
              <LineageRow
                label="Integrity"
                value={experiment.parent.integrityValid ? "VALID" : "FAILED"}
                warn={!experiment.parent.integrityValid}
              />
            </dl>
          </article>

          <article className="border border-[#27343B] bg-[#090D10]">
            <header className="border-b border-[#27343B] px-3 py-2.5 font-mono text-[9px] font-semibold uppercase text-[#D6DEE1]">
              Reality ladder
            </header>
            <ul className="divide-y divide-[#182228]">
              {experiment.executionReality.map((stage) => (
                <li key={stage.stage} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-[9px] text-[#7A878E]">{stage.stage}</span>
                  <span
                    className={`font-mono text-[8px] ${
                      stage.status === "PASS" ? "text-[#9FCB72]" : "text-[#D2AC57]"
                    }`}
                  >
                    {stage.status}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </div>

      <div className="grid gap-3 border-t border-[#334149] p-3 xl:grid-cols-2">
        <CriterionGrid code="M2" promotion={experiment.promotion.M2} />
        <CriterionGrid code="M3" promotion={experiment.promotion.M3} />
      </div>
      <StabilityMonitor monitor={experiment.dynamicalStabilityMonitor} />

      <div className="grid gap-px border-t border-[#334149] bg-[#334149] sm:grid-cols-2 xl:grid-cols-6">
        <ControlMetric
          label="Theory accuracy"
          value={pct(certification.metrics.theoryClassAccuracy)}
        />
        <ControlMetric
          label="False nonlinear"
          value={pct(certification.metrics.falseNonlinearDiscoveryRate)}
        />
        <ControlMetric
          label="Non-discovery"
          value={pct(certification.metrics.falseNonlinearNonDiscoveryRate)}
        />
        <ControlMetric
          label="False basin"
          value={pct(certification.metrics.falseBasinDiscoveryRate)}
        />
        <ControlMetric
          label="OOS dominance"
          value={pct(certification.metrics.nonlinearOosDominanceRate)}
        />
        <ControlMetric
          label="Econ abstention"
          value={pct(certification.metrics.economicAbstentionRate)}
        />
      </div>

      <footer className="grid gap-3 border-t border-[#334149] px-4 py-3 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#647178]">
            Scope lock
          </div>
          <p className="mt-1 text-[10px] text-[#818D93]">
            Excluded: {experiment.experiment.excludedScope.join(" · ")}. {experiment.theory.warning}
          </p>
        </div>
        <div className="font-mono text-[8px] uppercase text-[#56636A]">
          artifact {experiment.artifactHash.slice(0, 16)}…
        </div>
      </footer>
    </section>
  );
}

function StabilityMonitor({
  monitor,
}: {
  monitor: NonlinearLabPayload["experiment"]["dynamicalStabilityMonitor"];
}) {
  return (
    <section className="border-t border-[#334149] bg-[#080C0F]">
      <header className="grid border-b border-[#27343B] lg:grid-cols-[1fr_auto]">
        <div className="px-4 py-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#77935B]">
            {monitor.name} / expanding PIT windows
          </div>
          <p className="mt-1 text-[10px] text-[#78858C]">{monitor.claimBoundary}</p>
        </div>
        <div className="flex items-center gap-4 border-t border-[#27343B] px-4 py-3 lg:border-l lg:border-t-0">
          <div>
            <div className="font-mono text-[7px] uppercase text-[#59666D]">Tracked model</div>
            <div className="mt-1 font-mono text-[11px] text-[#D3DCDF]">{monitor.model}</div>
          </div>
          <StatusMark
            status={monitor.trend.status === "STABLE" ? "PASS" : "INFO"}
            label={monitor.trend.status}
          />
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead className="bg-[#090D10] font-mono text-[8px] uppercase text-[#637078]">
            <tr className="border-b border-[#27343B]">
              <th className="px-3 py-2.5 font-medium" scope="col">
                PIT window
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Stable states
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Root x
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Restoring −f′
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Barrier ΔU
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Exit p / horizon
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Bootstrap
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#182228]">
            {monitor.windows.map((window) => {
              const basin = window.basins[0];
              return (
                <tr key={window.asOf}>
                  <th className="px-3 py-2.5" scope="row">
                    <div className="font-mono text-[9px] text-[#B8C2C7]">
                      {new Date(window.asOf).toLocaleDateString()}
                    </div>
                    <div className="mt-1 font-mono text-[7px] uppercase text-[#59666D]">
                      n={window.observations} · end {window.endIndex}
                    </div>
                  </th>
                  <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#C9D3D7]">
                    {window.certifiedStableStates}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#C9D3D7]">
                    {basin ? numeric(basin.state, 4) : "WITHHELD"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#9FCB72]">
                    {basin ? numeric(basin.restoringStrength, 3) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#D2AC57]">
                    {basin ? numeric(basin.barrierHeight, 3) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#8DB9C8]">
                    {basin
                      ? `${pct(basin.oneStepExitProbability)} / ${numeric(basin.horizon, 2)}d`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#AEB9BE]">
                    {basin ? pct(basin.bootstrapStability) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="grid gap-px border-t border-[#27343B] bg-[#27343B] sm:grid-cols-3">
        <GateMetric label="STATE Δ" value={String(monitor.trend.stateCountChange)} />
        <GateMetric
          label="RESTORING"
          value={monitor.trend.restoringStrengthWeakening ? "WEAKENING" : "STABLE"}
        />
        <GateMetric
          label="BARRIER"
          value={monitor.trend.barrierShrinking ? "SHRINKING" : "STABLE"}
        />
      </footer>
    </section>
  );
}
function LineageRow({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5">
      <dt className="font-mono text-[8px] uppercase text-[#68757C]">{label}</dt>
      <dd className={`font-mono text-[9px] ${warn ? "text-[#D56A63]" : "text-[#B7C1C6]"}`}>
        {value}
      </dd>
    </div>
  );
}

function ControlMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#090D10] px-3 py-3">
      <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#637078]">{label}</div>
      <div className="mt-1 font-mono text-base font-semibold tabular-nums text-[#D4DCDF]">
        {value}
      </div>
    </div>
  );
}

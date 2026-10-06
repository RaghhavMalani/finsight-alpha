import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { RegimeDashboard } from "@/dynamics/MarketRegimeLab";
import { SnapshotLabelProvider, useSnapshotLabel } from "@/dynamics/snapshot-label";
import {
  fetchProductCatalog,
  fetchProductComparison,
  fetchProductSnapshot,
  type ProductAsset,
  type ProductComparison,
  type ProductSnapshot,
} from "@/dynamics/product-contracts";
import { LoadingState, StatusMark, UnavailableState } from "@/forge/shared/SurfacePrimitives";

const field = "min-w-0 w-full border border-[#37454F] bg-[#11191E] p-2 text-[#DAE1E5]";
const button =
  "border border-[#566572] bg-[#11191E] px-3 py-2 text-[#DAE1E5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFB000] disabled:opacity-40";
const fmt = (v: number | null | undefined) => (v == null ? "UNAVAILABLE" : v.toFixed(4));
const local = (v: string) => (v ? new Date(v).toISOString().slice(0, 19) : "");
const iso = (v: string) =>
  v && Number.isFinite(Date.parse(v + "Z")) ? new Date(v + "Z").toISOString() : "";
type Mode = "NOW" | "REPLAY" | "COMPARE";

export function RegimeProduct() {
  const catalog = useQuery({
    queryKey: ["regime-product", "assets"],
    queryFn: fetchProductCatalog,
    staleTime: 30_000,
    retry: false,
  });
  const [selection, setSelection] = useState("SPY:real");
  const entry = catalog.data?.assets.find((a) => `${a.asset}:${a.source}` === selection);
  return (
    <article
      className="min-w-0 border border-[#25313A] bg-[#080C0F] text-[#DBE2E7]"
      aria-label="Market Regime Intelligence v1"
    >
      <header className="space-y-3 border-b border-[#25313A] p-4 sm:p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-[#A8B7C2]">
              PRODUCT V1 / PUBLICATION-AWARE RESEARCH
            </p>
            <h2 className="mt-2 text-xl font-semibold">Market Regime Intelligence</h2>
          </div>
          <StatusMark status="ABSTAIN" label="NO MARKET / CAUSAL / ALPHA CLAIM" />
        </div>
        <p className="max-w-3xl text-xs leading-6 text-[#9DABB5]">
          Inspect the latest installed evidence, replay inputs admitted at a historical cutoff, or
          compare two complete snapshots. Analytics remain frozen at D0.4.2. This is not a live
          execution terminal.
        </p>
        <label className="grid max-w-lg gap-2 text-xs">
          Asset and evidence source
          <select
            aria-label="Product asset and source"
            className={field}
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            {(
              catalog.data?.assets ??
              ["SPY", "QQQ", "IWM"].map((asset) => ({
                asset,
                source: "real",
                scope: "REAL_PIT",
                available: false,
                evidence_mode: "UNAVAILABLE",
                coverage: "UNAVAILABLE",
              }))
            ).map((a) => (
              <option key={`${a.asset}:${a.source}`} value={`${a.asset}:${a.source}`}>
                {a.asset} /{" "}
                {a.scope === "SYNTHETIC"
                  ? `${a.source} — SYNTHETIC, not market history`
                  : `${a.evidence_mode ?? "SOURCE_DEFINED"} / ${a.coverage ?? "source definitions"}`}
                {a.available ? "" : " — UNAVAILABLE"}
              </option>
            ))}
          </select>
        </label>
        {entry?.evidence_mode === "CONSERVATIVE_MARKET_TIME" || entry?.evidence_mode === "MIXED" ? (
          <p className="max-w-3xl border border-[#776040] p-3 text-xs leading-5 text-[#E6CFA4]">
            Historical market availability reconstructed conservatively; exact historical receive
            timestamp unavailable. Coverage: IEX ONLY. Not consolidated US market volume.
          </p>
        ) : null}
        {entry?.scope === "SYNTHETIC" ? (
          <p className="border border-[#79612E] bg-[#1C170C] p-3 text-xs text-[#F0DCA1]">
            SYNTHETIC DEMO — NOT SPY, QQQ OR IWM. No real-market evidence is being displayed.
          </p>
        ) : null}
        <button className={`${button} text-xs`} onClick={() => void catalog.refetch()}>
          Refresh installed input catalog
        </button>
      </header>
      {catalog.isPending ? (
        <LoadingState label="Publication-evidenced input catalog" />
      ) : catalog.error ? (
        <UnavailableState
          title="Product catalog failed closed"
          error={catalog.error}
          retry={() => void catalog.refetch()}
        />
      ) : entry ? (
        <ProductWorkspace key={selection} entry={entry} />
      ) : (
        <p className="p-4">UNAVAILABLE: asset not in the supported universe.</p>
      )}
      <details className="m-4 border border-[#34434D] p-3 text-xs">
        <summary className="cursor-pointer text-[#C2CDD5]">Data activation requirements</summary>
        <ul className="mt-3 space-y-2 text-[#A8B6BF]">
          {catalog.data?.provider_requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-3 leading-5">
          Operator imports only. Missing streams are never fabricated or silently replaced by
          synthetic data. Publication days from ALFRED enter conservatively at the following New
          York midnight. Capture as_of is provenance, not historical publication time.
        </p>
      </details>
    </article>
  );
}

function ProductWorkspace({ entry }: { entry: ProductAsset }) {
  const [mode, setMode] = useState<Mode>("NOW");
  const last = entry.cutoffs.at(-1) ?? "",
    first = entry.cutoffs[Math.max(0, entry.cutoffs.length - 61)] ?? "";
  const [left, setLeft] = useState(first),
    [right, setRight] = useState(last);
  const [leftDraft, setLeftDraft] = useState(local(first)),
    [rightDraft, setRightDraft] = useState(local(last));
  const [index, setIndex] = useState(Math.max(0, entry.cutoffs.length - 1));
  const snapshot = useQuery({
    queryKey: ["regime-product", entry.asset, entry.source, mode === "NOW" ? "latest" : right],
    queryFn: () =>
      fetchProductSnapshot(entry.asset, entry.source, mode === "NOW" ? undefined : right),
    enabled: entry.available && mode !== "COMPARE" && (mode === "NOW" || !!right),
    staleTime: entry.source === "real" ? 30_000 : Infinity,
    retry: false,
  });
  const comparison = useQuery({
    queryKey: ["regime-product", "compare", entry.asset, entry.source, left, right],
    queryFn: () => fetchProductComparison(entry.asset, entry.source, left, right),
    enabled: entry.available && mode === "COMPARE" && !!left && !!right,
    staleTime: entry.source === "real" ? 30_000 : Infinity,
    retry: false,
  });
  const replay = (cutoff: string) => {
    setRight(cutoff);
    setRightDraft(local(cutoff));
    setMode("REPLAY");
  };
  const active = mode === "COMPARE" ? comparison : snapshot;
  return (
    <div>
      <div className="space-y-4 border-b border-[#25313A] p-4 text-xs">
        <div role="group" aria-label="Regime product mode" className="flex flex-wrap gap-2">
          {(["NOW", "REPLAY", "COMPARE"] as Mode[]).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              className={`${button} ${mode === m ? "!border-[#CCAA58] !text-[#F0DCA1]" : ""}`}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === "NOW" ? (
          <p className="text-[#A6B4BD]">
            NOW = latest admitted evidence in the installed dataset, not wall-clock market coverage.{" "}
            <button
              className={`${button} ml-2 mt-2`}
              disabled={!entry.available}
              onClick={() => void snapshot.refetch()}
            >
              Refresh snapshot
            </button>
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mode === "COMPARE" ? (
              <label className="grid gap-2">
                Snapshot A cutoff — UTC
                <input
                  type="datetime-local"
                  step="1"
                  aria-label="Snapshot A cutoff UTC"
                  className={field}
                  value={leftDraft}
                  onChange={(e) => setLeftDraft(e.target.value)}
                />
              </label>
            ) : null}
            <label className="grid gap-2">
              {mode === "COMPARE" ? "Snapshot B" : "Replay"} cutoff — UTC
              <input
                type="datetime-local"
                step="1"
                aria-label="Snapshot B cutoff UTC"
                className={field}
                value={rightDraft}
                onChange={(e) => setRightDraft(e.target.value)}
              />
            </label>
            <button
              className={`${button} self-end sm:col-span-2`}
              disabled={
                !entry.available || !iso(rightDraft) || (mode === "COMPARE" && !iso(leftDraft))
              }
              onClick={() => {
                setLeft(iso(leftDraft));
                setRight(iso(rightDraft));
              }}
            >
              Apply historical cutoff{mode === "COMPARE" ? "s" : ""}
            </button>
          </div>
        )}
        {mode === "REPLAY" && entry.cutoffs.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2">
              Published price session
              <select
                aria-label="Replay publication cutoff"
                className={field}
                value={entry.cutoffs.includes(right) ? right : ""}
                onChange={(e) => e.target.value && replay(e.target.value)}
              >
                <option value="">Custom historical cutoff</option>
                {entry.cutoffs.map((c) => (
                  <option key={c} value={c}>
                    {c.slice(0, 19)} UTC
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              Replay scrubber — {entry.cutoffs[index]?.slice(0, 10)}
              <input
                aria-label="Replay session scrubber"
                type="range"
                min="0"
                max={entry.cutoffs.length - 1}
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
              />
              <button className={button} onClick={() => replay(entry.cutoffs[index])}>
                Replay selected session
              </button>
            </label>
          </div>
        ) : null}
      </div>
      {!entry.available ? (
        <section className="m-4 border border-[#776040] p-4" role="status">
          <h3 className="text-sm text-[#E6CFA4]">{entry.asset} real PIT input UNAVAILABLE</h3>
          <p className="mt-2 text-xs leading-6 text-[#B9C3CA]">
            {entry.reason}. Install a legitimate versioned export or configured provider adapter
            before viewing this asset. Publication times cannot be inferred from a download.
            Synthetic demos are separately labeled choices, not a fallback.
          </p>
        </section>
      ) : active.isFetching ? (
        <LoadingState
          label={
            mode === "COMPARE"
              ? "Two historical PIT snapshots"
              : "Publication-aware regime snapshot"
          }
        />
      ) : active.error ? (
        <UnavailableState
          title="Snapshot failed closed"
          error={active.error}
          retry={() => void active.refetch()}
        />
      ) : mode === "COMPARE" && comparison.data ? (
        <CompareView value={comparison.data} />
      ) : snapshot.data ? (
        <SnapshotView value={snapshot.data} replay={replay} />
      ) : (
        <p className="p-4 text-xs">Choose valid timezone-aware historical cutoffs.</p>
      )}
    </div>
  );
}

function Provenance({ value }: { value: ProductSnapshot }) {
  const label = useSnapshotLabel("Snapshot provenance");
  return (
    <section
      className="m-3 space-y-3 border border-[#344650] bg-[#0B1419] p-3 text-xs sm:m-4"
      aria-label={label}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <strong>
          {value.asset} / {value.scope}
        </strong>
        <span>
          {value.status} / {value.attribution_target.replaceAll("_", " ")}
        </span>
      </div>
      <dl className="grid gap-2 break-all font-mono text-[10px] text-[#B0C0CB]">
        {[
          ["REQUESTED AS OF", value.as_of],
          ["STATE AT", value.state_at ?? "UNAVAILABLE"],
          ["INPUT", value.input_hash],
          ["SNAPSHOT", value.snapshot_hash],
          ["ANALYTICS", value.cache_identity.analytics_version],
        ].map(([name, text]) => (
          <div key={name}>
            <dt className="inline">{name} </dt>
            <dd className="inline">{text}</dd>
          </div>
        ))}
      </dl>
      <p className="leading-5 text-[#A6B8C4]">{value.note}</p>
      {value.market_evidence ? (
        <div className="space-y-2 border border-[#776040] p-3 text-[#E6CFA4]" role="note">
          <strong className="break-words">
            {value.market_evidence.mode} / {value.market_evidence.coverage}
          </strong>
          <p className="leading-5">{value.market_evidence.disclosure}</p>
        </div>
      ) : null}
      <details>
        <summary className="cursor-pointer text-[#DFE5E9]">
          Sources, publication evidence, revisions and quality
        </summary>
        <div className="mt-3 space-y-3">
          {value.provenance.map((p) => (
            <div key={p.stream} className="border-t border-[#293A45] pt-2">
              <strong>
                {p.stream.toUpperCase()} — {p.status} / {p.observations} observations
              </strong>
              <p className="mt-1 break-words leading-5">
                Source: {p.sources.join("; ") || "UNAVAILABLE"}
                <br />
                Published through: {p.available_through ?? "UNAVAILABLE"}
                <br />
                Source capture as_of: {p.source_as_of ?? "UNAVAILABLE"}
                <br />
                Quality: {p.quality.join("; ") || "UNAVAILABLE"}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer">
                  {p.revisions.length} revisions / publication references
                </summary>
                <p className="mt-2 max-h-40 overflow-auto break-all leading-5">
                  {p.revisions.join("; ")}
                  <br />
                  {p.publication_evidence.join("; ")}
                </p>
              </details>
            </div>
          ))}
          <dl className="space-y-2">
            {Object.entries(value.definitions).map(([key, definition]) => (
              <div key={key}>
                <dt className="font-semibold">{key}</dt>
                <dd className="mt-1 leading-5">{definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
      {value.factor_library?.length ? (
        <details>
          <summary className="cursor-pointer text-[#DFE5E9]">French factor release library</summary>
          <p className="mt-2 leading-5 text-[#B0C0CB]">
            Archive vintages and current captures are separate. Monthly archives are not daily
            regressors. QUAL, VOL and LIQ remain unavailable; RMW and CMA are separate FF5 factors.
          </p>
          {value.factor_library.map((f) => (
            <div
              key={`${f.family}:${f.frequency}`}
              className="mt-3 space-y-1 border-t border-[#293A45] pt-2"
            >
              <strong>
                {f.family} / {f.frequency} / {f.observations} source observations
              </strong>
              <p className="break-words leading-5">
                {f.quality.join("; ")} · {f.factors.join(" / ")}
              </p>
              <p className="break-all">Available through {f.available_through}</p>
              <p className="leading-5">{f.note}</p>
            </div>
          ))}
        </details>
      ) : null}
    </section>
  );
}

function SnapshotView({
  value,
  replay,
  labelPrefix = "",
}: {
  value: ProductSnapshot;
  replay?: (cutoff: string) => void;
  labelPrefix?: string;
}) {
  return (
    <SnapshotLabelProvider value={labelPrefix}>
      <div>
        <Provenance value={value} />
        {value.analysis ? (
          <RegimeDashboard key={value.snapshot_hash} artifact={value.analysis} />
        ) : (
          <p className="p-4 text-xs text-[#E6CFA4]">{value.reason}</p>
        )}
        {replay && value.analysis ? <Transitions value={value} replay={replay} /> : null}
      </div>
    </SnapshotLabelProvider>
  );
}

function CompareView({ value }: { value: ProductComparison }) {
  const a = value.left.analysis?.current,
    b = value.right.analysis?.current;
  const vectorNames = {
    V: "Volatility",
    L: "Liquidity",
    M: "Momentum",
    H: "Aggregate events",
    F: "Factor exposure",
    S: "Macro stress",
    C: "Correlation",
  };
  return (
    <section className="p-3 sm:p-4" aria-label="Snapshot comparison">
      <h3 className="text-base font-semibold">Snapshot A versus B</h3>
      <p className="mt-2 break-words text-xs leading-5 text-[#B8C6CF]">
        A: {value.left.as_of} / {a?.regime ?? "UNAVAILABLE"}
        <br />
        B: {value.right.as_of} / {b?.regime ?? "UNAVAILABLE"}
      </p>
      <div
        className="mt-4 overflow-x-auto"
        tabIndex={0}
        aria-label="Regime and fracture comparison table"
      >
        <table className="w-full min-w-[28rem] text-left text-xs">
          <caption className="mb-2 text-left text-[#AABDCB]">
            Server-projected state and fracture; delta is B minus A. Missing dimensions remain
            UNAVAILABLE.
          </caption>
          <thead>
            <tr className="border-b border-[#45535C]">
              <th className="p-2">Component</th>
              <th>A</th>
              <th>B</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(vectorNames).map(([key, name]) => (
              <tr key={key} className="border-b border-[#223039]">
                <th className="p-2 font-normal">{name}</th>
                <td>{fmt(a?.vector[key as keyof typeof vectorNames])}</td>
                <td>{fmt(b?.vector[key as keyof typeof vectorNames])}</td>
                <td>{fmt(value.vector_delta[key as keyof typeof vectorNames])}</td>
              </tr>
            ))}
            {Object.keys(a?.fracture.contributions ?? b?.fracture.contributions ?? {}).map(
              (key) => (
                <tr key={key} className="border-b border-[#223039]">
                  <th className="p-2 font-normal">Fracture / {key}</th>
                  <td>{fmt(a?.fracture.contributions[key])}</td>
                  <td>{fmt(b?.fracture.contributions[key])}</td>
                  <td>—</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#B0BFCA]">
        Both columns contain their own volatility, seasonality, factor-neutrality / PnL,
        momentum-regime and landscape panels, recomputed at their respective cutoffs. No fitted
        model or in-sample optimum certifies future performance.
      </p>
      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
        {([value.left, value.right] as const).map((snapshot, index) => (
          <section
            key={index}
            className="min-w-0 border border-[#384853]"
            aria-label={`Snapshot ${index === 0 ? "A" : "B"} analytics`}
          >
            <h4 className="p-3 text-sm font-semibold">Snapshot {index === 0 ? "A" : "B"}</h4>
            <SnapshotView value={snapshot} labelPrefix={`Snapshot ${index === 0 ? "A" : "B"}`} />
          </section>
        ))}
      </div>
    </section>
  );
}

function Transitions({
  value,
  replay,
}: {
  value: ProductSnapshot;
  replay: (cutoff: string) => void;
}) {
  const id = useId(),
    [onlyTransitions, setOnlyTransitions] = useState(false);
  const rows = value.timeline
    .filter((t) => !onlyTransitions || t.transition)
    .slice()
    .reverse();
  const colors: Record<string, string> = {
    volatility: "#E2B75B",
    correlation: "#70ADCE",
    liquidity: "#CEAAED",
    event: "#DD8E7C",
    factor: "#90C78B",
    macro: "#B7C1CD",
  };
  return (
    <section className="m-3 border border-[#344650] p-3 sm:m-4" aria-labelledby={id}>
      <h3 id={id} className="text-sm font-semibold">
        Regime transition timeline
      </h3>
      <p className="mt-2 text-xs leading-5 text-[#B0BFCA]">
        Each contribution uses the frozen 1/6 × absolute state change. A transition requires
        complete coverage and score ≥ 0.10. Partial sums are not transition scores. Select a
        publication to replay the entire dashboard.
      </p>
      <label className="mt-3 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={onlyTransitions}
          onChange={(e) => setOnlyTransitions(e.target.checked)}
        />
        Complete fractures only
      </label>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px]">
        {Object.entries(colors).map(([name, color]) => (
          <span key={name}>
            <span
              aria-hidden="true"
              style={{ background: color }}
              className="mr-1 inline-block h-2 w-2"
            />
            {name}
          </span>
        ))}
      </div>
      <div
        className="mt-3 max-h-96 overflow-auto"
        tabIndex={0}
        aria-label="Historical transition contribution ledger"
      >
        <table className="w-full min-w-[42rem] text-left text-[10px]">
          <caption className="sr-only">
            Publication time, regime and six fracture contributions
          </caption>
          <thead>
            <tr>
              <th className="p-2">Publication / replay</th>
              <th>Regime / coverage</th>
              <th>Fracture</th>
              {Object.keys(colors).map((k) => (
                <th key={k} className="p-2">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.available_at} className="border-t border-[#25343F]">
                <td className="p-2">
                  <button className={button} onClick={() => replay(t.available_at)}>
                    {t.available_at.slice(0, 19)} UTC
                  </button>
                </td>
                <td>
                  {t.regime.replaceAll("_", " ")}
                  <br />
                  {(t.fracture.coverage * 100).toFixed(0)}% coverage
                </td>
                <td>
                  {fmt(t.fracture.score)}
                  {t.transition ? " / TRANSITION" : ""}
                </td>
                {Object.entries(colors).map(([k, color]) => (
                  <td key={k} className="p-2">
                    <span>{fmt(t.fracture.contributions[k])}</span>
                    <span
                      aria-hidden="true"
                      className="mt-1 block h-1"
                      style={{
                        width: `${Math.min(100, (t.fracture.contributions[k] ?? 0) * 600)}%`,
                        background: color,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className="p-3 text-xs">No complete transitions in this visible history.</p>
        ) : null}
      </div>
    </section>
  );
}

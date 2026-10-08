import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { lookupInstrument } from "@/markets/instruments";
import { loadReplayManifest, readReplayArtifact } from "./client";
import { FACTOR_SERIES } from "./factor-series";
import { SourceCredit } from "./SourceCredit";
import { useDataMode } from "./mode";
import type { MarketWeek } from "./contracts";

type Evidence = {
  schema_version: "factor-regime/1";
  series: string;
  as_of: string;
  labels: Record<string, string>;
  latest_state: number;
  latest_posterior: number;
  fit_rows: number;
  converged: boolean;
  latest: MarketWeek;
  scope: string;
  provenance: {
    market_start: string;
    market_end: string;
    latest_availability: string;
    disclosure: string;
  };
};
export function FactorRegimeEvidence() {
  const search = useRouterState({ select: (s) => s.location.search as { ticker?: string } });
  const navigate = useNavigate();
  const identity =
    search.ticker === "IN-MKT" || lookupInstrument(search.ticker ?? "")?.market === "INDIA"
      ? "IN-MKT"
      : "US-MKT";
  const mode = useDataMode();
  const manifest = useQuery({
    queryKey: ["replay", "manifest"],
    queryFn: loadReplayManifest,
    staleTime: Infinity,
    retry: false,
  });
  const entry = manifest.data?.artifacts[`regime:${identity}`];
  const query = useQuery({
    queryKey: ["replay", "factor-regime", identity, entry?.sha256],
    enabled: mode === "replay" && entry?.status === "AVAILABLE",
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const value = (await readReplayArtifact(`regime:${identity}`)) as Evidence;
      if (
        value.schema_version !== "factor-regime/1" ||
        value.series !== identity ||
        value.as_of !== entry!.as_of ||
        !Number.isInteger(value.latest_state) ||
        !value.labels[String(value.latest_state)] ||
        !Number.isFinite(value.latest_posterior) ||
        value.latest_posterior < 0 ||
        value.latest_posterior > 1 ||
        !Number.isFinite(value.fit_rows) ||
        !value.provenance?.disclosure.includes("never backdated")
      )
        throw new Error("Invalid factor regime evidence");
      return value;
    },
  });
  if (mode !== "replay") return null;
  const evidence = query.data;
  return (
    <section
      className="mb-4 border border-[#25313A] bg-[#0B0D10] p-4 sm:p-5"
      aria-label="Public factor regime evidence"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Market factor regimes · real research evidence</h2>
        <label className="text-xs">
          Country{" "}
          <select
            className="ml-2 border border-[#25313A] bg-[#050607] p-2"
            aria-label="Regime evidence country"
            value={identity}
            onChange={(e) =>
              void navigate({ to: "/dynamics", search: { ticker: e.target.value } as never })
            }
          >
            {FACTOR_SERIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.country}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 font-mono text-xs text-[#F0A929]">
        {identity} · market factor, not a ticker
      </p>
      {evidence ? (
        <>
          <p className="mt-3 text-sm">
            {evidence.labels[String(evidence.latest_state)]} · posterior{" "}
            {(100 * evidence.latest_posterior).toFixed(1)}% · {evidence.fit_rows.toLocaleString()}{" "}
            fitted daily rows
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {evidence.provenance.market_start}–{evidence.provenance.market_end} · captured{" "}
            {evidence.provenance.latest_availability} ·{" "}
            {evidence.converged
              ? "EM tolerance reached"
              : "EM iteration limit reached; fit has not converged"}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {evidence.scope} Retrospective fit on one revised vintage; no historically known regimes
            or alpha claim.
          </p>
          <div className="my-3 flex flex-wrap gap-4 text-xs">
            <Link
              to="/observatory"
              search={{ ticker: identity, scene: "hmm" }}
              className="underline"
            >
              Open real HMM scene
            </Link>
            <Link
              to="/observatory"
              search={{ ticker: identity, scene: "signal" }}
              className="underline"
            >
              Signal validation scene
            </Link>
            <Link to="/markets/$ticker" params={{ ticker: identity }} className="underline">
              Weekly performance, drawdown and volatility
            </Link>
          </div>
          {entry && <SourceCredit licence={entry.licence} />}
        </>
      ) : (
        <p className="mt-3 text-xs" role="status">
          {query.error?.message ??
            manifest.error?.message ??
            entry?.reason ??
            "Verifying recorded factor evidence…"}
        </p>
      )}
    </section>
  );
}

import { stamp } from "./contracts";
import type { RiskBundle } from "./client";
export function SweepHistory({
  bundle,
  onSelect,
}: {
  bundle: RiskBundle;
  onSelect: (id: string) => void;
}) {
  const sweep = bundle.sweep.payload;
  const rows = [
    {
      sweep_id: sweep.sweep_id,
      sweep_ref: bundle.sweepRef,
      state_ref: sweep.state_ref,
      published_at: sweep.published_at,
      status: sweep.status,
    },
    ...sweep.history_index,
  ];
  return (
    <section className="border border-divider" aria-label="Sealed risk sweep history">
      <header className="border-b border-divider bg-raised p-4">
        <h2 className="mono-caps text-[11px]">SEALED SWEEP HISTORY</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Phase 7 history starts at the actual first detection. Older source events remain origin
          evidence.
        </p>
      </header>
      {rows.map((row) => (
        <button
          key={row.sweep_id}
          onClick={() => onSelect(row.sweep_id)}
          className="block w-full border-b border-divider p-4 text-left hover:bg-raised/50"
        >
          <div className="flex flex-wrap justify-between gap-2 font-mono text-[10px]">
            <time title={row.published_at}>{stamp(row.published_at)}</time>
            <span className="text-primary">{row.status}</span>
          </div>
          <div className="mt-2 break-all font-mono text-[9px] text-faint">{row.sweep_id}</div>
        </button>
      ))}
      <div className="grid grid-cols-3 border-b border-divider text-center">
        {(["new", "updated", "resolved"] as const).map((key) => (
          <div key={key} className="border-r border-divider p-4">
            <p className="mono-caps text-[8px] text-faint">{key}</p>
            <p className="mt-2 font-mono text-xl">{sweep.transition_counts[key]}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2 p-4 text-[10px] text-muted-foreground">
        <p>
          Evidence cutoff:{" "}
          <time title={bundle.sweep.evidence_cutoff}>{stamp(bundle.sweep.evidence_cutoff)}</time>
        </p>
        <p className="break-all font-mono text-[8px]">FINGERPRINT {sweep.fingerprint}</p>
        <p>Scheduled risk DISABLED · Manual risk AVAILABLE · D6 DISABLED / DEFERRED</p>
        <details>
          <summary className="cursor-pointer font-mono text-[9px] text-primary">
            Scientific operation proof
          </summary>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-2 font-mono text-[9px]">
            {Object.entries(sweep.operation_proofs).map(([key, value]) => (
              <div key={key} className="contents">
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd className="max-w-[350px] break-all">{value ?? "UNAVAILABLE"}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}

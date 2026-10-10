import type { LineageChain, LineageView } from "./contracts";

function Chain({ chain, depth = 0 }: { chain: LineageChain; depth?: number }) {
  if (chain.status !== "VERIFIED")
    return (
      <li className="regimes-chain" data-status="INVALID">
        <strong>INPUT_LINEAGE_INVALID</strong> · {chain.run_id.slice(0, 12)}… · {chain.reason}
      </li>
    );
  return (
    <li className="regimes-chain" style={{ marginLeft: depth * 12 }}>
      <strong>{chain.plugin}</strong> · run {chain.run_id.slice(0, 12)}… · as_of {chain.as_of} ·
      state_at {chain.state_at?.slice(0, 10)}
      <div className="regimes-footnote">
        code manifest {chain.code_manifest_sha256?.slice(0, 12)}… · lineage digest{" "}
        {chain.lineage_digest?.slice(0, 12)}… · execution commit{" "}
        {chain.execution?.commit?.slice(0, 9) ?? "—"}
        {chain.execution?.dirty_computation ? " · DIRTY" : ""}
      </div>
      <ul>
        {chain.sources?.map((s) => (
          <li key={s.source_version_id}>
            signal ({s.signals}) → admission {s.admissions.map((a) => a.slice(0, 10)).join(", ")}… →
            capture {s.capture_sha256.slice(0, 12)}… ({s.captured_at}) → source {s.source} →
            availability {s.availability_rule} → licence {s.licence_decision.status} (
            {s.licence_decision.dataset_key};{" "}
            {s.licence_decision.permitted_uses.join(", ") || "no uses"})
          </li>
        ))}
        {chain.producers?.map((p) => (
          <Chain key={p.run_id} chain={p} depth={depth + 1} />
        ))}
      </ul>
    </li>
  );
}

export function LineageDrawer({
  lineage,
  onClose,
}: {
  lineage: LineageView | undefined;
  onClose: () => void;
}) {
  return (
    <aside
      className="regimes-drawer"
      role="dialog"
      aria-label="Why is this regime state available?"
      aria-modal="false"
    >
      <header>
        <h2>10 · Why is this regime state available?</h2>
        <button onClick={onClose}>Close lineage</button>
      </header>
      {!lineage ? (
        <p role="status">Verifying the evidence chain…</p>
      ) : (
        <>
          <p className="regimes-footnote">
            {lineage.chain}. Source values stay local; only identities and clocks are shown.
          </p>
          <ul>
            {Object.entries(lineage.runs).map(([key, chain]) => (
              <li key={key}>
                <span className="regimes-chip">{key}</span>
                <ul>
                  <Chain chain={chain} />
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

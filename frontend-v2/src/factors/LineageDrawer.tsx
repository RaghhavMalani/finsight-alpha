import { useEffect, useRef } from "react";
import type { Country } from "./contracts";
import { useFactorLineage } from "./query";
export function LineageDrawer({
  country,
  cutoff,
  onClose,
}: {
  country: Country;
  cutoff: string;
  onClose: () => void;
}) {
  const q = useFactorLineage(country, cutoff);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = drawer.current;
    node?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab" && node) {
        const targets = Array.from(
          node.querySelectorAll<HTMLElement>('button,summary,a[href],[tabindex="0"]'),
        );
        const first = targets[0],
          last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    node?.addEventListener("keydown", key);
    return () => {
      node?.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="factor-drawer-backdrop">
      <aside
        ref={drawer}
        className="factor-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="factor-lineage-title"
      >
        <header>
          <div>
            <span className="factor-eyebrow">IMMUTABLE REFERENCE CHAIN</span>
            <h2 id="factor-lineage-title">{country} / retained lineage</h2>
          </div>
          <button onClick={onClose} aria-label="Close lineage">
            Close ×
          </button>
        </header>
        <p className="factor-footnote">
          Cutoff {cutoff} · source values LOCAL ONLY. No runtime is opened.
        </p>
        {q.isPending ? (
          <p role="status">Checking lineage metadata…</p>
        ) : q.error || !q.data ? (
          <p role="alert">{q.error?.message ?? "UNAVAILABLE"}</p>
        ) : (
          <>
            <div className="factor-lineage-nodes">
              {q.data.payload.nodes.map((node) => (
                <article key={node.id}>
                  <span>
                    {node.kind} · {node.status}
                  </span>
                  <code>{node.id}</code>
                  <small>{node.reason_code.replaceAll("_", " ")}</small>
                </article>
              ))}
            </div>
            <details>
              <summary>{q.data.payload.edges.length} declared relationships</summary>
              {q.data.payload.edges.map((edge, i) => (
                <p className="factor-hash" key={i}>
                  {edge.from} → {edge.to}
                  <br />
                  {edge.relationship}
                </p>
              ))}
            </details>
            <h3>Six unsafe publications remain withdrawn</h3>
            {q.data.payload.withdrawals.map((x, i) => (
              <p className="factor-hash" key={i}>
                {JSON.stringify(x)}
              </p>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}

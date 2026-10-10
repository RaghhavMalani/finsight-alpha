import { useState } from "react";
import type { Lineage } from "./contracts";

export function LineageInspector({ items }: { items: Lineage[] }) {
  const [selected, setSelected] = useState(0);
  const item = items[selected] ?? items[0];
  if (!item)
    return (
      <section className="data-panel">
        <h2>Lineage unavailable</h2>
        <p>No sealed signal-to-admission mapping for this selection.</p>
      </section>
    );
  return (
    <section className="data-panel">
      <h2>
        Lineage Inspector <span>VERIFIED</span>
      </h2>
      <label>
        Source version{" "}
        <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
          {items.map((row, i) => (
            <option value={i} key={row.source_version_id}>
              {row.source.source} · {row.source_version_id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <div className="lineage-chain">
        {[
          ["SIGNAL", item.signal_id],
          ["ADMISSION", item.admission_id],
          ["SOURCE VERSION", item.source_version_id],
          ["CAPTURE BYTES", item.capture_sha256],
        ].map(([label, hash]) => (
          <details key={label}>
            <summary>
              <span>{label}</span>
              <code>{hash.slice(0, 12)}…</code>
            </summary>
            <code>{hash}</code>
          </details>
        ))}
      </div>
      <dl className="lineage-facts">
        <dt>Available evidence</dt>
        <dd>{item.source.clock_quality}</dd>
        <dt>Captured</dt>
        <dd>{item.source.captured_at}</dd>
        <dt>Field definition</dt>
        <dd>{item.source.field_definition}</dd>
        <dt>Feed</dt>
        <dd>{item.source.feed_scope}</dd>
        <dt>Calendar</dt>
        <dd>
          {item.source.calendar.mic ?? "Not applicable"} · {item.source.calendar.status}
        </dd>
        <dt>Licence</dt>
        <dd>
          {item.source.licence.status} · {item.source.licence.attribution}
        </dd>
        <dt>Schema seal</dt>
        <dd>
          <code>{item.schema_hash}</code>
        </dd>
        <dt>Licence resolution seal</dt>
        <dd>
          <code>{item.licence_resolution_hash}</code>
        </dd>
      </dl>
      <a href={item.source.source_url} target="_blank" rel="noreferrer">
        Inspect primary source ↗
      </a>
      <p className="data-note">
        Source bytes and observation values remain local. This graph exposes immutable evidence
        identities.
      </p>
    </section>
  );
}

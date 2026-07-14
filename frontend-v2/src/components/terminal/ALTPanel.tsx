import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { API_BASE, api } from "@/lib/api";

type Status = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
type QualityCheck = { check: string; status: "PASS" | "FAIL"; detail: string };
type Metadata = {
  dataset_id: string;
  dataset_name: string;
  provider: string;
  source_url: string | null;
  license: { name: string; url: string | null };
  customer_license_status?: string;
  customer_license_permitted_uses?: string[];
  customer_license_valid_from?: string | null;
  customer_license_valid_through?: string | null;
  version: string;
  as_of: string | null;
  available_from: string | null;
  retrieved_at: string;
  geography: Record<string, unknown>;
  frequency: string;
  evidence_type: string;
  availability_note?: string;
  lineage: Array<Record<string, unknown>>;
  quality_checks: QualityCheck[];
};
type Point = {
  date: string;
  value: number;
  precipitation_mm?: number;
  temperature_c?: number;
  et0_mm?: number;
};
type EvidenceSeries = {
  status: Status;
  name: string;
  unit?: string;
  reason?: string;
  points: Point[];
  metadata: Metadata;
};
type SatelliteEvidence = Omit<EvidenceSeries, "points"> & { image_path?: string; points?: Point[] };
type Agriculture = {
  status: Status;
  product: string;
  generated_at: string;
  geography: { country_code: string; country: string };
  weather: EvidenceSeries;
  crop_yield: EvidenceSeries;
  production: EvidenceSeries;
  satellite: SatelliteEvidence;
  performance_claims: "UNAVAILABLE";
  performance_note: string;
};
type Trade = {
  status: Status;
  product: string;
  generated_at: string;
  geography: { country_code: string; country: string };
  series: EvidenceSeries[];
  performance_claims: "UNAVAILABLE";
  performance_note: string;
};

const COUNTRIES = [
  { code: "IND", label: "INDIA" },
  { code: "USA", label: "UNITED STATES" },
  { code: "BRA", label: "BRAZIL" },
] as const;

const STATUS_STYLE: Record<Status, string> = {
  AVAILABLE: "border-up/60 text-up",
  PARTIAL: "border-primary/60 text-primary",
  UNAVAILABLE: "border-down/60 text-down",
};

export function ALTPanel() {
  const [country, setCountry] = useState("IND");
  const agriculture = useQuery({
    queryKey: ["agriculture-intelligence", country],
    queryFn: () => api<Agriculture>(`/intelligence/agriculture?country=${country}`),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const trade = useQuery({
    queryKey: ["trade-intelligence", country],
    queryFn: () => api<Trade>(`/intelligence/trade?country=${country}`),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-panel">
      <div className="mono-caps flex flex-wrap items-center justify-between gap-2 border-b border-divider px-3 py-2 text-[9px]">
        <div>
          <div className="text-primary">EVIDENCE PRODUCTS · BACKEND INGESTION ONLY</div>
          <div className="mt-0.5 text-faint">
            No browser-to-provider calls · no simulated fallback · no unregistered performance
            claims
          </div>
        </div>
        <div className="flex gap-1">
          {COUNTRIES.map((item) => (
            <button
              key={item.code}
              onClick={() => setCountry(item.code)}
              className={`border px-2 py-1 ${country === item.code ? "border-primary text-primary" : "border-border text-faint"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <section className="border-b border-divider p-2">
        <SectionHeader
          index="01"
          title="AGRICULTURE INTELLIGENCE"
          status={agriculture.data?.status ?? (agriculture.isError ? "UNAVAILABLE" : "PARTIAL")}
          detail="Satellite imagery · geospatial weather · rainfall · reported yield and production"
        />
        {agriculture.isPending ? (
          <Loading label="INGESTING AND VALIDATING AUTHORITATIVE SOURCES" />
        ) : agriculture.isError || !agriculture.data ? (
          <Unavailable
            reason={
              agriculture.error instanceof Error
                ? agriculture.error.message
                : "Agriculture ingestion is unavailable."
            }
          />
        ) : (
          <>
            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-4">
              <SatelliteCard evidence={agriculture.data.satellite} country={country} />
              <EvidenceChart evidence={agriculture.data.weather} color="#B58BF0" />
              <EvidenceChart evidence={agriculture.data.crop_yield} color="#42C98B" />
              <EvidenceChart evidence={agriculture.data.production} color="#F0A929" />
            </div>
            <TruthBanner text={agriculture.data.performance_note} />
          </>
        )}
      </section>

      <section className="border-b border-divider p-2">
        <SectionHeader
          index="02"
          title="TRADE & COUNTRY GROWTH PULSE"
          status={trade.data?.status ?? (trade.isError ? "UNAVAILABLE" : "PARTIAL")}
          detail="Descriptive national indicators; no security-return inference"
        />
        {trade.isPending ? (
          <Loading label="INGESTING COUNTRY INDICATORS" />
        ) : trade.isError || !trade.data ? (
          <Unavailable
            reason={
              trade.error instanceof Error ? trade.error.message : "Trade ingestion is unavailable."
            }
          />
        ) : (
          <>
            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-4">
              {trade.data.series.map((series, index) => (
                <EvidenceChart
                  key={series.metadata.dataset_id || index}
                  evidence={series}
                  color="#8AB4F8"
                />
              ))}
            </div>
            <TruthBanner text={trade.data.performance_note} />
          </>
        )}
      </section>

      <section className="p-2">
        <SectionHeader
          index="03"
          title="COMPANY DEMAND RADAR"
          status="UNAVAILABLE"
          detail="Intentionally blocked"
        />
        <div className="mono-caps mt-2 border border-down/40 bg-down/5 px-3 py-3 text-[10px] text-muted-foreground">
          <div className="text-down">
            UNAVAILABLE · NO INDUSTRY OR LICENSED GROUND TRUTH SELECTED
          </div>
          <div className="mt-1 max-w-4xl leading-relaxed">
            This product will remain unavailable until a specific industry, decision use case,
            licensed target dataset, vintage calendar, and out-of-sample validation protocol are
            registered.
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  index,
  title,
  status,
  detail,
}: {
  index: string;
  title: string;
  status: Status;
  detail: string;
}) {
  return (
    <div className="mono-caps flex flex-wrap items-center gap-2 text-[10px]">
      <span className="text-primary">{index}</span>
      <span className="text-foreground">{title}</span>
      <span className={`border px-1.5 py-0.5 text-[8px] ${STATUS_STYLE[status]}`}>{status}</span>
      <span className="text-faint">{detail}</span>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="mono-caps mt-2 border border-border p-6 text-center text-[10px] text-faint">
      {label}…
    </div>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="mono-caps mt-2 border border-down/40 bg-down/5 p-4 text-[10px]">
      <div className="text-down">UNAVAILABLE</div>
      <div className="mt-1 text-muted-foreground">{reason}</div>
      <div className="mt-2 text-faint">No simulation or static substitute is being shown.</div>
    </div>
  );
}

function TruthBanner({ text }: { text: string }) {
  return (
    <div className="mono-caps mt-2 border border-border bg-raised px-3 py-2 text-[9px] text-faint">
      PREDICTIVE PERFORMANCE · UNAVAILABLE · {text}
    </div>
  );
}

function EvidenceChart({ evidence, color }: { evidence: EvidenceSeries; color: string }) {
  if (evidence.status !== "AVAILABLE" || evidence.points.length < 2) {
    return <EvidenceUnavailable evidence={evidence} />;
  }
  const width = 420;
  const height = 150;
  const pad = 12;
  const values = evidence.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = evidence.points
    .map((point, index) => {
      const x = pad + (index / Math.max(1, evidence.points.length - 1)) * (width - pad * 2);
      const y =
        pad + (height - pad * 2) - ((point.value - min) / (max - min || 1)) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const latest = evidence.points[evidence.points.length - 1];

  return (
    <article className="flex min-h-0 flex-col border border-divider bg-panel">
      <div className="mono-caps flex items-start justify-between gap-2 border-b border-divider px-2 py-1.5 text-[9px]">
        <div>
          <div className="text-foreground">{evidence.name}</div>
          <div className="text-faint">{evidence.unit ?? "unit not supplied"}</div>
        </div>
        <span className={`border px-1 py-0 text-[8px] ${STATUS_STYLE[evidence.status]}`}>
          {evidence.status}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-36 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${evidence.name} evidence chart`}
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
        <text x={pad} y={pad + 8} fontSize="9" fill={color} fontFamily="ui-monospace,monospace">
          {formatValue(latest.value)} {evidence.unit ?? ""}
        </text>
        <text
          x={width - pad}
          y={height - 4}
          fontSize="8"
          fill="#636C74"
          textAnchor="end"
          fontFamily="ui-monospace,monospace"
        >
          {evidence.points[0].date} → {latest.date}
        </text>
      </svg>
      <EvidenceFooter metadata={evidence.metadata} />
    </article>
  );
}

function SatelliteCard({ evidence, country }: { evidence: SatelliteEvidence; country: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const available = evidence.status === "AVAILABLE" && evidence.image_path && !imageFailed;
  return (
    <article className="flex min-h-0 flex-col border border-divider bg-panel">
      <div className="mono-caps flex items-start justify-between gap-2 border-b border-divider px-2 py-1.5 text-[9px]">
        <div>
          <div className="text-foreground">{evidence.name}</div>
          <div className="text-faint">Visual context only · no NDVI or yield score inferred</div>
        </div>
        <span
          className={`border px-1 py-0 text-[8px] ${STATUS_STYLE[available ? "AVAILABLE" : "UNAVAILABLE"]}`}
        >
          {available ? "AVAILABLE" : "UNAVAILABLE"}
        </span>
      </div>
      {available ? (
        <img
          src={`${API_BASE}${evidence.image_path}`}
          alt={`NASA MODIS Terra imagery for ${country} as of ${evidence.metadata.as_of}`}
          className="h-36 w-full bg-raised object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="mono-caps flex h-36 items-center justify-center bg-raised px-4 text-center text-[9px] text-down">
          UNAVAILABLE ·{" "}
          {imageFailed ? "BACKEND IMAGE PROXY FAILED" : (evidence.reason ?? "NO VALIDATED IMAGE")}
        </div>
      )}
      <EvidenceFooter metadata={evidence.metadata} />
    </article>
  );
}

function EvidenceUnavailable({ evidence }: { evidence: EvidenceSeries }) {
  return (
    <article className="flex min-h-[220px] flex-col border border-down/30 bg-down/5">
      <div className="mono-caps border-b border-down/20 px-2 py-1.5 text-[9px] text-foreground">
        {evidence.name}
      </div>
      <div className="mono-caps flex flex-1 flex-col items-center justify-center px-4 text-center text-[9px]">
        <div className="text-down">UNAVAILABLE</div>
        <div className="mt-1 text-faint">
          {evidence.reason ?? "The backend returned no validated observations."}
        </div>
        <div className="mt-2 text-faint">No simulated or static substitute is shown.</div>
      </div>
      <EvidenceFooter metadata={evidence.metadata} />
    </article>
  );
}

function EvidenceFooter({ metadata }: { metadata: Metadata }) {
  const geography = geographyLabel(metadata.geography);
  const passed = metadata.quality_checks.filter((check) => check.status === "PASS").length;
  return (
    <div className="mono-caps border-t border-divider bg-raised px-2 py-2 text-[8px] leading-relaxed text-faint">
      <div className="grid grid-cols-2 gap-x-2">
        <span>SOURCE</span>
        <span className="truncate text-foreground" title={metadata.provider}>
          {metadata.provider}
        </span>
        <span>AS OF</span>
        <span className="text-foreground">{metadata.as_of ?? "UNAVAILABLE"}</span>
        <span>VERSION</span>
        <span className="truncate text-foreground" title={metadata.version}>
          {shortVersion(metadata.version)}
        </span>
        <span>GEOGRAPHY</span>
        <span className="truncate text-foreground" title={geography}>
          {geography}
        </span>
        <span>AVAILABLE FROM</span>
        <span className="truncate text-foreground">{metadata.available_from ?? "UNAVAILABLE"}</span>
        <span>QUALITY</span>
        <span className="text-foreground">
          {metadata.quality_checks.length
            ? `${passed}/${metadata.quality_checks.length} PASS`
            : "UNAVAILABLE"}
        </span>
        <span>CUSTOMER LICENSE</span>
        <span className={metadata.customer_license_status === "ACTIVE" ? "text-up" : "text-down"}>
          {metadata.customer_license_status ?? "UNVERIFIED"}
        </span>
        <span>LICENSE SCOPE</span>
        <span
          className="truncate text-foreground"
          title={metadata.customer_license_permitted_uses?.join(", ")}
        >
          {metadata.customer_license_permitted_uses?.length
            ? metadata.customer_license_permitted_uses.join(", ")
            : "UNAVAILABLE"}
        </span>
        <span>LICENSE VALID THROUGH</span>
        <span className="text-foreground">
          {metadata.customer_license_status === "ACTIVE"
            ? (metadata.customer_license_valid_through ?? "NO FIXED END")
            : "UNAVAILABLE"}
        </span>
      </div>
      <div className="mt-1 truncate" title={metadata.evidence_type}>
        {metadata.evidence_type}
      </div>
      <div className="mt-1 flex gap-3">
        {metadata.source_url ? (
          <a
            href={metadata.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-info hover:underline"
          >
            SOURCE RECORD
          </a>
        ) : (
          <span>SOURCE RECORD · UNAVAILABLE</span>
        )}
        {metadata.license.url ? (
          <a
            href={metadata.license.url}
            target="_blank"
            rel="noreferrer"
            className="text-info hover:underline"
          >
            LICENSE
          </a>
        ) : (
          <span>LICENSE · UNAVAILABLE</span>
        )}
      </div>
    </div>
  );
}

function geographyLabel(geography: Record<string, unknown>) {
  const country = typeof geography.country === "string" ? geography.country : "unknown";
  const coverage =
    typeof geography.coverage === "string" ? geography.coverage : "coverage unavailable";
  return `${country} · ${coverage}`;
}

function shortVersion(version: string) {
  if (version === "UNAVAILABLE") return version;
  return version.length > 22 ? `${version.slice(0, 22)}…` : version;
}

function formatValue(value: number) {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000)
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

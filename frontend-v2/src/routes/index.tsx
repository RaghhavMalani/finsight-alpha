import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { loadQuakes, loadSatellites, useFeed } from "@/components/globe/feeds";
import type { Quake, Tle } from "@/components/globe/geo-data";
import { loadLand, type LandData } from "@/components/globe/land";
import { useReducedMotion } from "@/components/observatory/useReducedMotion";
import "@/components/landing/landing.css";

const GlobeScene = lazy(() => import("@/components/globe/GlobeScene"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FinSight Forge — every model, under glass" },
      {
        name: "description",
        content:
          "Watch regime models converge, signal forests re-rank and neural networks you design learn, on point-in-time evidence with the holdout sealed until it counts.",
      },
    ],
  }),
  component: Landing,
});

type Manifest = { as_of: string; artifacts: Record<string, unknown> };

const INSTRUMENTS: {
  to: string;
  search?: Record<string, unknown>;
  code: string;
  title: string;
  body: string;
  art: ReactNode;
  tone: string;
}[] = [
  {
    to: "/observatory",
    search: { scene: "hmm", ticker: "SPY" },
    code: "F7",
    title: "Model Observatory",
    body: "An HMM's EM fit and a boosted forest's walk-forward folds, replayed from checked artifacts whose bytes are hashed before a single line is drawn.",
    tone: "#39E6B5",
    art: <ArtRegimes />,
  },
  {
    to: "/observatory",
    search: { scene: "neural", ticker: "SPY" },
    code: "F8",
    title: "Neural Lab",
    body: "Design a network, then watch every weight move as it trains in your browser on worlds with a known answer, or on real evidence through the backend.",
    tone: "#FF4FD8",
    art: <ArtNetwork />,
  },
  {
    to: "/globe",
    code: "F9",
    title: "God's Eye",
    body: "Live earthquakes and satellites over the market hubs, computed into the network's Geo events inputs with the same one-day rule the backend uses.",
    tone: "#3FE0FF",
    art: <ArtGlobe />,
  },
  {
    to: "/forge",
    search: { run: undefined, node: 1 },
    code: "F2",
    title: "Forge Command Center",
    body: "Coding-agent research runs, frozen benchmarks and Reality Ladder evidence, every claim graded by an independent verifier.",
    tone: "#F0A929",
    art: <ArtLadder />,
  },
  {
    to: "/dynamics",
    code: "DYN",
    title: "Dynamics Lab",
    body: "Hawkes event processes, regime landscapes and preregistered failure decompositions, with their limits printed beside the result.",
    tone: "#B88CFF",
    art: <ArtWaves />,
  },
  {
    to: "/risk",
    code: "RSK",
    title: "Risk Desk",
    body: "Your paper book, stress scenarios and hedges. An empty book reads as zero risk, never as an injected sample portfolio.",
    tone: "#FF8A5B",
    art: <ArtBars />,
  },
];

const CONTRACT: [string, string][] = [
  [
    "Point-in-time",
    "Every row carries when it was observed and when it became available. Nothing after the cutoff reaches a fit, a scaler or a selection.",
  ],
  [
    "Content-addressed",
    "Replays and frozen artifacts are canonical JSON with SHA-256 addresses. A changed byte hides the scene instead of drawing it.",
  ],
  [
    "Holdout sealed",
    "Models are compared on validation. The untouched holdout is opened once, for the preregistered choice, and every extra look is counted.",
  ],
  [
    "Negative controls",
    "Null worlds, sabotage tests and leakage probes run beside every positive result. A verifier that cannot fail does not grade anything.",
  ],
];

function Landing() {
  const reduced = useReducedMotion();
  const quakes = useFeed<Quake[]>(loadQuakes, [], 5 * 60_000);
  const sats = useFeed<Tle[]>(loadSatellites, [], 2 * 3600_000);
  const [land, setLand] = useState<LandData | null>(null);
  const [now, setNow] = useState(0);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    setNow(Date.now());
    void loadLand().then(setLand);
    fetch("/artifacts/observatory/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setManifest)
      .catch(() => setManifest(null));
  }, []);
  const noop = useCallback(() => undefined, []);
  const latest = quakes.data[0];
  const strip = [
    manifest &&
      `Observatory · ${Object.keys(manifest.artifacts).length} checked replays · cutoff ${manifest.as_of.slice(0, 10)}`,
    quakes.status === "live" && `USGS · ${quakes.data.length} M4.5+ events in 30 days`,
    latest && `Latest · M${latest.mag.toFixed(1)} ${latest.place ?? ""}`,
    sats.status === "live" && `CelesTrak · ${sats.data.length} satellites propagated`,
    "Neural lab · trains in your browser, nothing uploaded",
  ].filter((x): x is string => !!x);
  return (
    <div className="landing">
      <header className="ld-nav">
        <Link to="/" className="ld-brand" aria-label="FinSight home">
          <i />
          FINSIGHT <b>FORGE</b>
        </Link>
        <nav aria-label="Primary">
          <Link to="/observatory" search={{ scene: "hmm", ticker: "SPY" }}>
            Observatory
          </Link>
          <Link to="/observatory" search={{ scene: "neural", ticker: "SPY" }}>
            Neural lab
          </Link>
          <Link to="/globe">God's Eye</Link>
          <Link to="/forge" search={{ run: undefined, node: 1 }}>
            Forge
          </Link>
        </nav>
        <Link to="/login" className="ld-signin">
          Sign in
        </Link>
      </header>

      <section className="ld-hero" aria-labelledby="ld-title">
        <div className="ld-globe" aria-hidden="true">
          {now > 0 && (
            <Suspense fallback={null}>
              <GlobeScene
                land={land}
                quakes={quakes.data}
                tles={sats.data}
                now={now}
                layers={{ quakes: true, satellites: true, hubs: true }}
                sensor={null}
                reduced={reduced}
                selected={null}
                onPick={noop}
                onLook={noop}
                onSatellites={noop}
                labelsRoot={null}
                interactive={false}
                view={[22, 140, 3.05]}
              />
            </Suspense>
          )}
        </div>
        <div className="ld-scan" aria-hidden="true" />
        <div className="ld-copy">
          <div className="ld-eyebrow">
            <span className="ld-live" /> Evidence-first research environment
          </div>
          <h1 id="ld-title" className="ld-title">
            <span data-text="Every model,">Every model,</span>
            <span data-text="under glass." className="ld-amber">
              under glass.
            </span>
          </h1>
          <p className="ld-lead">
            Watch a regime model converge, a signal forest re-rank its inputs and a neural network
            you designed learn, epoch by epoch. Everything runs on point-in-time evidence, and the
            holdout stays sealed until it counts.
          </p>
          <div className="ld-ctas">
            <Link to="/observatory" search={{ scene: "hmm", ticker: "SPY" }} className="ld-primary">
              Enter the Observatory
            </Link>
            <Link
              to="/observatory"
              search={{ scene: "neural", ticker: "SPY" }}
              className="ld-secondary"
            >
              Train a network
            </Link>
            <Link to="/globe" className="ld-secondary">
              Open God's Eye
            </Link>
          </div>
        </div>
        <div className="ld-strip" aria-label="Live status">
          <div className={reduced ? "" : "ld-marquee"}>
            {[...strip, ...strip].map((item, i) => (
              <span key={i} aria-hidden={i >= strip.length}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="ld-section" aria-labelledby="ld-instruments">
        <div className="ld-section-head">
          <div className="ld-eyebrow">Instruments</div>
          <h2 id="ld-instruments">Six ways into the same evidence.</h2>
        </div>
        <div className="ld-grid">
          {INSTRUMENTS.map((item) => (
            <Link
              key={item.title}
              to={item.to}
              search={item.search as never}
              className="ld-card"
              style={{ ["--tone" as string]: item.tone }}
            >
              <div className="ld-art">{item.art}</div>
              <div className="ld-card-code">{item.code}</div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <span className="ld-go">Open →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="ld-section ld-contract" aria-labelledby="ld-contract">
        <div className="ld-section-head">
          <div className="ld-eyebrow">The truth contract</div>
          <h2 id="ld-contract">A plausible answer is not a result.</h2>
          <p>
            Until independent code can reproduce its inputs, timing, calculations and evidence, a
            result is a claim. The instruments above show only what that code can stand behind.
          </p>
        </div>
        <div className="ld-rules">
          {CONTRACT.map(([title, body], i) => (
            <div key={title}>
              <b>0{i + 1}</b>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="ld-foot">
        <span>FinSight Forge · read-only observer · unknown schemas fail closed</span>
        <span>
          Globe adapted from{" "}
          <a href="https://github.com/bilawalsidhu/gods-eye-view" target="_blank" rel="noreferrer">
            God's Eye View
          </a>{" "}
          (MIT) · USGS · CelesTrak · Natural Earth
        </span>
      </footer>
    </div>
  );
}

/* Card art: decorative SVG, no data. */
function ArtRegimes() {
  return (
    <svg viewBox="0 0 120 70">
      {[
        [30, 42, "#39E6B5"],
        [58, 30, "#6AA8FF"],
        [84, 46, "#B88CFF"],
        [96, 18, "#FF4D6D"],
      ].map(([x, y, c]) => (
        <g key={String(c)}>
          <circle cx={x} cy={y} r="11" fill={String(c)} opacity="0.12" />
          <circle cx={x} cy={y} r="3" fill={String(c)} className="ld-pulse" />
        </g>
      ))}
      <path
        d="M30 42 Q44 22 58 30 T84 46 T96 18"
        fill="none"
        stroke="#6AA8FF"
        strokeOpacity="0.5"
        className="ld-dash"
      />
    </svg>
  );
}
function ArtNetwork() {
  const L = [
    [14, [14, 28, 42, 56]],
    [52, [20, 35, 50]],
    [86, [26, 44]],
    [110, [35]],
  ] as const;
  return (
    <svg viewBox="0 0 120 70">
      {L.slice(0, -1).flatMap(([x, ys], l) =>
        ys.flatMap((y) =>
          L[l + 1][1].map((y2, k) => (
            <line
              key={`${x}-${y}-${k}`}
              x1={x}
              y1={y}
              x2={L[l + 1][0]}
              y2={y2}
              stroke={(y + y2 + k) % 3 ? "#3FE0FF" : "#FF4FD8"}
              strokeOpacity="0.45"
              className="ld-dash"
            />
          )),
        ),
      )}
      {L.flatMap(([x, ys]) =>
        ys.map((y) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill="#F0A929" className="ld-pulse" />
        )),
      )}
    </svg>
  );
}
function ArtGlobe() {
  return (
    <svg viewBox="0 0 120 70">
      <circle cx="60" cy="35" r="30" fill="none" stroke="#3FE0FF" strokeOpacity="0.5" />
      {[-18, 0, 18].map((d) => (
        <ellipse
          key={d}
          cx="60"
          cy={35 + d * 0.9}
          rx={Math.sqrt(900 - d * d * 0.8)}
          ry="4"
          fill="none"
          stroke="#3FE0FF"
          strokeOpacity="0.2"
        />
      ))}
      <ellipse cx="60" cy="35" rx="12" ry="30" fill="none" stroke="#3FE0FF" strokeOpacity="0.2" />
      <ellipse
        cx="60"
        cy="35"
        rx="44"
        ry="12"
        fill="none"
        stroke="#FFD166"
        strokeOpacity="0.5"
        className="ld-dash"
        transform="rotate(-18 60 35)"
      />
      <circle cx="74" cy="26" r="2.5" fill="#FF8A5B" className="ld-pulse" />
      <circle cx="48" cy="42" r="2" fill="#F0A929" className="ld-pulse" />
    </svg>
  );
}
function ArtLadder() {
  return (
    <svg viewBox="0 0 120 70">
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={18 + i * 18}
          y={56 - i * 9}
          width="14"
          height={6 + i * 9}
          fill="#F0A929"
          opacity={0.2 + i * 0.15}
        />
      ))}
      <path d="M14 58 L108 14" stroke="#F0A929" strokeOpacity="0.6" className="ld-dash" />
    </svg>
  );
}
function ArtWaves() {
  return (
    <svg viewBox="0 0 120 70">
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M0 ${40 + i * 6} C 20 ${10 + i * 10}, 40 ${60 - i * 4}, 60 ${36 + i * 4} S 100 ${12 + i * 8}, 120 ${34 + i * 6}`}
          fill="none"
          stroke="#B88CFF"
          strokeOpacity={0.6 - i * 0.15}
          className="ld-dash"
        />
      ))}
      {[22, 47, 51, 54, 90, 93].map((x) => (
        <line key={x} x1={x} y1="60" x2={x} y2="66" stroke="#B88CFF" />
      ))}
    </svg>
  );
}
function ArtBars() {
  return (
    <svg viewBox="0 0 120 70">
      {[30, 46, 22, 58, 38, 50].map((h, i) => (
        <rect
          key={i}
          x={12 + i * 17}
          y={62 - h}
          width="10"
          height={h}
          fill="#FF8A5B"
          opacity={0.25 + (i % 3) * 0.2}
        />
      ))}
      <line
        x1="6"
        y1="28"
        x2="114"
        y2="28"
        stroke="#FF4D6D"
        strokeDasharray="3 3"
        strokeOpacity="0.7"
      />
    </svg>
  );
}

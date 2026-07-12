import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, BarChart3, CloudSun, Database, FlaskConical, LogOut,
  Newspaper, Play, RefreshCw, Search, Server, ShieldAlert, TrendingUp,
} from "lucide-react";
import { FormEvent, ReactNode, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";

import "../terminal.css";

import {
  api, ApiError, type Backtest, type Datasets, type NewsPayload,
  type Providers, type Quote, type RiskDashboard, type TapeItem,
  type User, type Weather,
} from "../lib/api";

export const Route = createFileRoute("/")({ component: TerminalPage });

const WATCHLIST = ["AAPL", "MSFT", "NVDA", "SPY", "RELIANCE.NS", "TCS.NS"];

const pct = (value: number | null | undefined, digits = 2) =>
  value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
const num = (value: number | null | undefined, digits = 2) =>
  value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: digits });
const titleCase = (value: string) => value.replaceAll("_", " ");

function TerminalPage() {
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api<User>("/auth/me"),
    retry: false,
  });

  if (me.isLoading) return <FullScreenState label="Opening secure desk…" />;
  if (me.error instanceof ApiError && me.error.status === 401) return <AuthGate />;
  if (me.isError) {
    return (
      <FullScreenState
        label="FastAPI is offline"
        detail="Start uvicorn backend.main:app --reload on port 8000, then retry."
        action={<button className="terminal-button" onClick={() => me.refetch()}>Retry connection</button>}
      />
    );
  }
  return <Terminal user={me.data!} />;
}

function AuthGate() {
  const client = useQueryClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api<User>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await client.invalidateQueries({ queryKey: ["auth", "me"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand-mark">FS</div>
        <p className="eyebrow">FinSight Alpha · connected research desk</p>
        <h1 className="font-serif text-6xl leading-[0.92] md:text-8xl">
          Markets move.<br /><span className="text-primary">Your view</span> should too.
        </h1>
        <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground">
          One live surface for price action, risk, news, alternative data, and
          research-grade strategy testing.
        </p>
        <div className="mt-10 grid max-w-xl grid-cols-3 gap-px overflow-hidden border border-border bg-border">
          {["Live APIs", "Quant engine", "Local-first"].map((item) => (
            <div key={item} className="bg-panel px-4 py-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{item}</div>
          ))}
        </div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">Secure terminal access</p>
        <h2 className="mt-3 font-serif text-4xl">{mode === "login" ? "Welcome back" : "Create your desk"}</h2>
        <label className="field-label mt-8">Email</label>
        <input className="terminal-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label className="field-label mt-5">Password</label>
        <input className="terminal-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {error && <p className="mt-4 border-l-2 border-down pl-3 text-sm text-down">{error}</p>}
        <button className="terminal-button mt-7 w-full" disabled={busy}>{busy ? "Connecting…" : mode === "login" ? "Enter terminal" : "Create account"}</button>
        <button type="button" className="mt-5 w-full text-xs text-muted-foreground hover:text-foreground" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? "New here? Create an account" : "Already registered? Sign in"}
        </button>
      </form>
    </main>
  );
}

function Terminal({ user }: { user: User }) {
  const client = useQueryClient();
  const [symbol, setSymbol] = useState("AAPL");
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [city, setCity] = useState("Mumbai");
  const [cityInput, setCityInput] = useState("Mumbai");

  const tape = useQuery({
    queryKey: ["tape"], queryFn: () => api<{ items: TapeItem[]; live: boolean }>(`/tape?symbols=${WATCHLIST.join(",")}`),
    refetchInterval: 60_000,
  });
  const quote = useQuery({
    queryKey: ["quote", symbol], queryFn: () => api<Quote>(`/quote/${encodeURIComponent(symbol)}`),
  });
  const news = useQuery({
    queryKey: ["news", symbol], queryFn: () => api<NewsPayload>(`/news/${encodeURIComponent(symbol)}?limit=8`),
  });
  const risk = useQuery({
    queryKey: ["risk", symbol], queryFn: () => api<RiskDashboard>(`/risk/dashboard/${encodeURIComponent(symbol)}`),
  });
  const weather = useQuery({
    queryKey: ["weather", city], queryFn: () => api<Weather>(`/context/weather?city=${encodeURIComponent(city)}`),
  });
  const datasets = useQuery({
    queryKey: ["datasets"], queryFn: () => api<Datasets>("/context/datasets"),
  });
  const providers = useQuery({
    queryKey: ["providers"], queryFn: () => api<Providers>("/context/providers"),
  });

  const backtest = useMutation({
    mutationFn: () => api<Backtest>("/strategy/run", {
      method: "POST",
      body: JSON.stringify({
        ticker: symbol,
        entry: [{ type: "sma_fast_above_slow", fast: 50, slow: 200 }],
        exit: [{ type: "sma_fast_below_slow", fast: 50, slow: 200 }],
        cost_bps: 5,
        oos_split: 0.7,
      }),
    }),
    onSuccess: () => toast.success("Strategy run complete"),
    onError: (error) => toast.error(error.message),
  });

  function chooseSymbol(next: string) {
    const cleaned = next.trim().toUpperCase();
    if (!cleaned) return;
    setSymbol(cleaned);
    setSymbolInput(cleaned);
    backtest.reset();
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    await client.invalidateQueries({ queryKey: ["auth", "me"] });
  }

  const backtestSeries = useMemo(() => {
    if (!backtest.data) return [];
    return backtest.data.dates.map((date, index) => ({
      date, strategy: backtest.data!.equity[index], benchmark: backtest.data!.benchmark[index],
    }));
  }, [backtest.data]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center gap-5 px-4 md:px-7">
          <div className="brand-mark small">FS</div>
          <div className="hidden md:block"><p className="font-serif text-xl">FinSight</p><p className="font-mono text-[8px] uppercase tracking-[0.2em] text-faint">Alpha terminal</p></div>
          <form className="relative ml-0 max-w-md flex-1 md:ml-8" onSubmit={(e) => { e.preventDefault(); chooseSymbol(symbolInput); }}>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input className="terminal-input h-10 pl-10" value={symbolInput} onChange={(e) => setSymbolInput(e.target.value)} placeholder="Search ticker…" aria-label="Ticker symbol" />
          </form>
          <div className="hidden items-center gap-2 font-mono text-[10px] text-muted-foreground lg:flex"><span className={`status-dot ${tape.data?.live ? "live" : ""}`} />{tape.data?.live ? "LIVE" : "EOD"} DATA</div>
          <button className="icon-button" onClick={() => { quote.refetch(); tape.refetch(); news.refetch(); risk.refetch(); }} title="Refresh data"><RefreshCw className="size-4" /></button>
          <button className="icon-button" onClick={logout} title={`Sign out ${user.email}`}><LogOut className="size-4" /></button>
        </div>
        <div className="tape-row">
          {tape.isLoading && <span className="px-5 text-faint">Loading market tape…</span>}
          {tape.data?.items.map((item) => (
            <button key={item.ticker} onClick={() => chooseSymbol(item.ticker)} className={`tape-item ${item.ticker === symbol ? "active" : ""}`}>
              <strong>{item.ticker}</strong><span>{num(item.last)}</span><span className={item.change_pct >= 0 ? "text-up" : "text-down"}>{pct(item.change_pct)}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-[1700px] px-4 py-5 md:px-7">
        <section className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="eyebrow">Selected instrument · {symbol.endsWith(".NS") ? "NSE" : "US / Global"}</p>
            <div className="mt-2 flex flex-wrap items-end gap-4">
              <h1 className="font-serif text-5xl md:text-7xl">{quote.data?.ticker ?? symbol}</h1>
              <div className="pb-2"><p className="text-2xl font-medium">{quote.isLoading ? "—" : `$${num(quote.data?.last)}`}</p><p className={quote.data && quote.data.change_pct >= 0 ? "text-up" : "text-down"}>{pct(quote.data?.change_pct)} today</p></div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{quote.data?.name ?? (quote.isError ? quote.error.message : "Loading instrument profile…")}</p>
          </div>
          <div className="flex flex-wrap gap-2">{WATCHLIST.map((item) => <button key={item} onClick={() => chooseSymbol(item)} className={`symbol-chip ${item === symbol ? "active" : ""}`}>{item}</button>)}</div>
        </section>

        <div className="terminal-grid">
          <Panel className="chart-panel" icon={<TrendingUp />} title="Price structure" meta="Adjusted close · SMA 50 / 200">
            {quote.isLoading ? <PanelLoading /> : quote.isError ? <PanelError error={quote.error} /> : (
              <ResponsiveContainer width="100%" height={330}>
                <LineChart data={quote.data?.series} margin={{ top: 14, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#171B1F" vertical={false} /><XAxis dataKey="date" stroke="#636C74" tick={{ fontSize: 9 }} minTickGap={42} /><YAxis domain={["auto", "auto"]} stroke="#636C74" tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#9AA2A9" }} />
                  <Line type="monotone" dataKey="close" stroke="#F0A929" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sma50" stroke="#45B9D3" strokeWidth={1} dot={false} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="sma200" stroke="#9AA2A9" strokeWidth={1} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel className="snapshot-panel" icon={<Activity />} title="Instrument readout" meta="Backend-calculated">
            <div className="metric-grid">
              <Metric label="1 month" value={pct(quote.data?.periods?.["1M"])} tone={quote.data?.periods?.["1M"]} />
              <Metric label="1 year" value={pct(quote.data?.periods?.["1Y"])} tone={quote.data?.periods?.["1Y"]} />
              <Metric label="Annual vol" value={pct(quote.data?.metrics?.annualized_volatility)} />
              <Metric label="Max drawdown" value={pct(quote.data?.metrics?.max_drawdown)} tone={quote.data?.metrics?.max_drawdown} />
              <Metric label="Sharpe" value={num(quote.data?.metrics?.sharpe_ratio)} />
              <Metric label="RSI 14" value={num(quote.data?.rsi, 1)} />
            </div>
            <div className="mt-5 border-t border-divider pt-5">
              <div className="mb-2 flex justify-between text-[10px] uppercase tracking-widest text-faint"><span>52W low {num(quote.data?.range52.low)}</span><span>High {num(quote.data?.range52.high)}</span></div>
              <div className="h-1.5 bg-raised"><div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, (quote.data?.range52.pos ?? 0) * 100))}%` }} /></div>
            </div>
          </Panel>

          <Panel className="news-panel" icon={<Newspaper />} title="Signal wire" meta={`${news.data?.overall_label ?? "Scanning"} sentiment`}>
            {news.isLoading ? <PanelLoading /> : news.isError ? <PanelError error={news.error} /> : (
              <div className="divide-y divide-divider">
                {(news.data?.items ?? []).slice(0, 6).map((item, index) => {
                  const headline = String(item.title ?? item.headline ?? "Untitled signal");
                  const url = typeof item.url === "string" ? item.url : undefined;
                  const label = String(item.label ?? "neutral");
                  return <article key={`${headline}-${index}`} className="news-item"><span className={`sentiment ${label}`} /> <div><a href={url} target="_blank" rel="noreferrer" className="leading-5 hover:text-primary">{headline}</a><p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-faint">{String(item.source ?? "Market wire")} · {label}</p></div></article>;
                })}
                {!news.data?.items?.length && <Empty label="No recent headlines returned." />}
              </div>
            )}
          </Panel>

          <Panel className="risk-panel" icon={<ShieldAlert />} title="Risk workstation" meta="Historical · parametric · stress">
            {risk.isLoading ? <PanelLoading /> : risk.isError ? <PanelError error={risk.error} /> : <RiskReadout data={risk.data!} />}
          </Panel>

          <Panel className="weather-panel" icon={<CloudSun />} title="Operational weather" meta="Open-Meteo live context">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const next = cityInput.trim(); if (next) setCity(next); }}>
              <input className="terminal-input" value={cityInput} onChange={(e) => setCityInput(e.target.value)} aria-label="Weather city" />
              <button className="terminal-button px-4">Load</button>
            </form>
            {weather.isLoading ? <PanelLoading /> : weather.isError ? <PanelError error={weather.error} /> : (
              <div className="mt-6"><div className="flex items-end justify-between"><div><p className="font-serif text-3xl">{weather.data?.city}</p><p className="text-xs text-muted-foreground">{weather.data?.region}, {weather.data?.country}</p></div><p className="font-mono text-4xl">{num(weather.data?.temperature_c, 1)}°</p></div>
                <div className="mt-6 grid grid-cols-3 gap-px bg-divider"><Metric label="Condition" value={weather.data?.condition ?? "—"} compact /><Metric label="Wind" value={`${num(weather.data?.wind_kph, 0)} km/h`} compact /><Metric label="Ops risk" value={weather.data?.operational_risk ?? "—"} compact /></div>
              </div>
            )}
          </Panel>

          <Panel className="data-panel" icon={<Database />} title="Data fabric" meta="API keys + Kaggle research files">
            <div className="space-y-2">
              {providers.data && Object.entries(providers.data).map(([name, state]) => <div key={name} className="provider-row"><span className={`status-dot ${state.configured ? "live" : ""}`} /><span className="capitalize">{titleCase(name)}</span><span className="ml-auto text-faint">{state.provider ?? (state.configured ? "ready" : "not configured")}</span></div>)}
            </div>
            <div className="mt-5 border-t border-divider pt-4"><div className="flex items-center justify-between"><p className="text-sm">Kaggle datasets</p><span className="font-mono text-primary">{datasets.data?.count ?? 0}</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{datasets.data?.message ?? "Checking local research store…"}</p><p className="mt-2 break-all font-mono text-[9px] text-faint">{datasets.data?.root}</p></div>
          </Panel>

          <Panel className="lab-panel" icon={<FlaskConical />} title="Trade lab" meta="SMA 50/200 · 5 bps costs · 30% OOS">
            {!backtest.data && !backtest.isPending && <div className="lab-empty"><BarChart3 className="size-8 text-primary" /><div><p className="font-serif text-2xl">Test the thesis before the trade.</p><p className="mt-1 text-sm text-muted-foreground">Runs the real backend strategy engine on historical {symbol} data.</p></div><button className="terminal-button ml-auto flex items-center gap-2" onClick={() => backtest.mutate()}><Play className="size-3" /> Run backtest</button></div>}
            {backtest.isPending && <PanelLoading label="Running walk-forward backtest…" />}
            {backtest.isError && <PanelError error={backtest.error} />}
            {backtest.data && <div><div className="mb-4 grid grid-cols-2 gap-px bg-divider md:grid-cols-4"><Metric label="Strategy return" value={pct(backtest.data.stats.total_return)} tone={backtest.data.stats.total_return} compact /><Metric label="OOS Sharpe" value={num(backtest.data.out_of_sample.sharpe)} compact /><Metric label="Max drawdown" value={pct(backtest.data.stats.max_drawdown)} tone={backtest.data.stats.max_drawdown} compact /><Metric label="Trades" value={String(backtest.data.n_trades)} compact /></div><ResponsiveContainer width="100%" height={220}><AreaChart data={backtestSeries}><CartesianGrid stroke="#171B1F" vertical={false} /><XAxis dataKey="date" stroke="#636C74" tick={{ fontSize: 9 }} minTickGap={48} /><YAxis stroke="#636C74" tick={{ fontSize: 9 }} /><Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="benchmark" stroke="#636C74" fill="transparent" /><Area type="monotone" dataKey="strategy" stroke="#F0A929" fill="rgba(240,169,41,.08)" /></AreaChart></ResponsiveContainer></div>}
          </Panel>
        </div>
      </main>
      <footer className="border-t border-border px-7 py-5 font-mono text-[9px] uppercase tracking-[0.16em] text-faint"><div className="mx-auto flex max-w-[1640px] justify-between"><span>FinSight Alpha · research, not execution</span><span>{user.email}</span></div></footer>
    </div>
  );
}

function Panel({ title, meta, icon, className = "", children }: { title: string; meta: string; icon: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`terminal-panel ${className}`}><header className="panel-header"><div className="flex items-center gap-2">{icon}<h2>{title}</h2></div><span>{meta}</span></header><div className="panel-body">{children}</div></section>;
}

function Metric({ label, value, tone, compact = false }: { label: string; value: string; tone?: number | null; compact?: boolean }) {
  return <div className={compact ? "metric compact" : "metric"}><p>{label}</p><strong className={tone == null ? "" : tone >= 0 ? "text-up" : "text-down"}>{value}</strong></div>;
}

function RiskReadout({ data }: { data: RiskDashboard }) {
  const source = data.headline && typeof data.headline === "object"
    ? data.headline as Record<string, unknown>
    : data as Record<string, unknown>;
  const values: Array<[string, unknown]> = [];
  const preferred = ["ann_vol", "ewma_vol", "sharpe", "max_drawdown", "beta", "corr_benchmark"];
  for (const key of preferred) if (typeof source[key] === "number") values.push([key, source[key]]);
  if (data.var && typeof data.var === "object") for (const [key, value] of Object.entries(data.var)) if (typeof value === "number" && values.length < 6) values.push([key, value]);
  if (!values.length) for (const [key, value] of Object.entries(source)) if (typeof value === "number" && values.length < 6) values.push([key, value]);
  return <div className="metric-grid">{values.slice(0, 6).map(([key, value]) => {
    const isPercent = /vol|drawdown|corr|rate|return/.test(key);
    return <Metric key={key} label={titleCase(key)} value={isPercent ? pct(value as number) : num(value as number)} tone={key.includes("drawdown") ? value as number : null} />;
  })}{!values.length && <Empty label="Risk payload returned without scalar metrics." />}</div>;
}

function PanelLoading({ label = "Loading live data…" }: { label?: string }) { return <div className="panel-state"><RefreshCw className="size-4 animate-spin text-primary" /><span>{label}</span></div>; }
function PanelError({ error }: { error: Error }) { return <div className="panel-state text-down"><Server className="size-4" /><span>{error.message}</span></div>; }
function Empty({ label }: { label: string }) { return <div className="py-8 text-center text-sm text-faint">{label}</div>; }
function FullScreenState({ label, detail, action }: { label: string; detail?: string; action?: ReactNode }) { return <main className="flex min-h-screen items-center justify-center px-5"><div className="text-center"><div className="brand-mark mx-auto mb-7">FS</div><p className="font-serif text-3xl">{label}</p>{detail && <p className="mt-3 text-sm text-muted-foreground">{detail}</p>}{action && <div className="mt-6">{action}</div>}</div></main>; }

const tooltipStyle = { background: "#0A0C0E", border: "1px solid #252A2F", borderRadius: 2, fontFamily: "JetBrains Mono", fontSize: 10 };

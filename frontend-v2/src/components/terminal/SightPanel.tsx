import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, streamAgent, type AgentToolStep } from "@/lib/api";
import { TICKERS } from "@/lib/market";

type Msg = {
  role: "user" | "ai";
  text: string;
  citations?: string[];
  tools?: string[];
  engine?: string;
};

export type SightDeskContext = {
  activePanel: string;
  ticker: string;
  displayedPrice: number;
  changePct: number;
  marketSource: "FINNHUB" | "EOD" | "SIM";
  priceProvenance: string;
  replay: boolean;
  watchlist: string[];
  paperBook: string[];
  panelData: Record<string, unknown>;
  comparedWith?: string | null;
  expectedMovePct?: number | null;
};

type SightPanelProps = {
  context: SightDeskContext;
  onCite?: (sym: string) => void;
};

const SUGGESTIONS = [
  "Why is NVDA moving?",
  "Compare AAPL vs MSFT",
  "Risk on SPY",
  "What's the vol regime today?",
];

// Render text with [TICKER] chips.
function renderWithChips(text: string, onChip?: (s: string) => void) {
  const parts = text.split(/(\[[A-Z][A-Z0-9-]*\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[([A-Z][A-Z0-9-]*)\]$/);
    if (m && TICKERS.includes(m[1])) {
      const sym = m[1];
      return (
        <button
          key={i}
          onClick={() => onChip?.(sym)}
          className="mono-caps interactive mx-0.5 inline-flex items-center border border-primary/40 bg-primary/10 px-1.5 py-0 align-baseline text-[10px] text-primary hover:border-primary"
        >
          {sym}
        </button>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function SightPanel({ context, onCite }: SightPanelProps) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [typing, setTyping] = useState("");
  const [running, setRunning] = useState(false);
  const [tools, setTools] = useState<AgentToolStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  async function ask(question: string) {
    const prompt = question.trim();
    if (!prompt || abortRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setMsgs((m) => [...m, { role: "user", text: prompt }]);
    setQ("");
    setTyping("");
    setTools([]);
    setError(null);
    setRunning(true);

    let streamed = "";
    let finalAnswer = "";
    let citations: string[] = [];
    let usedTools: AgentToolStep[] = [];
    let engine = "";
    let completed = false;

    try {
      await streamAgent(
        {
          question: prompt,
          ticker: context.ticker,
          context: {
            active_panel: context.activePanel,
            displayed_ticker: context.ticker,
            displayed_price: Number(context.displayedPrice.toFixed(4)),
            displayed_change_pct: Number(context.changePct.toFixed(4)),
            market_source: context.marketSource,
            displayed_price_provenance: context.priceProvenance,
            replay_active: context.replay,
            watchlist: context.watchlist,
            paper_book_symbols: context.paperBook,
            panel_data: context.panelData,
            compared_with: context.comparedWith ?? null,
            expected_move_pct: context.expectedMovePct ?? null,
          },
          max_steps: 6,
        },
        (event) => {
          if (!mountedRef.current) return;
          if (event.type === "token") {
            streamed += event.text;
            setTyping(streamed);
          } else if (event.type === "tool") {
            usedTools = [...usedTools, event];
            setTools(usedTools);
          } else if (event.type === "done") {
            completed = true;
            finalAnswer = event.answer?.trim() || streamed.trim();
            citations = event.citations ?? [];
            usedTools = event.steps?.length ? event.steps : usedTools;
            engine = event.engine ?? "";
          } else if (event.type === "error") {
            throw new Error(event.message || "The research agent could not complete this request.");
          }
        },
        controller.signal,
      );

      if (!completed) throw new Error("The agent stream ended before a final answer arrived.");
      if (!finalAnswer) throw new Error("The research agent returned an empty answer.");

      const toolNames = [
        ...new Set(usedTools.map((step) => step.tool).filter(Boolean)),
      ] as string[];
      setMsgs((m) => [
        ...m,
        { role: "ai", text: finalAnswer, citations, tools: toolNames, engine },
      ]);
      setTyping("");
      setTools([]);
    } catch (caught) {
      if (!mountedRef.current) return;
      if (caught instanceof DOMException && caught.name === "AbortError") {
        if (streamed.trim()) {
          setMsgs((m) => [...m, { role: "ai", text: streamed.trim(), engine: "stopped" }]);
        }
        setError("Request stopped before completion.");
      } else if (caught instanceof ApiError && caught.status === 401) {
        setError("Authentication required. Sign in to run the research agent.");
      } else {
        setError(caught instanceof Error ? caught.message : "The research agent is unavailable.");
      }
      setTyping("");
      setTools([]);
    } finally {
      if (mountedRef.current) {
        abortRef.current = null;
        setRunning(false);
      }
    }
  }

  const showEmpty = useMemo(() => msgs.length === 0 && !typing, [msgs, typing]);

  return (
    <div className="flex h-full flex-col">
      <div ref={boxRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {showEmpty && (
          <div className="mx-auto max-w-md py-10 text-center">
            <div className="mono-caps text-[10px] text-primary">FINSIGHT · SIGHT</div>
            <h3 className="mt-4 font-serif text-3xl text-foreground">Ask the desk anything.</h3>
            <p className="mt-3 text-[13px] text-muted-foreground">
              Runs the platform's market, fundamentals, news, filing, and scenario tools. Display
              context is labeled and re-verified before use.
            </p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "user" ? (
              <div className="max-w-[75%] border border-primary/30 bg-primary/5 px-3 py-2 font-mono text-[12px] tracking-wide text-foreground">
                {m.text}
              </div>
            ) : (
              <div className="max-w-[80%] font-serif text-[14px] leading-relaxed text-foreground">
                <div className="mono-caps mb-1 flex items-center gap-1.5 text-[9px] text-primary">
                  <span className="h-1 w-1 rounded-full bg-primary" /> SIGHT
                  {m.engine ? ` · ${m.engine.toUpperCase()}` : ""}
                </div>
                {renderWithChips(m.text, onCite)}
                {(m.tools?.length || m.citations?.length) && (
                  <div className="mono-caps mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8.5px] text-muted-foreground">
                    {m.tools?.length ? <span>TOOLS · {m.tools.join(" · ")}</span> : null}
                    {m.citations?.length ? <span>SOURCES · {m.citations.join(" · ")}</span> : null}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="max-w-[80%] font-serif text-[14px] leading-relaxed text-foreground">
              <div className="mono-caps mb-1 flex items-center gap-1.5 text-[9px] text-primary">
                <span className="h-1 w-1 rounded-full bg-primary animate-pulse-live" /> SIGHT ·
                streaming
              </div>
              {renderWithChips(typing, onCite)}
              <span className="ml-1 inline-block h-3 w-2 bg-primary align-middle animate-caret" />
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-divider">
        {running && (
          <div className="mono-caps border border-info/25 bg-info/5 px-3 py-2 text-[9px] text-info">
            {tools.length
              ? `RUNNING · ${tools.map((step) => step.tool || "tool").join(" → ")}`
              : "PLANNING · SELECTING EVIDENCE"}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="border border-down/30 bg-down/5 px-3 py-2 font-mono text-[11px] text-down"
          >
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={running}
              className="mono-caps interactive border border-border px-2 py-1 text-[9.5px] text-muted-foreground hover:border-primary hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={running}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) ask(q);
            }}
            placeholder="Ask about the current panel…"
            className="flex-1 border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(240,169,41,0.18)]"
          />
          <button
            onClick={() => (running ? abortRef.current?.abort() : ask(q))}
            disabled={!running && !q.trim()}
            className="mono-caps interactive bg-primary px-4 text-[10px] text-primary-foreground hover:brightness-110"
          >
            {running ? "Stop" : "Send →"}
          </button>
        </div>
      </div>
    </div>
  );
}

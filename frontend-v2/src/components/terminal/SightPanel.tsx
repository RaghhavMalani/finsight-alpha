import { useEffect, useMemo, useRef, useState } from "react";
import { TICKERS } from "@/lib/market";

type Msg = { role: "user" | "ai"; text: string };

const CANNED: Record<string, string> = {
  nvda:
    "[NVDA] is bid on continued datacenter capex commentary and a compressing IV term structure into next print. 20D momentum is +12σ over the 3Y median; dealer gamma flipped positive at 178, which typically dampens intraday range. Watch the 172 gamma flip — a break there re-opens two-way vol.",
  aapl:
    "[AAPL] is range-bound between the 225 gamma wall and 240 supply. Services growth remains the primary re-rating lever; product cycle catalysts are back-half. Ex-buyback drift is roughly +6% annualized; options market pricing a benign 3.5% earnings move.",
  spy:
    "[SPY] breadth is narrowing — the top 10 names contribute 68% of MTD return. Realized vol at 9.1 is below implied (11.4); vol carry favors sellers, but tail hedges are cheap. Cross-asset: 10Y term premium negative, credit spreads tight, gold outperforming.",
  compare:
    "Head-to-head: [NVDA] leads on momentum and OFI, while [AAPL] leads on realized-vol carry. Beta-adjusted, NVDA has produced ~2.4× the 20D excess return with ~1.8× the drawdown. Preferred pair expression: long NVDA / short QQQ delta-neutral.",
  risk:
    "[SPY] portfolio 1D 99% VaR is -1.8%; contribution dominated by [NVDA] (34%) and [META] (18%). Tail correlation to credit rising — hedge with 30-delta SPX puts (cheap by 3M z-score of -1.4).",
  default:
    "Signal ensemble is constructive — momentum, order flow, and vol regime all in the same direction. Key risk is a macro shock (rates, earnings tape, geopolitical). Prefer defined-risk expressions; [SPY] skew is priced richly enough to fund downside insurance cheaply.",
};

const SUGGESTIONS = [
  "Why is NVDA moving?",
  "Compare AAPL vs MSFT",
  "Risk on SPY",
  "What's the vol regime today?",
];

function respond(q: string): string {
  const low = q.toLowerCase();
  if (/\bvs\b|compare|versus/.test(low)) return CANNED.compare;
  if (/\brisk|var|drawdown/.test(low)) return CANNED.risk;
  for (const k of ["nvda", "aapl", "spy"]) if (low.includes(k)) return CANNED[k];
  return CANNED.default;
}

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

export function SightPanel({ onCite }: { onCite?: (sym: string) => void } = {}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [typing, setTyping] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  function ask(question: string) {
    if (!question.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: question.trim() }]);
    setQ("");
    const answer = respond(question);
    let i = 0;
    setTyping("");
    const iv = setInterval(() => {
      i += 2;
      setTyping(answer.slice(0, i));
      if (i >= answer.length) {
        clearInterval(iv);
        setMsgs((m) => [...m, { role: "ai", text: answer }]);
        setTyping("");
      }
    }, 12);
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
              Earnings, positioning, risk, cross-asset context — answers cite the tickers they draw from.
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
                </div>
                {renderWithChips(m.text, onCite)}
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="max-w-[80%] font-serif text-[14px] leading-relaxed text-foreground">
              <div className="mono-caps mb-1 flex items-center gap-1.5 text-[9px] text-primary">
                <span className="h-1 w-1 rounded-full bg-primary animate-pulse-live" /> SIGHT · streaming
              </div>
              {renderWithChips(typing, onCite)}
              <span className="ml-1 inline-block h-3 w-2 bg-primary align-middle animate-caret" />
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-divider">
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") ask(q);
            }}
            placeholder="Ask the desk…  (⌘↵ to send)"
            className="flex-1 border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(240,169,41,0.18)]"
          />
          <button
            onClick={() => ask(q)}
            className="mono-caps interactive bg-primary px-4 text-[10px] text-primary-foreground hover:brightness-110"
          >
            Send →
          </button>
        </div>
      </div>
    </div>
  );
}


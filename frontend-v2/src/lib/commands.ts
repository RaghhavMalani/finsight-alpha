import Fuse from "fuse.js";
import { TICKERS } from "@/lib/market";

export type CommandDef = {
  code: string;
  label: string;
  description: string;
  keywords?: string[];
};

export const COMMANDS: CommandDef[] = [
  {
    code: "HOME",
    label: "Home",
    description: "Market overview dashboard",
    keywords: ["dashboard", "overview", "start", "brief"],
  },
  {
    code: "MK",
    label: "Markets",
    description: "Live price, indicators, depth",
    keywords: ["market", "price", "quote", "depth", "chart"],
  },
  {
    code: "OC",
    label: "Options",
    description: "Chain, walls, strategy builder",
    keywords: ["option", "chain", "greek", "call", "put", "strategy", "spread"],
  },
  {
    code: "MC",
    label: "Monte Carlo",
    description: "3D probability landscape",
    keywords: ["monte", "simulation", "paths", "sim", "gbm", "landscape"],
  },
  {
    code: "GR",
    label: "Greeks",
    description: "3D greek surfaces",
    keywords: ["greek", "delta", "gamma", "vega", "theta", "surface"],
  },
  {
    code: "ML",
    label: "ML + analyst",
    description: "Signals · consensus · peers",
    keywords: ["machine", "learning", "signal", "analyst", "consensus", "peers", "bull", "bear"],
  },
  {
    code: "NEWS",
    label: "News impact",
    description: "Catalyst · transmission · company potential",
    keywords: ["news", "headline", "sentiment", "catalyst", "impact", "potential", "scenario"],
  },
  {
    code: "CX",
    label: "Correlation",
    description: "Matrix · Web · Dependencies",
    keywords: ["correlate", "correlation", "cross", "matrix", "web", "graph", "dependency"],
  },
  {
    code: "VS",
    label: "Vol surface",
    description: "3D implied volatility surface",
    keywords: ["surface", "vol", "volatility", "iv", "3d", "smile", "skew"],
  },
  {
    code: "ALT",
    label: "Stock intelligence",
    description: "Industry · supply chain · trade · vintages",
    keywords: [
      "industry",
      "supply chain",
      "semiconductor",
      "chip",
      "trade",
      "fred",
      "alfred",
      "comtrade",
      "vintage",
      "lineage",
    ],
  },
  {
    code: "BT",
    label: "Backtest",
    description: "Strategy backtesting",
    keywords: ["backtest", "sharpe", "walk-forward", "equity", "drawdown"],
  },
  {
    code: "STRAT",
    label: "Strategy builder",
    description: "Rules · sizing · save",
    keywords: ["strategy", "rules", "creator", "builder", "signal", "trade"],
  },
  {
    code: "RISK",
    label: "Risk manager",
    description: "VaR · exposure · stress · hedge",
    keywords: ["risk", "var", "exposure", "stress", "hedge", "portfolio", "commodities"],
  },
  {
    code: "SIGHT",
    label: "AI research",
    description: "Ask the desk",
    keywords: ["ai", "ask", "research", "assistant", "brief"],
  },
  {
    code: "TOUR",
    label: "Tour",
    description: "Replay the guided tour",
    keywords: ["tour", "help", "onboard", "guide", "spotlight"],
  },
];

export type ParsedCommand = {
  code: string;
  symbol?: string;
  symbol2?: string;
  action?: "GO" | "COMPARE";
};

const NL_HINTS: Array<{ match: RegExp; code: string }> = [
  { match: /\b(news|headline|sentiment|catalyst|company\s+potential)\b/i, code: "NEWS" },
  { match: /\b(monte\s*carlo|simulate|paths|landscape)\b/i, code: "MC" },
  { match: /\b(vol(atility)?\s*(surface|smile|skew)|iv\s*surface)\b/i, code: "VS" },
  { match: /\b(greeks?|delta|gamma|vega|theta|vanna|charm|gex)\b/i, code: "GR" },
  { match: /\b(option|chain|spread|straddle|condor)\b/i, code: "OC" },
  {
    match: /\b(depend|supplier|customer|competitor|shock|propagat|elasticity|impact)\b/i,
    code: "CX",
  },
  { match: /\b(correlate|correlation|matrix|web)\b/i, code: "CX" },
  { match: /\b(backtest|sharpe|equity\s*curve|walk.?forward)\b/i, code: "BT" },
  { match: /\b(strategy|rules?\s*builder|create\s*strat)\b/i, code: "STRAT" },
  { match: /\b(risk|drawdown|var|hedge|exposure|stress|commodit)\b/i, code: "RISK" },
  { match: /\b(regime|hsmm|forecast|tft|recommend|discover|pairs?|stat.?arb)\b/i, code: "ML" },
  { match: /\b(analyst|consensus|peers?|bull\s*case|bear\s*case)\b/i, code: "ML" },
  { match: /\b(momentum|signal|ml|model)\b/i, code: "ML" },
  {
    match:
      /\b(industry|supply chain|semiconductor|chip|trade|comtrade|fred|alfred|vintage|lineage|dataset)\b/i,
    code: "ALT",
  },
  { match: /\b(brief|ask|research|explain)\b/i, code: "SIGHT" },
  { match: /\b(market|price|quote|tape|depth|chart)\b/i, code: "MK" },
];

export function parseCommand(raw: string): ParsedCommand | null {
  const input = raw.trim();
  if (!input) return null;

  const upperAll = input.toUpperCase();
  const isSymbol = (value: string) => /^[A-Z0-9][A-Z0-9.\-^=]{0,24}$/.test(value);
  const vsMatch = upperAll.match(
    /\b([A-Z][A-Z0-9.\-^=]*)\s+(?:VS|V|VERSUS)\s+([A-Z][A-Z0-9.\-^=]*)\b/,
  );
  if (vsMatch && isSymbol(vsMatch[1]) && isSymbol(vsMatch[2])) {
    return { code: "HOME", symbol: vsMatch[1], symbol2: vsMatch[2], action: "COMPARE" };
  }
  const cmpMatch = upperAll.match(/\bCMP\s+([A-Z][A-Z0-9.\-^=]*)(?:\s+([A-Z][A-Z0-9.\-^=]*))?\b/);
  if (cmpMatch && isSymbol(cmpMatch[1])) {
    return {
      code: "HOME",
      symbol: cmpMatch[1],
      symbol2: cmpMatch[2] && isSymbol(cmpMatch[2]) ? cmpMatch[2] : undefined,
      action: "COMPARE",
    };
  }

  const tokens = upperAll.split(/\s+/);
  const foundCode = tokens.find((t) => COMMANDS.some((c) => c.code === t));
  const reserved = new Set([
    "GO",
    "CMP",
    "VS",
    "V",
    "VERSUS",
    ...COMMANDS.map((command) => command.code),
  ]);
  const explicitSymbol = foundCode
    ? tokens.find((token) => token !== foundCode && !reserved.has(token) && isSymbol(token))
    : undefined;
  const trailing = tokens.at(-1);
  const foundSymbol =
    tokens.find((token) => TICKERS.includes(token)) ??
    explicitSymbol ??
    (trailing &&
    !reserved.has(trailing) &&
    isSymbol(trailing) &&
    (tokens.length === 1 || trailing.length <= 25)
      ? trailing
      : undefined);
  const isGo = tokens.includes("GO");

  if (foundCode) return { code: foundCode, symbol: foundSymbol, action: isGo ? "GO" : undefined };
  if (foundSymbol) return { code: "HOME", symbol: foundSymbol, action: isGo ? "GO" : undefined };

  for (const h of NL_HINTS) {
    if (h.match.test(input)) return { code: h.code, symbol: foundSymbol };
  }
  return null;
}

const fuse = new Fuse(COMMANDS, {
  keys: ["code", "label", "description", "keywords"],
  threshold: 0.4,
  ignoreLocation: true,
});

export function fuzzyCommands(query: string): CommandDef[] {
  const q = query.trim();
  if (!q) return COMMANDS;
  const results = fuse.search(q).map((r) => r.item);
  if (results.length) return results;
  const up = q.toUpperCase();
  return COMMANDS.filter((c) => c.code.startsWith(up) || c.label.toUpperCase().includes(up));
}

export function nearestCommand(query: string): CommandDef {
  const r = fuzzyCommands(query);
  return r[0] ?? COMMANDS[0];
}

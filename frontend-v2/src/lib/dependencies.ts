// Curated dependency graph for the sim tickers.
// Each ticker has related nodes with a type + strength (0..1) + one-line note.

export type DepType = "supplier" | "customer" | "competitor" | "index" | "sector";
export type DepEdge = {
  id: string;
  type: DepType;
  strength: number;
  note: string;
};

export const DEPENDENCIES: Record<string, DepEdge[]> = {
  NVDA: [
    { id: "TSM", type: "supplier", strength: 0.95, note: "Fabricates NVDA's leading-edge H100/B200 GPUs" },
    { id: "ASML", type: "supplier", strength: 0.55, note: "EUV lithography enables the process node" },
    { id: "MSFT", type: "customer", strength: 0.88, note: "Azure AI clusters — largest H100 buyer" },
    { id: "META", type: "customer", strength: 0.82, note: "Reality Labs + AI training farms" },
    { id: "AMZN", type: "customer", strength: 0.74, note: "AWS Trainium co-exists but NVDA still core" },
    { id: "GOOGL", type: "customer", strength: 0.58, note: "GCP GPU capacity + Waymo" },
    { id: "AMD", type: "competitor", strength: 0.72, note: "MI300X targets same accelerator TAM" },
    { id: "INTC", type: "competitor", strength: 0.35, note: "Gaudi + Habana — trailing" },
    { id: "SMH", type: "sector", strength: 0.90, note: "Largest weight in semi ETF" },
    { id: "SPX", type: "index", strength: 0.62, note: "Top-5 S&P 500 constituent" },
  ],
  AAPL: [
    { id: "TSM", type: "supplier", strength: 0.92, note: "Sole fab for A-series/M-series silicon" },
    { id: "FOXCONN", type: "supplier", strength: 0.85, note: "Primary iPhone assembler" },
    { id: "QCOM", type: "supplier", strength: 0.45, note: "Modem chips through 2027 transition" },
    { id: "GOOGL", type: "customer", strength: 0.60, note: "$20B/yr default search TAC payment" },
    { id: "SAMSUNG", type: "competitor", strength: 0.78, note: "Galaxy line — global #2 in premium" },
    { id: "MSFT", type: "competitor", strength: 0.35, note: "Surface/Windows PC overlap" },
    { id: "XLK", type: "sector", strength: 0.88, note: "Largest holding in tech select ETF" },
    { id: "SPX", type: "index", strength: 0.70, note: "Top S&P weight" },
  ],
  MSFT: [
    { id: "NVDA", type: "supplier", strength: 0.85, note: "Azure H100 fleet backbone" },
    { id: "OPENAI", type: "supplier", strength: 0.90, note: "Exclusive Azure hosting + IP license" },
    { id: "AMD", type: "supplier", strength: 0.40, note: "MI300X buyers of last resort" },
    { id: "GOOGL", type: "competitor", strength: 0.80, note: "GCP + Gemini vs Azure + Copilot" },
    { id: "AMZN", type: "competitor", strength: 0.88, note: "AWS dominates cloud market share" },
    { id: "AAPL", type: "competitor", strength: 0.35, note: "Windows vs macOS + Surface line" },
    { id: "XLK", type: "sector", strength: 0.85, note: "Top-2 tech ETF holding" },
    { id: "SPX", type: "index", strength: 0.68, note: "Top-2 S&P weight" },
  ],
  META: [
    { id: "NVDA", type: "supplier", strength: 0.82, note: "H100 clusters power Llama training" },
    { id: "TSM", type: "supplier", strength: 0.40, note: "MTIA custom silicon fab" },
    { id: "GOOGL", type: "competitor", strength: 0.88, note: "Ad-dollar duopoly" },
    { id: "TIKTOK", type: "competitor", strength: 0.75, note: "Reels vs TikTok engagement war" },
    { id: "SNAP", type: "competitor", strength: 0.40, note: "Younger-demo pressure" },
    { id: "XLC", type: "sector", strength: 0.90, note: "Comm services top holding" },
    { id: "SPX", type: "index", strength: 0.42, note: "Top-10 S&P weight" },
  ],
  GOOGL: [
    { id: "TSM", type: "supplier", strength: 0.55, note: "TPU v5/v6 fabrication" },
    { id: "AAPL", type: "customer", strength: 0.60, note: "Safari default-search revenue" },
    { id: "MSFT", type: "competitor", strength: 0.85, note: "Search + cloud + AI on every axis" },
    { id: "META", type: "competitor", strength: 0.88, note: "Digital ad duopoly" },
    { id: "AMZN", type: "competitor", strength: 0.65, note: "Cloud + retail-search encroachment" },
    { id: "XLC", type: "sector", strength: 0.85, note: "Comm services top weight" },
    { id: "SPX", type: "index", strength: 0.50, note: "Top-10 S&P weight" },
  ],
  AMZN: [
    { id: "NVDA", type: "supplier", strength: 0.72, note: "AWS GPU inventory" },
    { id: "TSM", type: "supplier", strength: 0.35, note: "Trainium/Inferentia fab" },
    { id: "MSFT", type: "competitor", strength: 0.88, note: "AWS vs Azure — #1 vs #2 cloud" },
    { id: "GOOGL", type: "competitor", strength: 0.65, note: "GCP + shopping search" },
    { id: "WMT", type: "competitor", strength: 0.70, note: "US retail share war" },
    { id: "XLY", type: "sector", strength: 0.80, note: "Cons discretionary top weight" },
    { id: "SPX", type: "index", strength: 0.45, note: "Top-5 S&P weight" },
  ],
  TSLA: [
    { id: "CATL", type: "supplier", strength: 0.85, note: "Primary LFP cell supplier ex-US" },
    { id: "PANW", type: "supplier", strength: 0.30, note: "Cybersecurity for Autopilot fleet" },
    { id: "BYD", type: "competitor", strength: 0.90, note: "Global EV volume leader" },
    { id: "F", type: "competitor", strength: 0.50, note: "F-150 Lightning + Mach-E" },
    { id: "GM", type: "competitor", strength: 0.55, note: "Bolt + Ultium platform" },
    { id: "XLY", type: "sector", strength: 0.75, note: "Cons discretionary top-3" },
    { id: "SPX", type: "index", strength: 0.35, note: "Top-15 S&P weight" },
  ],
  SPY: [
    { id: "NVDA", type: "customer", strength: 0.62, note: "Top-5 constituent" },
    { id: "AAPL", type: "customer", strength: 0.70, note: "Top-1 constituent" },
    { id: "MSFT", type: "customer", strength: 0.68, note: "Top-2 constituent" },
    { id: "GOOGL", type: "customer", strength: 0.50, note: "Top-8 constituent" },
    { id: "META", type: "customer", strength: 0.42, note: "Top-10 constituent" },
    { id: "QQQ", type: "competitor", strength: 0.85, note: "Nasdaq-100 overlap" },
    { id: "SPX", type: "index", strength: 1.00, note: "Tracks the S&P 500 index" },
  ],
  QQQ: [
    { id: "NVDA", type: "customer", strength: 0.72, note: "Top-3 constituent" },
    { id: "AAPL", type: "customer", strength: 0.78, note: "Top-1 constituent" },
    { id: "MSFT", type: "customer", strength: 0.76, note: "Top-2 constituent" },
    { id: "SPY", type: "competitor", strength: 0.85, note: "S&P 500 overlap" },
    { id: "NDX", type: "index", strength: 1.00, note: "Tracks Nasdaq-100" },
  ],
  "BTC-USD": [
    { id: "COIN", type: "customer", strength: 0.85, note: "Coinbase revenue tied to BTC volume" },
    { id: "MSTR", type: "customer", strength: 0.95, note: "Treasury holds 200k+ BTC" },
    { id: "IBIT", type: "customer", strength: 0.90, note: "iShares spot BTC ETF" },
    { id: "ETH", type: "competitor", strength: 0.72, note: "Largest alt L1" },
    { id: "GLD", type: "competitor", strength: 0.45, note: "Digital-gold narrative overlap" },
  ],
};

export function depsOf(symbol: string): DepEdge[] {
  return DEPENDENCIES[symbol] ?? [];
}

export const DEP_COLOR: Record<DepType, string> = {
  supplier: "#45B9D3",   // cyan
  customer: "#42C98B",   // green
  competitor: "#F06464", // red
  sector: "#F0A929",     // amber
  index: "#B58BF0",      // violet
};

export const DEP_LABEL: Record<DepType, string> = {
  supplier: "SUPPLIER",
  customer: "CUSTOMER",
  competitor: "COMPETITOR",
  sector: "SECTOR ETF",
  index: "INDEX",
};

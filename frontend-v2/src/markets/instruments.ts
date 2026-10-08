export type ExchangeCode = "UN" | "UQ" | "UP" | "IS" | "IB";
export type Instrument = {
  symbol: string;
  providerSymbol: string;
  name: string;
  code: ExchangeCode;
  exchange: "NYSE" | "NASDAQ" | "NYSE Arca" | "NSE" | "BSE";
  market: "US" | "INDIA";
  currency: "USD" | "INR";
  timezone: string;
  session: string;
};

const venues = {
  UN: {
    exchange: "NYSE",
    market: "US",
    currency: "USD",
    timezone: "America/New_York",
    session: "09:30–16:00 ET",
  },
  UQ: {
    exchange: "NASDAQ",
    market: "US",
    currency: "USD",
    timezone: "America/New_York",
    session: "09:30–16:00 ET",
  },
  UP: {
    exchange: "NYSE Arca",
    market: "US",
    currency: "USD",
    timezone: "America/New_York",
    session: "09:30–16:00 ET",
  },
  IS: {
    exchange: "NSE",
    market: "INDIA",
    currency: "INR",
    timezone: "Asia/Kolkata",
    session: "09:15–15:30 IST",
  },
  IB: {
    exchange: "BSE",
    market: "INDIA",
    currency: "INR",
    timezone: "Asia/Kolkata",
    session: "09:15–15:30 IST",
  },
} as const;

function instrument(
  symbol: string,
  name: string,
  code: ExchangeCode,
  providerSymbol = symbol,
): Instrument {
  return { symbol, providerSymbol, name, code, ...venues[code] };
}

/** Reference identities, not quotes. Never infer a listing venue from a US symbol's spelling. */
export const INSTRUMENTS: Instrument[] = [
  instrument("SPY", "SPDR S&P 500 ETF Trust", "UP"),
  instrument("QQQ", "Invesco QQQ Trust", "UQ"),
  instrument("IWM", "iShares Russell 2000 ETF", "UP"),
  instrument("AAPL", "Apple", "UQ"),
  instrument("MSFT", "Microsoft", "UQ"),
  instrument("NVDA", "NVIDIA", "UQ"),
  instrument("TSLA", "Tesla", "UQ"),
  instrument("AMZN", "Amazon", "UQ"),
  instrument("GOOGL", "Alphabet", "UQ"),
  instrument("META", "Meta Platforms", "UQ"),
  instrument("TSM", "Taiwan Semiconductor Manufacturing ADR", "UN"),
  instrument("JPM", "JPMorgan Chase", "UN"),
  instrument("XOM", "Exxon Mobil", "UN"),
  instrument("RELIANCE", "Reliance Industries", "IS", "RELIANCE.NS"),
  instrument("TCS", "Tata Consultancy Services", "IS", "TCS.NS"),
  instrument("INFY", "Infosys", "IS", "INFY.NS"),
  instrument("HDFCBANK", "HDFC Bank", "IS", "HDFCBANK.NS"),
  instrument("ICICIBANK", "ICICI Bank", "IS", "ICICIBANK.NS"),
  instrument("SBIN", "State Bank of India", "IS", "SBIN.NS"),
  instrument("BHARTIARTL", "Bharti Airtel", "IS", "BHARTIARTL.NS"),
  instrument("ITC", "ITC", "IS", "ITC.NS"),
  instrument("NIFTYBEES", "Nippon India ETF Nifty BeES", "IS", "NIFTYBEES.NS"),
  instrument("RELIANCE", "Reliance Industries", "IB", "500325.BO"),
];

export function lookupInstrument(symbol: string): Instrument | undefined {
  const upper = symbol.trim().toUpperCase();
  return (
    INSTRUMENTS.find((i) => i.providerSymbol === upper) ??
    INSTRUMENTS.find((i) => i.symbol === upper) ??
    (/^[A-Z0-9][A-Z0-9.-]{0,21}\.NS$/.test(upper)
      ? instrument(upper.slice(0, -3), "NSE provider symbol; coverage unavailable", "IS", upper)
      : undefined)
  );
}

export function resolveInstrument(symbol: string, exchange?: string): Instrument {
  const upper = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9^][A-Z0-9.^=-]{0,24}$/.test(upper)) throw new Error("Enter a valid ticker.");
  const alias = exchange?.toUpperCase();
  if (alias && !["US", "UN", "UQ", "UP", "IN", "IS", "IB"].includes(alias))
    throw new Error("Exchange codes: US, UN, UQ, UP, IN, IS, IB.");
  const code = alias === "IN" ? "IS" : alias;
  const candidates = INSTRUMENTS.filter((i) => i.symbol === upper || i.providerSymbol === upper);
  const match =
    code === "US"
      ? candidates.find((i) => i.market === "US")
      : candidates.find((i) => !code || i.code === code);
  if (match) return match;
  if (candidates.length)
    throw new Error("The ticker and exchange conflict. Select its recorded listing.");
  if (code === "IB")
    throw new Error("No verified BSE identifier for this symbol. Use a recorded instrument.");
  const venue = code === "IS" || (!code && upper.endsWith(".NS")) ? "IS" : code;
  if (!venue || venue === "US")
    throw new Error("Unknown listing. Specify UN, UQ, UP or IN, or choose a recorded instrument.");
  if (upper.endsWith(".NS") && venue !== "IS") throw new Error("An .NS symbol requires IN or IS.");
  if (upper.endsWith(".BO"))
    throw new Error("Choose a recorded BSE instrument to establish its identity.");
  return instrument(
    upper.replace(/\.NS$/, ""),
    "Listing supplied in command; replay coverage unavailable",
    venue as ExchangeCode,
    venue === "IS" && !upper.endsWith(".NS") ? `${upper}.NS` : upper,
  );
}

export function instrumentMoney(value: number, currency: "USD" | "INR", digits = 2) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

import { resolveInstrument, type Instrument } from "../../markets/instruments.ts";
import { WORKSPACES } from "../workspaces.ts";

export type CommandTarget = { to: string; search: Record<string, string>; instrument?: Instrument };
const functions: Record<string, string> = {
  DES: "/markets",
  GP: "/markets",
  OMON: "/markets/options",
  FA: "/markets/fundamentals",
  REG: "/dynamics",
  GE: "/globe",
  RISK: "/risk",
  FACT: "/factors",
  EXEC: "/execution",
  RES: "/research",
  OBS: "/observatory",
  AGENTS: "/forge",
  DATA: "/data",
};
export const COMMAND_CODES = Object.keys(functions);

export function parseCommand(text: string, currentTicker = "SPY"): CommandTarget {
  const tokens = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (["GO", "<GO>"].includes(tokens.at(-1) ?? "")) tokens.pop();
  if (!tokens.length) throw new Error("Enter a ticker and function, for example RELIANCE IN DES.");
  const workspace = WORKSPACES.find(
    (w) => tokens.length === 1 && (w.command === tokens[0] || w.label === tokens[0]),
  );
  if (workspace) return { to: workspace.to, search: { ticker: currentTicker } };
  if (tokens.length < 2 || tokens.length > 3)
    throw new Error("Use TICKER [EXCHANGE] FUNCTION, then GO.");
  const fn = tokens.at(-1)!;
  if (!functions[fn]) throw new Error(`Unknown function. Use ${COMMAND_CODES.join(", ")}.`);
  const asset = resolveInstrument(tokens[0], tokens.length === 3 ? tokens[1] : undefined);
  return {
    to: functions[fn],
    search: {
      ticker: asset.providerSymbol,
      exchange: asset.code,
      ...(fn === "GP" ? { view: "graph" } : {}),
    },
    instrument: asset,
  };
}

import assert from "node:assert/strict";
import { parseCommand } from "../src/app/command/mnemonics.ts";
import { activeWorkspace, FUNCTION_KEYS, WORKSPACES } from "../src/app/workspaces.ts";
import { instrumentMoney, resolveInstrument } from "../src/markets/instruments.ts";

let count = 0;
for (const [command, ticker, exchange, to] of [
  ["SPY DES", "SPY", "UP", "/markets"],
  ["SPY US GP <GO>", "SPY", "UP", "/markets"],
  ["SPY UP GP GO", "SPY", "UP", "/markets"],
  ["AAPL UQ FA", "AAPL", "UQ", "/markets/fundamentals"],
  ["TSM UN GE", "TSM", "UN", "/globe"],
  ["RELIANCE IN DES", "RELIANCE.NS", "IS", "/markets"],
  ["reliance is gp", "RELIANCE.NS", "IS", "/markets"],
  ["RELIANCE IB DES", "500325.BO", "IB", "/markets"],
  ["RELIANCE.NS REG", "RELIANCE.NS", "IS", "/dynamics"],
  ["QQQ US RISK", "QQQ", "UQ", "/risk"],
  ["SPY FACT", "SPY", "UP", "/factors"],
  ["SPY EXEC", "SPY", "UP", "/execution"],
]) {
  const result = parseCommand(command);
  assert.deepEqual(
    [result.search.ticker, result.search.exchange, result.to],
    [ticker, exchange, to],
  );
  count++;
}
for (const text of [
  "SPY UQ DES",
  "AAPL IN DES",
  "RELIANCE.NS UN GP",
  "SPY XYZ GP",
  "SPY BAD",
  "SPY",
  "SPY UP GP EXTRA",
  "<script> UN DES",
  "UNKNOWN IB DES",
  "UNKNOWN DES",
]) {
  assert.throws(() => parseCommand(text), undefined, text);
  count++;
}
assert.equal(parseCommand("FACT", "RELIANCE.NS").search.ticker, "RELIANCE.NS");
assert.equal(parseCommand("EXECUTION").to, "/execution");
assert.equal(parseCommand("SPY GP").search.view, "graph");
assert.equal(resolveInstrument("TCS", "IN").session, "09:15–15:30 IST");
assert.match(instrumentMoney(1234.56, "INR"), /₹/);
assert.match(instrumentMoney(1234.56, "USD"), /\$/);
assert.deepEqual(FUNCTION_KEYS, ["F1", "F2", "F3", "F4", "F6", "F8", "F9", "F10"]);
assert.equal(WORKSPACES.length, 10);
for (const w of WORKSPACES) assert.equal(activeWorkspace(w.to), w.id);
for (const p of ["/runs/a", "/bench/a", "/worlds", "/artifacts", "/reality/a"])
  assert.equal(activeWorkspace(p), "agents");
console.log(`Shell: ${count + 23} command, exchange, currency and workspace checks passed.`);

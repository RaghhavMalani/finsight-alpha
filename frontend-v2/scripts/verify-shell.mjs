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
for (const id of ["US-MKT", "IN-MKT"]) {
  for (const [code, to] of [
    ["GP", "/markets"],
    ["REG", "/dynamics"],
    ["OBS", "/observatory"],
    ["DATA", "/data"],
  ]) {
    const target = parseCommand(`${id} ${code}`);
    assert.equal(target.to, to);
    assert.equal(target.search.ticker, id);
    assert.equal(target.instrument, undefined);
    count++;
  }
  assert.throws(() => parseCommand(`${id} US GP`));
  assert.throws(() => parseCommand(`${id} OMON`));
  count += 2;
}
assert.equal(resolveInstrument("TCS", "IN").session, "09:15–15:30 IST");
assert.match(instrumentMoney(1234.56, "INR"), /₹/);
assert.match(instrumentMoney(1234.56, "USD"), /\$/);
assert.deepEqual(FUNCTION_KEYS, ["F1", "F2", "F3", "F4", "F6", "F8", "F9", "F10"]);
assert.equal(WORKSPACES.length, 10);
for (const w of WORKSPACES) assert.equal(activeWorkspace(w.to), w.id);
for (const p of ["/runs/a", "/bench/a", "/worlds", "/artifacts", "/reality/a"])
  assert.equal(activeWorkspace(p), "agents");
console.log(`Shell: ${count + 23} command, exchange, currency and workspace checks passed.`);

const urlIndex = process.argv.indexOf("--url");
if (urlIndex > 0) {
  const base = process.argv[urlIndex + 1].replace(/\/$/, "");
  const { chromium, firefox } = await import("playwright");
  const headed = process.argv.includes("--headed");
  for (const [name, launch] of [
    ["Chrome", () => chromium.launch({ channel: "chrome", headless: !headed })],
    ["Edge", () => chromium.launch({ channel: "msedge", headless: !headed })],
    [
      "Firefox",
      () =>
        firefox.launch({
          headless: !headed,
          firefoxUserPrefs: { "accessibility.warn_on_browsewithcaret": false },
        }),
    ],
  ]) {
    const browser = await launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      for (const w of WORKSPACES) {
        if (process.argv.includes("--debug")) console.log(`${name}: testing ${w.key}`);
        await page.goto(`${base}/data?ticker=RELIANCE.NS`);
        await page.locator('.shell[data-ready="true"]').waitFor();
        await page.getByRole("button", { name: "Open command palette" }).waitFor();
        // A visible SSR button does not prove hydration; exercise a React state update first.
        await page.getByRole("button", { name: "Open command palette" }).click();
        await page.getByRole("dialog").waitFor();
        // Opening is committed before the palette's animation-frame focus effect runs.
        // Escape belongs to the dialog only once its input actually receives focus.
        await page.waitForFunction(
          () => document.activeElement === document.querySelector('[role="dialog"] input'),
        );
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        // Exercise the actual browser keyboard path, then inspect the final handled event.
        await page.evaluate(() => {
          document.activeElement?.blur();
          window.addEventListener(
            "keydown",
            (e) => {
              const record = () =>
                sessionStorage.setItem(
                  "key-check",
                  JSON.stringify({ key: e.key, prevented: e.defaultPrevented }),
                );
              record();
              setTimeout(record, 0);
            },
            { once: true },
          );
        });
        const dialogs = [];
        const onDialog = async (d) => {
          dialogs.push(d.message());
          await d.dismiss();
        };
        page.on("dialog", onDialog);
        // When the browser reloads on uncaptured F5, wait for the document
        // commit before inspecting its preserved event or navigating again.
        // Some headless browser channels leave F5 to browser UI without reloading.
        const refresh =
          w.key === "F5"
            ? page
                .waitForEvent("framenavigated", {
                  predicate: (frame) => frame === page.mainFrame(),
                  timeout: 2000,
                })
                .catch(() => null)
            : null;
        await page.keyboard.press(w.key);
        if (refresh) {
          if (await refresh) await page.waitForLoadState("networkidle");
        }
        if (FUNCTION_KEYS.includes(w.key)) {
          await page
            .locator(`.shell[data-workspace="${w.id}"]`)
            .waitFor({ timeout: 15000 })
            .catch(async (error) => {
              console.error(
                `${name} ${w.key}: ${page.url()} event=${await page.evaluate(() => sessionStorage.getItem("key-check"))}`,
              );
              throw error;
            });
          const event = JSON.parse(await page.evaluate(() => sessionStorage.getItem("key-check")));
          assert.deepEqual(
            event,
            { key: w.key, prevented: true },
            `${name} did not release ${w.key}`,
          );
          assert.ok(
            await page.evaluate(() => document.hasFocus()),
            `${name} retained ${w.key} outside the document`,
          );
        } else {
          await page.waitForTimeout(200);
          assert.match(
            page.url(),
            /\/data\?ticker=RELIANCE.NS/,
            `${name}: reserved ${w.key} navigated a workspace`,
          );
          const event = JSON.parse(await page.evaluate(() => sessionStorage.getItem("key-check")));
          assert.deepEqual(
            event,
            { key: w.key, prevented: false },
            `${name}: ${w.key} was captured`,
          );
        }
        page.off("dialog", onDialog);
      }
      // All captured keys remain native while editing; contenteditable, textarea and select too.
      await page.goto(`${base}/data`);
      await page.getByLabel("Command", { exact: true }).waitFor();
      for (const selector of [
        "#terminal-command",
        "textarea",
        "select",
        "[contenteditable='true']",
      ]) {
        if (selector.startsWith("#")) await page.locator(selector).focus();
        else
          await page.evaluate((tag) => {
            const el = document.createElement(tag === "[contenteditable='true']" ? "div" : tag);
            if (tag.startsWith("[")) el.contentEditable = "true";
            document.body.append(el);
            el.focus();
          }, selector);
        for (const key of FUNCTION_KEYS) {
          const handled = await page.evaluate((key) => {
            const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
            document.activeElement.dispatchEvent(e);
            return e.defaultPrevented;
          }, key);
          assert.equal(
            handled,
            false,
            `${name}: ${key} intercepted text-field focus (${selector})`,
          );
        }
      }
      for (const [command, workspace, ticker, graph] of [
        ["RELIANCE IN DES", "market", "RELIANCE.NS", false],
        ["SPY US GP", "market", "SPY", true],
        ["RELIANCE IB DES", "market", "500325.BO", false],
        ["FACT", "factors", "500325.BO", false],
        ["EXEC", "execution", "500325.BO", false],
      ]) {
        if (process.argv.includes("--debug")) console.log(`${name}: command ${command}`);
        await page.getByLabel("Command", { exact: true }).fill(command);
        await page.getByLabel("Command", { exact: true }).press("Enter");
        // Several consecutive commands share MARKET. Its existing shell alone
        // does not prove that navigation committed before the next input fill.
        await page.waitForURL(
          (url) =>
            url.pathname === (workspace === "market" ? "/markets" : "/" + workspace) &&
            url.searchParams.get("ticker") === ticker &&
            url.searchParams.get("view") === (graph ? "graph" : null),
        );
        await page.locator(`.shell[data-ready="true"][data-workspace="${workspace}"]`).waitFor();
        await page.waitForLoadState("networkidle");
      }
      for (const label of ["FACTORS", "EXECUTION"]) {
        await page
          .getByRole("navigation", { name: "Workspaces" })
          .getByText(label, { exact: true })
          .click();
        await page.locator(`.shell[data-workspace="${label.toLowerCase()}"]`).waitFor();
        await page.keyboard.press("Control+k");
        await page.getByRole("dialog").getByRole("combobox").fill(label);
        await page
          .getByRole("option")
          .filter({ hasText: `F${label === "FACTORS" ? "5" : "7"} · ${label}` })
          .click();
      }
      console.log(
        `${name}: F1–F10, native F5/F7, field focus, command line, FACTORS/EXECUTION bar and palette passed.`,
      );
    } finally {
      await browser.close();
    }
  }
}

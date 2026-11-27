import assert from "node:assert/strict";
import { parseCommand } from "../src/app/command/mnemonics.ts";
import {
  activeWorkspace,
  CAPTURED_FUNCTION_KEYS,
  FUNCTION_KEYS,
  workspaceForAltDigit,
  WORKSPACES,
} from "../src/app/workspaces.ts";
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
    ["FACT", "/factors"],
  ]) {
    const target = parseCommand(`${id} ${code}`);
    assert.equal(target.to, to);
    assert.equal(target.search.ticker, id);
    assert.equal(target.instrument, undefined);
    if (code === "FACT") assert.equal(target.search.country, id === "US-MKT" ? "US" : "INDIA");
    count++;
  }
  assert.throws(() => parseCommand(`${id} US GP`));
  assert.throws(() => parseCommand(`${id} OMON`));
  count += 2;
}
assert.equal(resolveInstrument("TCS", "IN").session, "09:15–15:30 IST");
assert.match(instrumentMoney(1234.56, "INR"), /₹/);
assert.match(instrumentMoney(1234.56, "USD"), /\$/);
// Seven workspaces. F5 (reload) and F7 (caret browsing) stay with the browser: those
// workspaces are labelled and reached with Alt 5 / Alt 7, never by hijacking the F-key.
assert.deepEqual(FUNCTION_KEYS, ["F1", "F2", "F3", "F4", "Alt 5", "F6", "Alt 7"]);
assert.deepEqual(CAPTURED_FUNCTION_KEYS, ["F1", "F2", "F3", "F4", "F6"]);
assert.equal(WORKSPACES.length, 7);
for (const w of WORKSPACES) assert.equal(activeWorkspace(w.to), w.id);
for (const p of ["/runs/a", "/bench/a", "/worlds", "/artifacts", "/reality/a"])
  assert.equal(activeWorkspace(p), "agents");
for (const [p, id] of [
  ["/observatory", "dynamics"],
  ["/factors", "market"],
  ["/execution", "market"],
  ["/regimes", "market"],
  ["/data", "risk"],
  ["/command", "command"],
])
  assert.equal(activeWorkspace(p), id);
const alt = (code, extra = {}) => ({
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  code,
  ...extra,
});
assert.equal(workspaceForAltDigit(alt("Digit5"))?.id, "dynamics");
assert.equal(workspaceForAltDigit(alt("Numpad7"))?.id, "risk");
assert.equal(workspaceForAltDigit(alt("Digit8")), null);
assert.equal(workspaceForAltDigit(alt("Digit5", { altKey: false })), null);
assert.equal(workspaceForAltDigit(alt("Digit5", { ctrlKey: true })), null);
console.log(`Shell: ${count + 34} command, exchange, currency and workspace checks passed.`);

const urlIndex = process.argv.indexOf("--url");
if (urlIndex > 0) {
  const base = process.argv[urlIndex + 1].replace(/\/$/, "");
  const { chromium, firefox } = await import("playwright");
  const headed = process.argv.includes("--headed");
  const only = process.env.SHELL_ONLY;
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
    if (only && only !== name) continue;
    const browser = await launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      const byKey = [
        ["F1", "command"],
        ["F2", "research"],
        ["F3", "world"],
        ["F4", "agents"],
        ["F5", null],
        ["F6", "market"],
        ["F7", null],
        ["Alt+5", "dynamics"],
        ["Alt+7", "risk"],
      ].map(([key, id]) => ({ key, id }));
      for (const w of byKey) {
        if (process.argv.includes("--debug")) console.log(`${name}: testing ${w.key}`);
        // A browser-owned F5 reload can still be committing; one retry of an aborted load.
        await page.goto(`${base}/data?ticker=RELIANCE.NS`).catch(async (error) => {
          if (!/NS_BINDING_ABORTED|ERR_ABORTED/.test(error.message)) throw error;
          await page.goto(`${base}/data?ticker=RELIANCE.NS`);
        });
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
          // The first non-modifier keydown; a bare Alt press before Alt+5 is not the event.
          const onKey = (e) => {
            if (["Alt", "Control", "Shift", "Meta"].includes(e.key)) return;
            window.removeEventListener("keydown", onKey);
            const record = () =>
              sessionStorage.setItem(
                "key-check",
                JSON.stringify({ key: e.key, prevented: e.defaultPrevented }),
              );
            record();
            setTimeout(record, 0);
          };
          window.addEventListener("keydown", onKey);
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
        if (w.id) {
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
            { key: w.key.startsWith("Alt+") ? event.key : w.key, prevented: true },
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
        if (w.id === "risk") {
          // A reference listing has no Risk assessment; Risk offers an explicit choice instead.
          await page
            .getByRole("button", { name: "Clear unsupported listing", exact: true })
            .click();
          await page.getByRole("region", { name: "Risk issue feed", exact: true }).waitFor();
        }
        page.off("dialog", onDialog);
      }
      // All captured keys remain native while editing; contenteditable, textarea and select too.
      await page.goto(`${base}/data`);
      await page.locator('.shell[data-ready="true"]').waitFor();
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
        for (const key of [...CAPTURED_FUNCTION_KEYS, "Alt+5", "Alt+7"]) {
          const handled = await page.evaluate((key) => {
            const init = key.startsWith("Alt+")
              ? { key: key.slice(4), code: `Digit${key.slice(4)}`, altKey: true }
              : { key };
            const e = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
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
      // The focus fixtures insert unmanaged nodes into the document. Exercise
      // real command submission in a fresh document, then prove React handlers
      // are interactive before sending Enter; a parent readiness flag alone is
      // not a check of the command/palette event path.
      await page.goto(`${base}/data?ticker=RELIANCE.NS`);
      await page.locator('.shell[data-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Open command palette" }).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForFunction(
        () => document.activeElement === document.querySelector('[role="dialog"] input'),
      );
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      for (const [command, section, ticker, graph] of [
        ["RELIANCE IN DES", "market", "RELIANCE.NS", false],
        ["SPY US GP", "market", "SPY", true],
        ["RELIANCE IB DES", "market", "500325.BO", false],
        ["FACT", "factors", "500325.BO", false],
        ["EXEC", "execution", "500325.BO", false],
      ]) {
        // FACT and EXEC are sections of the Markets workspace.
        const workspace = "market";
        if (process.argv.includes("--debug")) console.log(`${name}: command ${command}`);
        await page.getByLabel("Command", { exact: true }).fill(command);
        await page.getByLabel("Command", { exact: true }).press("Enter");
        // Several consecutive commands share MARKET. Its existing shell alone
        // does not prove that navigation committed before the next input fill.
        await page
          .waitForURL(
            (url) =>
              url.pathname === (section === "market" ? "/markets" : "/" + section) &&
              url.searchParams.get("ticker") === ticker &&
              url.searchParams.get("view") === (graph ? "graph" : null),
          )
          .catch(async (error) => {
            console.error(
              JSON.stringify({
                browser: name,
                command,
                url: page.url(),
                input: await page.getByLabel("Command", { exact: true }).inputValue(),
                help: await page.locator("#terminal-command-help").innerText(),
                focus: await page.evaluate(() => document.activeElement?.id),
              }),
            );
            throw error;
          });
        // Router location and the old shell's workspace attribute can update
        // before the destination mounts. Wait for actual destination content,
        // then its hydrated shell, so a remount cannot erase the next command.
        if (section === "market")
          await page
            .locator(".mk-head")
            .getByRole("heading", { name: ticker, exact: true })
            .waitFor();
        else if (section === "factors") await page.locator("[data-factor-workspace]").waitFor();
        else await page.locator(`[data-placeholder="${section}"]`).waitFor();
        await page.locator(`.shell[data-ready="true"][data-workspace="${workspace}"]`).waitFor();
        await page.waitForLoadState("networkidle");
      }
      // FACTORS and EXECUTION are Markets tabs now; the palette names them under F6.
      for (const label of ["FACTORS", "EXECUTION"]) {
        await page
          .getByRole("navigation", { name: "Markets sections" })
          .getByRole("link", { name: label[0] + label.slice(1).toLowerCase(), exact: true })
          .click();
        if (label === "FACTORS") await page.locator("[data-factor-workspace]").waitFor();
        else await page.locator(`[data-placeholder="${label.toLowerCase()}"]`).waitFor();
        await page.locator(`.shell[data-ready="true"][data-workspace="market"]`).waitFor();
        await page.keyboard.press("Control+k");
        await page.getByRole("dialog").getByRole("combobox").fill(label);
        // Intermittent in CI (the option never appeared within 30 s). On a timeout, print what the
        // palette actually showed, so the next failure names its cause; the check is unchanged.
        await page
          .getByRole("option")
          .filter({ hasText: `F6 · ${label}` })
          .click()
          .catch(async (error) => {
            const state = await page
              .evaluate(() => {
                const dialog = document.querySelector('[role="dialog"]');
                return {
                  dialogs: document.querySelectorAll('[role="dialog"]').length,
                  input: dialog?.querySelector('[role="combobox"]')?.value ?? null,
                  busy: dialog?.getAttribute("aria-busy") ?? null,
                  options: [...document.querySelectorAll('[role="option"]')]
                    .map((o) => o.textContent.trim().slice(0, 60))
                    .slice(0, 10),
                  text: dialog?.textContent.replace(/\s+/g, " ").trim().slice(0, 400) ?? null,
                  focused: document.activeElement?.tagName,
                };
              })
              .catch((e) => ({ evaluateFailed: String(e) }));
            console.error(`palette state when "F6 · ${label}" was missing:`, JSON.stringify(state));
            throw error;
          });
      }
      // The nav labels name the keys that actually work.
      assert.deepEqual(
        (
          await page.getByRole("navigation", { name: "Workspaces" }).locator("kbd").allInnerTexts()
        ).map((s) => s.trim()),
        ["F1", "F2", "F3", "F4", "Alt 5", "F6", "Alt 7"],
      );
      console.log(
        `${name}: F1–F4/F6, Alt 5/Alt 7, native F5/F7, field focus, command line, Markets tabs and palette passed.`,
      );
    } finally {
      await browser.close();
    }
  }
}

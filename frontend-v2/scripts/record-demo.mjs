// Records the ~2-minute FinSight Forge demo as a WebM video with Playwright.
//
//   node scripts/record-demo.mjs [--url https://finsight-alpha-web.vercel.app] [--out ../docs/demo]
//
// It drives the public Replay site through the seven-workspace tour. The captions are an overlay
// added for the recording only: they narrate what is on screen and are never part of the app.
// Every number shown comes from the app itself; the script does not inject data.
import { createRequire } from "node:module";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const base = arg("--url", "https://finsight-alpha-web.vercel.app").replace(/\/$/, "");
const outDir = resolve(arg("--out", fileURLToPath(new URL("../../docs/demo", import.meta.url))));
const size = { width: 1280, height: 720 };
const tmp = resolve(outDir, ".recording");
const stillsArg = arg("--stills", null);
const stills = stillsArg ? resolve(stillsArg) : null;
if (stills) mkdirSync(stills, { recursive: true });
let still = 0;
mkdirSync(tmp, { recursive: true });

// Real GPU when the machine has one (smoother WebGL in the recording), software GL otherwise.
const browser = await chromium.launch({
  args: process.env.DEMO_SOFTWARE_GL
    ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
    : [
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--use-angle=d3d11",
        "--enable-gpu",
      ],
});
const context = await browser.newContext({
  viewport: size,
  recordVideo: { dir: tmp, size },
  colorScheme: "dark",
});
const page = await context.newPage();
const started = Date.now();
const log = (s) => console.log(`${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s  ${s}`);

/** Shows a narration caption at the bottom of the frame for `ms`. */
async function say(text, ms) {
  await page.evaluate((t) => {
    let el = document.getElementById("__demo_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__demo_caption";
      el.setAttribute("aria-hidden", "true");
      Object.assign(el.style, {
        position: "fixed",
        left: "50%",
        bottom: "28px",
        transform: "translateX(-50%)",
        maxWidth: "980px",
        padding: "10px 18px",
        background: "rgba(5,8,12,0.92)",
        border: "1px solid rgba(240,169,41,0.55)",
        borderLeft: "3px solid #f0a929",
        color: "#e7eaec",
        font: "500 17px/1.45 Inter, system-ui, sans-serif",
        zIndex: "2147483647",
        pointerEvents: "none",
        textAlign: "center",
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
  log(text);
  // Optional stills for reviewing the cut without a video decoder.
  if (stills) {
    await page.waitForTimeout(Math.min(1500, ms));
    await page.screenshot({ path: resolve(stills, `${String(++still).padStart(2, "0")}.png`) });
    await page.waitForTimeout(Math.max(0, ms - 1500));
  } else await page.waitForTimeout(ms);
}
async function go(path, ready) {
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
  if (ready) await page.locator(ready).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
}
async function openOrigin(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-origin-popover]").waitFor({ timeout: 10000 });
}
async function closeOrigin() {
  await page.keyboard.press("Escape");
  await page
    .locator("[data-origin-popover]")
    .waitFor({ state: "hidden" })
    .catch(() => {});
}

try {
  // 1. F1 Command.
  await go("/", ".cmd");
  await say(
    "FinSight Forge: an evidence-first research terminal. A plausible answer is not a result until code can reproduce it.",
    6500,
  );
  await say(
    "This public demo replays checked, hash-verified artifacts. No live feeds, no backend, nothing is executed.",
    6500,
  );
  await say(
    "Seven workspaces. F1 Command is mission control over the globe; live data stays on your own machine.",
    6000,
  );

  // 2. F2 Research.
  await go("/research", '[data-node-id="R:US:PRIMARY"]');
  await say(
    "F2 Research: a sealed study replayed as an evidence graph. Each trial's distance from the hypothesis is its t-statistic.",
    8000,
  );
  await page.locator('[data-node-id="R:US:PRIMARY"]').focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-hud="R:US:PRIMARY"]').waitFor();
  await say(
    "Every state comes from a sealed field or a preregistered rule, shown with its inputs.",
    6500,
  );
  await openOrigin(page.locator('[data-hud] [data-prov="num"]').first());
  await say(
    "Click any number: it names the sealed file, the JSON pointer and the SHA-256 it was read from.",
    7000,
  );
  await closeOrigin();
  await page.keyboard.press("Escape");

  // 3. F3 Global Eye.
  await go("/globe", "[data-geo-propagation]");
  await say(
    "F3 Global Eye: events propagate through a knowledge graph where every edge cites its source.",
    6500,
  );
  const scenario = page.locator('[data-geo-scenario="scenario:taiwan-m6.8"]');
  if (await scenario.count()) {
    await scenario.focus();
    await page.keyboard.press("Enter");
    await say(
      "A labelled hypothetical: an M6.8 quake in eastern Taiwan reaches TSM, NVDA, AMD and Apple through quoted filings and reports.",
      8500,
    );
  }
  const choice = page.locator("[data-geo-choice]");
  if (await choice.count()) {
    const javaSea = await choice
      .locator("option")
      // The M6.5 of 2026-09-11 in the Java Sea; the picker labels it by the USGS place name.
      .evaluateAll(
        (os) =>
          os.find((o) => /M6\.5 · 2026-09-11 .*Teluknaga/i.test(o.textContent ?? ""))?.value ??
          null,
      );
    if (javaSea) {
      await choice.selectOption(javaSea);
      const atTime = page.getByRole("radio", { name: "At event time", exact: true });
      if (await atTime.count()) {
        await atTime.focus();
        await page.keyboard.press("Enter");
      }
      await say(
        "A recorded quake, judged only with what was known at the time: the M6.5 Java Sea event reaches Toyota.",
        8000,
      );
    }
  }

  // 4. F6 Markets.
  await go("/markets", 'button[data-num][data-origin-kind="replay"]');
  await say("F6 Markets: US and India, each value traced to a checked Replay artifact.", 5500);
  await openOrigin(
    page
      .locator('button[data-num][data-origin-kind="replay"]:not([data-src$="manifest.json"])')
      .first(),
  );
  await say(
    "Replay values say so: the artifact and the digest the Replay manifest names. Never called a seal.",
    7000,
  );
  await closeOrigin();

  // 5. Alt 7 Risk.
  await go("/risk", '[data-testid="risk-issue-select"]');
  await say(
    "Alt 7 Risk: independent checks over every feed and artifact, with the evidence behind each issue.",
    6000,
  );
  await page.locator('[data-testid="risk-issue-select"]').first().click();
  await page.waitForTimeout(800);
  await say("Missing data reads 'unavailable', never zero.", 5000);

  // 6. F4 Forge.
  await go("/runs");
  await say(
    "F4 Forge: coding-agent runs, replayed step by step and graded by programmatic verifiers.",
    6500,
  );
  await say("Code, verifiers and sealed evidence: github.com/RaghhavMalani/finsight-alpha", 6000);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) {
    const target = resolve(outDir, "finsight-forge-demo.webm");
    renameSync(await video.path(), target);
    log(`saved ${target}`);
  }
  rmSync(tmp, { recursive: true, force: true });
}

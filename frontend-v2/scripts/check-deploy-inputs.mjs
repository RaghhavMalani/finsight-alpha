// The public deploy (Vercel) uploads the repository minus .vercelignore. Build generators that read
// files outside frontend-v2 must still find them there, or the public site silently degrades: the
// Research page would honestly render "unavailable". This checks every such input with git's own
// ignore matching against .vercelignore, independently of the generators.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Inputs read at build time from outside frontend-v2 (scripts/generate-research-graph.mjs).
const generator = readFileSync(
  resolve(repo, "frontend-v2/scripts/generate-research-graph.mjs"),
  "utf8",
);
const dirs = [...generator.matchAll(/"(data\/exports\/research_os_v[0-9_]+)"/g)].map((m) => m[1]);
const freeze = generator.match(/const FREEZE = "([^"]+)"/)?.[1];
if (dirs.length < 2 || !freeze) throw new Error("could not read the research generator's inputs");
const inputs = [freeze];
for (const d of dirs) {
  const manifest = JSON.parse(readFileSync(resolve(repo, d, "manifest.json"), "utf8"));
  inputs.push(`${d}/manifest.json`);
  const files = manifest.files ?? manifest.artifacts ?? {};
  for (const f of Array.isArray(files) ? files.map((x) => x.path ?? x) : Object.keys(files))
    if (typeof f === "string") inputs.push(`${d}/${f}`); // manifest paths are relative to the export
}
const ignored = inputs.filter((p) => {
  if (!existsSync(resolve(repo, p))) throw new Error(`build input missing from the checkout: ${p}`);
  try {
    execFileSync(
      "git",
      ["-c", "core.excludesFile=.vercelignore", "check-ignore", "--no-index", "-q", p],
      {
        cwd: repo,
      },
    );
    return true; // exit 0: the path is ignored
  } catch (e) {
    if (e.status === 1) return false; // exit 1: not ignored
    throw e;
  }
});
if (ignored.length) {
  console.error(`.vercelignore hides ${ignored.length} build input(s) from the public deploy:`);
  for (const p of ignored.slice(0, 20)) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Deploy inputs: all ${inputs.length} research build inputs survive .vercelignore.`);

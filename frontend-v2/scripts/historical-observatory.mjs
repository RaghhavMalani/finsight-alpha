import { execFileSync } from "node:child_process";

// Existing immutable Phase 0 bytes, used only inside contract/browser tests.
// Do not republish vendor trace payloads in the current repository tree or public assets.
const commit = "f5275b59ef7cbc44e5314492de4c329548b086bf";
export function readHistoricalObservatory(url) {
  const name = new URL(url).pathname.split("/").at(-1);
  if (!/^(?:manifest|(?:spy|qqq|iwm)-(?:hmm|signal))\.json$/.test(name))
    throw new Error("Unknown historical trace fixture");
  return execFileSync(
    "git",
    ["show", `${commit}:frontend-v2/public/artifacts/observatory/${name}`],
    {
      maxBuffer: 16_000_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

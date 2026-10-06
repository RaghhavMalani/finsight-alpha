/// <reference lib="webworker" />
/** Trains lab networks off the main thread and streams every epoch back to the scene. */
import { openLabHoldout, trainLab, type LabRun } from "./lab.ts";
import type { Architecture } from "./mlp.ts";
import type { WorldSpec } from "./world.ts";

export type TrainerRequest =
  | {
      type: "train";
      runId: number;
      world: WorldSpec;
      architecture: Architecture;
      families: string[];
    }
  | { type: "holdout"; runId: number; run: LabRun }
  | { type: "cancel"; runId: number };

let active = 0;
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<TrainerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    if (message.runId === active) active = 0;
    return;
  }
  active = message.runId;
  const runId = message.runId;
  try {
    if (message.type === "holdout") {
      scope.postMessage({ type: "holdout", runId, holdout: openLabHoldout(message.run) });
      return;
    }
    const run = trainLab(message.world, message.architecture, message.families, {
      onEpoch: (row) => scope.postMessage({ type: "epoch", runId, row }),
      onSnapshot: (snapshot) => scope.postMessage({ type: "snapshot", runId, snapshot }),
      cancelled: () => active !== runId,
    });
    if (run) scope.postMessage({ type: "done", runId, run });
  } catch (error) {
    scope.postMessage({
      type: "error",
      runId,
      message: error instanceof Error ? error.message : "Lab training failed",
    });
  }
};

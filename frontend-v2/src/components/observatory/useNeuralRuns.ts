import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { artifactHash } from "./useTrainingStream";
import { neuralView, type NeuralLike, type NeuralSource, type NeuralView } from "./neural-model";
import type { NeuralSummary } from "./NeuralReadout";
import type { HoldoutResult, LabRun } from "./neural/lab";
import {
  DEFAULT_ARCHITECTURE,
  type Architecture,
  type EpochRow,
  type Snapshot,
} from "./neural/mlp";
import {
  DEFAULT_WORLD,
  defaultFamilies,
  LAB_FEATURES,
  WORLDS,
  type WorldSpec,
} from "./neural/world";
import { snapshotEpochList, validateTrace, type Manifest, type NeuralTrace } from "./types";

export type TrainerMessage =
  | { type: "epoch"; runId: number; row: EpochRow }
  | { type: "snapshot"; runId: number; snapshot: Snapshot }
  | { type: "done"; runId: number; run: LabRun }
  | { type: "holdout"; runId: number; holdout: HoldoutResult }
  | { type: "error"; runId: number; message: string };

const LAB_FAMILIES = LAB_FEATURES.map(([f]) => f);

/** A partially trained lab network, shaped like a finished run so the scene can draw it. */
function partialRun(
  arch: Architecture,
  families: string[],
  epochs: EpochRow[],
  snapshots: Snapshot[],
): NeuralLike {
  const columns = LAB_FEATURES.flatMap(([family, names]) =>
    families.includes(family) ? names.map((name) => [family, name] as const) : [],
  );
  const sizes = [columns.length, ...arch.hidden, 1];
  return {
    architecture: arch,
    layer_sizes: sizes,
    parameter_count: sizes.slice(1).reduce((n, out, l) => n + sizes[l] * out + out, 0),
    feature_names: columns.map(([, name]) => name),
    families: LAB_FAMILIES.filter((f) => families.includes(f)),
    family: columns.map(([family]) => family),
    epochs,
    snapshots,
    snapshot_epochs: snapshotEpochList(arch.epochs),
    best_val_loss_epoch: 0,
    attribution: [],
    family_attribution: {},
    probe: null,
  };
}

/**
 * Every neural source behind one interface: the in-browser lab (synthetic worlds, Web Worker),
 * a checked replay from the manifest, or a live backend run on installed evidence.
 */
export function useNeuralRuns({
  manifest,
  ticker,
  cutoff,
}: {
  manifest: Manifest | null;
  ticker: string;
  cutoff: string;
}) {
  const [source, setSource] = useState<NeuralSource>("lab");
  const [architecture, setArchitecture] = useState<Architecture>(DEFAULT_ARCHITECTURE);
  // Lab and real runs keep separate input choices: real runs start without the Geo events
  // negative control, and switching sources never carries a synthetic-world choice over.
  const [labFamilies, setLabFamilies] = useState<string[]>(() => defaultFamilies("lab"));
  const [realFamilies, setRealFamilies] = useState<string[]>(() => defaultFamilies("live"));
  const families = source === "lab" ? labFamilies : realFamilies;
  const setFamilies = source === "lab" ? setLabFamilies : setRealFamilies;
  const [world, setWorld] = useState<WorldSpec>(DEFAULT_WORLD);
  const [lab, setLab] = useState<{
    runId: number;
    arch: Architecture;
    families: string[];
    world: WorldSpec;
    epochs: EpochRow[];
    snapshots: Snapshot[];
    run: LabRun | null;
    error: string | null;
  } | null>(null);
  const [openingHoldout, setOpeningHoldout] = useState(false);
  const [compared, setCompared] = useState<Record<string, number>>({});
  const [looks, setLooks] = useState<Record<string, number>>({});
  const [real, setReal] = useState<{
    key: string;
    trace: NeuralTrace | null;
    hash: string | null;
    error: string | null;
    loading: boolean;
  } | null>(null);
  const worker = useRef<Worker | null>(null);
  const runCounter = useRef(0);

  const stopWorker = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
  }, []);
  useEffect(() => stopWorker, [stopWorker]);

  const worldKey = JSON.stringify(world);
  const startWorker = useCallback(() => {
    // A running worker cannot see a cancel message mid-epoch, so a new run replaces it.
    stopWorker();
    const w = new Worker(new URL("./neural/trainer.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    return w;
  }, [stopWorker]);

  const trainLab = useCallback(() => {
    const runId = ++runCounter.current,
      arch = architecture,
      chosen = families,
      spec = world;
    setLab({
      runId,
      arch,
      families: chosen,
      world: spec,
      epochs: [],
      snapshots: [],
      run: null,
      error: null,
    });
    const w = startWorker();
    w.onmessage = (event: MessageEvent<TrainerMessage>) => {
      const m = event.data;
      if (m.runId !== runId) return;
      setLab((s) => {
        if (!s || s.runId !== runId) return s;
        if (m.type === "epoch") return { ...s, epochs: [...s.epochs, m.row] };
        if (m.type === "snapshot") return { ...s, snapshots: [...s.snapshots, m.snapshot] };
        if (m.type === "done")
          return { ...s, run: m.run, epochs: m.run.epochs, snapshots: m.run.snapshots };
        if (m.type === "error") return { ...s, error: m.message };
        return s;
      });
      if (m.type === "done") {
        setCompared((c) => ({
          ...c,
          [`lab:${JSON.stringify(spec)}`]: (c[`lab:${JSON.stringify(spec)}`] ?? 0) + 1,
        }));
        stopWorker();
      }
      if (m.type === "error") stopWorker();
    };
    w.onerror = () => {
      setLab((s) =>
        s && s.runId === runId ? { ...s, error: "The lab trainer stopped unexpectedly" } : s,
      );
      stopWorker();
    };
    w.postMessage({ type: "train", runId, world: spec, architecture: arch, families: chosen });
  }, [architecture, families, world, startWorker, stopWorker]);

  const stopLab = useCallback(() => {
    stopWorker();
    setLab((s) => (s && !s.run ? { ...s, error: "Training stopped" } : s));
  }, [stopWorker]);

  const openHoldout = useCallback(() => {
    const run = lab?.run;
    if (!run || !lab) return;
    const runId = lab.runId,
      key = JSON.stringify(run.world);
    setOpeningHoldout(true);
    const w = startWorker();
    w.onmessage = (event: MessageEvent<TrainerMessage>) => {
      const m = event.data;
      if (m.runId !== runId) return;
      if (m.type === "holdout") {
        setLab((s) =>
          s && s.runId === runId && s.run ? { ...s, run: { ...s.run, holdout: m.holdout } } : s,
        );
        setLooks((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
      }
      setOpeningHoldout(false);
      stopWorker();
    };
    w.postMessage({ type: "holdout", runId, run });
  }, [lab, startWorker, stopWorker]);

  // Real runs: a checked replay declared by the manifest, or a live backend run.
  const replayEntry = manifest?.artifacts[`${ticker}:neural`];
  const asOf = source === "replay" ? (manifest?.as_of ?? cutoff) : cutoff;
  const runReal = useCallback(async () => {
    const key = JSON.stringify([
      source,
      ticker,
      asOf,
      source === "live" ? [architecture, families] : null,
    ]);
    setReal({ key, trace: null, hash: null, error: null, loading: true });
    try {
      let value: unknown,
        hash: string | null = null;
      if (source === "replay") {
        if (!replayEntry)
          throw new Error(
            `No checked neural replay for ${ticker}. Export one from installed evidence: python scripts/export_observatory.py --as-of ${asOf} --neural`,
          );
        const response = await fetch(replayEntry.url);
        if (!response.ok) throw new Error("Neural replay unavailable");
        const bytes = await response.arrayBuffer();
        hash = await artifactHash(bytes);
        if (hash !== replayEntry.sha256) throw new Error("Replay artifact SHA-256 mismatch");
        value = JSON.parse(new TextDecoder().decode(bytes));
      } else {
        const response = await fetch(`${API_BASE}/ml/neural/trace`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            ticker,
            as_of: asOf,
            source: "real",
            architecture,
            families,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            body?.detail ||
              (response.status === 401
                ? "Live runs need a signed-in session on the FinSight backend"
                : `Live neural run unavailable (${response.status})`),
          );
        }
        value = await response.json();
      }
      const trace = validateTrace(value, { kind: "neural", ticker, asOf }) as NeuralTrace;
      if (
        replayEntry &&
        source === "replay" &&
        trace.provenance.input_hash !== replayEntry.input_hash
      )
        throw new Error("Replay input hash does not match the manifest");
      if (source === "replay" && trace.holdout.sealed)
        throw new Error("A checked neural replay must carry its preregistered holdout evaluation");
      setReal({ key, trace, hash, error: null, loading: false });
      if (source === "live")
        setCompared((c) => ({
          ...c,
          [`live:${ticker}:${asOf}`]: (c[`live:${ticker}:${asOf}`] ?? 0) + 1,
        }));
    } catch (error) {
      setReal({
        key,
        trace: null,
        hash: null,
        error: error instanceof Error ? error.message : "Neural run unavailable",
        loading: false,
      });
    }
  }, [source, ticker, asOf, architecture, families, replayEntry]);

  // Replays load as soon as they are selected; live runs wait for the Train button.
  useEffect(() => {
    if (source === "replay") void runReal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, ticker, asOf, replayEntry?.sha256]);

  const view: NeuralView | null = useMemo(() => {
    if (source === "lab") {
      if (!lab || !lab.snapshots.length) return null;
      const run = lab.run ?? partialRun(lab.arch, lab.families, lab.epochs, lab.snapshots);
      return neuralView(run, "lab", !lab.run);
    }
    return real?.trace ? neuralView(real.trace, source) : null;
  }, [source, lab, real]);

  const summary: NeuralSummary = useMemo(() => {
    if (source === "lab") {
      const run = lab?.run;
      return {
        validation: run?.validation ?? null,
        holdout: run?.holdout ?? null,
        world: lab
          ? { ...lab.world, label: WORLDS[lab.world.kind].label, rule: WORLDS[lab.world.kind].rule }
          : undefined,
        truth: run?.truth,
      };
    }
    const t = real?.trace;
    return { validation: t?.validation ?? null, holdout: t?.holdout ?? null };
  }, [source, lab, real]);

  const comparedKey =
    source === "lab" ? `lab:${JSON.stringify(lab?.world ?? world)}` : `live:${ticker}:${asOf}`;
  return {
    source,
    setSource,
    architecture,
    setArchitecture,
    families,
    setFamilies,
    world,
    setWorld,
    worldKey,
    view,
    summary,
    training: source === "lab" && !!lab && !lab.run && !lab.error,
    error: source === "lab" ? (lab?.error ?? null) : (real?.error ?? null),
    loading: source !== "lab" && !!real?.loading,
    hash: source === "replay" ? (real?.hash ?? null) : null,
    trace: source === "lab" ? null : (real?.trace ?? null),
    train: source === "lab" ? trainLab : runReal,
    stop: stopLab,
    openHoldout,
    openingHoldout,
    compared: compared[comparedKey] ?? 0,
    holdoutLooks: lab?.run ? (looks[JSON.stringify(lab.run.world)] ?? 0) : 0,
    replayAvailable: !!replayEntry,
    asOf,
  };
}

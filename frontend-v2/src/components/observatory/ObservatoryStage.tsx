import { memo, useEffect, useMemo, useState } from "react";
import HMMScene from "./HMMScene";
import { hmmFit, type HMMView } from "./hmm-model";
import NeuralScene from "./NeuralScene";
import { neuralFit, type NeuralView } from "./neural-model";
import { SceneFrame, type CameraFit } from "./SceneFrame";
import { LabelLayer } from "./SceneLabels";
import SignalScene from "./SignalScene";
import { signalFit, type SignalView } from "./signal-model";

const IDLE_FIT: CameraFit = {
  key: "idle",
  radius: 6,
  direction: [0, 0, 1],
  target: [0, 0, 0],
  factor: 1,
  narrow: 1,
};

/**
 * The WebGL stage. The canvas stays mounted while the ticker or source changes; the scene
 * inside it unmounts as soon as its trace is no longer the verified one being shown.
 */
function ObservatoryStage({
  kind,
  hmm,
  signal,
  neural,
  editorWidth = 0,
  index,
  reduced,
  labelsRoot,
  tip,
  onFps,
}: {
  kind: "hmm" | "signal" | "neural";
  hmm: HMMView | null;
  signal: SignalView | null;
  neural?: NeuralView | null;
  /** Width of the network editor docked over the stage's left edge. */
  editorWidth?: number;
  index: number;
  reduced: boolean;
  labelsRoot: HTMLElement | null;
  tip: HTMLElement | null;
  /** Only while the D-key readout is open, so frame timing never re-renders the page. */
  onFps?: (fps: number) => void;
}) {
  const labels = useMemo(
    () =>
      labelsRoot
        ? new LabelLayer(labelsRoot, ".obs-title, .obs-legend, .nn-editor, .nn-reopen")
        : null,
    [labelsRoot],
  );
  useEffect(() => () => labels?.dispose(), [labels]);
  // While the next trace loads, hold the last framing instead of jumping to a default.
  const [held, setHeld] = useState(IDLE_FIT);
  const neuralKey = neural?.structureKey;
  const traceFit = useMemo(
    () =>
      hmm
        ? hmmFit(hmm)
        : signal
          ? signalFit(signal)
          : neural
            ? neuralFit(neural, editorWidth)
            : null,
    // A neural run refits the camera only when its shape changes, not on every epoch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hmm, signal, neuralKey, editorWidth],
  );
  const fit = traceFit ?? held;
  useEffect(() => {
    if (fit.key !== held.key) setHeld(fit);
  }, [fit, held.key]);
  return (
    <SceneFrame
      fit={fit}
      autoRotate={kind === "hmm" && !reduced}
      bloom={kind === "hmm" ? 0.85 : kind === "neural" ? 0.5 : 0.55}
      onFps={onFps}
    >
      {labels && hmm && (
        <HMMScene view={hmm} target={index} reduced={reduced} labels={labels} tip={tip} />
      )}
      {labels && signal && (
        <SignalScene view={signal} index={index} reduced={reduced} labels={labels} tip={tip} />
      )}
      {labels && neural && (
        <NeuralScene view={neural} epoch={index} reduced={reduced} labels={labels} tip={tip} />
      )}
    </SceneFrame>
  );
}

export default memo(ObservatoryStage);

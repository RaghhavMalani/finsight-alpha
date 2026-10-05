import type { CameraFit } from "./SceneFrame";
import type { HMMTrace } from "./types";

export function hmmFit(trace: HMMTrace): CameraFit {
  return {
    key: `hmm:${trace.ticker}:${trace.as_of}`,
    radius: 5,
    direction: [0, 0.07, 1],
    target: [0, 0, 0],
    factor: 0.92,
  };
}

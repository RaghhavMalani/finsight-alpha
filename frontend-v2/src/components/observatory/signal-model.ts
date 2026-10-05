import type { CameraFit } from "./SceneFrame";
import type { SignalTrace } from "./types";

export function signalFit(trace: SignalTrace): CameraFit {
  return {
    key: `signal:${trace.ticker}:${trace.as_of}`,
    radius: 8,
    direction: [0, 0.07, 1],
    target: [0, 0, 0],
    factor: 0.93,
  };
}

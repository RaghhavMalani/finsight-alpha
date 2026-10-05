import { useMemo, useState } from "react";
import { SceneLabel as Text } from "./SceneLabel";
import { GlowCurves } from "./GlowCurves";
import { NodeCloud } from "./NodeCloud";
import { SceneFrame, type Metrics } from "./SceneFrame";
import {
  FONT,
  PALETTE,
  decimal,
  type Curve,
  type HMMTrace,
  type SceneNode,
  type Vec3,
} from "./types";

export default function HMMScene({
  trace,
  index,
  reduced,
  onMetrics,
}: {
  trace: HMMTrace;
  index: number;
  reduced: boolean;
  onMetrics: (m: Metrics) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const frame = trace.frames[index];
  const topology = useMemo(() => {
    const centers: Vec3[] = Array.from({ length: trace.n_states }, (_, i) => {
      const angle = (i * 2 * Math.PI) / trace.n_states + Math.PI / 4;
      return [Math.cos(angle) * 3.7, Math.sin(angle) * 3.7, 0];
    });
    const nodes: SceneNode[] = centers.map((position, i) => ({
      id: i,
      position,
      color: PALETTE[i],
      radius: 0.16,
      label: `STATE ${i} · ${trace.labels[i]}`,
      values: [
        `EM ITERATION ${frame.iteration}`,
        `SELF TRANSITION ${decimal(frame.transmat[i][i])}`,
        ...trace.feature_names
          .slice(0, 4)
          .map(
            (name, j) =>
              `${name} MEAN ${decimal(frame.means[i][j])} · VAR ${decimal(frame.covariance_diagonal[i][j])}`,
          ),
      ],
    }));
    const posterior: Curve[] = [],
      transitions: Curve[] = [],
      means: Curve[] = [];
    frame.transmat.forEach((row, i) =>
      row.forEach((weight, j) => {
        const start = centers[i],
          end = centers[j];
        // A small offset closes a self-loop as a quadratic arc around the same state.
        transitions.push({
          start: i === j ? [start[0] - 0.15, start[1], 0] : start,
          end: i === j ? [end[0] + 0.15, end[1], 0] : end,
          control:
            i === j
              ? [start[0] * 1.35, start[1] * 1.35, 1.6]
              : [(start[0] + end[0]) * 0.18, (start[1] + end[1]) * 0.18, 1.3],
          color: PALETTE[i],
          weight,
          from: i,
          to: j,
        });
      }),
    );
    frame.posterior_tail.forEach((probabilities, i) => {
      const expected: Vec3 = [0, 0, 0];
      probabilities.forEach((p, j) => {
        expected[0] += p * centers[j][0];
        expected[1] += p * centers[j][1];
      });
      const angle = (i * 2 * Math.PI) / frame.posterior_tail.length;
      const position: Vec3 = [
        expected[0] + Math.cos(angle) * 0.72,
        expected[1] + Math.sin(angle) * 0.72,
        -0.6 - (i / frame.posterior_tail.length) * 1.8,
      ];
      const state = probabilities.indexOf(Math.max(...probabilities)),
        id = trace.n_states + i;
      nodes.push({
        id,
        position,
        color: PALETTE[state],
        radius: 0.033 + Math.max(...probabilities) * 0.018,
        label: trace.dates_tail[i].slice(0, 10),
        values: [
          "POSTERIOR UNDER SELECTED FIT",
          ...probabilities.map((p, j) => `P(STATE ${j}) ${decimal(p, 5)}`),
        ],
      });
      probabilities.forEach((weight, j) =>
        posterior.push({
          start: position,
          end: centers[j],
          control: [position[0] * 0.4, position[1] * 0.4, -2.1],
          color: PALETTE[j],
          weight,
          from: id,
          to: j,
        }),
      );
    });
    frame.means.forEach((row, i) =>
      row.forEach((value, j) => {
        const angle = (j * 2 * Math.PI) / row.length,
          center = centers[i];
        const position: Vec3 = [
          center[0] + Math.cos(angle) * (0.45 + Math.min(Math.abs(value), 3) * 0.15),
          center[1] + Math.sin(angle) * (0.45 + Math.min(Math.abs(value), 3) * 0.15),
          0.35,
        ];
        const id = trace.n_states + frame.posterior_tail.length + i * row.length + j;
        nodes.push({
          id,
          position,
          color: PALETTE[i],
          radius: 0.04,
          label: `STATE ${i} · ${trace.feature_names[j]}`,
          values: [
            `STANDARDIZED MEAN ${decimal(value, 5)}`,
            `VARIANCE ${decimal(frame.covariance_diagonal[i][j], 5)}`,
          ],
        });
        means.push({
          start: position,
          end: center,
          control: [center[0], center[1], 0.8],
          color: PALETTE[i],
          weight: Math.abs(value) / (1 + Math.abs(value)),
          from: id,
          to: i,
        });
      }),
    );
    return {
      nodes,
      posterior,
      transitions,
      means,
      centers,
      connections: [...posterior, ...transitions, ...means],
    };
  }, [trace, frame]);
  return (
    <SceneFrame
      curves={topology.posterior.length + topology.transitions.length + topology.means.length}
      nodes={topology.nodes.length}
      hover={hover}
      reduced={reduced}
      onMetrics={onMetrics}
    >
      <GlowCurves
        curves={topology.posterior}
        hover={hover}
        reduced={reduced}
        head={index / trace.frames.length}
      />
      <GlowCurves curves={topology.means} hover={hover} reduced={reduced} />
      <GlowCurves curves={topology.transitions} hover={hover} reduced={reduced} ribbons />
      <NodeCloud
        nodes={topology.nodes}
        connections={topology.connections}
        hover={hover}
        onHover={setHover}
      />
      {topology.centers.map((center, i) => (
        <Text
          key={i}
          font={FONT}
          position={[center[0], center[1] + 1.1, 0.2]}
          fontSize={0.16}
          color={PALETTE[i]}
          anchorX="center"
          maxWidth={3}
        >{`STATE ${i} / ${trace.labels[i].toUpperCase()}`}</Text>
      ))}
      <Text
        font={FONT}
        position={[0, 0, -0.2]}
        fontSize={0.13}
        color="#636C74"
      >{`${trace.n_states} STATES / ${trace.fit_rows} FIT ROWS`}</Text>
    </SceneFrame>
  );
}

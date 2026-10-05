import { useMemo, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import { StaticCurves } from "./GlowCurves";
import { NodeCloud } from "./NodeCloud";
import { useProjectedLabels, type LabelLayer, type LabelSpec } from "./SceneLabels";
import { decimal, type Curve, type SceneNode, type SignalTrace, type Vec3 } from "./types";

export default function SignalScene({
  trace,
  index,
  reduced,
  labels,
}: {
  trace: SignalTrace;
  index: number;
  reduced: boolean;
  labels: LabelLayer;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const group = useRef<Group>(null);
  const allFrames = trace.folds.flatMap((f) => f.frames);
  const frame = allFrames[index];
  const final = index === allFrames.length - 1;
  const topology = useMemo(() => {
    const nodes: SceneNode[] = trace.feature_names.map((name, i) => ({
      id: i,
      position: [-6.7, (0.5 - i / (trace.feature_names.length - 1)) * 7, 0],
      color: "#3FE0FF",
      radius: 0.055,
      label: name,
      values: ["FIT FEATURE", `PURGE ${trace.horizon} ROWS · EMBARGO ${trace.embargo} ROWS`],
    }));
    const curves: Curve[] = [];
    trace.folds.forEach((f, fi) =>
      f.frames.forEach((s, si) => {
        const id = trace.feature_names.length + fi * 100 + si;
        const position: Vec3 = [
          -3.8 + fi * 2.05,
          (0.5 - si / (f.frames.length - 1)) * 6.2,
          Math.sin((si / f.frames.length) * Math.PI) * 0.45,
        ];
        nodes.push({
          id,
          position,
          color: fi % 2 ? "#A98CF0" : "#3FE0FF",
          radius: 0.028,
          label: `FOLD ${f.fold} · STAGE ${s.stage}`,
          values: [
            `VALIDATION AUC ${decimal(s.val_auc)}`,
            `VALIDATION LOGLOSS ${decimal(s.val_logloss)}`,
            `FIT ${f.fit_rows} · VALIDATION ${f.validation_rows}`,
            `${f.validation_start.slice(0, 10)} → ${f.validation_end.slice(0, 10)}`,
            ...s.feature_importance
              .map((weight, i) => ({ weight, name: trace.feature_names[i] }))
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 3)
              .map((v) => `${v.name} ${decimal(v.weight)}`),
          ],
        });
        s.feature_importance.forEach((weight, i) => {
          if (weight <= 0) return;
          const start = nodes[i].position;
          curves.push({
            start,
            end: position,
            control: [
              (start[0] + position[0]) / 2,
              (start[1] + position[1]) * 0.35,
              1.6 + fi * 0.22,
            ],
            color: fi % 2 ? "#A98CF0" : "#3FE0FF",
            weight,
            from: i,
            to: id,
            group: f.fold,
            stage: s.stage,
          });
        });
      }),
    );
    // Deterministic strongest-edge budget, always actual stage importance; count disclosed.
    curves.sort((a, b) => b.weight - a.weight || a.to - b.to || a.from - b.from);
    return { nodes, curves: curves.slice(0, 5000), eligible: curves.length };
  }, [trace]);
  const specs = useMemo<LabelSpec[]>(
    () => [
      { pos: new Vector3(-6.7, 4.1, 0), html: "Fit features", color: "#3FE0FF", pri: 3 },
      ...trace.folds.map((f, i) => ({
        pos: new Vector3(-3.8 + i * 2.05, 4.1, 0),
        html: `Fold ${f.fold}<small>Val AUC ${f.fold < frame.fold ? decimal(f.frames.at(-1)!.val_auc) : f.fold === frame.fold ? decimal(frame.val_auc) : "pending"}</small>`,
        color: i % 2 ? "#A98CF0" : "#3FE0FF",
        pri: 3,
      })),
      {
        pos: new Vector3(7.1, 1.9, 0),
        html: `Untouched holdout<small>${final ? `AUC ${decimal(trace.holdout.auc)} · ${trace.holdout.rows} rows` : "locked"}</small>`,
        color: "#F0A929",
        pri: 3,
      },
    ],
    [trace, frame, final],
  );
  useProjectedLabels(labels, specs, group);
  return (
    <group ref={group}>
      <StaticCurves curves={topology.curves} hover={hover} reduced={reduced} />
      <NodeCloud
        nodes={topology.nodes}
        connections={topology.curves}
        hover={hover}
        onHover={setHover}
        extraValues={
          hover !== null && hover < trace.feature_names.length
            ? [
                `FOLD ${frame.fold} · STAGE ${frame.stage}`,
                `CUMULATIVE IMPORTANCE ${decimal(frame.feature_importance[hover], 5)}`,
              ]
            : []
        }
      />
    </group>
  );
}

import { useMemo, useState } from "react";
import { SceneLabel as Text } from "./SceneLabel";
import { GlowCurves } from "./GlowCurves";
import { NodeCloud } from "./NodeCloud";
import { SceneFrame, type Metrics } from "./SceneFrame";
import { FONT, decimal, type Curve, type SceneNode, type SignalTrace, type Vec3 } from "./types";

export default function SignalScene({
  trace,
  index,
  reduced,
  onMetrics,
}: {
  trace: SignalTrace;
  index: number;
  reduced: boolean;
  onMetrics: (m: Metrics) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
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
  return (
    <SceneFrame
      curves={topology.curves.length}
      nodes={topology.nodes.length}
      hover={hover}
      reduced={reduced}
      camera={[0, 1, 18]}
      onMetrics={onMetrics}
    >
      <GlowCurves
        curves={topology.curves}
        hover={hover}
        reduced={reduced}
        group={frame.fold}
        stage={frame.stage}
        head={frame.stage / 100}
      />
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
      <Text font={FONT} position={[-6.7, 4.1, 0]} fontSize={0.15} color="#3FE0FF">
        FIT FEATURES
      </Text>
      {trace.folds.map((f, i) => (
        <Text
          key={f.fold}
          font={FONT}
          position={[-3.8 + i * 2.05, 4.1, 0]}
          fontSize={0.16}
          color={i % 2 ? "#A98CF0" : "#3FE0FF"}
          anchorX="center"
        >{`FOLD ${f.fold}\nVALIDATION\nAUC ${f.fold < frame.fold ? decimal(f.frames.at(-1)!.val_auc) : f.fold === frame.fold ? decimal(frame.val_auc) : "PENDING"}`}</Text>
      ))}
      {trace.feature_names
        .filter((_, i) => i % Math.ceil(trace.feature_names.length / 8) === 0)
        .map((name) => {
          const i = trace.feature_names.indexOf(name);
          return (
            <Text
              key={name}
              font={FONT}
              position={[-6.9, topology.nodes[i].position[1], 0]}
              fontSize={0.09}
              color="#636C74"
              anchorX="right"
              maxWidth={2}
            >
              {name.toUpperCase()}
            </Text>
          );
        })}
      <Text
        font={FONT}
        position={[7.1, 1.9, 0]}
        fontSize={0.16}
        color="#F0A929"
        maxWidth={1.8}
        textAlign="center"
      >{`UNTOUCHED\nOOS HOLDOUT\n\n${final ? `AUC ${decimal(trace.holdout.auc)}\n${trace.holdout.rows} ROWS` : "LOCKED"}`}</Text>
      <Text font={FONT} position={[0, -4.1, 0]} fontSize={0.11} color="#636C74">
        TIME → / EXPANDING DEVELOPMENT WINDOW / VALIDATION ONLY
      </Text>
    </SceneFrame>
  );
}

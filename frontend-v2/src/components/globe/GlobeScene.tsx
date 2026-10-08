import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Group,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  json2satrec,
  type SatRec,
} from "satellite.js";
import { esc } from "@/components/observatory/format";
import { pickNearest, useCanvasPointer } from "@/components/observatory/pointer";
import { LabelLayer, type LabelSpec } from "@/components/observatory/SceneLabels";
import {
  HUB_RADIUS_KM,
  HUBS,
  subsolarPoint,
  type Quake,
  type Satellite,
  type RecordedSatellite,
} from "./geo-data";
import { EARTH_KM, R, toVec } from "./coords";
import type { LandData } from "./land";
import { SENSOR_PRELUDE, SENSOR_VERTEX, SENSORS, type SensorKind } from "./sensors";

/** Ocean sphere: dark, lit by the real sun direction, with a fresnel rim. */
function Earth({ sun }: { sun: Vector3 }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uSun: { value: sun } },
        vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vView;
          void main(){ vN = normalize(position); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
          vView = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vW; varying vec3 vView;
          void main(){ float day = smoothstep(-0.12, 0.25, dot(vN, normalize(uSun)));
          float rim = pow(1.0 - max(dot(vN, vView), 0.0), 3.0);
          vec3 c = mix(vec3(0.004,0.012,0.022), vec3(0.012,0.05,0.08), day) + rim*vec3(0.05,0.35,0.5);
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    [sun],
  );
  const atmosphere = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        vertexShader: `varying vec3 vN; varying vec3 vView; void main(){ vN = normalize(normalMatrix*normal);
          vec4 mv = modelViewMatrix*vec4(position,1.0); vView = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        // Back faces of a slightly larger sphere: brightest just outside the limb (where the
        // normal faces away from the viewer), fading to nothing at the halo's edge.
        fragmentShader: `varying vec3 vN; varying vec3 vView; void main(){
          float i = pow(clamp(-dot(vN, vView), 0.0, 1.0), 1.6);
          gl_FragColor = vec4(vec3(0.12,0.55,0.85)*i*0.9, i); }`,
      }),
    [],
  );
  useEffect(
    () => () => {
      material.dispose();
      atmosphere.dispose();
    },
    [material, atmosphere],
  );
  return (
    <>
      <mesh material={material}>
        <sphereGeometry args={[R, 96, 64]} />
      </mesh>
      <mesh material={atmosphere} scale={1.16}>
        <sphereGeometry args={[R, 64, 48]} />
      </mesh>
    </>
  );
}

/** Land as a dot matrix, coastlines and borders as lines; dots dim on the night side. */
function Land({ land, sun }: { land: LandData; sun: Vector3 }) {
  const { dots, lines, grid } = useMemo(() => {
    const geometry = new BufferGeometry();
    const pos = new Float32Array(land.dots.length * 3),
      v = new Vector3();
    land.dots.forEach(([lat, lon], i) => {
      toVec(lat, lon, R * 1.001, v);
      pos.set([v.x, v.y, v.z], i * 3);
    });
    geometry.setAttribute("position", new BufferAttribute(pos, 3));
    const dots = new Points(
      geometry,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uSun: { value: sun }, uScale: { value: 1 } },
        vertexShader: `uniform vec3 uSun; uniform float uScale; varying float vDay; varying float vFacing;
          void main(){ vec3 n = normalize(position); vDay = smoothstep(-0.15, 0.3, dot(n, normalize(uSun)));
          vec4 mv = modelViewMatrix*vec4(position,1.0); vFacing = dot(normalize(normalMatrix*n), normalize(-mv.xyz));
          gl_PointSize = max(1.2, 46.0*uScale/(-mv.z)); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying float vDay; varying float vFacing; void main(){
          float d = length(gl_PointCoord-0.5); if (d > 0.5 || vFacing < -0.05) discard;
          vec3 night = vec3(0.10,0.30,0.42), day = vec3(0.45,0.85,1.0);
          gl_FragColor = vec4(mix(night, day, vDay), (1.0-d*2.0)*mix(0.45,0.85,vDay)); }`,
      }),
    );
    const segments = (rings: [number, number][][], radius: number) => {
      const out: number[] = [],
        a = new Vector3(),
        b = new Vector3();
      for (const ring of rings)
        for (let i = 1; i < ring.length; i++) {
          toVec(ring[i - 1][1], ring[i - 1][0], radius, a);
          toVec(ring[i][1], ring[i][0], radius, b);
          out.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(out), 3));
      return g;
    };
    const lines = new LineSegments(
      segments([...land.coasts, ...land.borders], R * 1.002),
      new LineBasicMaterial({
        color: 0x3fe0ff,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    const graticule: [number, number][][] = [];
    for (let lat = -60; lat <= 60; lat += 30)
      graticule.push(Array.from({ length: 73 }, (_, k) => [k * 5 - 180, lat] as [number, number]));
    for (let lon = -180; lon < 180; lon += 30)
      graticule.push(Array.from({ length: 37 }, (_, k) => [lon, k * 5 - 90] as [number, number]));
    const grid = new LineSegments(
      segments(graticule, R * 1.0005),
      new LineBasicMaterial({
        color: 0x8fd3ff,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
      }),
    );
    return { dots, lines, grid };
  }, [land, sun]);
  useEffect(
    () => () => {
      for (const o of [dots, lines, grid]) {
        o.geometry.dispose();
        (o.material as ShaderMaterial).dispose();
      }
    },
    [dots, lines, grid],
  );
  useFrame(({ size, gl }) => {
    (dots.material as ShaderMaterial).uniforms.uScale.value =
      (size.height / 900) * gl.getPixelRatio();
  });
  return (
    <>
      <primitive object={grid} />
      <primitive object={dots} />
      <primitive object={lines} />
    </>
  );
}

const quakeColor = (mag: number) =>
  new Color().setHSL(0.13 - Math.min(1, Math.max(0, (mag - 4.5) / 3)) * 0.13, 1, 0.58);

/**
 * Each event: a spike whose height grows with magnitude and a ring that pulses outward,
 * faster for newer events. Events younger than one day have not yet entered the network's
 * Geo events inputs and pulse hollow.
 */
function Quakes({
  quakes,
  now,
  selected,
  onPick,
  reduced,
}: {
  quakes: Quake[];
  now: number;
  selected: string | null;
  onPick: (id: string | null, hover: boolean) => void;
  reduced: boolean;
}) {
  const group = useRef<Group>(null);
  const pointer = useCanvasPointer();
  const gl = useThree((s) => s.gl);
  const data = useMemo(() => {
    const n = Math.max(1, quakes.length);
    const spikes = new BufferGeometry();
    const sp = new Float32Array(n * 6),
      sc = new Float32Array(n * 6);
    const ring = new PlaneGeometry(1, 1);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uMotion: { value: 1 }, uSelected: { value: -1 } },
      vertexShader: `attribute vec3 aColor; attribute float aPhase; attribute float aFresh; attribute float aId;
        varying vec2 vUv; varying vec3 vColor; varying float vPhase; varying float vFresh; varying float vId;
        void main(){ vUv = uv; vColor = aColor; vPhase = aPhase; vFresh = aFresh; vId = aId;
        gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uMotion; uniform float uSelected;
        varying vec2 vUv; varying vec3 vColor; varying float vPhase; varying float vFresh; varying float vId;
        void main(){ float r = length(vUv-0.5)*2.0; if (r > 1.0) discard;
        float t = fract(uTime*mix(0.25,0.7,vFresh)*uMotion + vPhase);
        float wave = exp(-pow((r - t)*9.0, 2.0))*(1.0-t);
        float core = smoothstep(0.22, 0.0, r);
        float sel = abs(vId-uSelected) < 0.5 ? 1.0 : 0.0;
        float a = wave*0.9 + core*mix(0.85, 0.25, vFresh) + sel*smoothstep(0.05,0.0,abs(r-0.8))*1.2;
        gl_FragColor = vec4(vColor*(1.0+sel), a); }`,
    });
    const rings = new InstancedMesh(ring, material, n);
    const colors = new Float32Array(n * 3),
      phase = new Float32Array(n),
      fresh = new Float32Array(n),
      ids = new Float32Array(n);
    const m = new Matrix4(),
      q = new Quaternion(),
      up = new Vector3(0, 0, 1),
      p = new Vector3(),
      s = new Vector3();
    const anchors: [number, Vector3][] = [];
    quakes.forEach((e, i) => {
      const c = quakeColor(e.mag);
      const normal = toVec(e.lat, e.lon, 1).normalize();
      toVec(e.lat, e.lon, R * 1.003, p);
      q.setFromUnitVectors(up, normal);
      const size = 0.12 + 0.11 * (e.mag - 4.5) ** 1.4;
      s.set(size, size, size);
      m.compose(p, q, s);
      rings.setMatrixAt(i, m);
      colors.set([c.r, c.g, c.b], i * 3);
      phase[i] = (i * 0.618) % 1;
      fresh[i] = e.time + 86_400_000 > now ? 1 : 0;
      ids[i] = i;
      const top = toVec(e.lat, e.lon, R * (1.003 + 0.018 * (e.mag - 4) ** 1.6));
      sp.set([p.x, p.y, p.z, top.x, top.y, top.z], i * 6);
      sc.set([c.r * 0.3, c.g * 0.3, c.b * 0.3, c.r, c.g, c.b], i * 6);
      anchors.push([i, p.clone()]);
    });
    rings.count = quakes.length;
    ring.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
    ring.setAttribute("aPhase", new InstancedBufferAttribute(phase, 1));
    ring.setAttribute("aFresh", new InstancedBufferAttribute(fresh, 1));
    ring.setAttribute("aId", new InstancedBufferAttribute(ids, 1));
    spikes.setAttribute("position", new BufferAttribute(sp, 3));
    spikes.setAttribute("color", new BufferAttribute(sc, 3));
    spikes.setDrawRange(0, quakes.length * 2);
    const spikeLines = new LineSegments(
      spikes,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    return { rings, spikeLines, material, anchors };
  }, [quakes, now]);
  useEffect(
    () => () => {
      data.rings.geometry.dispose();
      data.material.dispose();
      data.spikeLines.geometry.dispose();
      (data.spikeLines.material as LineBasicMaterial).dispose();
    },
    [data],
  );
  const hovered = useRef<number | null>(null);
  useEffect(() => {
    const el = gl.domElement;
    const click = () =>
      onPick(hovered.current == null ? null : quakes[hovered.current].stableId, false);
    el.addEventListener("click", click);
    return () => el.removeEventListener("click", click);
  }, [gl, quakes, onPick]);
  useFrame(({ clock, camera, size }) => {
    data.material.uniforms.uTime.value = clock.elapsedTime;
    data.material.uniforms.uMotion.value = reduced ? 0 : 1;
    data.material.uniforms.uSelected.value = quakes.findIndex((e) => e.stableId === selected);
    const g = group.current;
    if (!g) return;
    // Only events on the near side can be picked.
    const facing = data.anchors.filter(([, p]) => p.dot(camera.position) > 0);
    const hit = pickNearest(pointer.current, facing, g, camera, size.width, size.height);
    const id = hit?.id ?? null;
    if (id !== hovered.current) {
      hovered.current = id;
      gl.domElement.style.cursor = id == null ? "" : "pointer";
      onPick(id == null ? null : quakes[id].stableId, true);
    }
  });
  return (
    <group ref={group}>
      <primitive object={data.spikeLines} />
      <primitive object={data.rings} />
    </group>
  );
}

/** Satellites propagated with SGP4 every second, each with a ten-minute trailing track. */
function Satellites({
  tles,
  onCount,
  iss,
}: {
  tles: Satellite[];
  onCount: (n: number) => void;
  /** Written with the ISS position every second, for its label. */
  iss: Vector3;
}) {
  const data = useMemo(() => {
    const recs = tles.flatMap<{
      name: string;
      rec: SatRec | null;
      snapshot: RecordedSatellite | null;
    }>((t) => {
      if ("trail" in t) return [{ name: t.name, rec: null, snapshot: t }];
      try {
        const rec = "omm" in t ? json2satrec(t.omm) : twoline2satrec(t.line1, t.line2);
        return rec.error ? [] : [{ name: t.name, rec, snapshot: null }];
      } catch {
        return [];
      }
    });
    const TRAIL = 20;
    const points = new BufferGeometry();
    const pp = new Float32Array(Math.max(1, recs.length) * 3);
    points.setAttribute("position", new BufferAttribute(pp, 3).setUsage(DynamicDrawUsage));
    const trail = new BufferGeometry();
    const tp = new Float32Array(Math.max(1, recs.length) * (TRAIL - 1) * 6),
      tc = new Float32Array(tp.length);
    trail.setAttribute("position", new BufferAttribute(tp, 3).setUsage(DynamicDrawUsage));
    trail.setAttribute("color", new BufferAttribute(tc, 3));
    for (let i = 0; i < recs.length; i++)
      for (let k = 0; k < TRAIL - 1; k++)
        for (const [j, f] of [
          [0, k / TRAIL],
          [1, (k + 1) / TRAIL],
        ] as const) {
          const o = ((i * (TRAIL - 1) + k) * 2 + j) * 3;
          tc.set([0.55 * f, 0.95 * f, 1.0 * f], o);
        }
    const dot = new Points(
      points,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: `void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = max(3.0, 120.0/(-mv.z));
          gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard;
          gl_FragColor = vec4(vec3(0.85,0.98,1.0), pow(1.0-d*2.0,1.5)); }`,
      }),
    );
    const lines = new LineSegments(
      trail,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    return { recs, dot, lines, TRAIL, last: 0 };
  }, [tles]);
  useEffect(() => onCount(data.recs.length), [data, onCount]);
  useEffect(
    () => () => {
      for (const o of [data.dot, data.lines]) {
        o.geometry.dispose();
        (o.material as ShaderMaterial).dispose();
      }
    },
    [data],
  );
  const v = useMemo(() => new Vector3(), []);
  const place = (rec: (typeof data.recs)[number]["rec"], date: Date) => {
    if (!rec) return null;
    const pv = propagate(rec, date);
    if (!pv || !pv.position || typeof pv.position === "boolean") return null;
    const geo = eciToGeodetic(pv.position, gstime(date));
    return toVec(
      degreesLat(geo.latitude),
      degreesLong(geo.longitude),
      R * (1 + geo.height / EARTH_KM),
      v,
    );
  };
  useFrame(() => {
    const now = Date.now();
    if (now - data.last < 1000) return;
    data.last = now;
    const pos = data.dot.geometry.getAttribute("position") as BufferAttribute,
      tpos = data.lines.geometry.getAttribute("position") as BufferAttribute;
    data.recs.forEach(({ rec, name, snapshot }, i) => {
      const p = snapshot
        ? toVec(snapshot.lat, snapshot.lon, R * (1 + snapshot.altitudeKm / EARTH_KM), v)
        : place(rec, new Date(now));
      if (p) pos.setXYZ(i, p.x, p.y, p.z);
      if (p && name.startsWith("ISS (ZARYA)")) iss.copy(p);
      let prev: Vector3 | null = null;
      for (let k = 0; k < data.TRAIL; k++) {
        const point = snapshot?.trail[k];
        const q = point
          ? toVec(point.lat, point.lon, R * (1 + point.altitudeKm / EARTH_KM), v)
          : place(rec, new Date(now - (data.TRAIL - 1 - k) * 30_000));
        const cur: Vector3 | null = q ? q.clone() : prev;
        if (prev && cur) {
          const o = (i * (data.TRAIL - 1) + k - 1) * 2;
          tpos.setXYZ(o, prev.x, prev.y, prev.z);
          tpos.setXYZ(o + 1, cur.x, cur.y, cur.z);
        }
        prev = cur;
      }
    });
    pos.needsUpdate = true;
    tpos.needsUpdate = true;
  });
  return (
    <>
      <primitive object={data.lines} />
      <primitive object={data.dot} />
    </>
  );
}

/** The backend's market hubs and the 1,000 km circles its near-hub input counts inside. */
function Hubs() {
  const lines = useMemo(() => {
    const out: number[] = [];
    const a = new Vector3(),
      b = new Vector3(),
      ang = HUB_RADIUS_KM / EARTH_KM;
    for (const [, lat, lon] of HUBS) {
      const c = toVec(lat, lon, 1).normalize();
      const e1 = new Vector3(0, 1, 0).cross(c).normalize(),
        e2 = c.clone().cross(e1).normalize();
      const at = (t: number, out: Vector3) =>
        out
          .copy(c)
          .multiplyScalar(Math.cos(ang))
          .addScaledVector(e1, Math.sin(ang) * Math.cos(t))
          .addScaledVector(e2, Math.sin(ang) * Math.sin(t))
          .multiplyScalar(R * 1.004);
      for (let k = 0; k < 64; k++) {
        at((k / 64) * Math.PI * 2, a);
        at(((k + 1) / 64) * Math.PI * 2, b);
        if (k % 2 === 0) out.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const p = toVec(lat, lon, R * 1.004),
        top = toVec(lat, lon, R * 1.09);
      out.push(p.x, p.y, p.z, top.x, top.y, top.z);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(out), 3));
    return new LineSegments(
      g,
      new LineBasicMaterial({
        color: 0xf0a929,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
  }, []);
  useEffect(
    () => () => {
      lines.geometry.dispose();
      (lines.material as LineBasicMaterial).dispose();
    },
    [lines],
  );
  return <primitive object={lines} />;
}

/** Hub and ISS names, projected each frame and hidden on the far side of the globe. */
function GlobeLabels({ root, iss, hubs }: { root: HTMLElement; iss: Vector3; hubs: boolean }) {
  const group = useRef<Group>(null);
  const labels = useMemo(() => new LabelLayer(root, ".ge-title, .ge-controls, .ge-focus"), [root]);
  useEffect(() => () => labels.dispose(), [labels]);
  const specs = useMemo<LabelSpec[]>(
    () =>
      HUBS.map(([name, lat, lon]) => ({
        pos: toVec(lat, lon, R * 1.095),
        html: esc(name),
        cls: "hub",
        valign: "bottom",
        pri: 2,
      })),
    [],
  );
  const station = useMemo<LabelSpec>(
    () => ({ pos: iss, html: "ISS", cls: "sat", align: "left", dx: 8, pri: 3 }),
    [iss],
  );
  const shown = useRef("");
  const toward = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const g = group.current;
    if (!g) return;
    const facing = (p: Vector3, min: number) =>
      toward.copy(p).normalize().dot(camera.position.clone().normalize()) > min;
    const list = [
      ...(hubs ? specs.filter((s) => facing(s.pos, 0.2)) : []),
      ...(iss.lengthSq() > 0 && facing(iss, 0.05) ? [station] : []),
    ];
    const key = list.map((l) => l.html).join("|");
    if (key !== shown.current) {
      shown.current = key;
      labels.set(list);
    }
    labels.place(g, camera, size.width, size.height);
  });
  return <group ref={group} />;
}

/** Bloom, then the chosen God's Eye View sensor look as the last full-screen pass. */
function Composer({ sensor, bloom }: { sensor: SensorKind | null; bloom: number }) {
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    camera = useThree((s) => s.camera),
    size = useThree((s) => s.size),
    dpr = useThree((s) => s.viewport.dpr);
  const { composer, bloomPass, pass } = useMemo(() => {
    const composer = new EffectComposer(gl);
    const bloomPass = new UnrealBloomPass(new Vector2(256, 256), bloom, 0.55, 0.18);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    let pass: ShaderPass | null = null;
    if (sensor) {
      const def = SENSORS[sensor];
      const material = new ShaderMaterial({
        glslVersion: GLSL3,
        uniforms: {
          colorTexture: { value: null },
          colorTextureDimensions: { value: new Vector2(1, 1) },
          intensity: { value: 1 },
          time: { value: 0 },
          ...Object.fromEntries(Object.entries(def.uniforms).map(([k, v]) => [k, { value: v }])),
        },
        vertexShader: SENSOR_VERTEX,
        fragmentShader: SENSOR_PRELUDE + def.fragmentShader,
      });
      pass = new ShaderPass(material, "colorTexture");
      composer.addPass(pass);
    }
    return { composer, bloomPass, pass };
    // Bloom strength is applied below without rebuilding the chain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, sensor]);
  useEffect(() => () => composer.dispose(), [composer]);
  useEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
    const scale = Math.min(1, 1440 / (size.width * dpr));
    bloomPass.setSize(size.width * dpr * scale, size.height * dpr * scale);
    pass?.uniforms.colorTextureDimensions.value.set(size.width * dpr, size.height * dpr);
  }, [composer, bloomPass, pass, dpr, size.width, size.height]);
  useEffect(() => {
    bloomPass.strength = bloom;
  }, [bloomPass, bloom]);
  useFrame(({ clock }, delta) => {
    if (pass) pass.uniforms.time.value = clock.elapsedTime;
    composer.render(delta);
  }, 1);
  return null;
}

/** Reports the camera's sub-point (the lat/lon under the view centre) for the HUD. */
function CameraReadout({ onLook }: { onLook: (lat: number, lon: number, alt: number) => void }) {
  const last = useRef(0);
  useFrame(({ camera }) => {
    const t = performance.now();
    if (t - last.current < 250) return;
    last.current = t;
    const p = camera.position,
      r = p.length();
    const lat = (Math.asin(p.y / r) * 180) / Math.PI,
      lon = (Math.atan2(-p.z, p.x) * 180) / Math.PI;
    onLook(lat, lon, (r / R - 1) * EARTH_KM);
  });
  return null;
}

export type GlobeLayers = { quakes: boolean; satellites: boolean; hubs: boolean };

export default function GlobeScene({
  land,
  quakes,
  tles,
  now,
  layers,
  sensor,
  reduced,
  selected,
  onPick,
  onLook,
  onSatellites,
  labelsRoot,
  interactive = true,
  view = [24, 150, 3.7],
}: {
  labelsRoot: HTMLElement | null;
  /** False on the landing page: no zoom, so the page keeps its scroll. */
  interactive?: boolean;
  /** Opening latitude, longitude and distance in globe radii. */
  view?: [number, number, number];
  land: LandData | null;
  quakes: Quake[];
  tles: Satellite[];
  now: number;
  layers: GlobeLayers;
  sensor: SensorKind | null;
  reduced: boolean;
  selected: string | null;
  onPick: (id: string | null, hover: boolean) => void;
  onLook: (lat: number, lon: number, alt: number) => void;
  onSatellites: (n: number) => void;
}) {
  const sun = useMemo(() => {
    const s = subsolarPoint(new Date(now));
    return toVec(s.lat, s.lon, 1).normalize();
  }, [now]);
  const controls = useRef<OrbitControlsImpl>(null);
  const iss = useMemo(() => new Vector3(), []);
  // Open over the western Pacific: Tokyo, Seoul, Hsinchu and Shenzhen and the Ring of Fire.
  const start = useMemo(() => toVec(view[0], view[1], R * view[2]), [view]);
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 38, near: 0.1, far: 500, position: [start.x, start.y, start.z] }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
      }}
      aria-label="3D globe of live earthquakes, satellites and market hubs"
    >
      <color attach="background" args={["#000000"]} />
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableZoom={interactive}
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.5}
        minDistance={R * 1.35}
        maxDistance={R * 6}
        autoRotate={!reduced}
        autoRotateSpeed={0.25}
      />
      <Earth sun={sun} />
      {land && <Land land={land} sun={sun} />}
      {layers.hubs && <Hubs />}
      {layers.quakes && quakes.length > 0 && (
        <Quakes quakes={quakes} now={now} selected={selected} onPick={onPick} reduced={reduced} />
      )}
      {layers.satellites && tles.length > 0 && (
        <Satellites tles={tles} onCount={onSatellites} iss={iss} />
      )}
      {labelsRoot && <GlobeLabels root={labelsRoot} iss={iss} hubs={layers.hubs} />}
      <CameraReadout onLook={onLook} />
      <Composer sensor={sensor} bloom={sensor ? 0.45 : 0.75} />
    </Canvas>
  );
}

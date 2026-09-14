import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Icon } from "../ui/Icon";
import { bucketOf, utilOf, UTIL_BUCKETS, type WarehouseLayout, type WarehouseZone } from "./types";
import "./warehouse3d.css";

/* ------------------------------------------------------------------
   랙 치수(m) — 실제 파레트 랙 비율에 맞춘 값
------------------------------------------------------------------ */
const BAY_W = 2.4;     // 베이 폭
const BAY_GAP = 0.45;  // 베이 간격
const ROW_D = 1.6;     // 랙 열 깊이
const AISLE = 3.4;     // 작업 통로
const LEVEL_H = 1.5;   // 단 높이
const PAD = 1.6;       // 구역 여백
const BASE_H = 0.25;   // 구역 바닥 두께

const zoneSize = (zone: WarehouseZone) => ({
  w: zone.cols * BAY_W + (zone.cols - 1) * BAY_GAP + PAD * 2,
  d: zone.rows * ROW_D + (zone.rows - 1) * AISLE + PAD * 2,
  h: BASE_H + zone.levels * LEVEL_H
});

type Palette = {
  floor: number;
  grid: number;
  gridCenter: number;
  platform: number;
  slot: number;
  envelope: number;
  sky: number;
  ground: number;
  hemi: number;
  dir: number;
  rim: boolean;
};

const palettes: Record<"dark" | "light", Palette> = {
  dark: {
    floor: 0x080e1a,
    grid: 0x1a2942,
    gridCenter: 0x2b4a7a,
    platform: 0x111c31,
    slot: 0x1e2c47,
    envelope: 0x2f6bff,
    sky: 0x1d2b4d,
    ground: 0x05070d,
    hemi: 1.1,
    dir: 1.15,
    rim: true
  },
  light: {
    floor: 0xe9eef6,
    grid: 0xc3cede,
    gridCenter: 0x93a3bb,
    platform: 0xdbe3ee,
    slot: 0xc6d0df,
    envelope: 0x7d90ad,
    sky: 0xffffff,
    ground: 0xc8d2e0,
    hemi: 1.5,
    dir: 1.5,
    rim: false
  }
};

type Core = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  world: THREE.Group;      // 바닥/그리드/외벽 등 층 공통
  zoneGroup: THREE.Group;  // 구역 랙
  fleetGroup: THREE.Group; // 지게차/AGV
  pickables: THREE.Object3D[];
  zoneVisuals: Map<string, { edge: THREE.LineSegments; filled: THREE.InstancedMesh; platform: THREE.Mesh; color: THREE.Color }>;
  movers: Array<{ group: THREE.Group; points: THREE.Vector3[]; lengths: number[]; total: number; speed: number; offset: number }>;
  frame: number;
  clock: THREE.Clock;
  disposables: Array<{ dispose: () => void }>;
};

type Props = {
  layout: WarehouseLayout;
  floor: string;
  onFloorChange: (floor: string) => void;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  theme: "dark" | "light";
  /** 마지막 동기화 시각 표기 */
  syncedAt?: string;
};

const DEFAULT_CAM = new THREE.Vector3(40, 34, 56);
const DEFAULT_TARGET = new THREE.Vector3(0, 5, 0);

export const Warehouse3D = ({
  layout,
  floor,
  onFloorChange,
  selectedZoneId,
  onSelectZone,
  theme,
  syncedAt
}: Props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const coreRef = useRef<Core | null>(null);
  const cameraStateRef = useRef({ position: DEFAULT_CAM.clone(), target: DEFAULT_TARGET.clone() });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [ready, setReady] = useState(false);

  // 백엔드 연동 시 일부 배열이 비어 올 수 있어 항상 방어적으로 읽는다
  const floorZones = useMemo(
    () => (layout.zones ?? []).filter((zone) => zone.floor === floor),
    [layout, floor]
  );
  const floorVehicles = useMemo(
    () => (layout.vehicles ?? []).filter((vehicle) => vehicle.floor === floor),
    [layout, floor]
  );
  const floorDocks = useMemo(
    () => (layout.docks ?? []).filter((dock) => dock.floor === floor),
    [layout, floor]
  );
  const floors = layout.warehouse?.floors ?? [];

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------------
     1) 씬 생성 — 테마가 바뀌면 재구성한다(카메라 위치는 유지)
  ---------------------------------------------------------------- */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const pal = palettes[theme];
    const width = Math.max(mount.clientWidth, 1);
    const height = Math.max(mount.clientHeight, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 600);
    camera.position.copy(cameraStateRef.current.position);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 30;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minPolarAngle = 0.1;
    controls.target.copy(cameraStateRef.current.target);
    controls.update();

    const disposables: Array<{ dispose: () => void }> = [];

    /* ---- 조명 ---- */
    const hemi = new THREE.HemisphereLight(pal.sky, pal.ground, pal.hemi);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, pal.dir);
    dir.position.set(48, 70, 34);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 10;
    dir.shadow.camera.far = 220;
    dir.shadow.camera.left = -70;
    dir.shadow.camera.right = 70;
    dir.shadow.camera.top = 70;
    dir.shadow.camera.bottom = -70;
    dir.shadow.bias = -0.0012;
    scene.add(dir);
    if (pal.rim) {
      const rimA = new THREE.PointLight(0x2f6bff, 180, 130, 2);
      rimA.position.set(-34, 20, -26);
      scene.add(rimA);
      const rimB = new THREE.PointLight(0x22d3ee, 120, 120, 2);
      rimB.position.set(36, 16, 28);
      scene.add(rimB);
    }

    /* ---- 월드(바닥/그리드/외벽) ---- */
    const world = new THREE.Group();
    scene.add(world);

    const { width: bw, depth: bd } = layout.warehouse;
    const floorGeo = new THREE.PlaneGeometry(bw + 14, bd + 14);
    const floorMat = new THREE.MeshStandardMaterial({ color: pal.floor, roughness: 0.96, metalness: 0.04 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    world.add(floorMesh);
    disposables.push(floorGeo, floorMat);

    const grid = new THREE.GridHelper(Math.max(bw, bd) + 14, Math.round((Math.max(bw, bd) + 14) / 2), pal.gridCenter, pal.grid);
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = theme === "dark" ? 0.42 : 0.6;
    grid.position.y = 0.02;
    world.add(grid);
    disposables.push(grid.geometry, gridMat);

    // 건물 외곽선
    const shellGeo = new THREE.BoxGeometry(bw, 13, bd);
    const shellEdges = new THREE.EdgesGeometry(shellGeo);
    const shellMat = new THREE.LineBasicMaterial({ color: pal.envelope, transparent: true, opacity: theme === "dark" ? 0.34 : 0.5 });
    const shell = new THREE.LineSegments(shellEdges, shellMat);
    shell.position.y = 6.5;
    world.add(shell);
    disposables.push(shellGeo, shellEdges, shellMat);

    const zoneGroup = new THREE.Group();
    scene.add(zoneGroup);
    const fleetGroup = new THREE.Group();
    scene.add(fleetGroup);

    const core: Core = {
      renderer,
      scene,
      camera,
      controls,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(-10, -10),
      world,
      zoneGroup,
      fleetGroup,
      pickables: [],
      zoneVisuals: new Map(),
      movers: [],
      frame: 0,
      clock: new THREE.Clock(),
      disposables
    };
    coreRef.current = core;
    setReady(true);

    /* ---- 렌더 루프 ---- */
    const labelPos = new THREE.Vector3();
    const tick = () => {
      core.frame = requestAnimationFrame(tick);
      const delta = core.clock.getDelta();
      const elapsed = core.clock.elapsedTime;

      if (!reducedMotion) {
        for (const mover of core.movers) {
          const distance = (elapsed * mover.speed + mover.offset) % mover.total;
          let acc = 0;
          for (let i = 0; i < mover.lengths.length; i += 1) {
            if (acc + mover.lengths[i] >= distance) {
              const t = (distance - acc) / mover.lengths[i];
              const from = mover.points[i];
              const to = mover.points[(i + 1) % mover.points.length];
              mover.group.position.lerpVectors(from, to, t);
              mover.group.lookAt(to.x, mover.group.position.y, to.z);
              break;
            }
            acc += mover.lengths[i];
          }
        }
      }

      core.controls.update();
      core.renderer.render(core.scene, core.camera);

      // HTML 라벨을 3D 좌표에 맞춰 배치 (React 리렌더 없이 DOM 직접 갱신)
      const rect = core.renderer.domElement.getBoundingClientRect();
      core.zoneVisuals.forEach((visual, zoneId) => {
        const el = labelRefs.current.get(zoneId);
        if (!el) return;
        labelPos.copy(visual.platform.position);
        labelPos.y = (visual.platform.userData.labelY as number) ?? 8;
        labelPos.project(core.camera);
        if (labelPos.z > 1) {
          el.style.opacity = "0";
          return;
        }
        const x = (labelPos.x * 0.5 + 0.5) * rect.width;
        const y = (-labelPos.y * 0.5 + 0.5) * rect.height;
        el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
        el.style.opacity = "1";
      });

      void delta;
    };
    tick();

    /* ---- 휠 정책 ----
       맵 위에서 그냥 휠을 굴리면 페이지가 스크롤되고,
       Ctrl(⌘) + 휠일 때만 3D 줌이 동작하도록 캡처 단계에서 가른다.
       (캔버스보다 상위 요소에서 잡아야 OrbitControls 보다 먼저 처리된다) */
    const onWheelCapture = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    };
    mount.addEventListener("wheel", onWheelCapture, { capture: true, passive: false });

    /* ---- 리사이즈 ---- */
    const observer = new ResizeObserver(() => {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    observer.observe(mount);

    return () => {
      cameraStateRef.current = { position: camera.position.clone(), target: controls.target.clone() };
      cancelAnimationFrame(core.frame);
      mount.removeEventListener("wheel", onWheelCapture, { capture: true });
      observer.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      coreRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, layout.warehouse.width, layout.warehouse.depth]);

  /* ----------------------------------------------------------------
     2) 구역(랙) + 장비 구성 — 층/데이터가 바뀌면 다시 만든다
  ---------------------------------------------------------------- */
  useEffect(() => {
    const core = coreRef.current;
    if (!core || !ready) return;
    const pal = palettes[theme];

    const clear = (group: THREE.Group) => {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      group.clear();
    };
    clear(core.zoneGroup);
    clear(core.fleetGroup);
    core.pickables = [];
    core.zoneVisuals.clear();
    core.movers = [];

    const dummy = new THREE.Object3D();

    for (const zone of floorZones) {
      const util = utilOf(zone);
      const bucket = bucketOf(util);
      const color = new THREE.Color(bucket.color);
      const { w, d, h } = zoneSize(zone);

      /* 구역 바닥 — 선택/호버 판정 대상 */
      const platGeo = new THREE.BoxGeometry(w, BASE_H, d);
      const platMat = new THREE.MeshStandardMaterial({ color: pal.platform, roughness: 0.85, metalness: 0.1 });
      const platform = new THREE.Mesh(platGeo, platMat);
      platform.position.set(zone.x, BASE_H / 2, zone.z);
      platform.receiveShadow = true;
      platform.userData = { zoneId: zone.id, labelY: h + 1.6 };
      core.zoneGroup.add(platform);

      /* 클릭/호버 판정용 투명 히트박스 — 랙 어디를 찍어도 구역이 잡히도록
         구역 전체 부피를 덮는다(보이지는 않지만 visible=true 여야 레이캐스트 대상) */
      const hitGeo = new THREE.BoxGeometry(w, h, d);
      const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const hitbox = new THREE.Mesh(hitGeo, hitMat);
      hitbox.position.set(zone.x, h / 2, zone.z);
      hitbox.userData = { zoneId: zone.id };
      core.zoneGroup.add(hitbox);
      core.pickables.push(hitbox);

      /* 구역 외곽 발광선 */
      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.04, d));
      const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.position.set(zone.x, BASE_H + 0.02, zone.z);
      core.zoneGroup.add(edge);

      /* 파레트 슬롯 — 채움/빈칸을 인스턴싱으로 1 드로우콜 처리 */
      const slots = zone.cols * zone.rows * zone.levels;
      const filledCount = Math.max(0, Math.min(slots, Math.round((slots * util) / 100)));
      const palletGeo = new THREE.BoxGeometry(BAY_W - 0.25, LEVEL_H - 0.35, ROW_D - 0.2);
      const filledMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: theme === "dark" ? 0.32 : 0.08,
        roughness: 0.5,
        metalness: 0.12
      });
      const emptyMat = new THREE.MeshStandardMaterial({
        color: pal.slot,
        transparent: true,
        opacity: theme === "dark" ? 0.3 : 0.45,
        roughness: 0.9
      });
      const filled = new THREE.InstancedMesh(palletGeo, filledMat, Math.max(filledCount, 1));
      const empty = new THREE.InstancedMesh(palletGeo, emptyMat, Math.max(slots - filledCount, 1));
      filled.castShadow = true;
      filled.receiveShadow = true;
      filled.count = filledCount;
      empty.count = slots - filledCount;

      const x0 = zone.x - w / 2 + PAD + BAY_W / 2;
      const z0 = zone.z - d / 2 + PAD + ROW_D / 2;
      let placed = 0;
      let emptyIdx = 0;
      // 아래 단부터 채운다 — 실제 적재 순서와 동일
      for (let level = 0; level < zone.levels; level += 1) {
        for (let row = 0; row < zone.rows; row += 1) {
          for (let col = 0; col < zone.cols; col += 1) {
            dummy.position.set(
              x0 + col * (BAY_W + BAY_GAP),
              BASE_H + LEVEL_H / 2 + level * LEVEL_H,
              z0 + row * (ROW_D + AISLE)
            );
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            if (placed < filledCount) {
              filled.setMatrixAt(placed, dummy.matrix);
              placed += 1;
            } else {
              empty.setMatrixAt(emptyIdx, dummy.matrix);
              emptyIdx += 1;
            }
          }
        }
      }
      filled.instanceMatrix.needsUpdate = true;
      empty.instanceMatrix.needsUpdate = true;
      core.zoneGroup.add(filled);
      core.zoneGroup.add(empty);

      core.zoneVisuals.set(zone.id, { edge, filled, platform, color });
    }

    /* ---- 도크 ---- */
    for (const dock of floorDocks) {
      const dockColor = dock.kind === "IN" ? 0x22d3ee : 0xf59e0b;
      const geo = new THREE.BoxGeometry(7, 0.3, 3);
      const mat = new THREE.MeshStandardMaterial({
        color: dockColor,
        emissive: dockColor,
        emissiveIntensity: theme === "dark" ? 0.45 : 0.1,
        roughness: 0.6
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(dock.x, 0.15, dock.z);
      core.zoneGroup.add(mesh);
    }

    /* ---- 지게차 / AGV ---- */
    for (const vehicle of floorVehicles) {
      const group = new THREE.Group();
      const bodyColor = vehicle.kind === "FORKLIFT" ? 0xfacc15 : 0x22d3ee;
      const bodyGeo = new THREE.BoxGeometry(1.7, 1.0, 2.6);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: theme === "dark" ? 0.28 : 0.06,
        roughness: 0.45,
        metalness: 0.2
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      body.position.y = 0.6;
      group.add(body);

      const beaconGeo = new THREE.SphereGeometry(0.26, 12, 12);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(0, 1.35, 0);
      group.add(beacon);

      const points = vehicle.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
      const lengths = points.map((point, idx) => point.distanceTo(points[(idx + 1) % points.length]));
      const total = lengths.reduce((sum, len) => sum + len, 0);
      group.position.copy(points[0]);
      core.fleetGroup.add(group);
      core.movers.push({ group, points, lengths, total, speed: vehicle.speed, offset: total * Math.random() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, floorZones, floorVehicles, floorDocks, theme]);

  /* ----------------------------------------------------------------
     3) 선택/호버 하이라이트
  ---------------------------------------------------------------- */
  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.zoneVisuals.forEach((visual, zoneId) => {
      const active = zoneId === selectedZoneId;
      const hover = zoneId === hoverId;
      const edgeMat = visual.edge.material as THREE.LineBasicMaterial;
      edgeMat.opacity = active ? 1 : hover ? 0.95 : 0.6;
      const filledMat = visual.filled.material as THREE.MeshStandardMaterial;
      filledMat.emissiveIntensity = theme === "dark"
        ? active ? 0.85 : hover ? 0.55 : 0.32
        : active ? 0.28 : hover ? 0.18 : 0.08;
      visual.edge.scale.setScalar(active ? 1.015 : 1);
    });
  }, [selectedZoneId, hoverId, theme, floorZones]);

  /* ----------------------------------------------------------------
     4) 포인터 상호작용
  ---------------------------------------------------------------- */
  const pick = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const core = coreRef.current;
    if (!core) return null;
    const rect = core.renderer.domElement.getBoundingClientRect();
    core.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    core.raycaster.setFromCamera(core.pointer, core.camera);
    const hit = core.raycaster.intersectObjects(core.pickables, false)[0];
    return (hit?.object.userData.zoneId as string | undefined) ?? null;
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const id = pick(event);
    setHoverId((prev) => (prev === id ? prev : id));
  };

  const handleClick = (event: React.PointerEvent<HTMLDivElement>) => {
    const id = pick(event);
    if (id) onSelectZone(id);
  };

  /* ----------------------------------------------------------------
     5) 뷰 컨트롤
  ---------------------------------------------------------------- */
  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.controls.autoRotate = autoRotate && !reducedMotion;
    core.controls.autoRotateSpeed = 0.55;
  }, [autoRotate, ready, reducedMotion]);

  const dolly = (factor: number) => {
    const core = coreRef.current;
    if (!core) return;
    const { camera, controls } = core;
    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
  };

  const resetView = () => {
    const core = coreRef.current;
    if (!core) return;
    core.camera.position.copy(DEFAULT_CAM);
    core.controls.target.copy(DEFAULT_TARGET);
    core.controls.update();
  };

  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.requestFullscreen?.();
  };

  return (
    <div className="wh3d" ref={stageRef}>
      <div
        className={`wh3d-canvas${hoverId ? " is-pointing" : ""}`}
        ref={mountRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverId(null)}
        onClick={(event) => handleClick(event as unknown as React.PointerEvent<HTMLDivElement>)}
      />

      {/* 구역 라벨 — 3D 좌표에 따라 매 프레임 위치가 갱신된다 */}
      <div className="wh3d-labels" aria-hidden="true">
        {floorZones.map((zone) => {
          const util = utilOf(zone);
          const bucket = bucketOf(util);
          return (
            <div
              key={zone.id}
              className={`wh3d-label tone-${bucket.key}${selectedZoneId === zone.id ? " is-active" : ""}`}
              ref={(el) => {
                if (el) labelRefs.current.set(zone.id, el);
                else labelRefs.current.delete(zone.id);
              }}
            >
              <span className="wh3d-label-name">{zone.name}</span>
              <span className="wh3d-label-util">{util}%</span>
              <span className="wh3d-label-code">{zone.code}</span>
            </div>
          );
        })}
      </div>

      {/* 층 선택 */}
      <div className="wh3d-floors">
        {[...floors].reverse().map((item) => (
          <button
            key={item}
            type="button"
            className={`wh3d-floor${item === floor ? " is-active" : ""}`}
            onClick={() => onFloorChange(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {/* 범례 */}
      <div className="wh3d-legend">
        {UTIL_BUCKETS.map((bucket) => (
          <span key={bucket.key}>
            <i style={{ background: bucket.token }} />
            {bucket.label}
          </span>
        ))}
      </div>

      {/* 뷰 도구 */}
      <div className="wh3d-tools">
        <button type="button" className="nx-iconbtn" onClick={() => dolly(0.82)} title="확대" aria-label="확대">
          <Icon name="plus" size={15} />
        </button>
        <button type="button" className="nx-iconbtn" onClick={() => dolly(1.22)} title="축소" aria-label="축소">
          <Icon name="minus" size={15} />
        </button>
        <button
          type="button"
          className={`nx-iconbtn${autoRotate ? " is-on" : ""}`}
          onClick={() => setAutoRotate((value) => !value)}
          title="자동 회전"
          aria-label="자동 회전"
          aria-pressed={autoRotate}
        >
          <Icon name="refresh" size={15} />
        </button>
        <button type="button" className="nx-iconbtn" onClick={resetView} title="기본 시점" aria-label="기본 시점">
          <Icon name="crosshair" size={15} />
        </button>
        <button type="button" className="nx-iconbtn" onClick={toggleFullscreen} title="전체 화면" aria-label="전체 화면">
          <Icon name="maximize" size={15} />
        </button>
      </div>

      <div className="wh3d-status">
        <span className="nx-live">LIVE</span>
        {syncedAt ? <span className="wh3d-sync">마지막 동기화 {syncedAt}</span> : null}
      </div>

      <div className="wh3d-hint">드래그 회전 · Ctrl+휠 확대 · 구역 클릭 시 상세</div>
    </div>
  );
};

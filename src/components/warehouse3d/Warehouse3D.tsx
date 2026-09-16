import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Icon } from "../ui/Icon";
import { BASE_H, normalizeDeg, rackYaw, slotCenter, zoneHeight } from "./geometry";
import {
  COLOR_MODE_LABEL,
  LOCATION_TYPE_LABEL,
  bucketOf,
  legendFor,
  slotColorOf,
  type ColorMode,
  type FocusRequest,
  type LayoutRack,
  type LayoutSlot,
  type LayoutZone,
  type MapSelection,
  type WarehouseLayout
} from "./types";
import "./warehouse3d.css";

/* ============================================================
   3D 창고 맵
   - 조회 모드(view): 구역 클릭 → 구역 포커스, 포커스된 구역 안의 슬롯 클릭 → 로케이션 선택
   - 작업 모드(work): 슬롯을 끌어 다른 슬롯에 놓으면 onDropSlot (재고 이동)
   선반(레이아웃) 편집은 이 컴포넌트에서 하지 않는다 — 2D 배치 편집기의 몫이다.
   ============================================================ */

type Palette = {
  floor: number;
  grid: number;
  gridCenter: number;
  platform: number;
  slot: number;
  voidSlot: number;
  envelope: number;
  edgeNeutral: number;
  dim: number;
  sky: number;
  ground: number;
  hemi: number;
  dir: number;
  rim: boolean;
  select: number;
  pillar: number;
  wall: number;
  aisle: number;
};

const palettes: Record<"dark" | "light", Palette> = {
  dark: {
    floor: 0x080e1a,
    grid: 0x1a2942,
    gridCenter: 0x2b4a7a,
    platform: 0x111c31,
    slot: 0x1e2c47,
    voidSlot: 0x2b3a57,
    envelope: 0x2f6bff,
    edgeNeutral: 0x3b4d6e,
    dim: 0x1a2336,
    sky: 0x1d2b4d,
    ground: 0x05070d,
    hemi: 1.1,
    dir: 1.15,
    rim: true,
    select: 0xffffff,
    pillar: 0x334155,
    wall: 0x1f2a3d,
    aisle: 0xfacc15
  },
  light: {
    floor: 0xe9eef6,
    grid: 0xc3cede,
    gridCenter: 0x93a3bb,
    platform: 0xdbe3ee,
    slot: 0xc6d0df,
    voidSlot: 0xaab6c8,
    envelope: 0x7d90ad,
    edgeNeutral: 0x9aa9bf,
    dim: 0xd5dce6,
    sky: 0xffffff,
    ground: 0xc8d2e0,
    hemi: 1.5,
    dir: 1.5,
    rim: false,
    select: 0x1d4ed8,
    pillar: 0x94a3b8,
    wall: 0xcbd5e1,
    aisle: 0xca8a04
  }
};

const INACTIVE_COLOR = 0x64748b;
const DROP_OK = 0x22c55e;
const DROP_BAD = 0xef4444;

const DEFAULT_CAM = new THREE.Vector3(40, 34, 56);
const DEFAULT_TARGET = new THREE.Vector3(0, 5, 0);

type ZoneVisual = {
  zone: LayoutZone;
  height: number;
  /** 구역에 속한 모든 메시를 담는다 — 배치 편집에서 통째로 옮기고 돌린다 */
  group: THREE.Group;
  /** 끄는 중 구역 중심 — 라벨이 따라간다 */
  center: { x: number; z: number };
  platform: THREE.Mesh;
  edge: THREE.LineSegments;
  hitbox: THREE.Mesh;
  filled: THREE.InstancedMesh;
  empty: THREE.InstancedMesh;
  filledSlots: LayoutSlot[];
  emptySlots: LayoutSlot[];
};

type Tween = {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
  start: number;
  duration: number;
};

type Core = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  perspective: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  orbit3d: OrbitControls;
  orbit2d: OrbitControls;
  raycaster: THREE.Raycaster;
  sun: THREE.DirectionalLight;
  world: THREE.Group;
  content: THREE.Group;
  fleet: THREE.Group;
  zones: Map<number, ZoneVisual>;
  slotMeshes: THREE.InstancedMesh[];
  hitboxes: THREE.Mesh[];
  racks: Map<number, LayoutRack>;
  selectOutline: THREE.LineSegments;
  hoverOutline: THREE.LineSegments;
  dropOutline: THREE.LineSegments;
  /** 구역을 끄는 동안 원래 자리를 점선 테두리로 남긴다 */
  originOutline: THREE.LineSegments;
  movers: Array<{ group: THREE.Group; points: THREE.Vector3[]; lengths: number[]; total: number; speed: number; offset: number }>;
  tween: Tween | null;
  frame: number;
  clock: THREE.Clock;
};

type Hover = { zoneId: number | null; slot: LayoutSlot | null };

type CameraApi = {
  focusZone: (zoneId: number) => void;
  focusSlot: (locationId: number) => void;
  resetCamera: () => void;
  frontCamera: () => void;
};

type DragState = { from: LayoutSlot; target: LayoutSlot | null; reason: string | null; x: number; y: number };

/** 배치 편집 — 구역을 끄는(옮기기 · Ctrl 돌리기) 중인 상태 (화면 표시용) */
type ZoneDragInfo = { zoneId: number; kind: "move" | "rotate"; x: number; z: number; rotation: number; reason: string | null; moved: boolean };

export type ZoneEditHandlers = {
  enabled: boolean;
  /** 놓을 수 없으면 사유, 가능하면 null. rotation 을 빼면 지금 각도 */
  check: (zoneId: number, x: number, z: number, rotation?: number) => string | null;
  onMove: (zoneId: number, x: number, z: number) => void;
  /** Ctrl(⌘)+끌기로 돌린 결과 */
  onRotate?: (zoneId: number, rotation: number) => void;
  onReject?: (reason: string) => void;
  onSelect?: (zoneId: number) => void;
  /** 격자 스냅 간격(m) */
  step?: number;
  /** 끌어 돌릴 때 각도 스냅(°) */
  rotateStep?: number;
};

type Props = {
  layout: WarehouseLayout;
  floor: string;
  onFloorChange: (floor: string) => void;
  theme: "dark" | "light";
  selection: MapSelection;
  onSelectionChange: (next: MapSelection) => void;
  colorMode?: ColorMode;
  onColorModeChange?: (mode: ColorMode) => void;
  /** 검색 결과 등 — 나머지 슬롯은 흐리게 */
  highlightIds?: number[] | null;
  focus?: FocusRequest | null;
  mode?: "view" | "work";
  /** 작업 모드 — 놓을 수 없으면 사유 문자열, 가능하면 null */
  dropCheck?: (from: LayoutSlot, to: LayoutSlot) => string | null;
  onDropSlot?: (from: LayoutSlot, to: LayoutSlot) => void;
  syncedAt?: string;
  /** 맵 왼쪽 위에 얹을 도구 (검색창 · 편집 바 등) */
  overlay?: ReactNode;
  /** 배치 편집 모드 — 구역 통째로 끌어 옮기기 */
  zoneEdit?: ZoneEditHandlers | null;
  /** 뷰 도구 줄 끝에 붙일 버튼 */
  toolbarExtra?: ReactNode;
  /** 슬롯 우클릭(터치는 길게 누르기) — point 는 맵 안 좌표(px) */
  onSlotContextMenu?: (slot: LayoutSlot, point: { x: number; y: number }) => void;
  /** 맵 위에 띄울 팝오버 (우클릭 메뉴 등) */
  popover?: ReactNode;
};

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const Warehouse3D = ({
  layout,
  floor,
  onFloorChange,
  theme,
  selection,
  onSelectionChange,
  colorMode = "util",
  onColorModeChange,
  highlightIds,
  focus,
  mode = "view",
  dropCheck,
  onDropSlot,
  syncedAt,
  overlay,
  zoneEdit,
  toolbarExtra,
  onSlotContextMenu,
  popover
}: Props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<number, HTMLDivElement>());
  const slotLabelRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<Core | null>(null);
  const cameraApi = useRef<CameraApi | null>(null);
  const cameraMemo = useRef({ position: DEFAULT_CAM.clone(), target: DEFAULT_TARGET.clone() });

  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Hover>({ zoneId: null, slot: null });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [zoneDrag, setZoneDrag] = useState<ZoneDragInfo | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [topView, setTopView] = useState(false);

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const floorInfo = useMemo(
    () => layout.floors.find((item) => item.code === floor) ?? layout.floors[0] ?? null,
    [layout.floors, floor]
  );
  const floorZones = useMemo(() => layout.zones.filter((zone) => zone.floor === floor), [layout.zones, floor]);
  const floorZoneIds = useMemo(() => new Set(floorZones.map((zone) => zone.id)), [floorZones]);
  const floorRacks = useMemo(() => layout.racks.filter((rack) => floorZoneIds.has(rack.zoneId)), [layout.racks, floorZoneIds]);
  const floorSlots = useMemo(() => layout.slots.filter((slot) => floorZoneIds.has(slot.zoneId)), [layout.slots, floorZoneIds]);
  const floorObjects = useMemo(() => layout.objects.filter((object) => object.floor === floor), [layout.objects, floor]);
  const floorVehicles = useMemo(() => layout.vehicles.filter((vehicle) => vehicle.floor === floor), [layout.vehicles, floor]);
  const slotById = useMemo(() => new Map(layout.slots.map((slot) => [slot.locationId, slot])), [layout.slots]);
  const highlightSet = useMemo(() => (highlightIds && highlightIds.length ? new Set(highlightIds) : null), [highlightIds]);

  // 네이티브 이벤트 핸들러가 항상 최신 값을 읽도록
  const live = useRef({ mode, selection, onSelectionChange, dropCheck, onDropSlot, slotById, floorZones, topView, zoneEdit, onSlotContextMenu });
  live.current = { mode, selection, onSelectionChange, dropCheck, onDropSlot, slotById, floorZones, topView, zoneEdit, onSlotContextMenu };

  const floorWidth = floorInfo?.width ?? 60;
  const floorDepth = floorInfo?.depth ?? 40;

  /* ----------------------------------------------------------------
     1) 씬 · 카메라 · 조명 · 바닥 — 테마/층 치수가 바뀌면 재구성
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

    const perspective = new THREE.PerspectiveCamera(38, width / height, 0.5, 600);
    perspective.position.copy(cameraMemo.current.position);
    const orbit3d = new OrbitControls(perspective, renderer.domElement);
    orbit3d.enableDamping = true;
    orbit3d.dampingFactor = 0.08;
    orbit3d.minDistance = 9;
    orbit3d.maxDistance = 180;
    orbit3d.maxPolarAngle = Math.PI * 0.47;
    orbit3d.minPolarAngle = 0.1;
    orbit3d.target.copy(cameraMemo.current.target);
    orbit3d.update();

    // 2D 탑뷰 — 원근 없는 정사영, 회전 잠금, 끌면 이동
    const half = Math.max(floorDepth / 2 + 6, (floorWidth / 2 + 6) / (width / height));
    const ortho = new THREE.OrthographicCamera(-half * (width / height), half * (width / height), half, -half, 0.5, 400);
    ortho.position.set(0, 120, 0);
    ortho.up.set(0, 0, -1);
    ortho.lookAt(0, 0, 0);
    const orbit2d = new OrbitControls(ortho, renderer.domElement);
    orbit2d.enableRotate = false;
    orbit2d.screenSpacePanning = true;
    orbit2d.enableDamping = true;
    orbit2d.dampingFactor = 0.12;
    orbit2d.minZoom = 0.8;
    orbit2d.maxZoom = 8;
    orbit2d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    orbit2d.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    orbit2d.target.set(0, 0, 0);
    orbit2d.enabled = false;
    orbit2d.update();

    /* ---- 조명 ---- */
    scene.add(new THREE.HemisphereLight(pal.sky, pal.ground, pal.hemi));
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

    /* ---- 바닥 · 그리드 · 외곽 ---- */
    const world = new THREE.Group();
    scene.add(world);
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(floorWidth + 14, floorDepth + 14),
      new THREE.MeshStandardMaterial({ color: pal.floor, roughness: 0.96, metalness: 0.04 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    world.add(floorMesh);

    const gridSize = Math.max(floorWidth, floorDepth) + 14;
    const grid = new THREE.GridHelper(gridSize, Math.round(gridSize / 2), pal.gridCenter, pal.grid);
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = theme === "dark" ? 0.42 : 0.6;
    grid.position.y = 0.02;
    world.add(grid);

    const shell = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(floorWidth, 13, floorDepth)),
      new THREE.LineBasicMaterial({ color: pal.envelope, transparent: true, opacity: theme === "dark" ? 0.34 : 0.5 })
    );
    shell.position.y = 6.5;
    world.add(shell);

    const content = new THREE.Group();
    scene.add(content);
    const fleet = new THREE.Group();
    scene.add(fleet);

    const outline = (color: number, opacity: number) => {
      const line = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false })
      );
      line.renderOrder = 10;
      line.visible = false;
      scene.add(line);
      return line;
    };

    const core: Core = {
      renderer,
      scene,
      perspective,
      ortho,
      orbit3d,
      orbit2d,
      raycaster: new THREE.Raycaster(),
      sun: dir,
      world,
      content,
      fleet,
      zones: new Map(),
      slotMeshes: [],
      hitboxes: [],
      racks: new Map(),
      selectOutline: outline(pal.select, 1),
      hoverOutline: outline(pal.envelope, 0.9),
      dropOutline: outline(DROP_OK, 1),
      originOutline: outline(pal.envelope, 0.75),
      movers: [],
      tween: null,
      frame: 0,
      clock: new THREE.Clock()
    };
    coreRef.current = core;
    // 테마가 바뀌어 씬을 다시 만들 때도 2D/3D 상태를 이어받는다
    orbit3d.enabled = !live.current.topView;
    orbit2d.enabled = live.current.topView;
    dir.castShadow = !live.current.topView;
    setReady(true);

    const activeCamera = () => (live.current.topView ? core.ortho : core.perspective);
    const activeOrbit = () => (live.current.topView ? core.orbit2d : core.orbit3d);

    /* ---- 렌더 루프 ---- */
    const labelPos = new THREE.Vector3();
    const tick = () => {
      core.frame = requestAnimationFrame(tick);
      const elapsed = core.clock.getElapsedTime();

      if (!reducedMotion) {
        for (const mover of core.movers) {
          const distance = (elapsed * mover.speed + mover.offset) % mover.total;
          let acc = 0;
          for (let i = 0; i < mover.lengths.length; i += 1) {
            if (acc + mover.lengths[i] >= distance) {
              const t = (distance - acc) / mover.lengths[i];
              const to = mover.points[(i + 1) % mover.points.length];
              mover.group.position.lerpVectors(mover.points[i], to, t);
              mover.group.lookAt(to.x, mover.group.position.y, to.z);
              break;
            }
            acc += mover.lengths[i];
          }
        }
      }

      const camera = activeCamera();
      const orbit = activeOrbit();
      if (core.tween) {
        const tw = core.tween;
        const t = Math.min((performance.now() - tw.start) / tw.duration, 1);
        const k = easeInOut(t);
        orbit.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
        if (camera === core.perspective) {
          camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
        } else {
          core.ortho.position.set(orbit.target.x, 120, orbit.target.z);
          core.ortho.zoom = THREE.MathUtils.lerp(tw.fromZoom, tw.toZoom, k);
          core.ortho.updateProjectionMatrix();
        }
        if (t >= 1) core.tween = null;
      }
      orbit.update();
      core.renderer.render(core.scene, camera);

      // HTML 라벨 — React 리렌더 없이 DOM 직접 갱신
      const rect = core.renderer.domElement.getBoundingClientRect();
      const place = (el: HTMLElement, x: number, y: number, z: number) => {
        labelPos.set(x, y, z).project(camera);
        if (labelPos.z > 1) {
          el.style.opacity = "0";
          return;
        }
        const px = (labelPos.x * 0.5 + 0.5) * rect.width;
        const py = (-labelPos.y * 0.5 + 0.5) * rect.height;
        el.style.transform = `translate(-50%, -100%) translate(${px}px, ${py}px)`;
        el.style.opacity = "1";
      };
      core.zones.forEach((visual, zoneId) => {
        const el = labelRefs.current.get(zoneId);
        // 끄는 중이면 옮긴 중심을 따라간다 (돌릴 때는 중심이 그대로)
        if (el) place(el, visual.center.x, visual.height + 1.6, visual.center.z);
      });
      const slotEl = slotLabelRef.current;
      const labelSlotId = slotEl?.dataset.locationId ? Number(slotEl.dataset.locationId) : null;
      if (slotEl && labelSlotId != null) {
        const slot = live.current.slotById.get(labelSlotId);
        const rack = slot ? core.racks.get(slot.rackId) : undefined;
        if (slot && rack) {
          const center = slotCenter(rack, slot.bay, slot.level);
          place(slotEl, center.x, center.y + rack.levelHeight / 2, center.z);
        } else {
          slotEl.style.opacity = "0";
        }
      }
    };
    tick();

    /* ---- 휠 정책: 그냥 휠 = 페이지 스크롤, Ctrl(⌘)+휠 = 확대 ---- */
    const onWheelCapture = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    };
    mount.addEventListener("wheel", onWheelCapture, { capture: true, passive: false });

    /* ---- 포인터 — 캡처 단계에서 가로채야 OrbitControls 보다 먼저 판단한다 ---- */
    const pointer = new THREE.Vector2();
    const cast = (clientX: number, clientY: number) => {
      const rectNow = core.renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rectNow.left) / rectNow.width) * 2 - 1, -((clientY - rectNow.top) / rectNow.height) * 2 + 1);
      core.raycaster.setFromCamera(pointer, activeCamera());
      const slotHit = core.raycaster.intersectObjects(core.slotMeshes, false)[0];
      let slot: LayoutSlot | null = null;
      if (slotHit && slotHit.instanceId != null) {
        const list = slotHit.object.userData.slots as LayoutSlot[];
        slot = list[slotHit.instanceId] ?? null;
      }
      const zoneHit = core.raycaster.intersectObjects(core.hitboxes, false)[0];
      const zoneId = slot?.zoneId ?? ((zoneHit?.object.userData.zoneId as number | undefined) ?? null);
      return { slot, zoneId };
    };

    let press: { x: number; y: number; slot: LayoutSlot | null; zoneId: number | null; dragging: boolean } | null = null;

    /* 배치 편집 — 커서를 바닥 평면(y=0)에 투영해 구역 중심을 옮긴다.
       높이 방향이 고정되니 3D 에서도 "위로 끌면 뒤로 가나?" 같은 모호함이 없다. */
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundHit = new THREE.Vector3();
    const groundAt = (clientX: number, clientY: number) => {
      const rectNow = core.renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rectNow.left) / rectNow.width) * 2 - 1, -((clientY - rectNow.top) / rectNow.height) * 2 + 1);
      core.raycaster.setFromCamera(pointer, activeCamera());
      return core.raycaster.ray.intersectPlane(ground, groundHit) ? { x: groundHit.x, z: groundHit.z } : null;
    };
    const snapTo = (value: number, step: number) => Math.round(value / step) * step;

    let rightDown: { x: number; y: number } | null = null;
    let longPress: { x: number; y: number; fired: boolean; timer: number } | null = null;
    const clearLongPress = () => {
      if (longPress) window.clearTimeout(longPress.timer);
      longPress = null;
    };

    let zoneGrab: {
      zoneId: number;
      /** move = 끌어 옮기기, rotate = Ctrl(⌘) 누르고 끌어 돌리기 */
      kind: "move" | "rotate";
      startX: number;
      startZ: number;
      startRotation: number;
      grabDx: number;
      grabDz: number;
      x: number;
      z: number;
      rotation: number;
      /** 돌리기 — 직전 커서 각도(rad)와 누적 회전(°). 한 바퀴를 넘겨도 끊기지 않게 누적한다 */
      lastAngle: number;
      turned: number;
      reason: string | null;
      moved: boolean;
      downX: number;
      downY: number;
    } | null = null;

    /** 구역 그룹을 (x, z) 로 옮기고 rotation 으로 돌린 모습 — 회전축은 구역 중심 */
    const poseZone = (visual: ZoneVisual, x: number, z: number, rotation: number) => {
      const yaw = -((rotation - (visual.zone.rotation ?? 0)) * Math.PI) / 180;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const { x: cx, z: cz } = visual.zone;
      // three.js y축 회전 R: (x, z) → (x cos + z sin, −x sin + z cos). 원래 중심 c 가 (x, z) 에 오도록 p = (x, z) − R(c)
      visual.group.rotation.set(0, yaw, 0);
      visual.group.position.set(x - (cx * cos + cz * sin), 0, z - (-cx * sin + cz * cos));
      visual.center = { x, z };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) {
        // 오른쪽 버튼으로 끌면 화면 이동 — 끈 뒤에는 메뉴를 띄우지 않으려고 시작점을 기억한다
        rightDown = { x: event.clientX, y: event.clientY };
        return;
      }
      if (event.button !== 0) return;
      const hit = cast(event.clientX, event.clientY);

      // 터치·펜은 길게 누르면 우클릭 메뉴
      if (event.pointerType !== "mouse" && hit.slot && live.current.onSlotContextMenu && !live.current.zoneEdit?.enabled) {
        const slot = hit.slot;
        const rectNow = mount.getBoundingClientRect();
        const point = { x: event.clientX - rectNow.left, y: event.clientY - rectNow.top };
        clearLongPress();
        longPress = {
          x: event.clientX,
          y: event.clientY,
          fired: false,
          timer: window.setTimeout(() => {
            if (!longPress) return;
            longPress.fired = true;
            live.current.onSlotContextMenu?.(slot, point);
          }, 550)
        };
      }

      if (live.current.zoneEdit?.enabled) {
        // 빈 바닥을 누르면 평소처럼 카메라를 돌린다
        if (hit.zoneId == null) return;
        const visual = core.zones.get(hit.zoneId);
        const point = groundAt(event.clientX, event.clientY);
        if (!visual || !point) return;
        event.stopPropagation();
        event.preventDefault();
        const rotation = visual.zone.rotation ?? 0;
        zoneGrab = {
          zoneId: hit.zoneId,
          kind: event.ctrlKey || event.metaKey ? "rotate" : "move",
          startX: visual.zone.x,
          startZ: visual.zone.z,
          startRotation: rotation,
          grabDx: point.x - visual.zone.x,
          grabDz: point.z - visual.zone.z,
          x: visual.zone.x,
          z: visual.zone.z,
          rotation,
          lastAngle: Math.atan2(point.z - visual.zone.z, point.x - visual.zone.x),
          turned: 0,
          reason: null,
          moved: false,
          downX: event.clientX,
          downY: event.clientY
        };
        return;
      }

      press = { x: event.clientX, y: event.clientY, slot: hit.slot, zoneId: hit.zoneId, dragging: false };
      // 작업 모드에서 재고가 있는 슬롯을 누르면 카메라 회전 대신 끌기로 해석한다
      if (live.current.mode === "work" && hit.slot && hit.slot.pallets > 0) {
        event.stopPropagation();
        event.preventDefault();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (longPress && !longPress.fired && Math.hypot(event.clientX - longPress.x, event.clientY - longPress.y) > 8) clearLongPress();
      if (zoneGrab) {
        const edit = live.current.zoneEdit;
        const visual = core.zones.get(zoneGrab.zoneId);
        if (!edit || !visual) return;
        if (!zoneGrab.moved && Math.hypot(event.clientX - zoneGrab.downX, event.clientY - zoneGrab.downY) < 4) return;
        const point = groundAt(event.clientX, event.clientY);
        if (!point) return;
        if (!zoneGrab.moved) {
          zoneGrab.moved = true;
          // 원래 자리를 테두리로 남긴다 — 돌린 구역이면 그 방향 그대로
          core.originOutline.position.set(zoneGrab.startX, BASE_H + 0.03, zoneGrab.startZ);
          core.originOutline.rotation.set(0, rackYaw(zoneGrab.startRotation), 0);
          core.originOutline.scale.set(visual.zone.width, 0.02, visual.zone.depth);
          core.originOutline.visible = true;
        }

        if (zoneGrab.kind === "rotate") {
          // 구역 중심을 축으로 커서가 돈 각도만큼 돌린다 — 중심 가까이에서는 각도가 튀므로 멈춘다
          const dx = point.x - zoneGrab.startX;
          const dz = point.z - zoneGrab.startZ;
          if (Math.hypot(dx, dz) < 0.6) return;
          const angle = Math.atan2(dz, dx);
          let delta = angle - zoneGrab.lastAngle;
          if (delta > Math.PI) delta -= Math.PI * 2;
          if (delta < -Math.PI) delta += Math.PI * 2;
          zoneGrab.lastAngle = angle;
          zoneGrab.turned += (delta * 180) / Math.PI;
          const step = edit.rotateStep ?? 5;
          const rotation = normalizeDeg(snapTo(zoneGrab.startRotation + zoneGrab.turned, step));
          if (rotation === zoneGrab.rotation) return;
          zoneGrab.rotation = rotation;
          poseZone(visual, zoneGrab.startX, zoneGrab.startZ, rotation);
          zoneGrab.reason = rotation === zoneGrab.startRotation ? null : edit.check(zoneGrab.zoneId, zoneGrab.startX, zoneGrab.startZ, rotation);
          setZoneDrag({ zoneId: zoneGrab.zoneId, kind: "rotate", x: zoneGrab.startX, z: zoneGrab.startZ, rotation, reason: zoneGrab.reason, moved: true });
          return;
        }

        const step = edit.step ?? 0.5;
        const x = snapTo(point.x - zoneGrab.grabDx, step);
        const z = snapTo(point.z - zoneGrab.grabDz, step);
        if (x === zoneGrab.x && z === zoneGrab.z) return;
        zoneGrab.x = x;
        zoneGrab.z = z;
        poseZone(visual, x, z, zoneGrab.startRotation);
        zoneGrab.reason = x === zoneGrab.startX && z === zoneGrab.startZ ? null : edit.check(zoneGrab.zoneId, x, z);
        setZoneDrag({ zoneId: zoneGrab.zoneId, kind: "move", x, z, rotation: zoneGrab.startRotation, reason: zoneGrab.reason, moved: true });
        return;
      }
      if (press && live.current.mode === "work" && press.slot && press.slot.pallets > 0) {
        const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
        if (!press.dragging && moved > 6) press.dragging = true;
        if (press.dragging) {
          const hit = cast(event.clientX, event.clientY);
          const from = press.slot;
          const target = hit.slot && hit.slot.locationId !== from.locationId ? hit.slot : null;
          const reason = target ? live.current.dropCheck?.(from, target) ?? null : null;
          const rectNow = mount.getBoundingClientRect();
          setDrag({ from, target, reason, x: event.clientX - rectNow.left, y: event.clientY - rectNow.top });
          return;
        }
      }
      if (event.target !== core.renderer.domElement) return;
      const hit = cast(event.clientX, event.clientY);
      const current = live.current;
      // 조회 모드에서는 포커스된 구역 안의 슬롯만 짚는다 (드릴다운). 배치 편집 중에는 구역만 짚는다
      const slot = current.zoneEdit?.enabled
        ? null
        : current.mode === "work" || hit.slot?.zoneId === current.selection.zoneId ? hit.slot : null;
      setHover((prev) =>
        prev.zoneId === hit.zoneId && prev.slot?.locationId === slot?.locationId ? prev : { zoneId: hit.zoneId, slot }
      );
    };

    const onPointerUp = (event: PointerEvent) => {
      if (longPress) {
        const fired = longPress.fired;
        clearLongPress();
        // 길게 눌러 메뉴를 띄웠으면 이번 손 뗌은 클릭으로 치지 않는다
        if (fired) {
          press = null;
          return;
        }
      }
      if (zoneGrab) {
        const grab = zoneGrab;
        zoneGrab = null;
        const edit = live.current.zoneEdit;
        const visual = core.zones.get(grab.zoneId);
        core.originOutline.visible = false;
        const unchanged = grab.kind === "rotate" ? grab.rotation === grab.startRotation : grab.x === grab.startX && grab.z === grab.startZ;
        if (!grab.moved) {
          edit?.onSelect?.(grab.zoneId);
        } else if (unchanged || grab.reason || (grab.kind === "rotate" && !edit?.onRotate)) {
          // 놓을 수 없는 자리·각도 — 원래대로 돌려놓는다
          if (visual) poseZone(visual, visual.zone.x, visual.zone.z, visual.zone.rotation ?? 0);
          if (grab.reason) edit?.onReject?.(grab.reason);
        } else {
          // 부모가 새 좌표·각도로 레이아웃을 다시 넘기면 그때 그룹 변환이 0 으로 다시 그려진다
          if (grab.kind === "rotate") edit?.onRotate?.(grab.zoneId, grab.rotation);
          else edit?.onMove(grab.zoneId, grab.x, grab.z);
          edit?.onSelect?.(grab.zoneId);
        }
        setZoneDrag(null);
        return;
      }
      if (!press) return;
      const current = live.current;
      const wasDrag = press.dragging;
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (wasDrag && press.slot) {
        const hit = cast(event.clientX, event.clientY);
        const target = hit.slot && hit.slot.locationId !== press.slot.locationId ? hit.slot : null;
        if (target && !(current.dropCheck?.(press.slot, target) ?? null)) current.onDropSlot?.(press.slot, target);
        setDrag(null);
      } else if (moved < 6 && event.target === core.renderer.domElement) {
        const { slot, zoneId } = press;
        if (slot && (current.mode === "work" || slot.zoneId === current.selection.zoneId)) {
          current.onSelectionChange({ zoneId: slot.zoneId, locationId: slot.locationId });
        } else if (zoneId != null) {
          current.onSelectionChange({ zoneId, locationId: null });
          focusZone(zoneId);
        }
      }
      press = null;
    };

    const onPointerLeave = () => setHover({ zoneId: null, slot: null });

    const onContextMenu = (event: MouseEvent) => {
      const handler = live.current.onSlotContextMenu;
      if (!handler) return;
      // 캔버스 위 브라우저 기본 메뉴는 쓸 일이 없다
      event.preventDefault();
      if (live.current.zoneEdit?.enabled) return;
      const dragged = rightDown && Math.hypot(event.clientX - rightDown.x, event.clientY - rightDown.y) > 6;
      rightDown = null;
      if (dragged) return;
      const hit = cast(event.clientX, event.clientY);
      if (!hit.slot) return;
      const rectNow = mount.getBoundingClientRect();
      handler(hit.slot, { x: event.clientX - rectNow.left, y: event.clientY - rectNow.top });
    };

    mount.addEventListener("contextmenu", onContextMenu);
    mount.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    mount.addEventListener("pointerleave", onPointerLeave);

    /* ---- 카메라 포커스 ---- */
    const startTween = (toTarget: THREE.Vector3, toPos: THREE.Vector3, toZoom: number) => {
      const orbit = activeOrbit();
      const camera = activeCamera();
      if (reducedMotion) {
        orbit.target.copy(toTarget);
        if (camera === core.perspective) core.perspective.position.copy(toPos);
        else {
          core.ortho.position.set(toTarget.x, 120, toTarget.z);
          core.ortho.zoom = toZoom;
          core.ortho.updateProjectionMatrix();
        }
        return;
      }
      core.tween = {
        fromPos: core.perspective.position.clone(),
        toPos,
        fromTarget: orbit.target.clone(),
        toTarget,
        fromZoom: core.ortho.zoom,
        toZoom,
        start: performance.now(),
        duration: 650
      };
    };

    const orbitPosition = (target: THREE.Vector3, radius: number, phiRange: [number, number] = [0.62, 1.05]) => {
      const offset = core.perspective.position.clone().sub(core.orbit3d.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.radius = radius;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, phiRange[0], phiRange[1]);
      return target.clone().add(new THREE.Vector3().setFromSpherical(spherical));
    };

    const focusZone = (zoneId: number) => {
      const visual = core.zones.get(zoneId);
      if (!visual) return;
      const { zone } = visual;
      const target = new THREE.Vector3(zone.x, visual.height / 2, zone.z);
      const extent = Math.max(zone.width, zone.depth);
      const zoom = THREE.MathUtils.clamp((Math.max(floorWidth, floorDepth) / extent) * 0.55, 1, 6);
      startTween(target, orbitPosition(target, THREE.MathUtils.clamp(extent * 1.85, 16, 70)), zoom);
    };

    const focusSlot = (locationId: number) => {
      const slot = live.current.slotById.get(locationId);
      const rack = slot ? core.racks.get(slot.rackId) : undefined;
      if (!slot || !rack) return;
      const center = slotCenter(rack, slot.bay, slot.level);
      const target = new THREE.Vector3(center.x, center.y, center.z);
      // 옆 랙에 가리지 않도록 조금 위에서 내려다본다
      startTween(target, orbitPosition(target, 24, [0.55, 0.85]), 5);
    };

    const resetCamera = () => {
      if (live.current.topView) startTween(new THREE.Vector3(0, 0, 0), core.perspective.position.clone(), 1);
      else startTween(DEFAULT_TARGET.clone(), DEFAULT_CAM.clone(), core.ortho.zoom);
    };

    const frontCamera = () => {
      const target = core.orbit3d.target.clone();
      startTween(target, new THREE.Vector3(target.x, target.y + 10, target.z + 62), core.ortho.zoom);
    };

    cameraApi.current = { focusZone, focusSlot, resetCamera, frontCamera };

    /* ---- 리사이즈 ---- */
    const observer = new ResizeObserver(() => {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      const aspect = w / h;
      core.perspective.aspect = aspect;
      core.perspective.updateProjectionMatrix();
      const halfH = Math.max(floorDepth / 2 + 6, (floorWidth / 2 + 6) / aspect);
      core.ortho.left = -halfH * aspect;
      core.ortho.right = halfH * aspect;
      core.ortho.top = halfH;
      core.ortho.bottom = -halfH;
      core.ortho.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    observer.observe(mount);

    return () => {
      cameraMemo.current = { position: perspective.position.clone(), target: orbit3d.target.clone() };
      cancelAnimationFrame(core.frame);
      mount.removeEventListener("wheel", onWheelCapture, { capture: true });
      mount.removeEventListener("contextmenu", onContextMenu);
      clearLongPress();
      mount.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      mount.removeEventListener("pointerleave", onPointerLeave);
      observer.disconnect();
      orbit3d.dispose();
      orbit2d.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      cameraApi.current = null;
      coreRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, floorWidth, floorDepth]);

  /* ----------------------------------------------------------------
     2) 구역 · 랙 슬롯 · 시설물 · 장비 — 층/데이터가 바뀌면 다시 만든다
  ---------------------------------------------------------------- */
  useEffect(() => {
    const core = coreRef.current;
    if (!core || !ready) return;
    const pal = palettes[theme];

    core.content.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    core.content.clear();
    core.fleet.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose?.();
    });
    core.fleet.clear();
    core.zones.clear();
    core.slotMeshes = [];
    core.hitboxes = [];
    core.movers = [];
    core.racks = new Map(floorRacks.map((rack) => [rack.id, rack]));

    const dummy = new THREE.Object3D();
    const slotKey = (rackId: number, bay: number, level: number) => `${rackId}:${bay}:${level}`;
    const occupied = new Set(floorSlots.map((slot) => slotKey(slot.rackId, slot.bay, slot.level)));

    // 적치 파레트 — 인스턴스 색으로 발광색까지 칠하도록 셰이더를 한 줄 고친다
    const tintEmissive = (material: THREE.MeshStandardMaterial) => {
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "vec3 totalEmissiveRadiance = emissive;",
          "vec3 totalEmissiveRadiance = emissive;\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif"
        );
      };
      material.customProgramCacheKey = () => "wh3d-tinted-emissive";
    };

    for (const zone of floorZones) {
      const height = zoneHeight(zone, floorRacks);
      const bucketColor = new THREE.Color(bucketOf(zone.util).color);
      // 구역 단위 그룹 — 배치 편집에서 그룹만 옮기고 돌리면 랙·파레트·판정 박스가 함께 움직인다
      const group = new THREE.Group();
      core.content.add(group);
      // 바닥판·테두리·판정 박스는 구역 방향으로 돌린다 (랙·슬롯 좌표에는 회전이 이미 들어 있다)
      const zoneYaw = rackYaw(zone.rotation ?? 0);

      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(zone.width, BASE_H, zone.depth),
        new THREE.MeshStandardMaterial({ color: pal.platform, roughness: 0.85, metalness: 0.1 })
      );
      platform.position.set(zone.x, BASE_H / 2, zone.z);
      platform.rotation.y = zoneYaw;
      platform.receiveShadow = true;
      group.add(platform);

      // 구역 전체 부피를 덮는 투명 판정 박스 — 랙 어디를 짚어도 구역이 잡힌다
      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(zone.width, height, zone.depth),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hitbox.position.set(zone.x, height / 2, zone.z);
      hitbox.rotation.y = zoneYaw;
      hitbox.userData = { zoneId: zone.id };
      group.add(hitbox);
      core.hitboxes.push(hitbox);

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(zone.width, 0.04, zone.depth)),
        new THREE.LineBasicMaterial({ color: bucketColor, transparent: true, opacity: 0.85 })
      );
      edge.position.set(zone.x, BASE_H + 0.02, zone.z);
      edge.rotation.y = zoneYaw;
      group.add(edge);

      const zoneSlots = floorSlots.filter((slot) => slot.zoneId === zone.id);
      const filledSlots = zoneSlots.filter((slot) => slot.pallets > 0);
      const emptySlots = zoneSlots.filter((slot) => slot.pallets <= 0);
      const zoneRacks = floorRacks.filter((rack) => rack.zoneId === zone.id);

      const unit = new THREE.BoxGeometry(1, 1, 1);
      const filledMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: theme === "dark" ? 0.32 : 0.08,
        roughness: 0.5,
        metalness: 0.12
      });
      tintEmissive(filledMat);
      const emptyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: theme === "dark" ? 0.3 : 0.45,
        roughness: 0.9,
        depthWrite: false
      });
      const filled = new THREE.InstancedMesh(unit, filledMat, Math.max(filledSlots.length, 1));
      const empty = new THREE.InstancedMesh(unit.clone(), emptyMat, Math.max(emptySlots.length, 1));
      filled.count = filledSlots.length;
      empty.count = emptySlots.length;
      filled.castShadow = true;
      filled.receiveShadow = true;
      filled.userData = { slots: filledSlots };
      empty.userData = { slots: emptySlots };

      const place = (mesh: THREE.InstancedMesh, list: LayoutSlot[], fillRatio: (slot: LayoutSlot) => number) => {
        list.forEach((slot, idx) => {
          const rack = core.racks.get(slot.rackId);
          if (!rack) return;
          const center = slotCenter(rack, slot.bay, slot.level);
          const fullH = rack.levelHeight - 0.35;
          const ratio = fillRatio(slot);
          const h = fullH * ratio;
          dummy.position.set(center.x, center.y - fullH / 2 + h / 2, center.z);
          dummy.rotation.set(0, rackYaw(rack.rotation), 0);
          dummy.scale.set(rack.bayWidth - 0.25, h, rack.depth - 0.2);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          mesh.setColorAt(idx, new THREE.Color(pal.slot));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      };
      // 적치량이 파레트 자리보다 적으면 상자 높이로 보여준다
      place(filled, filledSlots, (slot) => THREE.MathUtils.clamp(slot.pallets / slot.capacity, 0.18, 1));
      place(empty, emptySlots, () => 1);
      group.add(filled);
      group.add(empty);
      core.slotMeshes.push(filled, empty);

      // 로케이션이 배정되지 않은 랙 칸 — 흐린 틀만 그린다
      const voids: Array<{ rack: LayoutRack; bay: number; level: number }> = [];
      zoneRacks.forEach((rack) => {
        for (let bay = 1; bay <= rack.bays; bay += 1) {
          for (let level = 1; level <= rack.levels; level += 1) {
            if (!occupied.has(slotKey(rack.id, bay, level))) voids.push({ rack, bay, level });
          }
        }
      });
      if (voids.length) {
        const voidMesh = new THREE.InstancedMesh(
          unit.clone(),
          new THREE.MeshBasicMaterial({ color: pal.voidSlot, transparent: true, opacity: theme === "dark" ? 0.1 : 0.16, wireframe: true }),
          voids.length
        );
        voids.forEach(({ rack, bay, level }, idx) => {
          const center = slotCenter(rack, bay, level);
          dummy.position.set(center.x, center.y, center.z);
          dummy.rotation.set(0, rackYaw(rack.rotation), 0);
          dummy.scale.set(rack.bayWidth - 0.25, rack.levelHeight - 0.35, rack.depth - 0.2);
          dummy.updateMatrix();
          voidMesh.setMatrixAt(idx, dummy.matrix);
        });
        group.add(voidMesh);
      }

      core.zones.set(zone.id, { zone, height, group, center: { x: zone.x, z: zone.z }, platform, edge, hitbox, filled, empty, filledSlots, emptySlots });
    }

    /* ---- 시설물 ---- */
    for (const object of floorObjects) {
      const isDock = object.kind === "DOCK_IN" || object.kind === "DOCK_OUT";
      const color =
        object.kind === "DOCK_IN" ? 0x22d3ee
        : object.kind === "DOCK_OUT" ? 0xf59e0b
        : object.kind === "PILLAR" ? pal.pillar
        : object.kind === "WALL" ? pal.wall
        : pal.aisle;
      const height = isDock ? 0.3 : object.kind === "PILLAR" ? 12 : object.kind === "WALL" ? 4 : 0.04;
      const quarter = object.rotation === 90 || object.rotation === 270;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(quarter ? object.depth : object.width, height, quarter ? object.width : object.depth),
        new THREE.MeshStandardMaterial({
          color,
          emissive: isDock ? color : 0x000000,
          emissiveIntensity: isDock ? (theme === "dark" ? 0.45 : 0.1) : 0,
          roughness: 0.6,
          transparent: object.kind === "AISLE",
          opacity: object.kind === "AISLE" ? 0.35 : 1
        })
      );
      mesh.position.set(object.x, height / 2 + (object.kind === "AISLE" ? 0.03 : 0), object.z);
      mesh.castShadow = object.kind === "PILLAR" || object.kind === "WALL";
      core.content.add(mesh);
    }

    /* ---- 지게차 / AGV ---- */
    for (const vehicle of floorVehicles) {
      const group = new THREE.Group();
      const bodyColor = vehicle.kind === "FORKLIFT" ? 0xfacc15 : 0x22d3ee;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 1.0, 2.6),
        new THREE.MeshStandardMaterial({
          color: bodyColor,
          emissive: bodyColor,
          emissiveIntensity: theme === "dark" ? 0.28 : 0.06,
          roughness: 0.45,
          metalness: 0.2
        })
      );
      body.castShadow = true;
      body.position.y = 0.6;
      group.add(body);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      beacon.position.set(0, 1.35, 0);
      group.add(beacon);

      const points = vehicle.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
      const lengths = points.map((point, idx) => point.distanceTo(points[(idx + 1) % points.length]));
      const total = lengths.reduce((sum, len) => sum + len, 0);
      group.position.copy(points[0]);
      core.fleet.add(group);
      core.movers.push({ group, points, lengths, total, speed: vehicle.speed, offset: total * Math.random() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, theme, floorZones, floorRacks, floorSlots, floorObjects, floorVehicles]);

  /* ----------------------------------------------------------------
     3) 칠하기 — 색 기준 · 선택 · 검색 강조 · 끌기 상태 (지오메트리는 그대로)
  ---------------------------------------------------------------- */
  const dropValidity = useMemo(() => {
    if (!drag || !dropCheck) return null;
    const map = new Map<number, boolean>();
    floorSlots.forEach((slot) => {
      if (slot.locationId !== drag.from.locationId) map.set(slot.locationId, dropCheck(drag.from, slot) === null);
    });
    return map;
    // 끌기 시작한 슬롯이 바뀔 때만 다시 계산한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.from.locationId, floorSlots, dropCheck]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core || !ready) return;
    const pal = palettes[theme];
    const color = new THREE.Color();
    const dim = new THREE.Color(pal.dim);
    const ok = new THREE.Color(DROP_OK);

    core.zones.forEach((visual, zoneId) => {
      const { zone } = visual;
      const active = zoneId === selection.zoneId;
      const hovered = zoneId === hover.zoneId;

      const edgeMat = visual.edge.material as THREE.LineBasicMaterial;
      const dragging = zoneDrag?.zoneId === zoneId;
      // 끄는 중인 구역 테두리: 놓을 수 있으면 초록, 겹치거나 벗어나면 빨강
      edgeMat.color.set(
        dragging ? (zoneDrag?.reason ? DROP_BAD : DROP_OK)
        : zoneEdit?.enabled && active ? pal.select
        : colorMode === "util" ? bucketOf(zone.util).color : pal.edgeNeutral
      );
      edgeMat.opacity = dragging || active ? 1 : hovered ? 0.95 : 0.6;
      visual.edge.scale.setScalar(active ? 1.015 : 1);

      const filledMat = visual.filled.material as THREE.MeshStandardMaterial;
      filledMat.emissiveIntensity =
        theme === "dark" ? (active ? 0.62 : hovered ? 0.48 : 0.32) : active ? 0.2 : hovered ? 0.14 : 0.08;

      visual.filledSlots.forEach((slot, idx) => {
        color.set(slot.active ? slotColorOf(slot, zone.util, colorMode) : INACTIVE_COLOR);
        if (highlightSet && !highlightSet.has(slot.locationId)) color.lerp(dim, 0.78);
        if (dropValidity && dropValidity.get(slot.locationId) === false) color.lerp(dim, 0.7);
        visual.filled.setColorAt(idx, color);
      });
      if (visual.filled.instanceColor) visual.filled.instanceColor.needsUpdate = true;

      const emptyMat = visual.empty.material as THREE.MeshStandardMaterial;
      emptyMat.opacity = dropValidity ? (theme === "dark" ? 0.42 : 0.55) : theme === "dark" ? 0.3 : 0.45;
      visual.emptySlots.forEach((slot, idx) => {
        if (!slot.active) color.set(INACTIVE_COLOR).lerp(new THREE.Color(pal.slot), 0.5);
        else if (colorMode === "util") color.set(pal.slot);
        else color.set(slotColorOf(slot, zone.util, colorMode)).lerp(new THREE.Color(pal.slot), 0.45);
        if (highlightSet) color.lerp(dim, highlightSet.has(slot.locationId) ? 0 : 0.6);
        if (highlightSet?.has(slot.locationId)) color.set(0xffffff);
        if (dropValidity) {
          if (dropValidity.get(slot.locationId)) color.lerp(ok, 0.75);
          else color.lerp(dim, 0.6);
        }
        visual.empty.setColorAt(idx, color);
      });
      if (visual.empty.instanceColor) visual.empty.instanceColor.needsUpdate = true;
    });
  }, [ready, theme, colorMode, selection.zoneId, hover.zoneId, highlightSet, dropValidity, floorZones, floorSlots, zoneDrag, zoneEdit?.enabled]);

  // 외곽선(선택 · 호버 · 놓을 곳) — 끌기 중에는 이것만 매번 갱신한다
  useEffect(() => {
    const core = coreRef.current;
    if (!core || !ready) return;
    const pal = palettes[theme];

    const fit = (line: THREE.LineSegments, slot: LayoutSlot | null | undefined, lineColor?: number) => {
      const rack = slot ? core.racks.get(slot.rackId) : undefined;
      if (!slot || !rack) {
        line.visible = false;
        return;
      }
      const center = slotCenter(rack, slot.bay, slot.level);
      line.position.set(center.x, center.y, center.z);
      line.rotation.set(0, rackYaw(rack.rotation), 0);
      line.scale.set(rack.bayWidth - 0.08, rack.levelHeight - 0.18, rack.depth - 0.04);
      if (lineColor != null) (line.material as THREE.LineBasicMaterial).color.set(lineColor);
      line.visible = true;
    };

    const selectedSlot = selection.locationId != null ? slotById.get(selection.locationId) : null;
    fit(core.selectOutline, selectedSlot && floorZoneIds.has(selectedSlot.zoneId) ? selectedSlot : null, pal.select);
    fit(core.hoverOutline, hover.slot && hover.slot.locationId !== selection.locationId ? hover.slot : null, pal.envelope);
    fit(core.dropOutline, drag?.target ?? null, drag?.reason ? DROP_BAD : DROP_OK);
  }, [ready, theme, selection.locationId, hover.slot, drag?.target, drag?.reason, slotById, floorZoneIds, floorSlots]);

  /* ----------------------------------------------------------------
     4) 부모의 카메라 이동 요청 · 2D 전환 · 자동 회전
  ---------------------------------------------------------------- */
  useEffect(() => {
    if (!ready || !focus) return;
    const handle = cameraApi.current;
    if (!handle) return;
    if (focus.locationId != null) handle.focusSlot(focus.locationId);
    else if (focus.zoneId != null) handle.focusZone(focus.zoneId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, ready]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core || !ready) return;
    core.orbit3d.enabled = !topView;
    core.orbit2d.enabled = topView;
    // 위에서 내려다보면 그림자가 검은 덩어리로만 보여 도면 읽기를 방해한다
    core.sun.castShadow = !topView;
    core.tween = null;
    if (topView) {
      core.orbit2d.target.set(core.orbit3d.target.x, 0, core.orbit3d.target.z);
      core.ortho.position.set(core.orbit2d.target.x, 120, core.orbit2d.target.z);
      core.ortho.updateProjectionMatrix();
    }
  }, [topView, ready]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.orbit3d.autoRotate = autoRotate && !reducedMotion && !topView;
    core.orbit3d.autoRotateSpeed = 0.55;
  }, [autoRotate, ready, reducedMotion, topView]);

  const dolly = (factor: number) => {
    const core = coreRef.current;
    if (!core) return;
    if (topView) {
      core.ortho.zoom = THREE.MathUtils.clamp(core.ortho.zoom / factor, core.orbit2d.minZoom, core.orbit2d.maxZoom);
      core.ortho.updateProjectionMatrix();
      return;
    }
    const { perspective, orbit3d } = core;
    const offset = perspective.position.clone().sub(orbit3d.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, orbit3d.minDistance, orbit3d.maxDistance);
    perspective.position.copy(orbit3d.target).add(offset.setLength(distance));
    orbit3d.update();
  };

  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.requestFullscreen?.();
  };

  const floors = layout.floors.map((item) => item.code);
  const legend = legendFor(colorMode);
  const editing = Boolean(zoneEdit?.enabled);
  const labelSlot = drag || editing ? null : hover.slot ?? (selection.locationId != null ? slotById.get(selection.locationId) ?? null : null);
  const noLayout = layout.floors.length === 0;
  const draggedZone = zoneDrag ? floorZones.find((zone) => zone.id === zoneDrag.zoneId) ?? null : null;

  return (
    <div className={`wh3d${mode === "work" ? " is-work" : ""}${editing ? " is-edit" : ""}`} ref={stageRef}>
      <div
        className={`wh3d-canvas${hover.slot || hover.zoneId != null ? " is-pointing" : ""}${drag ? " is-dragging" : ""}${zoneDrag ? " is-zone-dragging" : ""}${topView ? " is-top" : ""}`}
        ref={mountRef}
      />

      {/* 구역 끌기 안내 — 좌표(또는 각도)와 놓을 수 있는지 */}
      {zoneDrag && draggedZone ? (
        <div className={`wh3d-zone-tag${zoneDrag.reason ? " is-bad" : " is-ok"}`} role="status">
          <b>{draggedZone.name}</b>
          {zoneDrag.kind === "rotate" ? (
            <span>
              회전 {zoneDrag.rotation}°
              {(() => {
                // 원래 각도에서 가까운 쪽으로 얼마나 돌렸는지 (−180 ~ +180)
                const diff = ((zoneDrag.rotation - (draggedZone.rotation ?? 0) + 540) % 360) - 180;
                return diff ? ` (${diff > 0 ? "+" : ""}${Math.round(diff * 10) / 10}°)` : "";
              })()}
            </span>
          ) : (
            <span>
              중심 X {zoneDrag.x} · Z {zoneDrag.z} m
              {zoneDrag.x !== draggedZone.x || zoneDrag.z !== draggedZone.z
                ? ` (${zoneDrag.x - draggedZone.x >= 0 ? "+" : ""}${Math.round((zoneDrag.x - draggedZone.x) * 10) / 10}, ${zoneDrag.z - draggedZone.z >= 0 ? "+" : ""}${Math.round((zoneDrag.z - draggedZone.z) * 10) / 10})`
                : ""}
            </span>
          )}
          <em>{zoneDrag.reason ?? (zoneDrag.kind === "rotate" ? "이 각도로 둘 수 있습니다" : "여기에 놓을 수 있습니다")}</em>
        </div>
      ) : null}

      {/* 구역 라벨 */}
      <div className="wh3d-labels" aria-hidden="true">
        {floorZones.map((zone) => {
          const bucket = bucketOf(zone.util);
          return (
            <div
              key={zone.id}
              className={`wh3d-label tone-${colorMode === "util" ? bucket.key : "neutral"}${selection.zoneId === zone.id ? " is-active" : ""}`}
              ref={(el) => {
                if (el) labelRefs.current.set(zone.id, el);
                else labelRefs.current.delete(zone.id);
              }}
            >
              <span className="wh3d-label-name">{zone.name}</span>
              <span className="wh3d-label-util">{zone.util}%</span>
              <span className="wh3d-label-code">{zone.codeRange}</span>
            </div>
          );
        })}
        <div
          className={`wh3d-slot-label${labelSlot ? "" : " is-hidden"}`}
          ref={slotLabelRef}
          data-location-id={labelSlot?.locationId ?? ""}
        >
          {labelSlot ? (
            <>
              <b>{labelSlot.code}</b>
              <span>
                {LOCATION_TYPE_LABEL[labelSlot.locationType]} · {labelSlot.pallets > 0 ? `${labelSlot.pallets} / ${labelSlot.capacity} 파레트` : "빈 슬롯"}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* 끌기 안내 */}
      {drag ? (
        <div className={`wh3d-drag${drag.reason ? " is-bad" : drag.target ? " is-ok" : ""}`} style={{ left: drag.x, top: drag.y }}>
          <b>{drag.from.code}</b>
          <Icon name="arrowR" size={13} />
          <b>{drag.target?.code ?? "놓을 곳"}</b>
          {drag.reason ? <span>{drag.reason}</span> : null}
        </div>
      ) : null}

      {overlay ? <div className="wh3d-overlay">{overlay}</div> : null}

      {popover}

      {/* 층 선택 */}
      {floors.length ? (
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
      ) : null}

      {/* 범례 + 색 기준 */}
      <div className="wh3d-legend">
        {onColorModeChange ? (
          <select
            className="wh3d-mode"
            value={colorMode}
            onChange={(event) => onColorModeChange(event.target.value as ColorMode)}
            aria-label="색 기준"
          >
            {(Object.keys(COLOR_MODE_LABEL) as ColorMode[]).map((key) => (
              <option key={key} value={key}>
                {COLOR_MODE_LABEL[key]}
              </option>
            ))}
          </select>
        ) : null}
        {legend.map((entry) => (
          <span key={entry.key}>
            <i style={{ background: entry.token }} />
            {entry.label}
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
        <span className="wh3d-tools-sep" />
        <button
          type="button"
          className={`nx-iconbtn wh3d-text-btn${topView ? " is-on" : ""}`}
          onClick={() => setTopView((value) => !value)}
          title={topView ? "3D 보기" : "2D 탑뷰"}
          aria-pressed={topView}
        >
          {topView ? "3D" : "2D"}
        </button>
        {!topView ? (
          <button type="button" className="nx-iconbtn" onClick={() => cameraApi.current?.frontCamera()} title="정면 보기" aria-label="정면 보기">
            <Icon name="eye" size={15} />
          </button>
        ) : null}
        <button type="button" className="nx-iconbtn" onClick={() => cameraApi.current?.resetCamera()} title="기본 시점" aria-label="기본 시점">
          <Icon name="crosshair" size={15} />
        </button>
        {!topView ? (
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
        ) : null}
        <button type="button" className="nx-iconbtn" onClick={toggleFullscreen} title="전체 화면" aria-label="전체 화면">
          <Icon name="maximize" size={15} />
        </button>
        {toolbarExtra ? (
          <>
            <span className="wh3d-tools-sep" />
            {toolbarExtra}
          </>
        ) : null}
      </div>

      <div className="wh3d-status">
        <span className="nx-live">LIVE</span>
        {syncedAt ? <span className="wh3d-sync">마지막 동기화 {syncedAt}</span> : null}
      </div>

      <div className="wh3d-hint">
        {editing
          ? "구역 끌기 이동 · Ctrl+끌기 구역 회전 · Q/E 45° · 방향키 0.5m · 빈 바닥 끌기 시점 · Ctrl+휠 확대"
          : mode === "work"
          ? "재고가 있는 슬롯을 끌어 다른 슬롯에 놓으면 이동 · 빈 곳을 끌면 회전"
          : topView
            ? "드래그 이동 · Ctrl+휠 확대 · 구역 클릭 후 슬롯 클릭"
            : selection.zoneId != null
              ? "구역 안의 슬롯을 클릭하면 로케이션 상세 · Ctrl+휠 확대"
              : "드래그 회전 · Ctrl+휠 확대 · 구역 클릭 시 확대"}
      </div>

      {noLayout ? (
        <div className="wh3d-empty">
          <Icon name="cube3d" size={28} />
          <b>{layout.warehouse.name}에는 등록된 레이아웃이 없습니다</b>
          <span>로케이션 관리 › 배치 탭에서 층과 구역을 만들면 이곳에 3D로 나타납니다.</span>
        </div>
      ) : null}
    </div>
  );
};

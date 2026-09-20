import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPut } from "../../../services/http";
import { useIsPhone } from "../../../shared/useIsPhone";
import { useAuthStore } from "../../../app/store/authStore";
import { useUiStore } from "../../../app/store/uiStore";
import { Icon } from "../../../components/ui/Icon";
import { Modal } from "../../../components/ui/Modal";
import { polygonArea, polygonIsSimple, stepRotation, type Pt } from "../../../components/warehouse3d/geometry";
import { hasErrors, validateDraft, type LayoutDraft, type RuleIssue } from "../../../components/warehouse3d/layoutRules";
import { ZONE_PURPOSES, purposeMeta, type LayoutSummaryRow, type MapSelection, type WarehouseLayout, type ZonePurpose } from "../../../components/warehouse3d/types";
import { PlanCanvas } from "./PlanCanvas";
import { Inspector, TrayPanel, type Notify } from "./EditorPanels";
import {
  OBJECT_DEFAULTS,
  addFloor,
  addObject,
  addPolygonZone,
  addRack,
  addZone,
  buildPreviewLayout,
  deleteSelection,
  moveSelection,
  patchZone,
  positionOf,
  rotateRack,
  summarizeChanges,
  zoneAt,
  type DraftResponse,
  type EditorSelection,
  type Tool
} from "./draftOps";
import "./layoutEditor.css";

const Warehouse3D = lazy(() =>
  import("../../../components/warehouse3d/Warehouse3D").then((m) => ({ default: m.Warehouse3D }))
);

/* ============================================================
   배치 편집기 (설계 모드)
   · 편집은 초안에만 쌓이고 [게시] 해야 운영 3D 에 반영된다
   · 초안은 자동 저장 — 탭을 옮겨도 이어서 편집할 수 있다
   · 선반(랙) 위치만 바꾼다. 재고 이동은 재고 이동 › 3D 탭의 몫
   ============================================================ */

const EDIT_ROLES = ["admin", "logistics"];

type History = { past: LayoutDraft[]; present: LayoutDraft; future: LayoutDraft[] };

const TOOLS: Array<{ tool: Tool; label: string; key: string; icon: string; title?: string }> = [
  { tool: "select", label: "선택", key: "V", icon: "move" },
  { tool: "zone", label: "장소", key: "Z", icon: "grid", title: "사각형 장소 — 클릭한 자리에 놓고 모서리로 크기 조절" },
  { tool: "polygon", label: "자유형", key: "F", icon: "shape", title: "자유형 장소 — 꼭짓점을 찍어 모양대로 그리기" },
  { tool: "rack", label: "랙", key: "K", icon: "layers" },
  { tool: "DOCK_IN", label: "입고 도크", key: "I", icon: "inbox" },
  { tool: "DOCK_OUT", label: "출고 도크", key: "O", icon: "truck" },
  { tool: "PILLAR", label: "기둥", key: "P", icon: "box" },
  { tool: "WALL", label: "벽", key: "W", icon: "menu" },
  { tool: "AISLE", label: "통로", key: "A", icon: "arrowR" }
];

type Props = {
  warehouseId: number;
  onWarehouseChange: (id: number) => void;
  summary: LayoutSummaryRow[];
  /** 게시 후 다른 탭(목록·CAPA)이 다시 읽도록 */
  onPublished?: () => void;
};

export const LayoutEditor = ({ warehouseId, onWarehouseChange, summary, onPublished }: Props) => {
  const theme = useUiStore((state) => state.theme);
  const role = useUiStore((state) => state.currentRole);
  const operator = useAuthStore((state) => state.user?.id ?? "system");
  const readOnly = !EDIT_ROLES.includes(role);

  const [meta, setMeta] = useState<Omit<DraftResponse, "draft"> | null>(null);
  const [published, setPublished] = useState<WarehouseLayout | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [floor, setFloor] = useState("1F");
  const [tool, setToolState] = useState<Tool>("select");
  /** 장소 · 자유형 도구로 새로 만들 장소 유형 */
  const [newPurpose, setNewPurpose] = useState<ZonePurpose>("RESERVE");
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [preview, setPreview] = useState(true);
  const [fitKey, setFitKey] = useState(0);
  const [zoomRequest, setZoomRequest] = useState<{ factor: number; nonce: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<"publish" | "discard" | null>(null);
  const phone = useIsPhone();
  const [busy, setBusy] = useState(false);
  const [previewSelection, setPreviewSelection] = useState<MapSelection>({ zoneId: null, locationId: null });

  const anchor = useRef<LayoutDraft | null>(null);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef<LayoutDraft | null>(null);

  const draft = history?.present ?? null;
  latest.current = draft;

  const notify: Notify = useCallback((tone, text) => setToast({ tone, text }), []);

  // 자유형을 그리기 시작하면 선택을 푼다 — 그리다가 Backspace 로 선택한 장소를 지우지 않게
  const setTool = useCallback((next: Tool) => {
    setToolState(next);
    if (next === "polygon") setSelection(null);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* ---------- 불러오기 ---------- */
  const load = useCallback(async () => {
    // 다른 창고로 바꾸기 직전 저장 대기 중인 편집이 있으면 먼저 보낸다
    if (saveTimer.current && latest.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void apiPut("/warehouse/layout/draft", { draft: latest.current, operator });
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [res, layout] = await Promise.all([
        apiGet<DraftResponse>(`/warehouse/layout/draft?warehouseId=${warehouseId}`),
        apiGet<WarehouseLayout>(`/warehouse/layout?warehouseId=${warehouseId}`)
      ]);
      const { draft: loaded, ...rest } = res;
      setMeta(rest);
      setPublished(layout);
      setHistory({ past: [], present: loaded, future: [] });
      setSavedAt(rest.savedAt);
      setSaveState(rest.hasSavedDraft ? "saved" : "idle");
      setSelection(null);
      setFloor((prev) => (loaded.floors.some((item) => item.code === prev) ? prev : loaded.floors[0]?.code ?? "1F"));
      setFitKey((key) => key + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "초안을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, [warehouseId, operator]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- 실행 취소 기록 ---------- */
  const commit = useCallback(
    (next: LayoutDraft) => {
      if (readOnly) return;
      setHistory((prev) => (prev ? { past: [...prev.past, prev.present].slice(-100), present: next, future: [] } : prev));
      setRevision((value) => value + 1);
    },
    [readOnly]
  );

  const undo = useCallback(() => {
    setHistory((prev) => (prev && prev.past.length ? { past: prev.past.slice(0, -1), present: prev.past[prev.past.length - 1], future: [prev.present, ...prev.future] } : prev));
    setRevision((value) => value + 1);
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => (prev && prev.future.length ? { past: [...prev.past, prev.present], present: prev.future[0], future: prev.future.slice(1) } : prev));
    setRevision((value) => value + 1);
  }, []);

  const onDragStart = useCallback(() => {
    anchor.current = latest.current;
    setDragging(true);
  }, []);
  const onDrag = useCallback((next: LayoutDraft) => {
    setHistory((prev) => (prev ? { ...prev, present: next } : prev));
  }, []);
  const onDragEnd = useCallback(() => {
    const base = anchor.current;
    anchor.current = null;
    setDragging(false);
    setHistory((prev) => (prev && base && base !== prev.present ? { past: [...prev.past, base].slice(-100), present: prev.present, future: [] } : prev));
    setRevision((value) => value + 1);
  }, []);

  /* ---------- 자동 저장 ---------- */
  const saveNow = useCallback(async () => {
    const current = latest.current;
    if (!current || readOnly) return;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setSaveState("saving");
    try {
      const res = await apiPut<{ savedAt: string }>("/warehouse/layout/draft", { draft: current, operator });
      setSavedAt(res.savedAt);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [operator, readOnly]);

  useEffect(() => {
    if (revision === 0 || readOnly) return;
    setSaveState("pending");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveNow(), 1500);
  }, [revision, readOnly, saveNow]);

  // 화면을 떠날 때 저장 대기 중이면 바로 보낸다
  useEffect(
    () => () => {
      if (saveTimer.current && latest.current) {
        window.clearTimeout(saveTimer.current);
        void apiPut("/warehouse/layout/draft", { draft: latest.current, operator });
      }
    },
    [operator]
  );

  useEffect(() => {
    if (saveState !== "pending" && saveState !== "saving") return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [saveState]);

  /* ---------- 검증 · 미리보기 ---------- */
  const locations = meta?.locations ?? [];
  const infos = useMemo(
    () => [
      ...locations.map((loc) => ({
        id: loc.id,
        code: loc.code,
        zoneId: loc.zoneId,
        hasStock: loc.hasStock,
        pallets: loc.pallets,
        loadKg: loc.loadKg,
        maxWeightKg: loc.maxWeightKg
      })),
      ...(draft?.newLocations ?? []).map((loc) => ({ id: loc.id, code: loc.code, zoneId: loc.zoneId, hasStock: false }))
    ],
    [locations, draft?.newLocations]
  );
  // 끄는 중에는 매 프레임 검증하지 않는다
  const [issues, setIssues] = useState<RuleIssue[]>([]);
  useEffect(() => {
    if (!draft || dragging) return;
    setIssues(validateDraft(draft, infos));
  }, [draft, infos, dragging]);

  const errorKeys = useMemo(
    () => new Set(issues.filter((issue) => issue.level === "error" && issue.target).map((issue) => `${issue.target!.kind}:${issue.target!.id}`)),
    [issues]
  );

  const [previewDraft, setPreviewDraft] = useState<LayoutDraft | null>(null);
  useEffect(() => {
    if (!dragging) setPreviewDraft(draft);
  }, [draft, dragging]);

  const previewLayout = useMemo(
    () => (previewDraft && published ? buildPreviewLayout(previewDraft, published.warehouse, locations, published) : null),
    [previewDraft, published, locations]
  );

  const changes = useMemo(() => (meta && draft ? summarizeChanges(meta.publishedDraft, draft) : []), [meta, draft]);

  /* ---------- 편집 동작 ---------- */
  const create = (kind: Tool, x: number, z: number) => {
    if (!draft || readOnly) return;
    if (!draft.floors.length) {
      notify("info", "먼저 층을 만드세요");
      return;
    }
    if (kind === "zone") {
      const result = addZone(draft, floor, x, z, newPurpose);
      commit(result.draft);
      setSelection({ kind: "zone", id: result.id });
      notify("info", `${purposeMeta(newPurpose).label} 추가 — 모서리로 크기를, 변 가운데 + 를 끌면 모양을 바꿉니다`);
    } else if (kind === "rack") {
      const zone = zoneAt(draft, floor, x, z);
      if (!zone) {
        notify("danger", "랙은 구역 안을 클릭해서 놓습니다");
        return;
      }
      if (!purposeMeta(zone.purpose).racks) {
        notify("danger", `${zone.name} 은(는) ${purposeMeta(zone.purpose).label}이라 랙을 둘 수 없습니다 — 보관 구역 안을 클릭하세요`);
        return;
      }
      const result = addRack(draft, zone.id, x, z);
      commit(result.draft);
      if (result.id != null) setSelection({ kind: "rack", id: result.id });
    } else if (kind !== "select" && kind !== "polygon") {
      const result = addObject(draft, floor, kind, x, z);
      commit(result.draft);
      setSelection({ kind: "object", id: result.id });
      notify("info", `${OBJECT_DEFAULTS[kind].name} 추가 — 모서리 핸들로 크기를 맞추세요`);
    }
    setTool("select");
  };

  /** 자유형 도구로 다 그린 장소 — 꼬인 선 · 너무 작은 면적은 만들지 않는다 */
  const createPolygon = (points: Pt[]) => {
    if (!draft || readOnly) return;
    if (!polygonIsSimple(points)) {
      notify("danger", "선이 서로 꼬였습니다 — 다시 그려 주세요");
      return;
    }
    if (polygonArea(points) < 1) {
      notify("danger", "장소가 너무 작습니다 (1 m² 이상)");
      return;
    }
    const result = addPolygonZone(draft, floor, points, newPurpose);
    commit(result.draft);
    setSelection({ kind: "zone", id: result.id });
    setTool("select");
    notify("success", `${purposeMeta(newPurpose).label} 자유형 추가 (꼭짓점 ${points.length}개) — 꼭짓점·변을 끌어 다듬으세요`);
  };

  const nudge = (dx: number, dz: number) => {
    if (!draft || !selection) return;
    const pos = positionOf(draft, selection);
    if (pos) commit(moveSelection(draft, selection, Math.round((pos.x + dx) * 10) / 10, Math.round((pos.z + dz) * 10) / 10));
  };

  const onIssueClick = (issue: RuleIssue) => {
    const target = issue.target;
    if (!target || !draft) return;
    if (target.kind === "floor") {
      setFloor(String(target.id));
      setSelection(null);
      return;
    }
    const id = Number(target.id);
    const floorOf =
      target.kind === "zone" ? draft.zones.find((zone) => zone.id === id)?.floor
      : target.kind === "rack" ? draft.zones.find((zone) => zone.id === draft.racks.find((rack) => rack.id === id)?.zoneId)?.floor
      : draft.objects.find((object) => object.id === id)?.floor;
    if (floorOf) setFloor(floorOf);
    setSelection({ kind: target.kind, id });
  };

  /* ---------- 단축키 ---------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (document.querySelector(".ds-overlay")) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (readOnly) return;
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        if (!readOnly) redo();
        return;
      }
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
        return;
      }
      if (mod) return;
      if (event.key === "Escape") {
        setSelection(null);
        setTool("select");
        return;
      }
      if (readOnly || !draft) return;
      // 자유형을 그리는 중이면 Enter · Backspace 는 캔버스가 쓴다
      if (tool === "polygon" && (event.key === "Enter" || event.key === "Backspace")) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selection) {
        event.preventDefault();
        commit(deleteSelection(draft, selection));
        setSelection(null);
        return;
      }
      if (event.key.toLowerCase() === "r" && selection?.kind === "rack") {
        commit(rotateRack(draft, selection.id));
        return;
      }
      // 구역 45° 돌리기 — 한글 입력 상태여도 같은 자리 키로 동작하게 event.code 로 본다 (대시보드 3D 편집과 같은 키)
      if ((event.code === "KeyQ" || event.code === "KeyE") && selection?.kind === "zone" && !event.altKey) {
        const zone = draft.zones.find((item) => item.id === selection.id);
        if (zone) commit(patchZone(draft, zone.id, { rotation: stepRotation(zone.rotation ?? 0, event.code === "KeyE" ? 1 : -1) }));
        return;
      }
      const step = event.shiftKey ? 0.1 : 0.5;
      if (selection && event.key.startsWith("Arrow")) {
        event.preventDefault();
        if (event.key === "ArrowLeft") nudge(-step, 0);
        if (event.key === "ArrowRight") nudge(step, 0);
        if (event.key === "ArrowUp") nudge(0, -step);
        if (event.key === "ArrowDown") nudge(0, step);
        return;
      }
      const found = TOOLS.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (found) setTool(found.tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- 게시 · 버리기 ---------- */
  const publish = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      // 저장 대기를 끊는다 — ref 를 비우지 않으면 게시 뒤 load() 가 게시 전 초안(새 장소 음수 ID)을 다시 저장해 같은 장소가 또 생긴다
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const res = await apiPost<{ published: { version: number }; warnings: string[] }>("/warehouse/layout/publish", { draft, operator });
      setConfirm(null);
      notify("success", `v${res.published.version} 게시 완료 — 대시보드·재고 이동 3D 에 바로 반영됩니다${res.warnings.length ? ` (주의 ${res.warnings.length}건)` : ""}`);
      await load();
      onPublished?.();
    } catch (err) {
      notify("danger", err instanceof Error ? err.message : "게시 실패");
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await apiPost("/warehouse/layout/draft/discard", { warehouseId });
      setConfirm(null);
      setRevision(0);
      await load();
      notify("info", "초안을 버리고 게시본으로 되돌렸습니다");
    } catch (err) {
      notify("danger", err instanceof Error ? err.message : "초안 버리기 실패");
    } finally {
      setBusy(false);
    }
  };

  /* ---------- 그리기 ---------- */
  if (loading && !draft) return <div className="le-loading">배치 초안을 불러오는 중…</div>;
  if (loadError || !draft || !meta) {
    return (
      <div className="ds-callout danger">
        <Icon name="alert" size={16} />
        <span>{loadError ?? "초안을 불러오지 못했습니다"}</span>
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          다시 시도
        </button>
      </div>
    );
  }

  const errorCount = issues.filter((issue) => issue.level === "error").length;
  // 폰에서는 캔버스를 띄우지 않는다 — 손가락으로 꼭짓점·핸들을 집을 수 없다
  const saveLabel =
    readOnly ? "보기 전용"
    : saveState === "pending" ? "변경 사항 저장 대기…"
    : saveState === "saving" ? "저장 중…"
    : saveState === "error" ? "자동 저장 실패 — Ctrl+S 로 다시 시도"
    : savedAt ? `초안 자동 저장됨 ${savedAt.slice(11)}`
    : "게시본과 같음";

  return (
    <div className={`le${readOnly ? " is-readonly" : ""}${phone ? " is-phone" : ""}`}>
      {/* 편집 배너 — 지금 설계 모드라는 걸 항상 보이게 */}
      <div className="le-banner">
        <div className="le-banner-state">
          <span className="le-badge">
            <Icon name="edit" size={13} />
            {readOnly ? "배치 보기" : "배치 편집 중"}
          </span>
          <span className="le-banner-text">
            게시본 v{meta.published.version}
            {meta.published.publishedAt ? ` · ${meta.published.publishedAt} ${meta.published.publishedBy ?? ""}` : " · 아직 게시 안 됨"}
            <em className={`le-save is-${saveState}`}>{saveLabel}</em>
            {changes.length ? <em className="le-changes">변경 {changes.length}항목</em> : null}
          </span>
        </div>
        <div className="le-banner-actions">
          <select className="le-select" value={warehouseId} onChange={(event) => onWarehouseChange(Number(event.target.value))} aria-label="창고">
            {summary.map((row) => (
              <option key={row.warehouseId} value={row.warehouseId}>
                {row.name}
                {row.floors === 0 ? " · 레이아웃 없음" : ""}
              </option>
            ))}
          </select>
          {!readOnly ? (
            <>
              <button type="button" className="le-icon" onClick={undo} disabled={!history?.past.length} title="실행 취소 (Ctrl+Z)">
                <Icon name="chevL" size={15} />
                되돌리기
              </button>
              <button type="button" className="le-icon" onClick={redo} disabled={!history?.future.length} title="다시 실행 (Ctrl+Shift+Z)">
                다시
                <Icon name="chevR" size={15} />
              </button>
              <button type="button" className="btn-secondary le-btn" onClick={() => setConfirm("discard")} disabled={!meta.hasSavedDraft && !changes.length}>
                초안 버리기
              </button>
              <button
                type="button"
                className="btn-primary le-btn"
                onClick={() => setConfirm("publish")}
                disabled={!changes.length || errorCount > 0}
                title={errorCount ? "검증 오류를 먼저 고치세요" : !changes.length ? "바뀐 내용이 없습니다" : "운영 3D 에 반영"}
              >
                <Icon name="upload" size={14} />
                게시
              </button>
            </>
          ) : null}
        </div>
      </div>

      {readOnly ? (
        <div className="ds-callout info le-readonly">
          <Icon name="lock" size={15} />
          <span>배치 편집은 관리자·물류 담당만 할 수 있습니다. 지금은 게시본을 보기만 합니다.</span>
        </div>
      ) : null}

      {/* 폰 — 캔버스(끌기·꼭짓점)는 손가락으로 못 쓴다. 층 탭 + 목록 + 속성값 + 바뀐 내용으로 대신한다 */}
      {phone ? (
        <>
          <div className="le-toolbar le-phone-bar">
            <div className="le-floors" role="tablist" aria-label="층">
              {draft.floors.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  role="tab"
                  aria-selected={item.code === floor}
                  className={item.code === floor ? "is-on" : ""}
                  onClick={() => {
                    setFloor(item.code);
                    setSelection(null);
                  }}
                >
                  {item.code}
                </button>
              ))}
            </div>
            <button type="button" className={`le-icon${preview ? " is-on" : ""}`} onClick={() => setPreview((value) => !value)}>
              <Icon name="cube3d" size={14} />
              3D 보기
            </button>
          </div>

          <p className="le-phone-hint">
            폰에서는 <b>목록에서 고르고 값으로</b> 고칩니다. 끌어서 옮기기 · 모양 그리기는 PC에서 하세요.
          </p>

          {changes.length || errorCount ? (
            <section className="le-phone-changes" aria-label="바뀐 내용">
              <header>
                <b>바뀐 내용 {changes.length}항목</b>
                {errorCount ? <span className="le-phone-err">오류 {errorCount}건</span> : null}
              </header>
              <ul>
                {issues
                  .filter((issue) => issue.level === "error")
                  .map((issue, index) => (
                    <li key={`err-${index}`} className="is-error">
                      {issue.message}
                    </li>
                  ))}
                {changes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="le-phone-none">게시본과 같습니다 — 바뀐 내용이 없습니다.</p>
          )}

          {selection ? (
            <button type="button" className="btn-secondary le-phone-back" onClick={() => setSelection(null)}>
              <Icon name="chevL" size={14} />
              이 층 목록으로
            </button>
          ) : null}

          <aside className="le-side le-phone-side">
            <Inspector
              draft={draft}
              floor={floor}
              selection={selection}
              readOnly={readOnly}
              locations={locations}
              onChange={commit}
              onSelect={setSelection}
              onFloorRemoved={() => {
                setFloor(draft.floors.find((item) => item.code !== floor)?.code ?? "1F");
                setSelection(null);
              }}
              notify={notify}
            />
          </aside>

          {preview && previewLayout && previewLayout.floors.length ? (
            <div className="le-preview le-phone-preview">
              <div className="le-preview-head">
                <span>
                  <Icon name="cube3d" size={13} />
                  3D 미리보기 · 초안 기준 · {floor}
                </span>
                <small>게시 전에는 운영 화면에 보이지 않습니다</small>
              </div>
              <div className="le-preview-stage">
                <Suspense fallback={<div className="le-loading">3D 준비 중…</div>}>
                  <Warehouse3D
                    layout={previewLayout}
                    floor={previewLayout.floors.some((item) => item.code === floor) ? floor : previewLayout.floors[0].code}
                    onFloorChange={(code) => {
                      setFloor(code);
                      setSelection(null);
                    }}
                    theme={theme}
                    selection={previewSelection}
                    onSelectionChange={setPreviewSelection}
                    colorMode="type"
                  />
                </Suspense>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
      {/* 도구 줄 */}
      <div className="le-toolbar">
        <div className="le-floors" role="tablist" aria-label="층">
          {draft.floors.map((item) => (
            <button
              key={item.code}
              type="button"
              role="tab"
              aria-selected={item.code === floor}
              className={item.code === floor ? "is-on" : ""}
              onClick={() => {
                setFloor(item.code);
                setSelection(null);
              }}
            >
              {item.code}
            </button>
          ))}
          {!readOnly ? (
            <button
              type="button"
              className="le-add-floor"
              onClick={() => {
                const result = addFloor(draft);
                commit(result.draft);
                setFloor(result.code);
                setSelection(null);
                setFitKey((key) => key + 1);
              }}
              title="층 추가"
            >
              <Icon name="plus" size={13} />층
            </button>
          ) : null}
        </div>

        {!readOnly ? (
          <div className="le-tools" role="toolbar" aria-label="도구">
            {TOOLS.map((item) => (
              <button
                key={item.tool}
                type="button"
                className={tool === item.tool ? "is-on" : ""}
                onClick={() => setTool(item.tool)}
                title={`${item.title ?? item.label} (${item.key})`}
                disabled={!draft.floors.length && item.tool !== "select"}
              >
                <Icon name={item.icon} size={14} />
                {item.label}
                <kbd>{item.key}</kbd>
              </button>
            ))}
          </div>
        ) : null}

        {!readOnly ? (
          <label className={`le-purpose${tool === "zone" || tool === "polygon" ? " is-active" : ""}`} title="장소 · 자유형 도구로 만들 장소의 유형">
            <i style={{ background: purposeMeta(newPurpose).token }} aria-hidden="true" />
            <span>새 장소</span>
            <select value={newPurpose} onChange={(event) => setNewPurpose(event.target.value as ZonePurpose)}>
              {(["보관 구역", "작업장", "지원 공간"] as const).map((group) => (
                <optgroup key={group} label={group}>
                  {ZONE_PURPOSES.filter((item) => item.group === group).map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        ) : null}

        <div className="le-view-tools">
          <label className="le-check">
            <input type="checkbox" checked={snapOn} onChange={(event) => setSnapOn(event.target.checked)} />
            0.5m 스냅
          </label>
          <button type="button" className="le-icon" onClick={() => setZoomRequest({ factor: 1 / 1.25, nonce: Date.now() })} title="축소">
            <Icon name="minus" size={14} />
          </button>
          <button type="button" className="le-icon" onClick={() => setZoomRequest({ factor: 1.25, nonce: Date.now() })} title="확대">
            <Icon name="plus" size={14} />
          </button>
          <button type="button" className="le-icon" onClick={() => setFitKey((key) => key + 1)} title="화면 맞춤">
            <Icon name="maximize" size={14} />
          </button>
          <button type="button" className={`le-icon${preview ? " is-on" : ""}`} onClick={() => setPreview((value) => !value)} title="3D 미리보기">
            <Icon name="cube3d" size={14} />
            3D
          </button>
        </div>
      </div>

      <div className={`le-body${preview && previewLayout?.floors.length ? " has-preview" : ""}`}>
        <TrayPanel
          draft={draft}
          locations={locations}
          selection={selection}
          readOnly={readOnly}
          onChange={commit}
          notify={notify}
          issues={issues}
          onIssueClick={onIssueClick}
        />

        <div className="le-center">
          <div className="le-canvas">
            {draft.floors.length ? (
              <PlanCanvas
                draft={draft}
                floor={floor}
                selection={selection}
                tool={readOnly ? "select" : tool}
                readOnly={readOnly}
                snapOn={snapOn}
                errorKeys={errorKeys}
                newPurpose={newPurpose}
                onSelect={setSelection}
                onCreate={create}
                onCreatePolygon={createPolygon}
                onCommit={commit}
                onDragStart={onDragStart}
                onDrag={onDrag}
                onDragEnd={onDragEnd}
                fitKey={fitKey}
                zoomRequest={zoomRequest}
              />
            ) : (
              <div className="le-no-floor">
                <Icon name="cube3d" size={30} />
                <b>{published?.warehouse.name ?? "이 창고"}에는 아직 배치가 없습니다</b>
                <span>층을 만들고 구역 → 랙 순서로 놓은 뒤, 왼쪽 트레이의 로케이션을 랙 칸에 넣으세요.</span>
                {!readOnly ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      const result = addFloor(draft);
                      commit(result.draft);
                      setFloor(result.code);
                      setFitKey((key) => key + 1);
                    }}
                  >
                    <Icon name="plus" size={14} />
                    1F 만들기
                  </button>
                ) : null}
              </div>
            )}
            {!readOnly && draft.floors.length ? (
              <div className="le-canvas-hint">
                {tool === "select"
                  ? !selection
                    ? "건물 모양: 층 테두리 꼭짓점·변 끌기(Shift 직각) · 변 가운데 + 끌기 = 꼭짓점 추가 · 더블클릭 삭제 · 빈 곳 끌기 화면 이동 · Ctrl+휠 확대"
                    : selection.kind === "zone"
                      ? "끌어서 이동 · 변 가운데 + 끌기 = 꼭짓점 추가 · 꼭짓점·변 끌기(Shift 직각) · 꼭짓점 더블클릭 삭제 · Q/E 45° · Del 빼기"
                      : "끌어서 이동 · 모서리로 크기 · R 회전 · Del 삭제 · 방향키 0.5m(Shift 0.1m) · 빈 곳 끌기 화면 이동 · Ctrl+휠 확대"
                  : tool === "polygon"
                    ? `${purposeMeta(newPurpose).label} 그리기 — 클릭으로 꼭짓점 · 첫 점/더블클릭/Enter 로 완성 · Shift 직각 · Backspace 한 점 취소 · Esc 취소`
                    : tool === "rack"
                      ? "보관 구역 안을 클릭하면 랙이 놓입니다 · Esc 취소"
                      : tool === "zone"
                        ? `클릭한 자리에 ${purposeMeta(newPurpose).label} 을(를) 놓습니다 · Esc 취소`
                        : "클릭한 자리에 만듭니다 · Esc 취소"}
              </div>
            ) : null}
          </div>

          {preview && previewLayout && previewLayout.floors.length ? (
            <div className="le-preview">
              <div className="le-preview-head">
                <span>
                  <Icon name="cube3d" size={13} />
                  3D 미리보기 · 초안 기준 · {floor}
                </span>
                <small>게시 전에는 운영 화면에 보이지 않습니다</small>
              </div>
              <div className="le-preview-stage">
                <Suspense fallback={<div className="le-loading">3D 준비 중…</div>}>
                  <Warehouse3D
                    layout={previewLayout}
                    floor={previewLayout.floors.some((item) => item.code === floor) ? floor : previewLayout.floors[0].code}
                    onFloorChange={(code) => {
                      setFloor(code);
                      setSelection(null);
                    }}
                    theme={theme}
                    selection={previewSelection}
                    onSelectionChange={setPreviewSelection}
                    colorMode="type"
                  />
                </Suspense>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="le-side">
          <Inspector
            draft={draft}
            floor={floor}
            selection={selection}
            readOnly={readOnly}
            locations={locations}
            onChange={commit}
            onSelect={setSelection}
            onFloorRemoved={() => {
              setFloor(draft.floors.find((item) => item.code !== floor)?.code ?? "1F");
              setSelection(null);
            }}
            notify={notify}
          />
        </aside>
      </div>
        </>
      )}

      {toast ? (
        <div className={`ds-callout ${toast.tone} le-toast`} role="status">
          <Icon name={toast.tone === "success" ? "checkCircle" : toast.tone === "danger" ? "alert" : "bell"} size={16} />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="닫기">
            <Icon name="x" size={13} />
          </button>
        </div>
      ) : null}

      <Modal
        open={confirm === "publish"}
        title="배치 게시"
        desc={`게시본 v${meta.published.version} → v${meta.published.version + 1}`}
        icon="upload"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary)"
        onClose={() => !busy && setConfirm(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>
              취소
            </button>
            <button type="button" className="btn-primary" onClick={() => void publish()} disabled={busy || hasErrors(issues)}>
              {busy ? "게시 중…" : "게시"}
            </button>
          </>
        }
      >
        <div className="le-confirm">
          <p>게시하면 대시보드·재고 이동의 3D 와 로케이션 마스터에 바로 반영됩니다.</p>
          <ul>
            {changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {issues.filter((issue) => issue.level === "warning").map((issue) => (
            <div key={issue.message} className="ds-callout warning">
              <Icon name="alert" size={14} />
              <span>{issue.message}</span>
            </div>
          ))}
          <p className="le-note">로케이션 위치만 바뀌고 재고 수량은 바뀌지 않습니다. 재고는 로케이션을 따라갑니다.</p>
        </div>
      </Modal>

      <Modal
        open={confirm === "discard"}
        title="초안 버리기"
        desc="게시본으로 되돌립니다"
        icon="alert"
        iconBg="var(--c-danger-bg)"
        iconColor="var(--c-danger)"
        onClose={() => !busy && setConfirm(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>
              계속 편집
            </button>
            <button type="button" className="btn-primary le-btn-danger" onClick={() => void discard()} disabled={busy}>
              {busy ? "처리 중…" : "초안 버리기"}
            </button>
          </>
        }
      >
        <div className="le-confirm">
          <p>지금까지의 편집({changes.length}항목)이 사라지고 되돌릴 수 없습니다.</p>
          <ul>
            {changes.slice(0, 6).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
};

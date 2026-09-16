import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../services/http";
import { appToday } from "../../shared/appDate";
import { useUiStore } from "../../app/store/uiStore";
import { useAuthStore } from "../../app/store/authStore";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { MapSearch } from "../../components/warehouse3d/MapSearch";
import { MapSidePanel } from "../../components/warehouse3d/MapSidePanel";
import { SlotContextMenu } from "../../components/warehouse3d/SlotContextMenu";
import { useStockActions } from "../../components/warehouse3d/stockActions";
import { useWarehouseMap } from "../../components/warehouse3d/useWarehouseMap";
import type {
  LayoutSlot,
  MapSearchItem,
  MapSearchLocation,
  MapSearchResult,
  SlotStock
} from "../../components/warehouse3d/types";
import { useZoneEditSession } from "../inventory/layoutEditor/useZoneEditSession";
import { ZoneEditBar, ZoneEditPanel } from "../inventory/layoutEditor/ZoneEditPanel";
import "./ControlTower.css";

/** 구역 배치 편집 권한 — 물류 관리자·IT (DOCS/WMS_3D창고맵_설계.md 11-3) */
const LAYOUT_EDIT_ROLES = ["admin", "logistics"];

// three.js 는 무거우므로 별도 청크로 분리한다 — KPI/표는 먼저 그려지고 맵이 뒤따라 붙는다
const Warehouse3D = lazy(() =>
  import("../../components/warehouse3d/Warehouse3D").then((m) => ({ default: m.Warehouse3D }))
);

type DashboardSummary = {
  logistics: { todayInbound: number; todayOutbound: number; totalStock: number; working: number };
  inbound: { scheduled: number; confirmed: number; putawayWait: number; returnReceived: number };
  outbound: { waiting: number; picking: number; picked: number; completed: number; rejected: number };
  stock: { total: number; available: number; defect: number; longTerm: number };
  alerts: { replenish: number; shortage: number; interfaceError: number; returnRejected: number };
};

type TaskRow = {
  taskNo: string;
  kind: string;
  partner: string;
  qty: number;
  unit: string;
  status: string;
  tone: string;
  time: string;
  to: string;
};

type StockMix = { total: number; buckets: Array<{ name: string; qty: number; tone: string }> };

type Notice = { id: number; category: string; title: string; createdAt: string; pinned: boolean };

type Kpi = {
  key: string;
  label: string;
  value: number;
  unit: string;
  icon: string;
  tone: "info" | "success" | "warning" | "danger" | "violet" | "accent";
  foot?: string;
  to: string;
};

const TONE_VARS: Record<string, string> = {
  info: "var(--primary)",
  success: "var(--c-success)",
  warning: "var(--c-warning)",
  danger: "var(--c-danger)",
  violet: "var(--c-violet)",
  accent: "var(--accent)"
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const formatToday = () => {
  const date = appToday();
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
};

const nowTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
};

/* ============================================================
   물류 관제 대시보드
   KPI 스트립 + 3D 창고 맵 + 로케이션 현황 + 작업/재고/공지
   ============================================================ */
export const ControlTowerPage = () => {
  const navigate = useNavigate();
  const theme = useUiStore((state) => state.theme);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [mix, setMix] = useState<StockMix | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState("");
  const [taskKind, setTaskKind] = useState("전체");

  // 3D 맵 상태 — 레이아웃은 로케이션 마스터 + 재고에서 계산된 값이다
  const map = useWarehouseMap();
  const { layout, refresh: refreshMap } = map;

  // 구역 배치 편집 — 3D 위에서 구역을 통째로 끌어 옮긴다
  const role = useUiStore((state) => state.currentRole);
  const operator = useAuthStore((state) => state.user?.id ?? "system");
  const canEditLayout = LAYOUT_EDIT_ROLES.includes(role);
  const zoneEdit = useZoneEditSession(map, operator);
  const [editConfirm, setEditConfirm] = useState<"save" | "discard" | null>(null);
  const { notice: editNotice, setNotice: setEditNotice } = zoneEdit;

  // 슬롯 우클릭 메뉴 — 이동·조정·보충은 재고 이동 3D 탭과 같은 창·규칙을 쓴다
  // load 는 아래에서 정의되므로 호출 시점에 읽도록 감싼다
  const stockActions = useStockActions(map, { onChanged: () => load() });
  const [slotMenu, setSlotMenu] = useState<{ slot: LayoutSlot; point: { x: number; y: number } } | null>(null);

  const openSlotMenu = (slot: LayoutSlot, point: { x: number; y: number }) => {
    map.setSelection({ zoneId: slot.zoneId, locationId: slot.locationId });
    setSlotMenu({ slot, point });
  };

  const showSameItem = async (stock: SlotStock) => {
    const res = await apiGet<MapSearchResult>(`/warehouse/search?warehouseId=${map.warehouseId}&q=${encodeURIComponent(stock.itemCode)}`);
    const item = res.items.find((entry) => entry.itemCode === stock.itemCode);
    if (item) pickItem(item);
  };

  const startZoneEdit = () => {
    map.setHighlight(null);
    stockActions.cancelMove();
    setSlotMenu(null);
    void zoneEdit.enter();
  };
  const stopZoneEdit = () => {
    if (zoneEdit.changedZoneIds.size) setEditConfirm("discard");
    else zoneEdit.exit();
  };

  useEffect(() => {
    if (!editNotice) return;
    const timer = window.setTimeout(() => setEditNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [editNotice, setEditNotice]);

  // 편집 중 단축키 — 방향키 0.5m(Shift 0.1m), Q/E 45° 회전, Ctrl+Z 되돌리기, Esc 편집 종료
  useEffect(() => {
    if (!zoneEdit.active) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (document.querySelector(".ds-overlay")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        zoneEdit.undo();
        return;
      }
      if (event.key === "Escape") {
        stopZoneEdit();
        return;
      }
      // 한글 입력 상태여도 같은 자리 키로 동작하게 event.code 로 본다
      if (!event.ctrlKey && !event.metaKey && !event.altKey && (event.code === "KeyQ" || event.code === "KeyE")) {
        if (zoneEdit.selectedZoneId == null) return;
        event.preventDefault();
        zoneEdit.rotateBy(event.code === "KeyE" ? 1 : -1);
        return;
      }
      const step = event.shiftKey ? 0.1 : 0.5;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step]
      };
      const move = moves[event.key];
      if (move && zoneEdit.selectedZoneId != null) {
        event.preventDefault();
        zoneEdit.nudge(move[0], move[1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<DashboardSummary>("/dashboard/summary"),
      apiGet<TaskRow[]>("/dashboard/tasks"),
      apiGet<StockMix>("/dashboard/stock-mix"),
      apiGet<Notice[]>("/notices")
    ])
      .then(([summaryData, taskData, mixData, noticeData]) => {
        setSummary(summaryData);
        setTasks(taskData);
        setMix(mixData);
        setNotices(noticeData);
        setSyncedAt(nowTime());
      })
      .catch((err) => setError(err instanceof Error ? err.message : "조회 실패"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const reloadAll = () => {
    load();
    void refreshMap();
  };

  const pickLocation = (location: MapSearchLocation) => {
    map.setHighlight(null);
    map.selectLocation(location.locationId);
  };

  const pickItem = (item: MapSearchItem) => {
    const placed = item.locations.filter((location) => location.placed);
    const floors = Array.from(new Set(placed.map((location) => location.floor).filter(Boolean)));
    map.setHighlight({
      label: `${item.itemName} · ${placed.length}곳${floors.length > 1 ? ` (${floors.join("·")})` : ""}`,
      ids: placed.map((location) => location.locationId)
    });
    if (placed[0]) map.selectZone(placed[0].zoneId);
  };

  const kpis: Kpi[] = useMemo(() => {
    const inbound = summary?.inbound;
    const outbound = summary?.outbound;
    return [
      { key: "in-sched", label: "입고 예정", value: inbound?.scheduled ?? 0, unit: "건", icon: "inbox", tone: "info", to: "/inbound/inbound-schedule" },
      { key: "in-conf", label: "입고 확정", value: inbound?.confirmed ?? 0, unit: "건", icon: "checkCircle", tone: "success", to: "/inbound/inbound-confirm" },
      { key: "putaway", label: "적치 대기", value: inbound?.putawayWait ?? 0, unit: "건", icon: "layers", tone: "warning", foot: "격납 지시 필요", to: "/stock/putaway" },
      { key: "out-wait", label: "출고 예정", value: outbound?.waiting ?? 0, unit: "건", icon: "truck", tone: "accent", to: "/outbound/outbound-order" },
      { key: "picking", label: "피킹 진행", value: outbound?.picking ?? 0, unit: "건", icon: "clipboard", tone: "violet", to: "/outbound/picking" },
      { key: "return", label: "반품 확인", value: inbound?.returnReceived ?? 0, unit: "건", icon: "swap", tone: "danger", to: "/inbound/return-confirm" }
    ];
  }, [summary]);

  const visibleTasks = useMemo(
    () => (taskKind === "전체" ? tasks : tasks.filter((task) => task.kind === taskKind)),
    [tasks, taskKind]
  );

  /* 재고 도넛 — conic-gradient 각도 계산 */
  const donut = useMemo(() => {
    if (!mix || mix.total <= 0) return { gradient: "conic-gradient(var(--surface-4) 0 100%)", rows: [] as StockMix["buckets"] };
    let acc = 0;
    const stops = mix.buckets
      .filter((bucket) => bucket.qty > 0)
      .map((bucket) => {
        const from = (acc / mix.total) * 360;
        acc += bucket.qty;
        const to = (acc / mix.total) * 360;
        return `${TONE_VARS[bucket.tone] ?? "var(--primary)"} ${from}deg ${to}deg`;
      });
    return { gradient: `conic-gradient(${stops.join(", ")})`, rows: mix.buckets };
  }, [mix]);

  return (
    <section className="ct-page">
      {/* ---------- 인사말 ---------- */}
      <header className="ct-hello">
        <div>
          <h2>오늘도 안전한 물류, 좋은 하루입니다.</h2>
          <p>
            {formatToday()} · {layout?.warehouse.name ?? "물류센터"} 실시간 운영 현황
          </p>
        </div>
        <div className="ct-hello-actions">
          {syncedAt ? <span className="ct-sync">기준 {syncedAt}</span> : null}
          <button type="button" className="btn-secondary ct-refresh" onClick={reloadAll}>
            <Icon name="refresh" size={15} />
            새로고침
          </button>
        </div>
      </header>

      {error ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>불러오기 실패: {error}</span>
        </div>
      ) : null}

      {/* ---------- KPI 스트립 ---------- */}
      <div className="ct-kpis">
        {kpis.map((kpi) => (
          <button key={kpi.key} type="button" className="ct-kpi" onClick={() => navigate(kpi.to)}>
            <span className={`nx-ico ${kpi.tone}`}>
              <Icon name={kpi.icon} size={19} />
            </span>
            <span className="ct-kpi-body">
              <span className="ct-kpi-label">{kpi.label}</span>
              <span className="ct-kpi-value">
                {loading ? "—" : kpi.value.toLocaleString()}
                <small>{kpi.unit}</small>
              </span>
            </span>
            <span className="ct-kpi-foot">{kpi.foot ?? ""}</span>
          </button>
        ))}
      </div>

      {/* ---------- 3D 맵 + 로케이션 현황 ---------- */}
      <div className="ct-main">
        <section className="card ct-map">
          <div className="ct-panel-head">
            <div className="nx-sect">
              <span className="nx-eyebrow">WAREHOUSE MAP</span>
              <span className="nx-sect-title">{layout?.warehouse.name ?? "창고"} 3D 현황</span>
            </div>
            <div className="ct-panel-tools">
              <select
                className="ct-select"
                value={map.warehouseId}
                onChange={(event) => map.setWarehouseId(Number(event.target.value))}
                aria-label="창고 선택"
                disabled={zoneEdit.active}
                title={zoneEdit.active ? "배치 편집 중에는 창고를 바꿀 수 없습니다" : undefined}
              >
                {map.summary.map((row) => (
                  <option key={row.warehouseId} value={row.warehouseId}>
                    {row.name}
                    {row.floors === 0 ? " · 레이아웃 미등록" : ""}
                  </option>
                ))}
              </select>
              <span className="ct-chip">{map.floor}</span>
              <span className="ct-chip">{map.floorZones.length}개 구역</span>
            </div>
          </div>
          <div className="ct-map-stage">
            {layout ? (
              <Suspense fallback={<div className="ct-map-loading">3D 창고 맵을 준비하는 중…</div>}>
                <Warehouse3D
                  layout={zoneEdit.active && zoneEdit.layout ? zoneEdit.layout : layout}
                  floor={map.floor}
                  onFloorChange={map.setFloor}
                  theme={theme}
                  selection={zoneEdit.active ? { zoneId: zoneEdit.selectedZoneId, locationId: null } : map.selection}
                  onSelectionChange={
                    zoneEdit.active
                      ? () => undefined
                      : (next) => {
                          // 우클릭 메뉴에서 [다른 칸으로 옮기기] 중이면 클릭한 칸이 도착지
                          if (!stockActions.interceptSelection(next)) map.setSelection(next);
                        }
                  }
                  mode={stockActions.pending ? "work" : "view"}
                  dropCheck={stockActions.dropCheck}
                  onDropSlot={stockActions.onDropSlot}
                  onSlotContextMenu={zoneEdit.active ? undefined : openSlotMenu}
                  popover={
                    slotMenu && !zoneEdit.active ? (
                      <SlotContextMenu
                        slot={slotMenu.slot}
                        point={slotMenu.point}
                        actions={stockActions}
                        onClose={() => setSlotMenu(null)}
                        onOpenOrder={(order, code) =>
                          navigate(`/outbound/picking?outboundNo=${encodeURIComponent(order.outboundNo)}&from=${encodeURIComponent(code)}`)
                        }
                        onShowItem={(stock) => void showSameItem(stock)}
                        onFocus={() => map.requestFocus({ locationId: slotMenu.slot.locationId })}
                      />
                    ) : null
                  }
                  colorMode={map.colorMode}
                  onColorModeChange={map.setColorMode}
                  highlightIds={zoneEdit.active ? null : map.highlight?.ids ?? null}
                  focus={zoneEdit.active ? null : map.focus}
                  syncedAt={syncedAt}
                  zoneEdit={
                    zoneEdit.active
                      ? {
                          enabled: true,
                          check: zoneEdit.check,
                          onMove: (zoneId, x, z) => void zoneEdit.moveZone(zoneId, x, z),
                          onRotate: (zoneId, rotation) => void zoneEdit.rotateZone(zoneId, rotation),
                          onReject: (reason) => setEditNotice({ tone: "danger", text: `놓을 수 없습니다 — ${reason}` }),
                          onSelect: zoneEdit.setSelectedZoneId
                        }
                      : null
                  }
                  toolbarExtra={
                    canEditLayout && layout.floors.length ? (
                      <button
                        type="button"
                        className={`nx-iconbtn wh3d-text-btn${zoneEdit.active ? " is-on" : ""}`}
                        onClick={zoneEdit.active ? stopZoneEdit : startZoneEdit}
                        disabled={zoneEdit.entering}
                        title={zoneEdit.active ? "배치 편집 끝내기 (Esc)" : "구역을 끌어 옮기거나 돌리는 배치 편집"}
                        aria-pressed={zoneEdit.active}
                      >
                        <Icon name="edit" size={13} />
                        {zoneEdit.active ? "편집 중" : "편집"}
                      </button>
                    ) : null
                  }
                  overlay={
                    zoneEdit.active ? (
                      <ZoneEditBar session={zoneEdit} onSave={() => setEditConfirm("save")} onCancel={stopZoneEdit} />
                    ) : stockActions.pendingBanner ? (
                      stockActions.pendingBanner
                    ) : layout.floors.length ? (
                      <MapSearch
                        warehouseId={map.warehouseId}
                        onPickLocation={pickLocation}
                        onPickItem={pickItem}
                        highlightLabel={map.highlight?.label ?? null}
                        onClearHighlight={() => map.setHighlight(null)}
                      />
                    ) : null
                  }
                />
              </Suspense>
            ) : (
              <div className="ct-map-loading">{map.error ? `레이아웃 조회 실패: ${map.error}` : "3D 레이아웃을 불러오는 중…"}</div>
            )}
          </div>
        </section>

        {zoneEdit.active ? (
          <ZoneEditPanel
            session={zoneEdit}
            floor={map.floor}
            onSave={() => setEditConfirm("save")}
            onCancel={stopZoneEdit}
          />
        ) : (
        <MapSidePanel
          map={map}
          onPickSlot={(slot) => stockActions.interceptSelection({ zoneId: slot.zoneId, locationId: slot.locationId })}
          onOpenActions={() => {
            const slot = layout?.slots.find((item) => item.locationId === map.selection.locationId);
            // 맵 오른쪽 위에 연다 — 메뉴가 맵 안쪽으로 알아서 당겨진다
            if (slot) setSlotMenu({ slot, point: { x: 100000, y: 56 } });
          }}
          headAction={
            <button type="button" className="ct-link" onClick={() => navigate("/master/location-master")}>
              로케이션 관리
              <Icon name="chevR" size={13} />
            </button>
          }
          zoneFooter={
            map.selectedZone ? (
              <button
                type="button"
                className="btn-primary wmp-cta"
                onClick={() => map.selectedZone && map.requestFocus({ zoneId: map.selectedZone.id })}
              >
                {map.selectedZone.name} 확대해서 보기
                <Icon name="arrowR" size={15} />
              </button>
            ) : null
          }
          locationFooter={
            <>
              <button type="button" className="btn-secondary wmp-cta" onClick={() => navigate("/stock/stock-realtime")}>
                실시간 재고
              </button>
              <button type="button" className="btn-primary wmp-cta" onClick={() => navigate("/stock/transfer")}>
                재고 이동
                <Icon name="arrowR" size={15} />
              </button>
            </>
          }
        />
        )}
      </div>

      {stockActions.layer}

      {editNotice ? (
        <div className={`ds-callout ${editNotice.tone} zep-toast`} role="status">
          <Icon name={editNotice.tone === "success" ? "checkCircle" : "alert"} size={16} />
          <span>{editNotice.text}</span>
          <button type="button" onClick={() => setEditNotice(null)} aria-label="닫기">
            <Icon name="x" size={13} />
          </button>
        </div>
      ) : null}

      <Modal
        open={editConfirm === "save"}
        title="구역 배치 저장"
        desc="저장하면 게시되어 모든 3D 화면과 로케이션 관리에 반영됩니다"
        icon="upload"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary)"
        onClose={() => !zoneEdit.saving && setEditConfirm(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditConfirm(null)} disabled={zoneEdit.saving}>
              계속 편집
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={zoneEdit.saving}
              onClick={async () => {
                const ok = await zoneEdit.save();
                if (ok) setEditConfirm(null);
              }}
            >
              {zoneEdit.saving ? "저장 중…" : "저장"}
            </button>
          </>
        }
      >
        <div className="zep-confirm">
          <ul>
            {zoneEdit.changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>구역 안의 랙·로케이션이 함께 옮겨지거나 돌아가고, 로케이션 코드와 재고 수량은 그대로입니다.</p>
        </div>
      </Modal>

      <Modal
        open={editConfirm === "discard"}
        title="편집 취소"
        desc={`바꾼 구역 ${zoneEdit.changedZoneIds.size}곳을 원래 자리·방향으로 되돌립니다`}
        icon="alert"
        iconBg="var(--c-warning-bg)"
        iconColor="var(--c-warning)"
        onClose={() => setEditConfirm(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditConfirm(null)}>
              계속 편집
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditConfirm(null);
                zoneEdit.exit();
              }}
            >
              버리고 나가기
            </button>
          </>
        }
      >
        <div className="zep-confirm">
          <p>저장하지 않은 이동·회전은 사라집니다.</p>
        </div>
      </Modal>

      {/* ---------- 작업 / 재고 / 공지 ---------- */}
      <div className="ct-bottom">
        <section className="card ct-tasks">
          <div className="ct-panel-head">
            <div className="nx-sect">
              <span className="nx-sect-title">주요 작업 현황</span>
              <span className="nx-sect-sub">실시간 배정 작업</span>
            </div>
            <div className="ct-panel-tools">
              <button type="button" className="btn-primary ct-mini-btn" onClick={() => navigate("/outbound/manual-order")}>
                <Icon name="plus" size={14} />
                작업 등록
              </button>
              <select
                className="ct-select"
                value={taskKind}
                onChange={(event) => setTaskKind(event.target.value)}
                aria-label="작업 구분"
              >
                <option>전체</option>
                <option>입고</option>
                <option>출고</option>
              </select>
            </div>
          </div>

          <div className="ct-table-wrap">
            <table className="data-table ct-table">
              <thead>
                <tr>
                  <th>작업번호</th>
                  <th>구분</th>
                  <th>상태</th>
                  <th>거래처</th>
                  <th className="ct-num">수량</th>
                  <th className="ct-num">시간</th>
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map((task) => (
                  <tr key={task.taskNo} onClick={() => navigate(task.to)}>
                    <td className="ct-mono">{task.taskNo}</td>
                    <td>{task.kind}</td>
                    <td>
                      <span className={`ds-badge ${task.tone}`}>
                        <i className="bdot" />
                        {task.status}
                      </span>
                    </td>
                    <td>{task.partner}</td>
                    <td className="ct-num">{task.qty.toLocaleString()} {task.unit}</td>
                    <td className="ct-num ct-time">{task.time}</td>
                  </tr>
                ))}
                {!visibleTasks.length ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="nx-empty">표시할 작업이 없습니다.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card ct-stock">
          <div className="ct-panel-head">
            <div className="nx-sect">
              <span className="nx-sect-title">재고 현황</span>
              <span className="nx-sect-sub">보관 구분별 수량</span>
            </div>
            <button type="button" className="ct-link" onClick={() => navigate("/stock/stock-realtime")}>
              전체보기
              <Icon name="chevR" size={13} />
            </button>
          </div>

          <div className="ct-donut-wrap">
            <div className="ct-donut" style={{ background: donut.gradient }}>
              <div className="ct-donut-hole">
                <span>총 재고</span>
                <strong>{(mix?.total ?? 0).toLocaleString()}</strong>
                <small>EA</small>
              </div>
            </div>
            <ul className="ct-donut-legend">
              {donut.rows.map((row) => (
                <li key={row.name}>
                  <i style={{ background: TONE_VARS[row.tone] ?? "var(--primary)" }} />
                  <span>{row.name}</span>
                  <b>{row.qty.toLocaleString()}</b>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card ct-notice">
          <div className="ct-panel-head">
            <div className="nx-sect">
              <span className="nx-sect-title">공지사항</span>
              <span className="nx-sect-sub">운영팀 전달사항</span>
            </div>
            <button type="button" className="ct-link" onClick={() => navigate("/communication/notice")}>
              더보기
              <Icon name="chevR" size={13} />
            </button>
          </div>
          <ul className="ct-notice-list">
            {notices.map((notice) => (
              <li key={notice.id} onClick={() => navigate("/communication/notice")}>
                <span className={`ds-badge ${notice.pinned ? "danger" : "gray"}`}>{notice.pinned ? "중요" : "일반"}</span>
                <span className="ct-notice-title">{notice.title}</span>
                <span className="ct-notice-date">{notice.createdAt.slice(5, 10).replace("-", ".")}</span>
              </li>
            ))}
            {!notices.length ? <div className="nx-empty">등록된 공지가 없습니다.</div> : null}
          </ul>
        </section>
      </div>
    </section>
  );
};

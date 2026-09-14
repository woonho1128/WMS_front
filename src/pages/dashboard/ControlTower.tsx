import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../services/http";
import { appToday } from "../../shared/appDate";
import { useUiStore } from "../../app/store/uiStore";
import { Icon } from "../../components/ui/Icon";
import { bucketOf, utilOf, type WarehouseLayout, type WarehouseZone } from "../../components/warehouse3d/types";
import "./ControlTower.css";

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
  const [layout, setLayout] = useState<WarehouseLayout | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [mix, setMix] = useState<StockMix | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState("");

  const [floor, setFloor] = useState("1F");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [taskKind, setTaskKind] = useState("전체");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<DashboardSummary>("/dashboard/summary"),
      apiGet<WarehouseLayout>("/warehouse/layout"),
      apiGet<TaskRow[]>("/dashboard/tasks"),
      apiGet<StockMix>("/dashboard/stock-mix"),
      apiGet<Notice[]>("/notices")
    ])
      .then(([summaryData, layoutData, taskData, mixData, noticeData]) => {
        setSummary(summaryData);
        setLayout(layoutData);
        setTasks(taskData);
        setMix(mixData);
        setNotices(noticeData);
        setSyncedAt(nowTime());
      })
      .catch((err) => setError(err instanceof Error ? err.message : "조회 실패"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const floorZones = useMemo(
    () => (layout?.zones ?? []).filter((zone) => zone.floor === floor),
    [layout, floor]
  );

  // 층을 바꾸면 그 층의 첫 구역을 선택 상태로 맞춘다
  useEffect(() => {
    if (!floorZones.length) return;
    setZoneId((prev) => (prev && floorZones.some((zone) => zone.id === prev) ? prev : floorZones[0].id));
  }, [floorZones]);

  const selectedZone = floorZones.find((zone) => zone.id === zoneId) ?? null;

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
          <button type="button" className="btn-secondary ct-refresh" onClick={load}>
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
              <span className="ct-chip">{floor}</span>
              <span className="ct-chip">{floorZones.length}개 구역</span>
            </div>
          </div>
          <div className="ct-map-stage">
            {layout ? (
              <Suspense fallback={<div className="ct-map-loading">3D 창고 맵을 준비하는 중…</div>}>
                <Warehouse3D
                  layout={layout}
                  floor={floor}
                  onFloorChange={setFloor}
                  selectedZoneId={zoneId}
                  onSelectZone={setZoneId}
                  theme={theme}
                  syncedAt={syncedAt}
                />
              </Suspense>
            ) : (
              <div className="ct-map-loading">3D 레이아웃을 불러오는 중…</div>
            )}
          </div>
        </section>

        <aside className="card ct-rail">
          <div className="ct-panel-head">
            <div className="nx-sect">
              <span className="nx-sect-title">로케이션 현황</span>
              <span className="nx-sect-sub">{layout?.warehouse.name ?? ""} · {floor}</span>
            </div>
            <button type="button" className="ct-link" onClick={() => navigate("/master/location-master")}>
              전체 구역
              <Icon name="chevR" size={13} />
            </button>
          </div>

          <div className="ct-zones">
            {floorZones.map((zone) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                active={zone.id === zoneId}
                onSelect={() => setZoneId(zone.id)}
              />
            ))}
            {!floorZones.length ? <div className="nx-empty">해당 층에 등록된 구역이 없습니다.</div> : null}
          </div>

          <button
            type="button"
            className="btn-primary ct-rail-cta"
            onClick={() => navigate("/master/location-master")}
          >
            {selectedZone ? `${selectedZone.name} 상세 보기` : "로케이션 상세 보기"}
            <Icon name="arrowR" size={15} />
          </button>
        </aside>
      </div>

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

/* ------------------------------------------------------------
   로케이션 현황 한 줄 — 선택 시 상세가 펼쳐진다
------------------------------------------------------------ */
const ZoneRow = ({ zone, active, onSelect }: { zone: WarehouseZone; active: boolean; onSelect: () => void }) => {
  const util = utilOf(zone);
  const bucket = bucketOf(util);
  const barTone = bucket.key === "free" ? "is-ok" : bucket.key === "normal" ? "is-info" : bucket.key === "busy" ? "is-warn" : "is-danger";

  return (
    <div className={`ct-zone${active ? " is-active" : ""}`}>
      <button type="button" className="ct-zone-head" onClick={onSelect}>
        <span className="ct-zone-badge" style={{ background: bucket.token }}>
          {zone.id}
        </span>
        <span className="ct-zone-text">
          <span className="ct-zone-name">{zone.name}</span>
          <span className="ct-zone-code">{zone.code}</span>
        </span>
        <span className="ct-zone-figures">
          <span className="ct-zone-util" style={{ color: bucket.token }}>{util}%</span>
          <span className="ct-zone-cap">
            {zone.used} / {zone.capacity}
          </span>
        </span>
      </button>
      <div className={`nx-bar ${barTone} ct-zone-bar`}>
        <i style={{ width: `${util}%` }} />
      </div>
      {active ? (
        <dl className="ct-zone-detail">
          <div>
            <dt>구역 유형</dt>
            <dd>{zone.typeName}</dd>
          </div>
          <div>
            <dt>보관 SKU</dt>
            <dd>{zone.sku} 종</dd>
          </div>
          <div>
            <dt>담당자</dt>
            <dd>{zone.manager}</dd>
          </div>
          <div>
            <dt>최근 입·출고</dt>
            <dd>
              {zone.recentIn} / {zone.recentOut}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
};

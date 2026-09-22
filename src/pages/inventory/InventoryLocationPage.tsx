import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable";
import { apiGet, apiPost, apiPut, apiDelete } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import { zoneHoldsRacks, type LayoutRack, type LayoutSummaryRow } from "../../components/warehouse3d/types";
import { LocationCapaView } from "./LocationCapaView";
import { LocationLabelDialog, type LabelTarget } from "./LocationLabels";
import { LayoutEditor } from "./layoutEditor/LayoutEditor";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용
import "./LocationPage.css";

type LocationRow = {
  id: number;
  code: string;
  locationType: string; // PICKING/RESERVE/DEFECT/DAMAGED
  status: string;
  maxQty: number | null;
  active: boolean;
  zoneId: number;
  zoneName: string;
  warehouseName: string;
  warehouseId: number | null;
  floor: string | null;
  stockCount: number;
  /** 든 품목 종류 수 — 2 이상이면 혼적 */
  skuCount: number;
  /** 든 품목 이름 ", " 로 이은 것 (표시용) — 비었으면 null */
  skuNames: string | null;
  rackId: number | null;
  rackCode: string | null;
  bay: number | null;
  level: number | null;
  /** "A-R01 · 2연 3단" — 미배치면 null */
  placement: string | null;
  /** 이 로케이션에 따로 정한 최대 무게(kg) — null 이면 랙 기준 */
  maxWeightKg: number | null;
  /** 배치된 랙의 칸당 허용 하중(kg) */
  rackMaxLoadKg: number | null;
  palletSpec: string | null;
};

const toLabelTarget = (r: LocationRow): LabelTarget => ({
  locationId: r.id,
  code: r.code,
  warehouseName: r.warehouseName,
  zoneName: r.zoneName,
  floor: r.floor,
  rackCode: r.rackCode,
  bay: r.bay,
  level: r.level,
  locationType: r.locationType
});

/** 목록 표기 — 따로 정한 값이 없으면 랙 기준을 흐리게 */
const weightCell = (r: LocationRow) =>
  r.maxWeightKg != null ? (
    `${r.maxWeightKg.toLocaleString()} kg`
  ) : r.rackMaxLoadKg != null ? (
    <span className="lp-weight-inherit">{r.rackMaxLoadKg.toLocaleString()} kg · 랙</span>
  ) : (
    "-"
  );

/** 보관 품목 칸 — 비었으면 "-", 한 품목이면 이름, 섞였으면 혼적 배지 + 이름들 */
const stockCell = (r: LocationRow) => {
  if (!r.skuCount) return <span className="lp-weight-inherit">-</span>;
  if (r.skuCount === 1) return <span className="lp-sku-names" title={r.skuNames ?? ""}>{r.skuNames}</span>;
  return (
    <span className="lp-sku-mixed" title={r.skuNames ?? ""}>
      <StatusBadge tone="warning">혼적 {r.skuCount}종</StatusBadge>
      <span className="lp-sku-names">{r.skuNames}</span>
    </span>
  );
};

/** 보관 상태 필터 — 혼적만 따로 볼 수 있게 (2026-09-22 현업 회의 9번) */
type StockFilter = "전체" | "empty" | "single" | "mixed";
const STOCK_FILTER_LABEL: Record<StockFilter, string> = { 전체: "전체", empty: "비어 있음", single: "한 품목", mixed: "혼적 (2종 이상)" };
const matchStockFilter = (r: LocationRow, filter: StockFilter) =>
  filter === "전체" || (filter === "empty" ? r.skuCount === 0 : filter === "single" ? r.skuCount === 1 : r.skuCount >= 2);

type ZoneOption = { id: number; code: string; name: string; warehouseName: string; warehouseId?: number | null; floor?: string | null; purpose?: string | null };

type Tab = "list" | "capa" | "layout";

const PAGE_SIZE = 50;

const TYPE_META: Record<string, { label: string; tone: "info" | "violet" | "danger" | "warning" | "teal" }> = {
  PICKING: { label: "피킹", tone: "info" },
  RESERVE: { label: "보충", tone: "violet" },
  CROSS_DOCK: { label: "직출", tone: "teal" },
  DEFECT: { label: "불량", tone: "danger" },
  DAMAGED: { label: "파손", tone: "warning" }
};
const TYPE_KEYS = Object.keys(TYPE_META);

export const InventoryLocationPage = () => {
  const [tab, setTab] = useState<Tab>("list");
  const [mapWarehouseId, setMapWarehouseId] = useState(4);
  const [layoutSummary, setLayoutSummary] = useState<LayoutSummaryRow[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ locationId: number; warehouseId: number; nonce: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selWarehouse, setSelWarehouse] = useState("전체");
  const [selType, setSelType] = useState("전체");
  const [selStock, setSelStock] = useState<StockFilter>("전체");
  const [keyword, setKeyword] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const [bulkType, setBulkType] = useState("PICKING");

  // 생성/수정 모달
  const [createOpen, setCreateOpen] = useState(false);
  const [newZone, setNewZone] = useState<number | "">("");
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState("PICKING");
  const [newMaxQty, setNewMaxQty] = useState<number | "">("");
  const [newMaxWeight, setNewMaxWeight] = useState<number | "">("");
  const [zoneRacks, setZoneRacks] = useState<LayoutRack[]>([]);
  const [newRackId, setNewRackId] = useState<number | "">("");
  const [newCell, setNewCell] = useState("");
  const [editTarget, setEditTarget] = useState<LocationRow | null>(null);
  const [editType, setEditType] = useState("PICKING");
  const [editStatus, setEditStatus] = useState("가용");
  const [editMaxQty, setEditMaxQty] = useState<number | "">("");
  const [editMaxWeight, setEditMaxWeight] = useState<number | "">("");
  const [editActive, setEditActive] = useState(true);
  const [labelTargets, setLabelTargets] = useState<LabelTarget[] | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<LocationRow[]>("/locations"),
      apiGet<ZoneOption[]>("/zones"),
      apiGet<LayoutSummaryRow[]>("/warehouse/layout-summary")
    ])
      .then(([l, z, s]) => { setRows(l); setZones(z); setLayoutSummary(s); })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // 등록 모달 — Zone 을 고르면 그 구역의 랙을 불러와 빈 칸을 고를 수 있게 한다
  useEffect(() => {
    setNewRackId("");
    setNewCell("");
    if (newZone === "") {
      setZoneRacks([]);
      return;
    }
    apiGet<LayoutRack[]>(`/racks?zoneId=${newZone}`).then(setZoneRacks).catch(() => setZoneRacks([]));
  }, [newZone]);

  const freeCells = useMemo(() => {
    const rack = zoneRacks.find((item) => item.id === newRackId);
    if (!rack) return [];
    const taken = new Set(rows.filter((r) => r.rackId === rack.id).map((r) => `${r.bay}:${r.level}`));
    const cells: string[] = [];
    for (let level = 1; level <= rack.levels; level += 1) {
      for (let bay = 1; bay <= rack.bays; bay += 1) {
        if (!taken.has(`${bay}:${level}`)) cells.push(`${bay}:${level}`);
      }
    }
    return cells;
  }, [zoneRacks, newRackId, rows]);

  const openIn3D = (r: LocationRow) => {
    const warehouseId = r.warehouseId ?? mapWarehouseId;
    setMapWarehouseId(warehouseId);
    setFocusRequest({ locationId: r.id, warehouseId, nonce: Date.now() });
    setTab("capa");
  };

  const openLayoutFor = (r: LocationRow) => {
    if (r.warehouseId) setMapWarehouseId(r.warehouseId);
    setNotice(`배치 탭 왼쪽 "미배치 로케이션"에서 ${r.code} 를 찾아 랙 칸에 놓으세요.`);
    setTab("layout");
  };

  const warehouses = useMemo(() => ["전체", ...Array.from(new Set(rows.map((r) => r.warehouseName)))], [rows]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (selWarehouse !== "전체" && r.warehouseName !== selWarehouse) return false;
      if (selType !== "전체" && r.locationType !== selType) return false;
      if (!matchStockFilter(r, selStock)) return false;
      // 품목 이름으로도 찾는다 — "이 품목이 어느 칸에 있나"
      if (kw && !`${r.code} ${r.zoneName} ${r.skuNames ?? ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [rows, selWarehouse, selType, selStock, keyword]);

  const summary = useMemo(() => {
    const by = (t: string) => rows.filter((r) => r.locationType === t).length;
    return {
      total: rows.length,
      picking: by("PICKING"),
      reserve: by("RESERVE"),
      bad: by("DEFECT") + by("DAMAGED"),
      mixed: rows.filter((r) => r.skuCount >= 2).length,
      unplaced: rows.filter((r) => !r.placement).length
    };
  }, [rows]);

  useEffect(() => setPage(1), [selWarehouse, selType, selStock, keyword]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleCheck = (id: number) =>
    setChecked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allVisibleChecked = pageRows.length > 0 && pageRows.every((r) => checked.includes(r.id));
  const toggleAll = () =>
    setChecked(allVisibleChecked ? checked.filter((id) => !pageRows.some((r) => r.id === id)) : Array.from(new Set([...checked, ...pageRows.map((r) => r.id)])));

  const doCreate = async () => {
    if (newZone === "" || !newCode.trim()) { setNotice("Zone과 코드를 입력하세요."); return; }
    setBusy(true);
    try {
      const [bay, level] = newCell ? newCell.split(":").map(Number) : [null, null];
      await apiPost("/locations", {
        zoneId: newZone,
        code: newCode.trim(),
        locationType: newType,
        maxQty: newMaxQty === "" ? null : newMaxQty,
        maxWeightKg: newMaxWeight === "" ? null : newMaxWeight,
        // 배치를 고르면 3D 에 바로 나타나고, 비워 두면 배치 탭의 미배치 트레이로 간다
        ...(newRackId !== "" && newCell ? { rackId: newRackId, bay, level } : {})
      });
      setNotice(`로케이션 ${newCode} 생성 완료${newRackId !== "" && newCell ? " — 3D 에 바로 나타납니다" : " — 미배치 상태입니다 (배치 탭에서 랙 칸에 놓으세요)"}`);
      setCreateOpen(false);
      setNewCode(""); setNewMaxQty(""); setNewMaxWeight(""); setNewRackId(""); setNewCell("");
      await load();
      setReloadKey((key) => key + 1);
    } catch (e) { setNotice(e instanceof Error ? e.message : "생성 실패"); }
    finally { setBusy(false); }
  };

  const openEdit = (r: LocationRow) => {
    setEditTarget(r);
    setEditType(r.locationType);
    setEditStatus(r.status);
    setEditMaxQty(r.maxQty ?? "");
    setEditMaxWeight(r.maxWeightKg ?? "");
    setEditActive(r.active);
  };

  const doUpdate = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      await apiPut(`/locations/${editTarget.id}`, {
        locationType: editType,
        status: editStatus,
        maxQty: editMaxQty === "" ? null : editMaxQty,
        maxWeightKg: editMaxWeight === "" ? null : editMaxWeight,
        active: editActive
      });
      setNotice(`${editTarget.code} 수정 완료`);
      setEditTarget(null);
      await load();
      setReloadKey((key) => key + 1);
    } catch (e) { setNotice(e instanceof Error ? e.message : "수정 실패"); }
    finally { setBusy(false); }
  };

  const doDelete = async (r: LocationRow) => {
    setBusy(true);
    try {
      await apiDelete(`/locations/${r.id}`);
      setNotice(`${r.code} 삭제 완료${r.placement ? ` — 3D 의 ${r.placement} 칸이 비었습니다` : ""}`);
      setEditTarget(null);
      await load();
      setReloadKey((key) => key + 1);
    } catch (e) { setNotice(e instanceof Error ? e.message : "삭제 실패"); }
    finally { setBusy(false); }
  };

  const doBulk = async () => {
    if (checked.length === 0) { setNotice("일괄변경할 로케이션을 선택하세요."); return; }
    setBusy(true);
    try {
      await apiPost("/locations/bulk-type", { ids: checked, locationType: bulkType });
      setNotice(`${checked.length}개 로케이션을 ${TYPE_META[bulkType].label}(으)로 일괄변경했습니다.`);
      setChecked([]);
      await load();
      setReloadKey((key) => key + 1);
    } catch (e) { setNotice(e instanceof Error ? e.message : "일괄변경 실패"); }
    finally { setBusy(false); }
  };

  const exportCsv = () =>
    downloadCsv(
      `로케이션_${new Date().toISOString().slice(0, 10)}`,
      ["창고", "Zone", "로케이션코드", "유형", "상태", "배치", "적재한도", "최대무게(kg)", "최대무게 기준", "파레트규격", "재고건수", "품목 수", "보관 품목", "사용여부"],
      filtered.map((r) => [
        r.warehouseName,
        r.zoneName,
        r.code,
        TYPE_META[r.locationType]?.label ?? r.locationType,
        r.status,
        r.placement ?? "미배치",
        r.maxQty ?? "",
        r.maxWeightKg ?? r.rackMaxLoadKg ?? "",
        r.maxWeightKg != null ? "로케이션" : r.rackMaxLoadKg != null ? "랙" : "",
        r.palletSpec ?? "",
        r.stockCount,
        r.skuCount,
        r.skuNames ?? "",
        r.active ? "사용" : "미사용"
      ])
    );

  const tabs: Array<{ key: Tab; label: string; icon: string; badge?: string }> = [
    { key: "list", label: "목록", icon: "menu", badge: String(summary.total) },
    { key: "capa", label: "CAPA", icon: "cube3d" },
    { key: "layout", label: "배치", icon: "edit", badge: summary.unplaced ? `미배치 ${summary.unplaced}` : undefined }
  ];

  return (
    <section className="outbound-page lp-page">
      <header className="app-surface lp-head">
        <div>
          <h2>로케이션 관리</h2>
          <p>
            {tab === "list"
              ? "로케이션이 있는지는 여기서 정합니다. 추가·삭제하면 3D 에 바로 반영됩니다."
              : tab === "capa"
                ? "구역별 파레트 자리 점유·가용을 3D 와 표로 봅니다."
                : "장소(보관 구역 · 입고장 · 출고장 · 사무실)와 랙이 어디에 어떤 모양으로 놓였는지 정합니다. 편집은 초안에 쌓이고 게시해야 운영에 반영됩니다."}
          </p>
        </div>
        <div className="lp-tabs" role="tablist" aria-label="로케이션 관리 보기">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={`lp-tab${tab === item.key ? " is-on" : ""}`}
              onClick={() => {
                if (item.key === "list" && tab !== "list") load();
                setTab(item.key);
              }}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
              {item.badge ? <small>{item.badge}</small> : null}
            </button>
          ))}
        </div>
      </header>

      {tab === "capa" ? (
        <LocationCapaView
          warehouseId={mapWarehouseId}
          onWarehouseChange={setMapWarehouseId}
          focusRequest={focusRequest}
          onEditLayout={() => setTab("layout")}
          reloadKey={reloadKey}
        />
      ) : null}

      {tab === "layout" ? (
        // 폰에서는 편집기가 캔버스 대신 목록 · 속성값 화면으로 바뀐다 (LayoutEditor 안에서 갈라진다)
        <LayoutEditor
          warehouseId={mapWarehouseId}
          onWarehouseChange={setMapWarehouseId}
          summary={layoutSummary}
          onPublished={() => {
            load();
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      {tab === "list" ? (
      <>
      <section className="outbound-summary-grid" aria-label="로케이션 요약">
        <article className="app-surface outbound-summary-card"><span>전체 로케이션</span><strong>{summary.total}개</strong></article>
        <article className="app-surface outbound-summary-card"><span>피킹</span><strong>{summary.picking}개</strong></article>
        <article className="app-surface outbound-summary-card"><span>보충</span><strong>{summary.reserve}개</strong></article>
        <article className="app-surface outbound-summary-card"><span>불량/파손</span><strong>{summary.bad}개</strong></article>
        {/* 혼적 — 누르면 혼적만 (다시 누르면 전체) */}
        <button
          type="button"
          className={`app-surface outbound-summary-card lp-mix-card${selStock === "mixed" ? " is-on" : ""}${summary.mixed ? " has-mixed" : ""}`}
          onClick={() => setSelStock((cur) => (cur === "mixed" ? "전체" : "mixed"))}
          aria-pressed={selStock === "mixed"}
          title={selStock === "mixed" ? "전체 보기" : "품목이 2종 이상 섞인 로케이션만 보기"}
        >
          <span>혼적 (2종 이상)</span>
          <strong>{summary.mixed}개</strong>
        </button>
      </section>

      <DashboardCard className="outbound-filter-card" title="로케이션 관리">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색 (코드/Zone/품목)</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="로케이션 코드 / Zone / 품목명" />
          </label>
          <label>
            <span>창고</span>
            <select value={selWarehouse} onChange={(e) => setSelWarehouse(e.target.value)}>
              {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label>
            <span>유형</span>
            <select value={selType} onChange={(e) => setSelType(e.target.value)}>
              <option value="전체">전체</option>
              {TYPE_KEYS.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
            </select>
          </label>
          <label>
            <span>보관</span>
            <select value={selStock} onChange={(e) => setSelStock(e.target.value as StockFilter)}>
              {(Object.keys(STOCK_FILTER_LABEL) as StockFilter[]).map((key) => (
                <option key={key} value={key}>{STOCK_FILTER_LABEL[key]}</option>
              ))}
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>엑셀</button>
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>+ 로케이션 등록</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`로케이션 목록 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? "체크 후 상태(유형)를 일괄변경하거나 QR 라벨을 출력하세요. 개별 변경은 행의 수정 버튼으로 합니다."}</p>
          <div className="outbound-expand-actions">
            <button
              type="button"
              className="btn-secondary lp-label-btn"
              disabled={checked.length === 0}
              onClick={() => setLabelTargets(rows.filter((r) => checked.includes(r.id)).map(toLabelTarget))}
              title="선택한 로케이션의 QR 라벨을 인쇄합니다 (라벨 프린터 · A4 라벨지)"
            >
              <Icon name="printer" size={14} />
              선택 {checked.length}건 QR 라벨
            </button>
            <select value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
              {TYPE_KEYS.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
            </select>
            <button type="button" className="btn-secondary" disabled={busy || checked.length === 0} onClick={doBulk}>
              선택 {checked.length}건 상태 일괄변경
            </button>
          </div>
        </div>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>
        ) : null}
        <ResponsiveTable>
          <table className="outbound-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={allVisibleChecked} onChange={toggleAll} aria-label="전체 선택" /></th>
                <th className="rt-title">로케이션코드</th>
                <th>창고</th>
                <th>Zone</th>
                <th>유형</th>
                <th>상태</th>
                <th>배치 (랙·연·단)</th>
                <th className="num">적재한도</th>
                <th className="num">최대 무게</th>
                <th className="num">재고건수</th>
                <th>보관 품목</th>
                <th>사용여부</th>
                <th className="rt-actions" style={{ textAlign: "right" }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={13} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>조건에 맞는 로케이션이 없습니다.</td></tr>
              ) : (
                pageRows.map((r) => {
                  const meta = TYPE_META[r.locationType];
                  return (
                    <tr key={r.id}>
                      <td><input type="checkbox" checked={checked.includes(r.id)} onChange={() => toggleCheck(r.id)} aria-label={`${r.code} 선택`} /></td>
                      <td><b>{r.code}</b></td>
                      <td>{r.warehouseName}</td>
                      <td>{r.zoneName}</td>
                      <td>{meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : r.locationType}</td>
                      <td>{r.status}</td>
                      <td>{r.placement ? <span className="lp-placement">{r.placement}</span> : <StatusBadge tone="warning">미배치</StatusBadge>}</td>
                      <td className="num">{r.maxQty != null ? r.maxQty.toLocaleString() : "-"}</td>
                      <td className="num">{weightCell(r)}</td>
                      <td className="num">{r.stockCount}</td>
                      <td className="lp-sku-cell">{stockCell(r)}</td>
                      <td>{r.active ? <StatusBadge tone="success">사용</StatusBadge> : <StatusBadge tone="gray">미사용</StatusBadge>}</td>
                      <td>
                        <div className="lp-row-actions">
                          {r.placement ? (
                            <button type="button" className="lp-link" onClick={() => openIn3D(r)} title="CAPA 탭 3D 에서 이 칸으로 이동">
                              <Icon name="cube3d" size={13} />
                              3D
                            </button>
                          ) : (
                            <button type="button" className="lp-link is-warn" onClick={() => openLayoutFor(r)} title="배치 탭에서 랙 칸에 놓기">
                              <Icon name="edit" size={13} />
                              배치
                            </button>
                          )}
                          <button type="button" className="btn-secondary" onClick={() => openEdit(r)}>수정</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ResponsiveTable>
        {filtered.length > PAGE_SIZE ? (
          <div className="lp-pager">
            <span>
              <b>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}</b> / {filtered.length}
            </span>
            <button type="button" onClick={() => setPage(1)} disabled={page === 1}>처음</button>
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>이전</button>
            <span>{page} / {pageCount}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>다음</button>
            <button type="button" onClick={() => setPage(pageCount)} disabled={page === pageCount}>끝</button>
          </div>
        ) : null}
      </DashboardCard>
      </>
      ) : null}

      {/* 생성 모달 */}
      <Modal
        open={createOpen}
        title="로케이션 등록"
        desc="Zone에 새 로케이션을 추가합니다."
        icon="warehouse"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doCreate}>등록</button>
          </>
        }
      >
        <label className="ds-field">
          <span>Zone</span>
          <select value={newZone} onChange={(e) => setNewZone(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">Zone 선택</option>
            {/* 로케이션은 보관 구역에만 — 사무실 · 입고장 · 출고장 같은 바닥 공간은 고르지 않는다 (유형 없는 예전 Zone 은 그대로) */}
            {zones.filter((z) => !z.purpose || zoneHoldsRacks({ purpose: z.purpose })).map((z) => <option key={z.id} value={z.id}>{z.warehouseName} · {z.name} ({z.code})</option>)}
          </select>
        </label>
        <label className="ds-field" style={{ marginTop: 10 }}>
          <span>로케이션 코드</span>
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="예: PC-A-03" />
        </label>
        <label className="ds-field" style={{ marginTop: 10 }}>
          <span>유형</span>
          <select value={newType} onChange={(e) => setNewType(e.target.value)}>
            {TYPE_KEYS.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
          </select>
        </label>
        <div className="lp-place-grid" style={{ marginTop: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <label className="ds-field">
            <span>적재한도 (선택)</span>
            <input type="number" min={0} value={newMaxQty} onChange={(e) => setNewMaxQty(e.target.value === "" ? "" : Number(e.target.value))} placeholder="예: 500" />
          </label>
          <label className="ds-field">
            <span>최대 무게 kg (선택)</span>
            <input
              type="number"
              min={1}
              value={newMaxWeight}
              onChange={(e) => setNewMaxWeight(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={(() => {
                const rack = zoneRacks.find((item) => item.id === newRackId);
                return rack?.maxLoadKg != null ? `비우면 랙 기준 ${rack.maxLoadKg.toLocaleString()}` : "비우면 랙 기준";
              })()}
            />
          </label>
        </div>
        <div className="lp-place-grid" style={{ marginTop: 10 }}>
          <label className="ds-field">
            <span>배치 — 랙 (선택)</span>
            <select
              value={newRackId}
              disabled={newZone === "" || zoneRacks.length === 0}
              onChange={(e) => { setNewRackId(e.target.value === "" ? "" : Number(e.target.value)); setNewCell(""); }}
            >
              <option value="">{newZone === "" ? "Zone 먼저 선택" : zoneRacks.length ? "미배치로 등록" : "이 Zone 에 랙 없음"}</option>
              {zoneRacks.map((rack) => <option key={rack.id} value={rack.id}>{rack.code} ({rack.bays}연×{rack.levels}단)</option>)}
            </select>
          </label>
          <label className="ds-field" style={{ gridColumn: "span 2" }}>
            <span>빈 칸 (연·단)</span>
            <select value={newCell} disabled={newRackId === ""} onChange={(e) => setNewCell(e.target.value)}>
              <option value="">{newRackId === "" ? "-" : freeCells.length ? `칸 선택 (빈 칸 ${freeCells.length})` : "빈 칸 없음"}</option>
              {freeCells.map((cell) => {
                const [bay, level] = cell.split(":");
                return <option key={cell} value={cell}>{bay}연 {level}단</option>;
              })}
            </select>
          </label>
        </div>
        <p className="lp-hint">
          칸을 고르면 3D 에 바로 나타납니다. 비워 두면 <b>미배치</b>로 등록되고, 배치 탭 왼쪽 트레이에서 나중에 칸에 놓을 수 있습니다.
        </p>
      </Modal>

      {/* 수정 모달 */}
      <Modal
        open={editTarget !== null}
        title="로케이션 수정"
        desc={editTarget ? `${editTarget.code} · ${editTarget.warehouseName}` : ""}
        icon="warehouse"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setEditTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginRight: "auto", color: "var(--c-danger)" }}
              disabled={busy || (editTarget?.stockCount ?? 0) > 0}
              title={(editTarget?.stockCount ?? 0) > 0 ? "재고가 있어 삭제 불가" : undefined}
              onClick={() => editTarget && doDelete(editTarget)}
            >
              삭제
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doUpdate}>저장</button>
          </>
        }
      >
        <label className="ds-field">
          <span>유형</span>
          <select value={editType} onChange={(e) => setEditType(e.target.value)}>
            {TYPE_KEYS.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
          </select>
        </label>
        <label className="ds-field" style={{ marginTop: 10 }}>
          <span>상태</span>
          <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
            {["가용", "사용", "만재", "점검", "차단"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="lp-place-grid" style={{ marginTop: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <label className="ds-field">
            <span>적재한도</span>
            <input type="number" min={0} value={editMaxQty} onChange={(e) => setEditMaxQty(e.target.value === "" ? "" : Number(e.target.value))} />
          </label>
          <label className="ds-field">
            <span>최대 무게 kg</span>
            <input
              type="number"
              min={1}
              value={editMaxWeight}
              onChange={(e) => setEditMaxWeight(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={editTarget?.rackMaxLoadKg != null ? `비우면 랙 기준 ${editTarget.rackMaxLoadKg.toLocaleString()}` : "비우면 제한 없음"}
            />
          </label>
        </div>
        <p className="lp-hint">최대 무게는 이 칸에만 따로 적용합니다 — 맨 윗단처럼 랙 기준보다 낮춰야 할 때 쓰세요. 이동·보충·격납 때 넘으면 막힙니다.</p>
        <label className="ds-field" style={{ marginTop: 10 }}>
          <span>사용여부</span>
          <select value={editActive ? "1" : "0"} onChange={(e) => setEditActive(e.target.value === "1")}>
            <option value="1">사용</option>
            <option value="0">미사용</option>
          </select>
        </label>
        <p className="lp-hint">
          배치: <b>{editTarget?.placement ?? "미배치"}</b> — 칸을 옮기려면 배치 탭에서 편집 후 게시하세요.
          {(editTarget?.stockCount ?? 0) > 0 ? " 재고가 있어 삭제할 수 없습니다." : ""}
        </p>
      </Modal>

      <LocationLabelDialog targets={labelTargets} title="로케이션 목록에서 선택" onClose={() => setLabelTargets(null)} />
    </section>
  );
};

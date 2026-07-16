import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { apiGet, apiPost, apiPut, apiDelete } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

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
  stockCount: number;
};

type ZoneOption = { id: number; code: string; name: string; warehouseName: string };

const TYPE_META: Record<string, { label: string; tone: "info" | "violet" | "danger" | "warning" | "teal" }> = {
  PICKING: { label: "피킹", tone: "info" },
  RESERVE: { label: "보충", tone: "violet" },
  CROSS_DOCK: { label: "직출", tone: "teal" },
  DEFECT: { label: "불량", tone: "danger" },
  DAMAGED: { label: "파손", tone: "warning" }
};
const TYPE_KEYS = Object.keys(TYPE_META);

export const InventoryLocationPage = () => {
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selWarehouse, setSelWarehouse] = useState("전체");
  const [selType, setSelType] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const [bulkType, setBulkType] = useState("PICKING");

  // 생성/수정 모달
  const [createOpen, setCreateOpen] = useState(false);
  const [newZone, setNewZone] = useState<number | "">("");
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState("PICKING");
  const [newMaxQty, setNewMaxQty] = useState<number | "">("");
  const [editTarget, setEditTarget] = useState<LocationRow | null>(null);
  const [editType, setEditType] = useState("PICKING");
  const [editStatus, setEditStatus] = useState("가용");
  const [editMaxQty, setEditMaxQty] = useState<number | "">("");
  const [editActive, setEditActive] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([apiGet<LocationRow[]>("/locations"), apiGet<ZoneOption[]>("/zones")])
      .then(([l, z]) => { setRows(l); setZones(z); })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const warehouses = useMemo(() => ["전체", ...Array.from(new Set(rows.map((r) => r.warehouseName)))], [rows]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (selWarehouse !== "전체" && r.warehouseName !== selWarehouse) return false;
      if (selType !== "전체" && r.locationType !== selType) return false;
      if (kw && !`${r.code} ${r.zoneName}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [rows, selWarehouse, selType, keyword]);

  const summary = useMemo(() => {
    const by = (t: string) => rows.filter((r) => r.locationType === t).length;
    return { total: rows.length, picking: by("PICKING"), reserve: by("RESERVE"), bad: by("DEFECT") + by("DAMAGED") };
  }, [rows]);

  const toggleCheck = (id: number) =>
    setChecked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allVisibleChecked = filtered.length > 0 && filtered.every((r) => checked.includes(r.id));
  const toggleAll = () =>
    setChecked(allVisibleChecked ? [] : filtered.map((r) => r.id));

  const doCreate = async () => {
    if (newZone === "" || !newCode.trim()) { setNotice("Zone과 코드를 입력하세요."); return; }
    setBusy(true);
    try {
      await apiPost("/locations", { zoneId: newZone, code: newCode.trim(), locationType: newType, maxQty: newMaxQty === "" ? null : newMaxQty });
      setNotice(`로케이션 ${newCode} 생성 완료`);
      setCreateOpen(false);
      setNewCode(""); setNewMaxQty("");
      await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "생성 실패"); }
    finally { setBusy(false); }
  };

  const openEdit = (r: LocationRow) => {
    setEditTarget(r);
    setEditType(r.locationType);
    setEditStatus(r.status);
    setEditMaxQty(r.maxQty ?? "");
    setEditActive(r.active);
  };

  const doUpdate = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      await apiPut(`/locations/${editTarget.id}`, { locationType: editType, status: editStatus, maxQty: editMaxQty === "" ? null : editMaxQty, active: editActive });
      setNotice(`${editTarget.code} 수정 완료`);
      setEditTarget(null);
      await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "수정 실패"); }
    finally { setBusy(false); }
  };

  const doDelete = async (r: LocationRow) => {
    setBusy(true);
    try {
      await apiDelete(`/locations/${r.id}`);
      setNotice(`${r.code} 삭제 완료`);
      setEditTarget(null);
      await load();
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
    } catch (e) { setNotice(e instanceof Error ? e.message : "일괄변경 실패"); }
    finally { setBusy(false); }
  };

  const exportCsv = () =>
    downloadCsv(
      `로케이션_${new Date().toISOString().slice(0, 10)}`,
      ["창고", "Zone", "로케이션코드", "유형", "상태", "적재한도", "재고건수", "사용여부"],
      filtered.map((r) => [r.warehouseName, r.zoneName, r.code, TYPE_META[r.locationType]?.label ?? r.locationType, r.status, r.maxQty ?? "", r.stockCount, r.active ? "사용" : "미사용"])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="로케이션 요약">
        <article className="app-surface outbound-summary-card"><span>전체 로케이션</span><strong>{summary.total}개</strong></article>
        <article className="app-surface outbound-summary-card"><span>피킹</span><strong>{summary.picking}개</strong></article>
        <article className="app-surface outbound-summary-card"><span>보충</span><strong>{summary.reserve}개</strong></article>
        <article className="app-surface outbound-summary-card"><span>불량/파손</span><strong>{summary.bad}개</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="로케이션 관리">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색 (코드/Zone)</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="로케이션 코드 / Zone" />
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
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>엑셀</button>
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>+ 로케이션 등록</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`로케이션 목록 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? "체크 후 하단에서 상태(유형)를 일괄변경하거나, 행의 수정 버튼으로 개별 변경하세요."}</p>
          <div className="outbound-expand-actions">
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
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={allVisibleChecked} onChange={toggleAll} aria-label="전체 선택" /></th>
                <th>로케이션코드</th>
                <th>창고</th>
                <th>Zone</th>
                <th>유형</th>
                <th>상태</th>
                <th className="num">적재한도</th>
                <th className="num">재고건수</th>
                <th>사용여부</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>조건에 맞는 로케이션이 없습니다.</td></tr>
              ) : (
                filtered.map((r) => {
                  const meta = TYPE_META[r.locationType];
                  return (
                    <tr key={r.id}>
                      <td><input type="checkbox" checked={checked.includes(r.id)} onChange={() => toggleCheck(r.id)} aria-label={`${r.code} 선택`} /></td>
                      <td><b>{r.code}</b></td>
                      <td>{r.warehouseName}</td>
                      <td>{r.zoneName}</td>
                      <td>{meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : r.locationType}</td>
                      <td>{r.status}</td>
                      <td className="num">{r.maxQty != null ? r.maxQty.toLocaleString() : "-"}</td>
                      <td className="num">{r.stockCount}</td>
                      <td>{r.active ? <StatusBadge tone="success">사용</StatusBadge> : <StatusBadge tone="gray">미사용</StatusBadge>}</td>
                      <td>
                        <div className="outbound-row-actions">
                          <button type="button" className="btn-secondary" onClick={() => openEdit(r)}>수정</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

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
            {zones.map((z) => <option key={z.id} value={z.id}>{z.warehouseName} · {z.name} ({z.code})</option>)}
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
        <label className="ds-field" style={{ marginTop: 10 }}>
          <span>적재한도 (선택)</span>
          <input type="number" min={0} value={newMaxQty} onChange={(e) => setNewMaxQty(e.target.value === "" ? "" : Number(e.target.value))} placeholder="예: 500" />
        </label>
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
        <label className="ds-field" style={{ marginTop: 10 }}>
          <span>적재한도</span>
          <input type="number" min={0} value={editMaxQty} onChange={(e) => setEditMaxQty(e.target.value === "" ? "" : Number(e.target.value))} />
        </label>
        <label className="ds-field" style={{ marginTop: 10 }}>
          <span>사용여부</span>
          <select value={editActive ? "1" : "0"} onChange={(e) => setEditActive(e.target.value === "1")}>
            <option value="1">사용</option>
            <option value="0">미사용</option>
          </select>
        </label>
      </Modal>
    </section>
  );
};

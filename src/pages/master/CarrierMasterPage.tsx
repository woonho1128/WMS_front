import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { apiGet, apiPost, apiPut, apiDelete } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type Carrier = {
  id: number;
  code: string;
  name: string;
  region: string;       // 수도권/지방권/전국
  manager: string | null;
  phone: string | null;
  accountUser: string | null;
  portalRole: string;   // 조회/배차공유
  active: boolean;
};

const REGIONS = ["수도권", "지방권", "전국"];
const ROLES = ["조회", "배차공유"];
const regionTone = (r: string): "info" | "violet" | "gray" => (r === "수도권" ? "info" : r === "지방권" ? "violet" : "gray");

const emptyForm = { code: "", name: "", region: "전국", manager: "", phone: "", accountUser: "", portalRole: "조회", active: true };

export const CarrierMasterPage = () => {
  const [rows, setRows] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<Carrier[]>("/carriers")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((r) => `${r.code} ${r.name} ${r.manager ?? ""}`.toLowerCase().includes(kw));
  }, [rows, keyword]);

  const openCreate = () => { setEditId(null); setForm({ ...emptyForm }); setModalOpen(true); };
  const openEdit = (c: Carrier) => {
    setEditId(c.id);
    setForm({ code: c.code, name: c.name, region: c.region, manager: c.manager ?? "", phone: c.phone ?? "", accountUser: c.accountUser ?? "", portalRole: c.portalRole, active: c.active });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) { setNotice("코드와 배송사명을 입력하세요."); return; }
    setBusy(true);
    try {
      if (editId == null) await apiPost("/carriers", form);
      else await apiPut(`/carriers/${editId}`, form);
      setNotice(`배송사 ${form.name} ${editId == null ? "등록" : "수정"} 완료`);
      setModalOpen(false);
      load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "저장 실패"); }
    finally { setBusy(false); }
  };

  const remove = async (c: Carrier) => {
    setBusy(true);
    try {
      await apiDelete(`/carriers/${c.id}`);
      setNotice(`${c.name} 삭제 완료`);
      setModalOpen(false);
      load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "삭제 실패"); }
    finally { setBusy(false); }
  };

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="배송사 요약">
        <article className="app-surface outbound-summary-card"><span>전체 배송사</span><strong>{rows.length}곳</strong></article>
        <article className="app-surface outbound-summary-card"><span>수도권</span><strong>{rows.filter((r) => r.region === "수도권").length}곳</strong></article>
        <article className="app-surface outbound-summary-card"><span>지방권</span><strong>{rows.filter((r) => r.region === "지방권").length}곳</strong></article>
        <article className="app-surface outbound-summary-card"><span>사용중</span><strong>{rows.filter((r) => r.active).length}곳</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="배송사 관리">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색 (코드/명/담당자)</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="검색어 입력" />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-primary" onClick={openCreate}>+ 배송사 등록</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`배송사 목록 (${filtered.length}곳)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? "배송사를 등록·수정·삭제하고, 권역과 포털 계정 권한을 관리합니다."}</p>
        </div>
        {error ? (<div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr><th>코드</th><th>배송사명</th><th>권역</th><th>담당자</th><th>연락처</th><th>포털계정</th><th>권한</th><th>사용</th><th>작업</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>배송사가 없습니다.</td></tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.code}</b></td>
                    <td>{c.name}</td>
                    <td><StatusBadge tone={regionTone(c.region)}>{c.region}</StatusBadge></td>
                    <td>{c.manager ?? "-"}</td>
                    <td>{c.phone ?? "-"}</td>
                    <td>{c.accountUser ?? "-"}</td>
                    <td>{c.portalRole}</td>
                    <td>{c.active ? <StatusBadge tone="success">사용</StatusBadge> : <StatusBadge tone="gray">미사용</StatusBadge>}</td>
                    <td><div className="outbound-row-actions"><button type="button" className="btn-secondary" onClick={() => openEdit(c)}>수정</button></div></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <Modal
        open={modalOpen}
        title={editId == null ? "배송사 등록" : "배송사 수정"}
        desc={editId == null ? "새 배송사를 등록합니다." : form.name}
        icon="warehouse"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            {editId != null ? (
              <button type="button" className="btn-secondary" style={{ marginRight: "auto", color: "var(--c-danger)" }} disabled={busy} onClick={() => { const c = rows.find((x) => x.id === editId); if (c) remove(c); }}>삭제</button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={save}>저장</button>
          </>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label className="ds-field"><span>코드</span><input value={form.code} disabled={editId != null} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="예: CJ" /></label>
          <label className="ds-field"><span>배송사명</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: CJ대한통운" /></label>
          <label className="ds-field"><span>권역</span><select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          <label className="ds-field"><span>담당자</span><input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} /></label>
          <label className="ds-field"><span>연락처</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="ds-field"><span>포털 계정</span><input value={form.accountUser} onChange={(e) => setForm({ ...form, accountUser: e.target.value })} placeholder="예: carrier_cj" /></label>
          <label className="ds-field"><span>계정 권한</span><select value={form.portalRole} onChange={(e) => setForm({ ...form, portalRole: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          <label className="ds-field"><span>사용여부</span><select value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}><option value="1">사용</option><option value="0">미사용</option></select></label>
        </div>
      </Modal>
    </section>
  );
};

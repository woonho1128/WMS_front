import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { apiGet, apiPost } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type Notice = {
  id: number;
  category: string;
  title: string;
  content: string | null;
  author: string | null;
  pinned: boolean;
  createdAt: string | null;
};

const CATEGORIES = ["공지", "업무협조", "시스템", "배송"];
const catTone = (c: string): "danger" | "info" | "violet" | "gray" =>
  c === "공지" ? "danger" : c === "업무협조" ? "info" : c === "배송" ? "violet" : "gray";

const fmt = (s: string | null) => (s ? s.replace("T", " ").slice(0, 16) : "-");

export const NoticePage = () => {
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [catFilter, setCatFilter] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState<Notice | null>(null);
  const [writeOpen, setWriteOpen] = useState(false);
  const [form, setForm] = useState({ category: "공지", title: "", content: "", pinned: false });

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<Notice[]>("/notices")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (catFilter !== "전체" && r.category !== catFilter) return false;
      if (kw && !`${r.title} ${r.content ?? ""} ${r.author ?? ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [rows, catFilter, keyword]);

  const save = async () => {
    if (!form.title.trim()) { setNotice("제목을 입력하세요."); return; }
    setBusy(true);
    try {
      await apiPost("/notices", form);
      setNotice("업무 연락 등록 완료");
      setWriteOpen(false);
      setForm({ category: "공지", title: "", content: "", pinned: false });
      load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "등록 실패"); }
    finally { setBusy(false); }
  };

  return (
    <section className="outbound-page">
      <DashboardCard className="outbound-filter-card" title="업무 연락 (DECO)">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색 (제목/내용/작성자)</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="검색어 입력" />
          </label>
          <label>
            <span>분류</span>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="전체">전체</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
            <button type="button" className="btn-primary" onClick={() => setWriteOpen(true)}>+ 업무 연락 작성</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`업무 연락 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? "제목을 클릭하면 상세 내용을 볼 수 있습니다."}</p>
        </div>
        {error ? (<div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(18080) 확인</span></div>) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr><th style={{ width: 90 }}>분류</th><th>제목</th><th style={{ width: 110 }}>작성자</th><th style={{ width: 140 }}>등록일</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>업무 연락이 없습니다.</td></tr>
              ) : (
                filtered.map((n) => (
                  <tr key={n.id} style={{ cursor: "pointer" }} onClick={() => setDetail(n)}>
                    <td><StatusBadge tone={catTone(n.category)}>{n.category}</StatusBadge></td>
                    <td>{n.pinned ? <b style={{ color: "var(--c-danger)" }}>📌 </b> : null}<b>{n.title}</b></td>
                    <td>{n.author ?? "-"}</td>
                    <td>{fmt(n.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <Modal
        open={detail !== null}
        title={detail?.title ?? ""}
        desc={detail ? `${detail.category} · ${detail.author ?? "-"} · ${fmt(detail.createdAt)}` : ""}
        icon="bell"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setDetail(null)}
        footer={<button type="button" className="btn-secondary" onClick={() => setDetail(null)}>닫기</button>}
      >
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 14 }}>{detail?.content ?? "(내용 없음)"}</p>
      </Modal>

      <Modal
        open={writeOpen}
        title="업무 연락 작성"
        desc="DECO 업무 연락을 등록합니다."
        icon="bell"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setWriteOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setWriteOpen(false)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={save}>등록</button>
          </>
        }
      >
        <label className="ds-field"><span>분류</span>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <label className="ds-field" style={{ marginTop: 10 }}><span>제목</span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="제목" />
        </label>
        <label className="ds-field" style={{ marginTop: 10 }}><span>내용</span>
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} placeholder="내용" style={{ resize: "vertical" }} />
        </label>
        <label className="ds-field" style={{ marginTop: 10 }}><span>상단 고정</span>
          <select value={form.pinned ? "1" : "0"} onChange={(e) => setForm({ ...form, pinned: e.target.value === "1" })}><option value="0">일반</option><option value="1">상단 고정</option></select>
        </label>
      </Modal>
    </section>
  );
};

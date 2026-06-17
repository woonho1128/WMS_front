import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { apiGet, apiPost } from "../../services/http";
import { RETURN_STATUS, type ReturnRow } from "./ReturnSchedulePage";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

/** 반품 확정 — 승인(반품재고 생성→격납대기) / 반려(사유 입력→영업담당자 알림) */
export const ReturnConfirmPage = () => {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"wait" | "done">("wait");
  const [keyword, setKeyword] = useState("");
  const [approveTarget, setApproveTarget] = useState<ReturnRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReturnRow | null>(null);
  const [rejectReason, setRejectReason] = useState("반품 기한 초과");
  const [rejectNote, setRejectNote] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<ReturnRow[]>("/returns")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "wait" ? r.status !== "received" : r.status === "received") return false;
      if (kw) {
        const hay = [r.returnNo, r.omsOrderNo, r.manager, r.customerName, r.itemCode]
          .map((v) => (v ?? "").toLowerCase());
        if (!hay.some((h) => h.includes(kw))) return false;
      }
      return true;
    });
  }, [rows, tab, keyword]);

  const summary = useMemo(
    () => ({
      received: rows.filter((r) => r.status === "received").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length
    }),
    [rows]
  );

  const doApprove = async () => {
    if (!approveTarget) return;
    setBusy(true);
    try {
      await apiPost(`/returns/${approveTarget.id}/approve`, {});
      setNotice(
        `${approveTarget.returnNo} 승인 — 반품재고(LOT-${approveTarget.returnNo})가 격납대기로 생성되었습니다. 재고관리 > 격납 대기에서 격납하세요.`
      );
      setApproveTarget(null);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "승인 실패");
      setApproveTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectNote.trim() ? `${rejectReason} · ${rejectNote.trim()}` : rejectReason;
    setBusy(true);
    try {
      await apiPost(`/returns/${rejectTarget.id}/reject`, { reason });
      setNotice(`${rejectTarget.returnNo} 반려 — 영업담당자(${rejectTarget.manager ?? "-"})에게 알림이 전송됩니다.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "반려 실패");
    } finally {
      setRejectTarget(null);
      setBusy(false);
      await load();
    }
  };

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="반품확정 요약">
        <article className="app-surface outbound-summary-card"><span>처리 대기</span><strong>{summary.received}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>승인(격납대기 생성)</span><strong>{summary.approved}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>반려(알림 발송)</span><strong>{summary.rejected}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="반품 확정 조회">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색 (오더번호/담당자)</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="반품번호 / OMS 오더번호 / 담당자 / 거래처"
            />
          </label>
          <label>
            <span>구분</span>
            <select value={tab} onChange={(e) => setTab(e.target.value as "wait" | "done")}>
              <option value="wait">처리 대기 (수신)</option>
              <option value="done">처리 완료 (승인/반려)</option>
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`${tab === "wait" ? "처리 대기" : "처리 완료"} 목록 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">
            {notice ?? "승인 시 반품재고가 격납대기로 생성되고, 반려 시 사유와 함께 영업담당자에게 알림이 전송됩니다."}
          </p>
        </div>
        {error ? (
          <div className="ds-callout danger" style={{ marginBottom: 12 }}>
            <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
          </div>
        ) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>반품번호</th>
                <th>거래처</th>
                <th>품목</th>
                <th className="num">수량</th>
                <th>반품사유</th>
                <th>담당자</th>
                <th>입고 위치</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>
                  {tab === "wait" ? "처리할 반품 오더가 없습니다." : "처리 완료된 반품이 없습니다."}
                </td></tr>
              ) : (
                filtered.map((r) => {
                  const st = RETURN_STATUS[r.status] ?? { label: r.status, tone: "gray" as const };
                  return (
                    <tr key={r.id}>
                      <td>{r.returnNo}</td>
                      <td>{`${r.customerCode ?? ""}${r.customerCode ? " / " : ""}${r.customerName ?? "-"}`}</td>
                      <td>{r.itemCode} · {r.itemName}</td>
                      <td className="num">{r.qty.toLocaleString()} {r.unit}</td>
                      <td>{r.reason ?? "-"}</td>
                      <td>{r.manager ?? "-"}</td>
                      <td>{r.warehouseName} / {r.locationCode ?? "-"}</td>
                      <td>
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                        {r.status === "rejected" && r.rejectReason ? (
                          <div className="cell-mut" style={{ fontSize: 12, marginTop: 2 }}>{r.rejectReason}</div>
                        ) : null}
                      </td>
                      <td>
                        <div className="outbound-row-actions">
                          {r.status === "received" ? (
                            <>
                              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setApproveTarget(r)}>승인</button>
                              <button type="button" className="btn-secondary outbound-reject-btn" disabled={busy} onClick={() => setRejectTarget(r)}>반려</button>
                            </>
                          ) : (
                            <span className="cell-mut">{r.processedAt ?? "처리됨"}</span>
                          )}
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

      <Modal
        open={approveTarget !== null}
        title="반품 승인"
        desc={approveTarget ? `${approveTarget.returnNo} · ${approveTarget.itemCode} ${approveTarget.qty.toLocaleString()}${approveTarget.unit}` : ""}
        icon="checkCircle"
        iconBg="var(--c-success-bg)"
        iconColor="var(--c-success)"
        onClose={() => setApproveTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setApproveTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doApprove}>승인</button>
          </>
        }
      >
        <div className="ds-callout info">
          <Icon name="check" size={18} />
          <span>승인 시 <b>반품재고가 격납대기 상태로 생성</b>됩니다 (LOT = LOT-반품번호). 격납 완료 시 가용재고로 전환됩니다.</span>
        </div>
      </Modal>

      <Modal
        open={rejectTarget !== null}
        title="반품 반려"
        desc={rejectTarget ? `${rejectTarget.returnNo} · 담당 ${rejectTarget.manager ?? "-"}` : ""}
        icon="ban"
        iconBg="var(--c-danger-bg)"
        iconColor="var(--c-danger)"
        onClose={() => setRejectTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setRejectTarget(null)}>취소</button>
            <button type="button" className="btn-primary" style={{ background: "var(--c-danger)", borderColor: "var(--c-danger)" }} onClick={doReject}>
              반려 확정
            </button>
          </>
        }
      >
        <div className="ds-callout danger" style={{ marginBottom: 14 }}>
          <Icon name="alert" size={18} />
          <span>반려 시 <b>영업담당자에게 알림</b>이 전송됩니다 (작업 알림: 반품반려).</span>
        </div>
        <label className="ds-field">
          <span>반려 사유</span>
          <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
            <option value="반품 기한 초과">반품 기한 초과</option>
            <option value="상품 상태 불량(고객 과실)">상품 상태 불량(고객 과실)</option>
            <option value="반품 대상 아님">반품 대상 아님</option>
            <option value="기타">기타</option>
          </select>
        </label>
        <label className="ds-field">
          <span>비고 (선택)</span>
          <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="상세 사유 입력" />
        </label>
      </Modal>
    </section>
  );
};

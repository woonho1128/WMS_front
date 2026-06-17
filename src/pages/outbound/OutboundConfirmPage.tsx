import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { OUTBOUND_STEPS, OUTBOUND_STATUS_TONE, type OutboundScreenStatus } from "../../domain/wmsProcess";
import { apiGet, apiPost, apiPut } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type OutboundRow = {
  id: number;
  outboundNo: string;
  scheduledDate: string | null;
  customerCode: string | null;
  customerName: string | null;
  outType: string | null;
  qty: number;
  carrier: string | null;
  shipAddress: string | null;
  invoiceNo: string | null;
  status: OutboundScreenStatus;
  rejectReason: string | null;
};

export const OutboundConfirmPage = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"wait" | "done" | "rejected">("wait");
  const [keyword, setKeyword] = useState("");
  const [rejectTarget, setRejectTarget] = useState<OutboundRow | null>(null);
  const [rejectReason, setRejectReason] = useState("재고부족");
  const [rejectNote, setRejectNote] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<OutboundRow | null>(null);

  const reload = () => {
    setLoading(true);
    return apiGet<OutboundRow[]>("/outbounds")
      .then(setRows)
      .catch((e) => setNotice(`불러오기 실패: ${e instanceof Error ? e.message : e} (백엔드 8080 확인)`))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const status: OutboundScreenStatus = tab === "wait" ? "피킹완료" : tab === "done" ? "출고완료" : "거부";
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.status !== status) return false;
      if (kw) {
        const hay = [r.outboundNo, r.customerCode, r.customerName, r.invoiceNo]
          .map((v) => (v ?? "").toLowerCase());
        if (!hay.some((h) => h.includes(kw))) return false;
      }
      return true;
    });
  }, [rows, tab, keyword]);

  const summary = useMemo(
    () => ({
      wait: rows.filter((r) => r.status === "피킹완료").length,
      done: rows.filter((r) => r.status === "출고완료").length,
      rejected: rows.filter((r) => r.status === "거부").length
    }),
    [rows]
  );

  const setRowInvoice = (id: number, invoiceNo: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, invoiceNo } : r)));

  const saveInvoice = async (id: number, invoiceNo: string) => {
    try {
      await apiPut(`/outbounds/${id}/invoice`, { invoiceNo });
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "송장 저장 실패");
    }
  };

  const doConfirm = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    try {
      await apiPost(`/outbounds/${confirmTarget.id}/confirm`, {});
      setNotice(`${confirmTarget.outboundNo} 출고확정 완료 — ERP I/F 자동전송(중계서버 출고결과) 대상입니다.`);
      setConfirmTarget(null);
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "출고확정 실패");
      setConfirmTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectNote.trim() ? `${rejectReason} · ${rejectNote.trim()}` : rejectReason;
    setBusy(true);
    try {
      await apiPost(`/outbounds/${rejectTarget.id}/reject`, { reason });
      setNotice(`${rejectTarget.outboundNo} 거부(예외처리) — OMS 거부값 회신: ${reason}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "거부 실패");
    } finally {
      setRejectTarget(null);
      setBusy(false);
      await reload();
    }
  };

  return (
    <section className="outbound-page">
      <ProcessBanner
        title="출고 확정 단계"
        steps={OUTBOUND_STEPS}
        current={2}
        note="피킹완료 건에 송장번호 입력 → 출고확정 시 ERP I/F 자동전송 · 실패/예외는 거부 처리"
      />

      <section className="outbound-summary-grid" aria-label="출고확정 요약">
        <article className="app-surface outbound-summary-card"><span>확정 대기(피킹완료)</span><strong>{summary.wait}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>출고완료</span><strong>{summary.done}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>거부(예외)</span><strong>{summary.rejected}건</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title="출고 확정 조회">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>검색</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="출하번호 / 납품처 / 송장번호"
            />
          </label>
          <label>
            <span>구분</span>
            <select value={tab} onChange={(e) => setTab(e.target.value as typeof tab)}>
              <option value="wait">확정 대기 (피킹완료)</option>
              <option value="done">출고완료</option>
              <option value="rejected">거부(예외)</option>
            </select>
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={reload}>새로고침</button>
            <button
              type="button"
              className="btn-secondary"
              title="ERP 전송 실패건 재전송은 이력관리 > 전체 로그 조회에서 처리합니다"
              onClick={() => navigate("/history/system-logs")}
            >
              ERP 재전송(로그)
            </button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`${tab === "wait" ? "확정 대기" : tab === "done" ? "출고완료" : "거부"} 목록 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">
            {notice ?? "송장번호 입력 후 출고확정하세요. 재고부족 등 예외는 거부 처리(OMS 회신)합니다."}
          </p>
        </div>
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>출하번호</th>
                <th>출고예정일</th>
                <th>납품처</th>
                <th className="num">수량</th>
                <th>운송정보</th>
                <th>송장번호</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>
                  {tab === "wait" ? "확정 대기 건이 없습니다. 피킹 작업을 먼저 완료하세요." : "데이터가 없습니다."}
                </td></tr>
              ) : (
                filtered.map((row) => {
                  const waiting = row.status === "피킹완료";
                  const needInvoice = waiting && !(row.invoiceNo ?? "").trim();
                  return (
                    <tr key={row.id}>
                      <td>{row.outboundNo}</td>
                      <td>{row.scheduledDate ?? "-"}</td>
                      <td>{`${row.customerCode ?? ""} / ${row.customerName ?? ""}`}</td>
                      <td className="num">{row.qty.toLocaleString()}</td>
                      <td>{row.carrier ?? "-"}</td>
                      <td>
                        {waiting ? (
                          <input
                            className={`invoice-input${needInvoice ? " is-required" : ""}`}
                            value={row.invoiceNo ?? ""}
                            onChange={(e) => setRowInvoice(row.id, e.target.value)}
                            onBlur={(e) => saveInvoice(row.id, e.target.value)}
                            placeholder="송장번호 입력 (필수)"
                          />
                        ) : (
                          <span className="cell-mut">{row.invoiceNo ?? "-"}</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge tone={OUTBOUND_STATUS_TONE[row.status]}>{row.status}</StatusBadge>
                        {row.status === "거부" && row.rejectReason ? (
                          <div className="cell-mut" style={{ fontSize: 12, marginTop: 2 }}>{row.rejectReason}</div>
                        ) : null}
                      </td>
                      <td>
                        <div className="outbound-row-actions">
                          {waiting ? (
                            <>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy || needInvoice}
                                title={needInvoice ? "송장번호를 먼저 입력하세요" : undefined}
                                onClick={() => setConfirmTarget(row)}
                              >
                                출고확정
                              </button>
                              <button type="button" className="btn-secondary outbound-reject-btn" onClick={() => setRejectTarget(row)}>
                                거부
                              </button>
                            </>
                          ) : (
                            <span className="cell-mut">처리 완료</span>
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
        open={confirmTarget !== null}
        title="출고확정"
        desc={confirmTarget ? `${confirmTarget.outboundNo} · 송장 ${confirmTarget.invoiceNo ?? "-"}` : ""}
        icon="checkCircle"
        iconBg="var(--c-success-bg)"
        iconColor="var(--c-success)"
        onClose={() => setConfirmTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doConfirm}>출고확정</button>
          </>
        }
      >
        <div className="ds-callout info">
          <Icon name="check" size={18} />
          <span>출고확정 시 <b>중계서버로 출고결과(ERP I/F)가 자동전송</b>됩니다. 부분출고 불가 — 전량 확정됩니다.</span>
        </div>
      </Modal>

      <Modal
        open={rejectTarget !== null}
        title="출고 거부 (예외처리)"
        desc={rejectTarget ? `${rejectTarget.outboundNo} · ${rejectTarget.customerName ?? ""}` : ""}
        icon="ban"
        iconBg="var(--c-danger-bg)"
        iconColor="var(--c-danger)"
        onClose={() => setRejectTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setRejectTarget(null)}>취소</button>
            <button type="button" className="btn-primary" style={{ background: "var(--c-danger)", borderColor: "var(--c-danger)" }} onClick={doReject}>
              거부 확정
            </button>
          </>
        }
      >
        <div className="ds-callout danger" style={{ marginBottom: 14 }}>
          <Icon name="alert" size={18} />
          <span>거부 시 OMS로 <b>거부값이 회신</b>되어 주문이 실패 처리됩니다. (부분출고 불가)</span>
        </div>
        <label className="ds-field">
          <span>거부 사유</span>
          <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
            <option value="재고부족">재고부족</option>
            <option value="주소 오류">주소 오류</option>
            <option value="품질 이슈">품질 이슈</option>
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

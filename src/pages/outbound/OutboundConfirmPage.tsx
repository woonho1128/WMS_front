import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { ProcessBanner } from "../../components/ui/ProcessBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable";
import { OUTBOUND_STEPS, OUTBOUND_STATUS_TONE, type OutboundScreenStatus } from "../../domain/wmsProcess";
import { apiGet, apiPost, apiPut } from "../../services/http";
import { PhotoCountLink, outboundPhotoPath } from "./PhotoCountLink";
import { HoldDialog, type HoldTarget } from "./HoldDialog";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용
import "./outboundDialogs.css";

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
  /** 보류(출고 불가 알림) 사유 */
  rejectReason: string | null;
  /** 출고 사진 장수 — 0 이면 확정할 때 경고만 (설계: 현장 작업을 막지 않는다) */
  photoCount: number;
  /** 확인을 기다리는 주문 변경 · 취소 — 있으면 확정하지 못하고 변경 확인 화면으로 */
  pendingChanges?: number;
};

/** 출고확정 결과 — notified: 주문 시스템에 알렸고, 주문 시스템이 ERP 까지 반영한 뒤 확정됐다 */
type ConfirmResult = { skippedLines: number; notified: boolean };

const CHANGE_REVIEW_PATH = "/outbound/change-review";

export const OutboundConfirmPage = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"wait" | "done" | "held">("wait");
  const [keyword, setKeyword] = useState("");
  const [holdTarget, setHoldTarget] = useState<HoldTarget | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<OutboundRow | null>(null);
  /** 주문 시스템 · ERP 가 받지 않은 사유 — 창을 닫지 않고 보인다 (출고는 피킹완료 그대로) */
  const [confirmError, setConfirmError] = useState<string | null>(null);

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
    const status: OutboundScreenStatus = tab === "wait" ? "피킹완료" : tab === "done" ? "출고완료" : "보류";
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
      held: rows.filter((r) => r.status === "보류").length
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

  const openConfirm = (row: OutboundRow) => {
    setConfirmError(null);
    setConfirmTarget(row);
  };

  /** 반영을 기다리는 동안에는 닫지 않는다 — 결과를 모른 채 창이 사라지지 않게 */
  const closeConfirm = () => {
    if (busy) return;
    setConfirmTarget(null);
    setConfirmError(null);
  };

  const doConfirm = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    setConfirmError(null);
    try {
      const result = await apiPost<ConfirmResult>(`/outbounds/${confirmTarget.id}/confirm`, {});
      const skipped = result?.skippedLines ?? 0;
      setNotice(
        `${confirmTarget.outboundNo} 출고확정 완료` +
          (result?.notified ? " — 주문 시스템 · ERP 에 반영했습니다." : ".") +
          (skipped > 0 ? ` 주의: 스킵 ${skipped}라인은 미출고로 남았습니다.` : "")
      );
      setConfirmTarget(null);
      await reload();
    } catch (e) {
      // 주문 시스템 · ERP 가 받지 않았다 — 출고는 피킹완료 그대로. 창에 사유를 두고 [다시 시도]
      setConfirmError(e instanceof Error ? e.message : "출고확정 실패");
    } finally {
      setBusy(false);
    }
  };

  /** 다시 출고 — 보류를 풀어 피킹완료(집어 둔 물건이 있으면) · 출고대기로 */
  const doResume = async (row: OutboundRow) => {
    setBusy(true);
    try {
      await apiPost(`/outbounds/${row.id}/resume`, {});
      setNotice(`${row.outboundNo} 보류를 풀었습니다 — 주문 시스템에 알리고 이어서 진행합니다.`);
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "다시 출고 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="outbound-page">
      <ProcessBanner
        title="출고 확정 단계"
        steps={OUTBOUND_STEPS}
        current={2}
        note="피킹완료 건에 송장번호 입력 → 출고확정 (주문 시스템 · ERP 반영까지 기다림) · 못 나가면 출고 불가 알림(보류)"
      />

      <section className="outbound-summary-grid" aria-label="출고확정 요약">
        <article className="app-surface outbound-summary-card"><span>확정 대기(피킹완료)</span><strong>{summary.wait}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>출고완료</span><strong>{summary.done}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>보류(출고 불가)</span><strong>{summary.held}건</strong></article>
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
              <option value="held">보류 (출고 불가)</option>
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

      <DashboardCard className="outbound-table-card" title={`${tab === "wait" ? "확정 대기" : tab === "done" ? "출고완료" : "보류"} 목록 (${filtered.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">
            {notice ??
              (tab === "held"
                ? "보류 건은 영업이 주문을 취소하면 자동으로 취소됩니다. 문제가 풀렸으면 [다시 출고]를 누르세요."
                : "송장번호 입력 후 출고확정하세요. 재고부족 등으로 못 나가면 [출고 불가]로 주문 시스템에 알립니다.")}
          </p>
        </div>
        <ResponsiveTable>
          <table className="outbound-table">
            <thead>
              <tr>
                <th className="rt-title">출하번호</th>
                <th>출고예정일</th>
                <th>납품처</th>
                <th className="num">수량</th>
                <th>운송정보</th>
                <th>송장번호</th>
                <th>사진</th>
                <th>상태</th>
                <th className="rt-actions">처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>
                  {tab === "wait" ? "확정 대기 건이 없습니다. 피킹 작업을 먼저 완료하세요." : "데이터가 없습니다."}
                </td></tr>
              ) : (
                filtered.map((row) => {
                  const waiting = row.status === "피킹완료";
                  const held = row.status === "보류";
                  const needInvoice = waiting && !(row.invoiceNo ?? "").trim();
                  const changeWaiting = waiting && (row.pendingChanges ?? 0) > 0;
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
                      {/* 사진 칸 — 누르면 출고 사진에서 그 건이 열린다. 없으면 붉게(나중에 채우게) */}
                      <td>{held ? <span className="cell-mut">-</span> : <PhotoCountLink outboundNo={row.outboundNo} count={row.photoCount ?? 0} />}</td>
                      <td>
                        <StatusBadge tone={OUTBOUND_STATUS_TONE[row.status]}>{row.status}</StatusBadge>
                        {held && row.rejectReason ? (
                          <div className="cell-mut" style={{ fontSize: 12, marginTop: 2 }}>{row.rejectReason}</div>
                        ) : null}
                        {changeWaiting ? (
                          <div style={{ marginTop: 4 }}>
                            <StatusBadge tone="warning">주문 변경 대기</StatusBadge>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="outbound-row-actions">
                          {changeWaiting ? (
                            // 주문 변경 · 취소가 확인을 기다린다 — 나간 뒤에는 승인할 수 없어 확정을 막는다 (서버도 막는다)
                            <button
                              type="button"
                              className="btn-secondary"
                              title="주문 변경 · 취소를 먼저 승인하거나 거절하세요"
                              onClick={() => navigate(CHANGE_REVIEW_PATH)}
                            >
                              변경 확인
                            </button>
                          ) : waiting ? (
                            <>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy || needInvoice}
                                title={needInvoice ? "송장번호를 먼저 입력하세요" : undefined}
                                onClick={() => openConfirm(row)}
                              >
                                출고확정
                              </button>
                              <button type="button" className="btn-secondary outbound-reject-btn" onClick={() => setHoldTarget(row)}>
                                출고 불가
                              </button>
                            </>
                          ) : held ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={busy}
                              title="문제가 풀렸으면 이어서 진행합니다 — 주문 시스템에 알립니다"
                              onClick={() => doResume(row)}
                            >
                              다시 출고
                            </button>
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
        </ResponsiveTable>
      </DashboardCard>

      <Modal
        open={confirmTarget !== null}
        title="출고확정"
        desc={confirmTarget ? `${confirmTarget.outboundNo} · 송장 ${confirmTarget.invoiceNo ?? "-"}` : ""}
        icon="checkCircle"
        iconBg="var(--c-success-bg)"
        iconColor="var(--c-success)"
        onClose={closeConfirm}
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={busy} onClick={closeConfirm}>취소</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={doConfirm} aria-busy={busy}>
              {busy ? <span className="ob-wait">주문 시스템 · ERP 반영 중…</span> : confirmError ? "다시 시도" : "출고확정"}
            </button>
          </>
        }
      >
        {confirmError ? (
          <div className="ds-callout danger" role="alert" style={{ marginBottom: 10 }}>
            <Icon name="alert" size={18} />
            <span>{confirmError}</span>
          </div>
        ) : null}
        <div className="ds-callout info">
          <Icon name="check" size={18} />
          <span>
            주문 시스템에서 온 출고는 <b>주문 시스템이 ERP 에 반영할 때까지 기다렸다가</b> 확정합니다. 반영되지 않으면 확정하지 않고
            피킹완료로 둡니다 — 잠시 후 다시 누르세요. 부분출고 불가 — 전량 확정됩니다.
          </span>
        </div>
        {/* 사진이 없어도 확정은 된다 — 경고만 (설계 §5 · 2026-09-20 확정, 현장 작업을 막지 않는다) */}
        {confirmTarget && (confirmTarget.photoCount ?? 0) === 0 ? (
          <div className="ds-callout warning" style={{ marginTop: 10 }}>
            <Icon name="camera" size={18} />
            <span>
              <b>출고 사진이 없습니다.</b> 확정은 그대로 됩니다 — 상차 · 송장 사진은 확정 뒤에도{" "}
              <button
                type="button"
                className="outbound-link-btn"
                disabled={busy}
                onClick={() => {
                  setConfirmTarget(null);
                  navigate(outboundPhotoPath(confirmTarget.outboundNo));
                }}
              >
                출고관리 › 출고 사진
              </button>
              에서 올릴 수 있습니다.
            </span>
          </div>
        ) : null}
      </Modal>

      <HoldDialog
        target={holdTarget}
        onClose={() => setHoldTarget(null)}
        onDone={(message) => {
          setNotice(message);
          reload();
        }}
      />
    </section>
  );
};

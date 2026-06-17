import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet, apiPut } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type Policy = { policyKey: string; label: string; description: string; enabled: boolean };
type Buckets = { onHand: number; allocated: number; defect: number; moving: number; putawayWait: number };

export const StockPolicyPage = () => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [buckets, setBuckets] = useState<Buckets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ policies: Policy[]; buckets: Buckets }>("/policies")
      .then((d) => { setPolicies(d.policies); setBuckets(d.buckets); })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const on = (key: string) => policies.find((p) => p.policyKey === key)?.enabled ?? false;

  // 정책 기반 가용재고 계산 (토글에 따라 라이브 반영)
  const computed = useMemo(() => {
    if (!buckets) return { available: 0, terms: [] as { label: string; val: number; sign: string }[] };
    const terms: { label: string; val: number; sign: string }[] = [
      { label: "가용 현재고", val: buckets.onHand, sign: "+" }
    ];
    let v = buckets.onHand;
    if (on("reserve_reflect")) { v -= buckets.allocated; terms.push({ label: "예약(할당)", val: buckets.allocated, sign: "−" }); }
    if (!on("exclude_defect")) { v += buckets.defect; terms.push({ label: "불량 포함", val: buckets.defect, sign: "+" }); }
    if (!on("exclude_moving")) { v += buckets.moving; terms.push({ label: "이동중 포함", val: buckets.moving, sign: "+" }); }
    if (!on("exclude_putaway")) { v += buckets.putawayWait; terms.push({ label: "격납대기 포함", val: buckets.putawayWait, sign: "+" }); }
    return { available: v, terms };
  }, [buckets, policies]);

  const toggle = async (p: Policy) => {
    setBusy(true);
    setPolicies((prev) => prev.map((x) => (x.policyKey === p.policyKey ? { ...x, enabled: !x.enabled } : x)));
    try {
      await apiPut(`/policies/${p.policyKey}`, { enabled: !p.enabled });
      setNotice(`'${p.label}' ${!p.enabled ? "적용" : "해제"}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "변경 실패");
      load(); // 실패 시 롤백
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="가용재고 정책 요약">
        <article className="app-surface outbound-summary-card"><span>가용 현재고</span><strong>{(buckets?.onHand ?? 0).toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>예약(할당)</span><strong>{(buckets?.allocated ?? 0).toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>불량/격납대기</span><strong>{((buckets?.defect ?? 0) + (buckets?.putawayWait ?? 0)).toLocaleString()}</strong></article>
        <article className="app-surface outbound-summary-card"><span>정책 적용 가용재고</span><strong style={{ color: "var(--c-info)" }}>{computed.available.toLocaleString()}</strong></article>
      </section>

      <DashboardCard className="outbound-table-card" title="가용재고 정책">
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? "정책 토글을 변경하면 가용재고 계산식과 합계가 즉시 반영됩니다."}</p>
        </div>
        {error ? (<div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr><th>정책</th><th>설명</th><th style={{ width: 120 }}>적용</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : (
                policies.map((p) => (
                  <tr key={p.policyKey}>
                    <td><b>{p.label}</b></td>
                    <td style={{ color: "var(--ink-faint)" }}>{p.description}</td>
                    <td>
                      <button
                        type="button"
                        className={p.enabled ? "btn-primary" : "btn-secondary"}
                        disabled={busy}
                        onClick={() => toggle(p)}
                      >
                        {p.enabled ? "적용중" : "해제"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title="가용재고 계산식 (미리보기)">
        <div style={{ padding: "8px 4px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 15 }}>
          {computed.terms.map((t, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {i > 0 ? <b style={{ color: "var(--ink-faint)" }}>{t.sign}</b> : null}
              <StatusBadge tone={t.sign === "−" ? "danger" : "gray"}>{t.label} {t.val.toLocaleString()}</StatusBadge>
            </span>
          ))}
          <b style={{ color: "var(--ink-faint)" }}>=</b>
          <StatusBadge tone="info">정책 적용 가용재고 {computed.available.toLocaleString()}</StatusBadge>
        </div>
        <p className="outbound-notice" style={{ marginTop: 8 }}>
          현재 정책: 예약재고 {on("reserve_reflect") ? "반영" : "미반영"} · 불량 {on("exclude_defect") ? "제외" : "포함"} · 이동중 {on("exclude_moving") ? "제외" : "포함"} · 격납대기 {on("exclude_putaway") ? "제외" : "포함"}
        </p>
      </DashboardCard>
    </section>
  );
};

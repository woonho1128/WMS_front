import { useEffect, useRef, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { apiGet } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 카드/필터 스타일 재사용

type Funnel = Record<string, number> & { total: number; progressPct: number };
type ProgressData = { inbound: Funnel; outbound: Funnel };

const REFRESH_MS = 5 * 60 * 1000; // 5분 주기 자동갱신

const STAGE_TONES = ["#94a3b8", "#3b82f6", "#7c3aed", "#16a34a", "#dc2626"];

const FunnelCard = ({ title, funnel, stages }: { title: string; funnel: Funnel | undefined; stages: string[] }) => {
  const total = funnel?.total ?? 0;
  const max = Math.max(1, ...stages.map((s) => (funnel?.[s] as number) ?? 0));
  return (
    <DashboardCard className="outbound-table-card" title={`${title} · 진행률 ${funnel?.progressPct ?? 0}%`}>
      <div style={{ padding: "4px 6px" }}>
        <div style={{ height: 10, borderRadius: 5, background: "var(--line, #e5e7eb)", overflow: "hidden", marginBottom: 14 }}>
          <div style={{ width: `${funnel?.progressPct ?? 0}%`, height: "100%", background: "var(--c-success, #16a34a)", transition: "width .4s" }} />
        </div>
        {stages.map((s, i) => {
          const v = (funnel?.[s] as number) ?? 0;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 110, fontSize: 13, color: "var(--ink-faint)" }}>{s}</span>
              <div style={{ flex: 1, height: 18, background: "var(--surface-2, #f1f5f9)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((v / max) * 100)}%`, height: "100%", background: STAGE_TONES[i % STAGE_TONES.length], minWidth: v > 0 ? 3 : 0, transition: "width .4s" }} />
              </div>
              <b style={{ width: 48, textAlign: "right" }}>{v.toLocaleString()}</b>
            </div>
          );
        })}
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--ink-faint)" }}>전체 {total.toLocaleString()}건</div>
      </div>
    </DashboardCard>
  );
};

/** 진행 현황 — 입고/출고 퍼널 + 진행률, 5분 자동갱신 */
export const ProgressPage = () => {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ts, setTs] = useState("");
  const [auto, setAuto] = useState(true);
  const timer = useRef<number | null>(null);

  const load = () => {
    apiGet<ProgressData>("/dashboard/progress")
      .then((d) => {
        setData(d);
        const n = new Date();
        setTs(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"));
  };

  useEffect(() => {
    load();
    if (auto) {
      timer.current = window.setInterval(load, REFRESH_MS);
      return () => { if (timer.current) window.clearInterval(timer.current); };
    }
    return undefined;
  }, [auto]);

  const obDone = data?.outbound.progressPct ?? 0;
  const inDone = data?.inbound.progressPct ?? 0;

  return (
    <section className="outbound-page">
      <header className="app-surface" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>진행 현황</h2>
          <p style={{ margin: "4px 0 0", color: "var(--ink-faint)", fontSize: 13 }}>입고/출고 단계별 실시간 진행률 · 5분 주기 자동갱신</p>
        </div>
        <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
          {ts ? <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>기준 {ts}</span> : null}
          <label style={{ fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 자동갱신(5분)
          </label>
          <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
        </div>
      </header>

      {error ? (<div className="ds-callout danger"><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>) : null}

      <section className="outbound-summary-grid" aria-label="진행률 요약">
        <article className="app-surface outbound-summary-card"><span>출고 진행률</span><strong style={{ color: "var(--c-success)" }}>{obDone}%</strong></article>
        <article className="app-surface outbound-summary-card"><span>입고 진행률</span><strong style={{ color: "var(--c-info)" }}>{inDone}%</strong></article>
        <article className="app-surface outbound-summary-card"><span>출고 오더수</span><strong>{(data?.outbound.total ?? 0).toLocaleString()}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>입고 오더수</span><strong>{(data?.inbound.total ?? 0).toLocaleString()}건</strong></article>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="summary-grid">
        <FunnelCard title="출고 진행" funnel={data?.outbound} stages={["출고대기", "피킹중", "피킹완료", "출고완료", "거부"]} />
        <FunnelCard title="입고 진행" funnel={data?.inbound} stages={["입고예정", "입고등록", "로케이션지정", "입고확정"]} />
      </div>
    </section>
  );
};

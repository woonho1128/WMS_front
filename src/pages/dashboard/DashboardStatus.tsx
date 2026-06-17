import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardCard } from "./components/DashboardCard";
import { apiGet } from "../../services/http";
import "./DashboardStatus.css";

type Tone = "info" | "success" | "warning" | "danger" | "violet" | "neutral";

type DashboardSummary = {
  logistics: { todayInbound: number; todayOutbound: number; totalStock: number; working: number };
  inbound: { scheduled: number; confirmed: number; putawayWait: number; returnReceived: number };
  outbound: { waiting: number; picking: number; picked: number; completed: number; rejected: number };
  stock: { total: number; available: number; defect: number; longTerm: number };
  alerts: { replenish: number; shortage: number; interfaceError: number; returnRejected: number };
};

type Stat = {
  label: string;
  value: number;
  unit?: string;
  sub?: string;
  tone?: Tone;
  to?: string; // 클릭 시 이동 경로
};

const useSummary = () => {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ts, setTs] = useState<string>("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<DashboardSummary>("/dashboard/summary")
      .then((d) => {
        setData(d);
        const now = new Date();
        setTs(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  return { data, loading, error, ts, reload: load };
};

const StatGrid = ({
  title,
  desc,
  stats,
  loading,
  error,
  ts,
  reload
}: {
  title: string;
  desc: string;
  stats: Stat[];
  loading: boolean;
  error: string | null;
  ts: string;
  reload: () => void;
}) => {
  const navigate = useNavigate();
  return (
    <section className="dstat-page">
      <header className="app-surface dstat-head">
        <div>
          <h2>{title}</h2>
          <p>{desc}</p>
        </div>
        <div className="dstat-refresh">
          {ts ? <span className="dstat-ts">기준 {ts}</span> : null}
          <button type="button" className="btn-secondary" onClick={reload}>새로고침</button>
        </div>
      </header>

      {error ? (
        <div className="ds-callout danger"><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>
      ) : null}

      <div className="dstat-grid">
        {stats.map((s) => (
          <DashboardCard
            key={s.label}
            className={`dstat-card tone-${s.tone ?? "neutral"}${s.to ? " is-link" : ""}`}
          >
            <div
              onClick={s.to ? () => navigate(s.to!) : undefined}
              role={s.to ? "button" : undefined}
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <span className="dstat-label">{s.label}</span>
              <span className="dstat-value">
                {loading ? "…" : s.value.toLocaleString()}
                {s.unit ? <small>{s.unit}</small> : null}
              </span>
              {s.sub ? <span className="dstat-sub">{s.sub}</span> : null}
            </div>
          </DashboardCard>
        ))}
      </div>
    </section>
  );
};

/** 물류 현황 — 금일 입고·출고·재고·작업중 */
export const LogisticsStatusPage = () => {
  const { data, loading, error, ts, reload } = useSummary();
  const l = data?.logistics;
  const stats: Stat[] = [
    { label: "금일 입고 건수", value: l?.todayInbound ?? 0, unit: "건", tone: "info", to: "/inbound/inbound-schedule" },
    { label: "금일 출고 건수", value: l?.todayOutbound ?? 0, unit: "건", tone: "success", to: "/outbound/outbound-order" },
    { label: "총 재고", value: l?.totalStock ?? 0, unit: "EA", tone: "neutral", to: "/stock/stock-realtime" },
    { label: "작업중 건수", value: l?.working ?? 0, unit: "건", tone: "warning", sub: "입고처리·피킹·격납 대기 합계" }
  ];
  return <StatGrid title="물류 현황" desc="금일 입고·출고·재고와 진행 중인 작업을 확인합니다." stats={stats} loading={loading} error={error} ts={ts} reload={reload} />;
};

/** 입고 현황 — 입고예정·입고확정·격납대기 */
export const InboundStatusPage = () => {
  const { data, loading, error, ts, reload } = useSummary();
  const i = data?.inbound;
  const stats: Stat[] = [
    { label: "입고예정", value: i?.scheduled ?? 0, unit: "건", tone: "info", to: "/inbound/inbound-schedule" },
    { label: "입고확정", value: i?.confirmed ?? 0, unit: "건", tone: "success", to: "/inbound/inbound-confirm" },
    { label: "격납대기", value: i?.putawayWait ?? 0, unit: "건", tone: "warning", to: "/stock/putaway" },
    { label: "반품수신(처리대기)", value: i?.returnReceived ?? 0, unit: "건", tone: "violet", to: "/inbound/return-confirm" }
  ];
  return <StatGrid title="입고 현황" desc="입고예정·입고확정·격납대기·반품 처리 현황입니다." stats={stats} loading={loading} error={error} ts={ts} reload={reload} />;
};

/** 출고 현황 — 출고대기·피킹중·출고완료 */
export const OutboundStatusPage = () => {
  const { data, loading, error, ts, reload } = useSummary();
  const o = data?.outbound;
  const stats: Stat[] = [
    { label: "출고대기", value: o?.waiting ?? 0, unit: "건", tone: "neutral", to: "/outbound/outbound-order" },
    { label: "피킹중", value: o?.picking ?? 0, unit: "건", tone: "info", to: "/outbound/picking" },
    { label: "피킹완료(확정대기)", value: o?.picked ?? 0, unit: "건", tone: "violet", to: "/outbound/outbound-confirm" },
    { label: "출고완료", value: o?.completed ?? 0, unit: "건", tone: "success" },
    { label: "거부", value: o?.rejected ?? 0, unit: "건", tone: "danger" }
  ];
  return <StatGrid title="출고 현황" desc="출고대기·피킹중·피킹완료·출고완료 현황입니다." stats={stats} loading={loading} error={error} ts={ts} reload={reload} />;
};

/** 재고 현황 — 총재고·가용·불량·장기 */
export const StockStatusPage = () => {
  const { data, loading, error, ts, reload } = useSummary();
  const s = data?.stock;
  const stats: Stat[] = [
    { label: "총 재고", value: s?.total ?? 0, unit: "EA", tone: "neutral", to: "/stock/stock-realtime" },
    { label: "가용 재고", value: s?.available ?? 0, unit: "EA", tone: "success", to: "/stock/stock-available" },
    { label: "불량 재고", value: s?.defect ?? 0, unit: "EA", tone: "danger" },
    { label: "장기 재고 (1년+)", value: s?.longTerm ?? 0, unit: "EA", tone: "warning", to: "/analytics/aging-stock" }
  ];
  return <StatGrid title="재고 현황" desc="총 재고·가용재고·불량재고·장기재고 현황입니다." stats={stats} loading={loading} error={error} ts={ts} reload={reload} />;
};

/** 작업 알림 — 보충대상·쇼트·인터페이스오류·반품반려 */
export const WorkAlertsPage = () => {
  const { data, loading, error, ts, reload } = useSummary();
  const a = data?.alerts;
  const stats: Stat[] = [
    { label: "보충 대상", value: a?.replenish ?? 0, unit: "건", tone: "info", sub: "피킹 가용 < 안전재고", to: "/stock/replenishment" },
    { label: "쇼트 발생 (재고부족)", value: a?.shortage ?? 0, unit: "건", tone: "danger", sub: "안전재고 이하 품목", to: "/analytics/shortage" },
    { label: "인터페이스 오류", value: a?.interfaceError ?? 0, unit: "건", tone: "warning", sub: "중계서버 전송 실패", to: "/history/system-logs" },
    { label: "반품 반려", value: a?.returnRejected ?? 0, unit: "건", tone: "violet", to: "/inbound/return-confirm" }
  ];
  return <StatGrid title="작업 알림" desc="보충대상·쇼트발생·인터페이스 오류·반품반려 알림입니다. 카드를 클릭하면 처리 화면으로 이동합니다." stats={stats} loading={loading} error={error} ts={ts} reload={reload} />;
};

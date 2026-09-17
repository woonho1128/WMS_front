import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertList,
  Breakdown,
  FlowStepper,
  HourlyChart,
  KpiCard,
  LinkButton,
  Panel,
  ProgressCell,
  StageChip,
  StatusShell,
  fmt,
  useStatusData
} from "./StatusWidgets";
import type { InboundDashboard } from "./statusTypes";

/* ============================================================
   대시보드 › 입고 현황
   오늘 들어오는 물건이 어느 단계에 있고 어디서 막혔는지 — 단계를 누르면 표가 걸러지고,
   카드·행·알림을 누르면 처리 화면(입고 예정 · 입고 확정 · 격납 대기 · 반품 확정)으로 간다
   ============================================================ */

const KIND_TONE: Record<string, "violet" | "teal"> = { 외주: "violet", 이동: "teal" };
const daysLate = (expectedAt: string, today: string) => Math.max(1, Math.round((Date.parse(today) - Date.parse(expectedAt)) / 86_400_000));

export const InboundStatusPage = () => {
  const navigate = useNavigate();
  const { data, error, ts, reload } = useStatusData<InboundDashboard>("/dashboard/inbound");
  const [stage, setStage] = useState<string | null>(null);

  const rows = useMemo(() => (data?.rows ?? []).filter((row) => !stage || row.stage === stage), [data, stage]);
  const stageInfo = data?.stages.find((item) => item.key === stage) ?? null;
  const working = (data?.rows ?? []).filter((row) => row.stage !== "done").length;
  const doneToday = data?.stages.find((item) => item.key === "done")?.count ?? 0;

  return (
    <StatusShell
      eyebrow="INBOUND STATUS"
      title="입고 현황"
      desc="오늘 들어오는 물건이 어느 단계에 있고 어디서 막혔는지 봅니다. 카드·단계·행을 누르면 처리 화면으로 갑니다."
      ts={ts}
      onReload={reload}
      error={error}
      loading={!data && !error}
    >
      {data ? (
        <>
          <div className="sd-kpis">
            {data.kpis.map((kpi) => (
              <KpiCard key={kpi.key} kpi={kpi} />
            ))}
          </div>

          <div className="sd-grid">
            <Panel
              icon="inbox"
              title="입고 진행 현황"
              sub={`진행 중 ${working}건 · 오늘 완료 ${doneToday}건`}
              aside={<LinkButton label="입고 예정" to="/inbound/inbound-schedule" />}
            >
              <FlowStepper stages={data.stages} selected={stage} onSelect={setStage} />
              <div className="sd-table-wrap">
                <table className="data-table sd-table">
                  <thead>
                    <tr>
                      <th>입고번호</th>
                      <th>공급처 · 창고</th>
                      <th>예정일</th>
                      <th className="num">예정수량</th>
                      <th>진행</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr className="sd-empty-row">
                        <td colSpan={6}>{stageInfo ? `${stageInfo.label} 단계에 있는 입고가 없습니다` : "진행 중인 입고가 없습니다"}</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id} onClick={() => navigate(row.to)} title={`${row.stageLabel} — 누르면 처리 화면으로 갑니다`}>
                          <td>
                            <span className="sd-code">{row.inboundNo}</span>
                            <span className={`sd-cell-sub${KIND_TONE[row.kind] ? ` is-tone sd-tone-${KIND_TONE[row.kind]}` : ""}`}>{row.kind} 입고</span>
                          </td>
                          <td>
                            {row.supplierName}
                            <span className="sd-cell-sub">{row.warehouseName}</span>
                          </td>
                          <td>
                            {row.expectedAt === data.today ? "오늘" : row.expectedAt.slice(5)}
                            {row.overdue ? <span className="sd-cell-sub is-late">{daysLate(row.expectedAt, data.today)}일 지연</span> : null}
                          </td>
                          <td className="num">
                            {fmt(row.qty)}
                            {row.receivedQty > 0 && row.receivedQty !== row.qty ? <span className="sd-cell-sub is-warn">실입고 {fmt(row.receivedQty)}</span> : null}
                          </td>
                          <td>
                            <ProgressCell value={row.progress} tone={row.tone} />
                          </td>
                          <td>
                            <StageChip label={row.stageLabel} tone={row.tone} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel icon="alert" title="입고 알림" sub={`${data.alerts.length}건 · 입고·반품`} aside={<LinkButton label="작업 알림" to="/dashboard/work-alerts" />}>
              <AlertList alerts={data.alerts} empty="지금 확인할 입고 알림이 없습니다" limit={6} />
            </Panel>

            <Panel
              icon="barChart"
              title="금일 시간별 입고 처리량"
              sub="입고확정 · 격납 완료 수량"
              aside={
                <span className="sd-total">
                  금일 누적<b>{fmt(data.hourly.total)}</b>
                </span>
              }
            >
              <HourlyChart hourly={data.hourly} />
            </Panel>

            <Panel icon="layers" title="입고 구분" sub="진행 중 + 오늘 완료">
              <Breakdown rows={data.breakdown} empty="오늘 입고 건이 없습니다" />
            </Panel>
          </div>
        </>
      ) : null}
    </StatusShell>
  );
};

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
import type { OutboundDashboard } from "./statusTypes";

/* ============================================================
   대시보드 › 출고 현황
   오늘 나갈 주문의 피킹·출고확정·배차가 어디까지 왔는지 — 단계를 누르면 표가 걸러지고,
   행을 누르면 그 주문을 처리할 화면(피킹 작업 · 출고 확정 · 배차 · 배송 내역서)으로 간다
   ============================================================ */

export const OutboundStatusPage = () => {
  const navigate = useNavigate();
  const { data, error, ts, reload } = useStatusData<OutboundDashboard>("/dashboard/outbound");
  const [stage, setStage] = useState<string | null>(null);

  const rows = useMemo(() => (data?.rows ?? []).filter((row) => !stage || row.stage === stage), [data, stage]);
  const stageLabel = stage === "거부" ? "거부" : data?.stages.find((item) => item.key === stage)?.label ?? null;
  const working = (data?.rows ?? []).filter((row) => row.stage !== "출고완료" && row.stage !== "거부").length;
  const shippedToday = (data?.rows ?? []).filter((row) => row.stage === "출고완료").length;

  return (
    <StatusShell
      eyebrow="OUTBOUND STATUS"
      title="출고 현황"
      desc="오늘 나갈 주문이 피킹·출고확정·배차 중 어디까지 왔는지 봅니다. 행을 누르면 그 주문을 처리할 화면으로 갑니다."
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
              icon="truck"
              title="출고 진행 현황"
              sub={`진행 중 ${working}건 · 오늘 출고완료 ${shippedToday}건`}
              aside={<LinkButton label="출고 요청서" to="/outbound/outbound-order" />}
            >
              <FlowStepper
                stages={data.stages}
                selected={stage === "거부" ? null : stage}
                onSelect={setStage}
                side={
                  data.rejected.count ? (
                    <button
                      type="button"
                      className={`sd-side-chip sd-tone-danger${stage === "거부" ? " is-on" : ""}`}
                      onClick={() => setStage(stage === "거부" ? null : "거부")}
                      aria-pressed={stage === "거부"}
                      title="거부된 출고만 보기"
                    >
                      거부 <b>{data.rejected.count}</b>
                    </button>
                  ) : null
                }
              />
              <div className="sd-table-wrap">
                <table className="data-table sd-table">
                  <thead>
                    <tr>
                      <th>출하번호</th>
                      <th>납품처</th>
                      <th className="num">수량</th>
                      <th>피킹</th>
                      <th>송장 · 배차</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr className="sd-empty-row">
                        <td colSpan={6}>{stageLabel ? `${stageLabel} 단계에 있는 주문이 없습니다` : "진행 중인 출고가 없습니다"}</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id} onClick={() => navigate(row.to)} title={`${row.stageLabel} — 누르면 처리 화면으로 갑니다`}>
                          <td>
                            <span className="sd-code">{row.outboundNo}</span>
                            <span className={`sd-cell-sub${row.overdue ? " is-late" : ""}`}>
                              {row.scheduledDate === data.today ? "오늘 출고" : `${row.scheduledDate.slice(5)} 출고`}
                              {row.overdue ? " · 지연" : ""}
                            </span>
                          </td>
                          <td>
                            {row.customerName}
                            <span className="sd-cell-sub">
                              {row.outType} · {row.region}
                            </span>
                          </td>
                          <td className="num">{fmt(row.qty)}</td>
                          <td>
                            {row.stage === "거부" ? (
                              <span className="sd-cell-muted">—</span>
                            ) : (
                              <ProgressCell value={row.progress} tone={row.progress >= 100 ? "success" : "info"} note={`${fmt(row.pickedQty)} / ${fmt(row.qty)}`} />
                            )}
                          </td>
                          <td className="sd-marks">
                            <span className={row.invoiceNo ? "is-on" : undefined} title={row.invoiceNo ?? "송장 없음"}>
                              송장
                            </span>
                            <span className={row.dispatched ? "is-on" : undefined} title={row.dispatched ? "배차 완료" : "배차 전"}>
                              배차
                            </span>
                            <small>{row.carrier ?? "-"}</small>
                          </td>
                          <td>
                            <StageChip label={row.stageLabel} tone={row.tone} title={row.rejectReason ?? undefined} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel icon="alert" title="출고 알림" sub={`${data.alerts.length}건 · 출고·연동`} aside={<LinkButton label="작업 알림" to="/dashboard/work-alerts" />}>
              <AlertList alerts={data.alerts} empty="지금 확인할 출고 알림이 없습니다" limit={6} />
            </Panel>

            <Panel
              icon="barChart"
              title="금일 시간별 출고 처리량"
              sub="피킹 · 출고확정 수량"
              aside={
                <span className="sd-total">
                  금일 누적<b>{fmt(data.hourly.total)}</b>
                </span>
              }
            >
              <HourlyChart hourly={data.hourly} />
            </Panel>

            <Panel icon="layers" title="배송사별 오늘 출고" sub="거부 제외 · 건수와 수량">
              <Breakdown rows={data.breakdown} empty="오늘 출고 건이 없습니다" />
            </Panel>
          </div>
        </>
      ) : null}
    </StatusShell>
  );
};

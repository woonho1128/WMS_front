import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { apiGet, apiPost } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type Target = {
  outboundId: number;
  outboundNo: string;
  customerName: string;
  shipAddress: string | null;
  region: string;
  status: string;
  scheduledDate: string | null;
  totalWeightKg: number;
  totalVolumeM3: number;
  palletCount: number;
  recommendedVehicle: string;
};

type Dispatched = {
  id: number;
  dispatchNo: string;
  outboundNo: string;
  customerName: string;
  shipAddress: string | null;
  region: string;
  carrierName: string | null;
  vehicleType: string | null;
  totalWeightKg: number;
  totalVolumeM3: number;
  palletCount: number;
  dispatchDate: string | null;
};

type Carrier = { id: number; name: string; region: string; active: boolean };

const VEHICLES = ["1톤", "2.5톤", "5톤", "11톤"];

type Props = { region: "수도권" | "지방권"; title: string };

/** 배차관리 공용 — 권역별 배차대상/배정/현황 */
export const DispatchPage = ({ region, title }: Props) => {
  const [targets, setTargets] = useState<Target[]>([]);
  const [dispatched, setDispatched] = useState<Dispatched[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [target, setTarget] = useState<Target | null>(null);
  const [carrierId, setCarrierId] = useState<number | "">("");
  const [vehicle, setVehicle] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<Target[]>(`/dispatch/targets?region=${encodeURIComponent(region)}`),
      apiGet<Dispatched[]>(`/dispatch?region=${encodeURIComponent(region)}`),
      apiGet<Carrier[]>("/carriers")
    ])
      .then(([t, d, c]) => { setTargets(t); setDispatched(d); setCarriers(c); })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [region]); // eslint-disable-line react-hooks/exhaustive-deps

  // 권역 매칭 배송사 (해당 권역 + 전국, 사용중)
  const availableCarriers = useMemo(
    () => carriers.filter((c) => c.active && (c.region === region || c.region === "전국")),
    [carriers, region]
  );

  const summary = useMemo(() => {
    const weight = targets.reduce((a, t) => a + t.totalWeightKg, 0);
    const pallets = targets.reduce((a, t) => a + t.palletCount, 0);
    return { targets: targets.length, dispatched: dispatched.length, weight: Math.round(weight * 10) / 10, pallets };
  }, [targets, dispatched]);

  const openAssign = (t: Target) => {
    setTarget(t);
    setVehicle(t.recommendedVehicle);
    const match = availableCarriers[0];
    setCarrierId(match ? match.id : "");
  };

  const doAssign = async () => {
    if (!target || carrierId === "") { setNotice("배송사를 선택하세요."); return; }
    setBusy(true);
    try {
      await apiPost("/dispatch/assign", { outboundId: target.outboundId, carrierId, vehicleType: vehicle });
      const cName = carriers.find((c) => c.id === carrierId)?.name;
      setNotice(`${target.outboundNo} 배차 완료 — ${cName} / ${vehicle}`);
      setTarget(null);
      load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "배차 실패"); }
    finally { setBusy(false); }
  };

  const exportCsv = () =>
    downloadCsv(
      `배차현황_${region}_${new Date().toISOString().slice(0, 10)}`,
      ["배차번호", "출하번호", "납품처", "배송사", "차량", "중량(kg)", "부피(m³)", "파렛트", "배차일"],
      dispatched.map((d) => [d.dispatchNo, d.outboundNo, d.customerName, d.carrierName ?? "", d.vehicleType ?? "", d.totalWeightKg, d.totalVolumeM3, d.palletCount, d.dispatchDate ?? ""])
    );

  return (
    <section className="outbound-page">
      <section className="outbound-summary-grid" aria-label="배차 요약">
        <article className="app-surface outbound-summary-card"><span>{region} 배차대상</span><strong>{summary.targets}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>배차완료</span><strong>{summary.dispatched}건</strong></article>
        <article className="app-surface outbound-summary-card"><span>대상 총중량</span><strong>{summary.weight.toLocaleString()} kg</strong></article>
        <article className="app-surface outbound-summary-card"><span>대상 파렛트</span><strong>{summary.pallets} PLT</strong></article>
      </section>

      <DashboardCard className="outbound-filter-card" title={`${title} — 배차 대상 (${targets.length}건)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? `${region} 출고 건의 중량·부피·파렛트를 계산하고 차량을 추천합니다. 배송사를 배정하세요.`}</p>
          <div className="outbound-expand-actions">
            <button type="button" className="btn-secondary" onClick={load}>새로고침</button>
          </div>
        </div>
        {error ? (<div className="ds-callout danger" style={{ marginBottom: 12 }}><span>불러오기 실패: {error} — 백엔드(8080) 확인</span></div>) : null}
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr><th>출하번호</th><th>납품처</th><th>배송주소</th><th className="num">중량(kg)</th><th className="num">부피(m³)</th><th className="num">파렛트</th><th>추천차량</th><th>처리</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : targets.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>{region} 배차 대상이 없습니다. (피킹완료/출고완료 + 미배차)</td></tr>
              ) : (
                targets.map((t) => (
                  <tr key={t.outboundId}>
                    <td><b>{t.outboundNo}</b></td>
                    <td>{t.customerName}</td>
                    <td><span className="outbound-addr-cell" title={t.shipAddress ?? ""}>{t.shipAddress ?? "-"}</span></td>
                    <td className="num">{t.totalWeightKg.toLocaleString()}</td>
                    <td className="num">{t.totalVolumeM3.toLocaleString()}</td>
                    <td className="num">{t.palletCount}</td>
                    <td><StatusBadge tone="info">{t.recommendedVehicle}</StatusBadge></td>
                    <td><div className="outbound-row-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => openAssign(t)}>배송사 배정</button></div></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`배차 현황 (${dispatched.length}건)`} action={<button type="button" className="btn-secondary" onClick={exportCsv} disabled={dispatched.length === 0}>배차현황 출력(엑셀)</button>}>
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr><th>배차번호</th><th>출하번호</th><th>납품처</th><th>배송사</th><th>차량</th><th className="num">중량(kg)</th><th className="num">파렛트</th><th>배차일</th></tr>
            </thead>
            <tbody>
              {dispatched.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--ink-faint)" }}>배차 완료 건이 없습니다.</td></tr>
              ) : (
                dispatched.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{d.dispatchNo}</td>
                    <td>{d.outboundNo}</td>
                    <td>{d.customerName}</td>
                    <td><b>{d.carrierName ?? "-"}</b></td>
                    <td><StatusBadge tone="violet">{d.vehicleType ?? "-"}</StatusBadge></td>
                    <td className="num">{d.totalWeightKg.toLocaleString()}</td>
                    <td className="num">{d.palletCount}</td>
                    <td>{d.dispatchDate ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <Modal
        open={target !== null}
        title="배송사 배정"
        desc={target ? `${target.outboundNo} · ${target.customerName} · ${target.region}` : ""}
        icon="truck"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={busy || carrierId === ""} onClick={doAssign}>배차 확정</button>
          </>
        }
      >
        {target ? (
          <>
            <div className="ds-callout info" style={{ marginBottom: 12 }}>
              <Icon name="check" size={18} />
              <span>중량 <b>{target.totalWeightKg.toLocaleString()}kg</b> · 부피 <b>{target.totalVolumeM3.toLocaleString()}m³</b> · <b>{target.palletCount}</b>파렛트 → 추천 <b>{target.recommendedVehicle}</b></span>
            </div>
            <label className="ds-field">
              <span>배송사 ({region} + 전국)</span>
              <select value={carrierId} onChange={(e) => setCarrierId(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">배송사 선택</option>
                {availableCarriers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.region})</option>)}
              </select>
            </label>
            <label className="ds-field" style={{ marginTop: 10 }}>
              <span>배정 차량</span>
              <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                {VEHICLES.map((v) => <option key={v} value={v}>{v}{v === target.recommendedVehicle ? " (추천)" : ""}</option>)}
              </select>
            </label>
          </>
        ) : null}
      </Modal>
    </section>
  );
};

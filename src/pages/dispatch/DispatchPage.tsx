import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable/ResponsiveTable";
import { apiGet, apiPost } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import { todayStr } from "../../shared/appDate";
import "./DispatchPage.css";

/* ============================================================
   배차 — 배차 대상 선택 → 차량 적재율 확인 → 배차 확정
   기준: DOCS/front 운영화면 재설계 HTML
   ============================================================ */

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

/** 차량 적재 한도 — 중량(kg) / 부피(m³) */
const VEHICLES = [
  { name: "1톤", weight: 1000, volume: 4.5 },
  { name: "2.5톤", weight: 2500, volume: 10 },
  { name: "5톤", weight: 5000, volume: 22 },
  { name: "11톤", weight: 11000, volume: 48 }
];

type Props = { region: "수도권" | "지방권"; title: string };

const num = (n: number) => n.toLocaleString("ko-KR");
const cityOf = (address: string | null) => (address ?? "").split(" ")[1] ?? "-";
const gaugeTone = (pct: number) => (pct > 100 ? "danger" : pct >= 85 ? "warning" : "success");

export const DispatchPage = ({ region, title }: Props) => {
  const [targets, setTargets] = useState<Target[]>([]);
  const [dispatched, setDispatched] = useState<Dispatched[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [picked, setPicked] = useState<number[]>([]);
  const [vehicle, setVehicle] = useState("5톤");
  const [carrierId, setCarrierId] = useState<number | "">("");

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<Target[]>(`/dispatch/targets?region=${encodeURIComponent(region)}`),
      apiGet<Dispatched[]>(`/dispatch?region=${encodeURIComponent(region)}`),
      apiGet<Carrier[]>("/carriers")
    ])
      .then(([t, d, c]) => {
        setTargets(t);
        setDispatched(d);
        setCarriers(c);
        if (c.length && carrierId === "") setCarrierId(c[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [region]);

  const today = todayStr();

  const allChecked = targets.length > 0 && targets.every((t) => picked.includes(t.outboundId));
  const toggle = (id: number) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => setPicked(allChecked ? [] : targets.map((t) => t.outboundId));

  /* ---------- 선택 물량 = 1회 운행 ---------- */
  const trip = useMemo(() => {
    const list = targets.filter((t) => picked.includes(t.outboundId));
    const weight = list.reduce((a, t) => a + t.totalWeightKg, 0);
    const volume = list.reduce((a, t) => a + t.totalVolumeM3, 0);
    const pallet = list.reduce((a, t) => a + t.palletCount, 0);
    const spec = VEHICLES.find((v) => v.name === vehicle) ?? VEHICLES[2];
    const wPct = spec.weight ? (weight / spec.weight) * 100 : 0;
    const vPct = spec.volume ? (volume / spec.volume) * 100 : 0;
    const stops = Array.from(new Set(list.map((t) => cityOf(t.shipAddress))));
    const fit = VEHICLES.find((v) => weight <= v.weight && volume <= v.volume);
    return {
      list, weight, volume, pallet, spec,
      wPct, vPct,
      over: wPct > 100 || vPct > 100,
      stops,
      fit: fit?.name ?? null
    };
  }, [targets, picked, vehicle]);

  const confirmDispatch = async () => {
    if (!trip.list.length || carrierId === "") return;
    setBusy(true);
    try {
      for (const t of trip.list) {
        await apiPost("/dispatch/assign", {
          outboundId: t.outboundId,
          carrierId,
          vehicleType: vehicle
        });
      }
      setNotice(`배차 확정 ${trip.list.length}건 · ${trip.stops.length}착지 — ${vehicle} 배정 완료`);
      setPicked([]);
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "배차 실패");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `${title}_${today}`,
      ["배차번호", "출고번호", "납품처", "배송사", "차량", "중량(kg)", "부피(m3)", "파렛트", "배차일"],
      dispatched.map((d) => [
        d.dispatchNo, d.outboundNo, d.customerName, d.carrierName, d.vehicleType,
        d.totalWeightKg, d.totalVolumeM3, d.palletCount, d.dispatchDate
      ])
    );

  return (
    <section className="dsp-page">
      {error ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
        </div>
      ) : null}
      {notice ? (
        <div className="ds-callout success">
          <Icon name="check" size={18} />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="dsp-main">
        {/* ---------- 배차 대상 ---------- */}
        <section className="card dsp-targets">
          <div className="dsp-head">
            <div className="nx-sect">
              <span className="nx-sect-title">배차 대상</span>
              <span className="dsp-count">{targets.length}</span>
            </div>
            <div className="dsp-head-tools">
              <span className="ds-badge info">{region}</span>
              <button type="button" className="nx-iconbtn" onClick={load} title="새로고침" aria-label="새로고침">
                <Icon name="refresh" size={15} />
              </button>
            </div>
          </div>

          <ResponsiveTable className="dsp-table-wrap" cardsBelow="fit">
            <table className="data-table dsp-table">
              <thead>
                <tr>
                  <th className="dsp-check-col">
                    <button
                      type="button"
                      className={`dsp-check${allChecked ? " is-on" : ""}`}
                      onClick={toggleAll}
                      disabled={!targets.length}
                      aria-label="전체 선택"
                    >
                      {allChecked ? <Icon name="check" size={12} /> : null}
                    </button>
                  </th>
                  <th className="rt-title">출하번호</th>
                  <th>납품처</th>
                  <th>착지</th>
                  <th>납기</th>
                  <th className="num">중량</th>
                  <th className="num">부피</th>
                  <th className="num">PLT</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => {
                  const on = picked.includes(t.outboundId);
                  const urgent = (t.scheduledDate ?? "") <= today;
                  return (
                    <tr
                      key={t.outboundId}
                      className={`dsp-row${on ? " is-sel" : ""}`}
                      onClick={() => toggle(t.outboundId)}
                      title={`${t.outboundNo} · ${t.customerName} · ${t.shipAddress ?? ""}`}
                    >
                      <td className="dsp-check-col">
                        <span className={`dsp-check${on ? " is-on" : ""}`}>{on ? <Icon name="check" size={12} /> : null}</span>
                      </td>
                      <td className="dsp-no">{t.outboundNo}</td>
                      <td>{t.customerName}</td>
                      <td>{cityOf(t.shipAddress)}</td>
                      <td className={`dsp-due${urgent ? " is-urgent" : ""}`}>{(t.scheduledDate ?? "").slice(5)}</td>
                      <td className="num">{num(t.totalWeightKg)}</td>
                      <td className="num">{t.totalVolumeM3.toFixed(1)}</td>
                      <td className="num">{t.palletCount}</td>
                    </tr>
                  );
                })}
                {!targets.length && !loading ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="nx-empty">배차 대상이 없습니다. 피킹완료 건이 생기면 표시됩니다.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ResponsiveTable>
          <p className="dsp-foot-note">납기가 오늘이거나 지난 건은 붉게 표시됩니다 · 당일 마감</p>
        </section>

        {/* ---------- 배차 편성 ---------- */}
        <aside className="card dsp-build">
          <div className="dsp-head">
            <div className="nx-sect">
              <span className="nx-sect-title">배차 편성</span>
              <span className="nx-sect-sub">선택 건을 한 차량으로 묶습니다</span>
            </div>
          </div>

          <div className="dsp-vehicles">
            {VEHICLES.map((v) => (
              <button
                key={v.name}
                type="button"
                className={`dsp-vehicle${vehicle === v.name ? " is-on" : ""}${trip.fit === v.name ? " is-fit" : ""}`}
                onClick={() => setVehicle(v.name)}
              >
                <b>{v.name}</b>
                <span>{num(v.weight)}kg</span>
                <span>{v.volume}m³</span>
              </button>
            ))}
          </div>

          <div className="dsp-gauges">
            <div className="dsp-gauge">
              <span className="dsp-gauge-label">중량</span>
              <span className="nx-bar dsp-gauge-bar">
                <i className={`tone-${gaugeTone(trip.wPct)}`} style={{ width: `${Math.min(trip.wPct, 100)}%` }} />
              </span>
              <span className={`dsp-gauge-pct tone-${gaugeTone(trip.wPct)}`}>{Math.round(trip.wPct)}%</span>
            </div>
            <div className="dsp-gauge">
              <span className="dsp-gauge-label">부피</span>
              <span className="nx-bar dsp-gauge-bar">
                <i className={`tone-${gaugeTone(trip.vPct)}`} style={{ width: `${Math.min(trip.vPct, 100)}%` }} />
              </span>
              <span className={`dsp-gauge-pct tone-${gaugeTone(trip.vPct)}`}>{Math.round(trip.vPct)}%</span>
            </div>
            <div className="dsp-gauge-sub">
              {num(trip.weight)}kg · {trip.volume.toFixed(1)}m³ / {num(trip.spec.weight)}kg · {trip.spec.volume}m³
            </div>
          </div>

          {trip.over ? (
            <div className="ds-callout danger dsp-warn">
              <Icon name="alert" size={16} />
              <span>
                선택 물량이 {vehicle} 적재한도를 넘습니다.
                {trip.fit ? ` ${trip.fit}으로 올리거나 2회차로 나누세요.` : " 2회차 이상으로 나누세요."}
              </span>
            </div>
          ) : null}

          <div className="dsp-summary">
            <div>
              <dt>건수</dt>
              <dd>{trip.list.length}</dd>
            </div>
            <div>
              <dt>착지</dt>
              <dd>{trip.stops.length}</dd>
            </div>
            <div>
              <dt>중량</dt>
              <dd>{num(trip.weight)}</dd>
            </div>
            <div>
              <dt>PLT</dt>
              <dd>{trip.pallet}</dd>
            </div>
          </div>

          <div className="dsp-stops">
            <span className="nx-eyebrow">배송 순서</span>
            <b>{trip.stops.join(" → ") || "—"}</b>
          </div>

          <div className="dsp-picked">
            {trip.list.map((t) => (
              <div key={t.outboundId} className="dsp-picked-row">
                <div>
                  <div className="dsp-no">{t.outboundNo}</div>
                  <div className="dsp-sub">
                    {t.customerName} · {cityOf(t.shipAddress)}
                  </div>
                </div>
                <b>{num(t.totalWeightKg)}</b>
                <button type="button" className="dsp-remove" onClick={() => toggle(t.outboundId)} aria-label="선택 해제">
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            {!trip.list.length ? <div className="nx-empty">왼쪽에서 배차할 출고 건을 선택하세요.</div> : null}
          </div>

          <label className="ds-field dsp-carrier">
            <span>배송사</span>
            <select value={carrierId} onChange={(e) => setCarrierId(e.target.value === "" ? "" : Number(e.target.value))}>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.region})
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn-primary dsp-cta"
            disabled={busy || !trip.list.length || carrierId === ""}
            onClick={confirmDispatch}
            title={trip.over ? "적재한도 초과 상태로도 확정은 가능합니다 — 현장 확인 후 진행하세요" : undefined}
          >
            배차 확정 · {trip.list.length}건 / {trip.stops.length}착지
            <Icon name="arrowR" size={15} />
          </button>
        </aside>
      </div>

      {/* ---------- 금일 확정 배차 ---------- */}
      <section className="card dsp-done">
        <div className="dsp-head">
          <div className="nx-sect">
            <span className="nx-sect-title">금일 확정 배차</span>
            <span className="dsp-count">{dispatched.length}</span>
          </div>
          <button type="button" className="dsp-btn" onClick={exportCsv}>
            <Icon name="download" size={14} />
            배차서 출력
          </button>
        </div>
        <ResponsiveTable className="dsp-table-wrap" cardsBelow="fit">
          <table className="data-table dsp-table">
            <thead>
              <tr>
                <th className="rt-title">배차번호</th>
                <th>출고번호</th>
                <th>납품처</th>
                <th>배송사</th>
                <th>차량</th>
                <th className="num">중량</th>
                <th className="num">PLT</th>
                <th>적재율</th>
              </tr>
            </thead>
            <tbody>
              {dispatched.map((d) => {
                const spec = VEHICLES.find((v) => v.name === d.vehicleType) ?? VEHICLES[0];
                const pct = Math.round((d.totalWeightKg / spec.weight) * 100);
                return (
                  <tr key={d.id}>
                    <td className="dsp-no">{d.dispatchNo}</td>
                    <td>{d.outboundNo}</td>
                    <td>{d.customerName}</td>
                    <td>{d.carrierName ?? "-"}</td>
                    <td>
                      <span className="ds-badge gray">{d.vehicleType ?? "-"}</span>
                    </td>
                    <td className="num">{num(d.totalWeightKg)}</td>
                    <td className="num">{d.palletCount}</td>
                    <td className="dsp-rate">
                      {/* 막대와 % 를 한 줄로 — 폰 카드에서 둘이 위아래로 흩어지지 않게 */}
                      <span className="dsp-rate-in">
                        <span className="nx-bar">
                          <i className={`tone-${gaugeTone(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </span>
                        <b className={`tone-${gaugeTone(pct)}`}>{pct}%</b>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!dispatched.length && !loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="nx-empty">확정된 배차가 없습니다.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ResponsiveTable>
      </section>
    </section>
  );
};

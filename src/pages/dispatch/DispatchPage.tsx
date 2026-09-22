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

/**
 * 합계(중량 · 부피 · 파레트 수)는 제원 미등록 품목이 섞이면 null = 모름.
 * 예전에는 서버가 0 으로 더해 가벼운 값이 나오고 그 값으로 차량을 추천했다 (2026-09-22 현업 회의 3번 · 폴백 금지).
 */
type Target = {
  outboundId: number;
  outboundNo: string;
  customerName: string;
  shipAddress: string | null;
  region: string;
  status: string;
  scheduledDate: string | null;
  totalWeightKg: number | null;
  totalVolumeM3: number | null;
  palletCount: number | null;
  /** 그 제원이 미등록인 품목 수 */
  weightMissing: number;
  volumeMissing: number;
  palletMissing: number;
  /** 중량 · 파레트 수를 모르면 null (추천하지 않는다) */
  recommendedVehicle: string | null;
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
  totalWeightKg: number | null;
  totalVolumeM3: number | null;
  palletCount: number | null;
  dispatchDate: string | null;
};

/** 모르는 합계 — 미등록 품목 수를 툴팁으로 */
const Unknown = ({ missing, what }: { missing?: number; what: string }) => (
  <span
    className="dsp-unknown"
    title={missing ? `${what} 미등록 품목 ${missing}개 — 기준정보 › 품목 마스터에서 입력하면 계산됩니다` : `${what}을(를) 모릅니다`}
  >
    모름
  </span>
);

/** 목록의 합계는 다 알 때만 더한다 — 하나라도 모르면 null */
const sumKnown = (values: Array<number | null>) =>
  values.every((value) => value != null) ? values.reduce<number>((acc, value) => acc + (value ?? 0), 0) : null;

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
/** 부피 m³ — 택배 한두 상자(0.05m³)가 "0.0" 으로 보이지 않게 1 미만은 소수 둘째 자리까지 */
const m3 = (v: number) => (v < 1 ? v.toFixed(2) : v.toFixed(1));
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
    // 하나라도 모르면 그 합계는 모른다 — 아는 것만 더하면 실제보다 가볍게 나와 작은 차를 고르게 된다
    const weight = list.length ? sumKnown(list.map((t) => t.totalWeightKg)) : 0;
    const volume = list.length ? sumKnown(list.map((t) => t.totalVolumeM3)) : 0;
    const pallet = list.length ? sumKnown(list.map((t) => t.palletCount)) : 0;
    const spec = VEHICLES.find((v) => v.name === vehicle) ?? VEHICLES[2];
    const wPct = weight == null ? null : spec.weight ? (weight / spec.weight) * 100 : 0;
    const vPct = volume == null ? null : spec.volume ? (volume / spec.volume) * 100 : 0;
    const stops = Array.from(new Set(list.map((t) => cityOf(t.shipAddress))));
    const fit = weight != null && volume != null ? VEHICLES.find((v) => weight <= v.weight && volume <= v.volume) : undefined;
    const unknownCount = list.filter((t) => t.totalWeightKg == null || t.totalVolumeM3 == null).length;
    return {
      list, weight, volume, pallet, spec,
      wPct, vPct,
      over: (wPct ?? 0) > 100 || (vPct ?? 0) > 100,
      stops,
      fit: fit?.name ?? null,
      unknownCount
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
        // 모르면 '모름' — 빈칸이면 엑셀에서 0 으로 더해진다
        d.totalWeightKg ?? "모름", d.totalVolumeM3 ?? "모름", d.palletCount ?? "모름", d.dispatchDate
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
                      <td className="num">{t.totalWeightKg != null ? num(t.totalWeightKg) : <Unknown missing={t.weightMissing} what="단위 중량" />}</td>
                      <td className="num">{t.totalVolumeM3 != null ? m3(t.totalVolumeM3) : <Unknown missing={t.volumeMissing} what="단위 부피" />}</td>
                      <td className="num">{t.palletCount != null ? t.palletCount : <Unknown missing={t.palletMissing} what="파레트 입수" />}</td>
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
            {(
              [
                { label: "중량", pct: trip.wPct },
                { label: "부피", pct: trip.vPct }
              ] as const
            ).map((gauge) => (
              <div key={gauge.label} className="dsp-gauge">
                <span className="dsp-gauge-label">{gauge.label}</span>
                <span className="nx-bar dsp-gauge-bar">
                  {gauge.pct != null ? (
                    <i className={`tone-${gaugeTone(gauge.pct)}`} style={{ width: `${Math.min(gauge.pct, 100)}%` }} />
                  ) : null}
                </span>
                {gauge.pct != null ? (
                  <span className={`dsp-gauge-pct tone-${gaugeTone(gauge.pct)}`}>{Math.round(gauge.pct)}%</span>
                ) : (
                  <span className="dsp-gauge-pct dsp-unknown">모름</span>
                )}
              </div>
            ))}
            <div className="dsp-gauge-sub">
              {trip.weight != null ? `${num(trip.weight)}kg` : "중량 모름"} · {trip.volume != null ? `${m3(trip.volume)}m³` : "부피 모름"} /{" "}
              {num(trip.spec.weight)}kg · {trip.spec.volume}m³
            </div>
          </div>

          {trip.unknownCount > 0 ? (
            <div className="ds-callout warning dsp-warn">
              <Icon name="alert" size={16} />
              <span>
                선택한 {trip.unknownCount}건에 제원(중량·부피) 미등록 품목이 있어 적재율을 계산할 수 없습니다 — 차량은 현장에서 확인해 직접 고르세요.
                기준정보 › 품목 마스터에서 제원을 넣으면 계산됩니다.
              </span>
            </div>
          ) : null}

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
              <dd>{trip.weight != null ? num(trip.weight) : <Unknown what="중량" />}</dd>
            </div>
            <div>
              <dt>PLT</dt>
              <dd>{trip.pallet != null ? trip.pallet : <Unknown what="파레트 수" />}</dd>
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
                <b>{t.totalWeightKg != null ? num(t.totalWeightKg) : <Unknown missing={t.weightMissing} what="단위 중량" />}</b>
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
                const pct = d.totalWeightKg != null ? Math.round((d.totalWeightKg / spec.weight) * 100) : null;
                return (
                  <tr key={d.id}>
                    <td className="dsp-no">{d.dispatchNo}</td>
                    <td>{d.outboundNo}</td>
                    <td>{d.customerName}</td>
                    <td>{d.carrierName ?? "-"}</td>
                    <td>
                      <span className="ds-badge gray">{d.vehicleType ?? "-"}</span>
                    </td>
                    <td className="num">{d.totalWeightKg != null ? num(d.totalWeightKg) : <Unknown what="중량" />}</td>
                    <td className="num">{d.palletCount != null ? d.palletCount : <Unknown what="파레트 수" />}</td>
                    <td className="dsp-rate">
                      {/* 막대와 % 를 한 줄로 — 폰 카드에서 둘이 위아래로 흩어지지 않게 */}
                      {pct != null ? (
                        <span className="dsp-rate-in">
                          <span className="nx-bar">
                            <i className={`tone-${gaugeTone(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </span>
                          <b className={`tone-${gaugeTone(pct)}`}>{pct}%</b>
                        </span>
                      ) : (
                        <span className="dsp-sub">중량을 몰라 계산 못 함</span>
                      )}
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

import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { apiGet, apiPut } from "../../services/http";
import "./outboundDialogs.css";

/* ============================================================
   출고일 · 인수자 변경 — 물류팀이 WMS 에서 바꾸고 주문 시스템에 알린다
   (2026-10-19 결정: 출고일 · 인수자는 WMS 에서 바꾼다)
   출고일은 주문 시스템이 ERP 출고일까지 바꿀 때까지 기다렸다가 저장한다 — 안 되면 그대로 (2026-10-21)
   주문 시스템에서 온 출고만 인수자를 바꿀 수 있다. WMS 에서 만든 출고는 출고예정일만.
   ============================================================ */

type Delivery = {
  id: number;
  outboundNo: string;
  status: string;
  fromOms: boolean;
  scheduledDate: string | null;
  shipAddress: string | null;
  requestedDate: string | null;
  requestedTime: string | null;
  readyDate: string | null;
  readyTime: string | null;
  vehicleTypeName: string | null;
  receiverName: string | null;
  receiverMobile: string | null;
  receiverTel: string | null;
  zipCode: string | null;
  address: string | null;
  addressDetail: string | null;
  editable: boolean;
  /** 저장 응답에서만 — 주문 시스템에 알렸는가 (출고일은 ERP 까지 반영된 뒤에 저장된다) */
  notified?: boolean;
};

/** 배송차종 — 주문 시스템의 배송차종 이름 그대로 */
const VEHICLES = ["없음", "다마스", "라보", "1톤", "1.4톤", "2.5톤", "3.5톤", "5톤이상", "택배"];

type Tab = "schedule" | "receiver";

type Props = {
  /** 출고 id — null 이면 닫힘 */
  outboundId: number | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const v = (s: string | null | undefined) => s ?? "";
const orNull = (s: string) => (s.trim() ? s.trim() : null);

export const DeliveryEditDialog = ({ outboundId, onClose, onSaved }: Props) => {
  const [data, setData] = useState<Delivery | null>(null);
  const [tab, setTab] = useState<Tab>("schedule");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [requestedDate, setRequestedDate] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [readyTime, setReadyTime] = useState("");
  const [vehicle, setVehicle] = useState("");

  const [receiverName, setReceiverName] = useState("");
  const [receiverMobile, setReceiverMobile] = useState("");
  const [receiverTel, setReceiverTel] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");

  useEffect(() => {
    if (outboundId == null) return;
    setData(null);
    setError(null);
    setTab("schedule");
    apiGet<Delivery>(`/outbounds/${outboundId}/delivery`)
      .then((d) => {
        setData(d);
        setRequestedDate(v(d.fromOms ? d.requestedDate : d.scheduledDate));
        setRequestedTime(v(d.requestedTime));
        setReadyDate(v(d.readyDate));
        setReadyTime(v(d.readyTime));
        setVehicle(v(d.vehicleTypeName));
        setReceiverName(v(d.receiverName));
        setReceiverMobile(v(d.receiverMobile));
        setReceiverTel(v(d.receiverTel));
        setZipCode(v(d.zipCode));
        setAddress(v(d.address));
        setAddressDetail(v(d.addressDetail));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"));
  }, [outboundId]);

  const save = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      if (tab === "schedule") {
        const saved = await apiPut<Delivery>(`/outbounds/${data.id}/schedule`, data.fromOms
          ? { requestedDate: orNull(requestedDate), requestedTime: orNull(requestedTime), readyDate: orNull(readyDate),
              readyTime: orNull(readyTime), vehicleTypeName: orNull(vehicle) }
          : { requestedDate: orNull(requestedDate) });
        onSaved(saved?.notified
          ? `${data.outboundNo} 출고일을 바꿨습니다 — 주문 시스템 · ERP 에 반영했습니다.`
          : data.fromOms
            ? `${data.outboundNo} 출고일을 바꿨습니다.`
            : `${data.outboundNo} 출고예정일을 바꿨습니다.`);
      } else {
        await apiPut(`/outbounds/${data.id}/receiver`, {
          receiverName: orNull(receiverName), receiverMobile: orNull(receiverMobile), receiverTel: orNull(receiverTel),
          zipCode: orNull(zipCode), address: orNull(address), addressDetail: orNull(addressDetail)
        });
        onSaved(`${data.outboundNo} 인수자 · 배송지를 바꿨습니다 — 주문 시스템에 알립니다.`);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const locked = data !== null && !data.editable;
  /** 출고일은 주문 시스템 · ERP 반영을 기다린다 — 그동안 닫지 않는다 */
  const close = () => {
    if (!busy) onClose();
  };
  const busyLabel = tab === "schedule" && data?.fromOms ? "주문 시스템 · ERP 반영 중…" : "저장 중…";

  return (
    <Modal
      open={outboundId !== null}
      title="출고일 · 인수자 변경"
      desc={data ? `${data.outboundNo} · ${data.status}` : "불러오는 중…"}
      icon="edit"
      iconBg="var(--primary-bg)"
      iconColor="var(--primary-ink)"
      onClose={close}
      className="dlv-modal"
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={busy} onClick={close}>닫기</button>
          <button type="button" className="btn-primary" disabled={busy || !data || locked} onClick={save} aria-busy={busy}>
            {busy ? <span className="ob-wait">{busyLabel}</span> : tab === "schedule" ? "출고일 저장" : "인수자 저장"}
          </button>
        </>
      }
    >
      {error ? (
        <div className="ds-callout danger" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      ) : null}
      {!data ? (
        <p className="dlv-note">{error ? "" : "지금 값을 불러오는 중입니다…"}</p>
      ) : (
        <>
          <div className="dlv-tabs" role="tablist" aria-label="바꿀 것">
            <button type="button" role="tab" aria-selected={tab === "schedule"} className={`dlv-tab${tab === "schedule" ? " is-on" : ""}`} onClick={() => setTab("schedule")}>
              <Icon name="clock" size={14} />
              출고일
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "receiver"}
              className={`dlv-tab${tab === "receiver" ? " is-on" : ""}`}
              disabled={!data.fromOms}
              title={data.fromOms ? undefined : "WMS 에서 만든 출고에는 인수자 칸이 없습니다"}
              onClick={() => setTab("receiver")}
            >
              <Icon name="user" size={14} />
              인수자
            </button>
          </div>

          <div className={`ds-callout ${locked ? "danger" : "info"}`} style={{ marginBottom: 12 }}>
            <Icon name={locked ? "lock" : "check"} size={18} />
            <span>
              {locked
                ? `${data.status} 상태라 바꿀 수 없습니다 — 나가기 전(출고대기 · 피킹중 · 피킹완료 · 보류)에만 바꿉니다.`
                : !data.fromOms
                  ? "WMS 에서 만든 출고 — 출고예정일만 바뀝니다."
                  : tab === "schedule"
                    ? "저장하면 주문 시스템이 ERP 출고일까지 바꿀 때까지 기다립니다 — 반영되지 않으면 출고일은 그대로입니다."
                    : "저장하면 주문 시스템에 바뀐 값을 알립니다 — 주문의 배송 정보도 같이 바뀝니다."}
            </span>
          </div>

          {tab === "schedule" ? (
            <div className="dlv-grid">
              <label className="ds-field">
                <span>{data.fromOms ? "배송희망일 *" : "출고예정일 *"}</span>
                <input type="date" value={requestedDate} disabled={locked} onChange={(e) => setRequestedDate(e.target.value)} />
              </label>
              {data.fromOms ? (
                <>
                  <label className="ds-field">
                    <span>희망 시간</span>
                    <input type="time" value={requestedTime} disabled={locked} onChange={(e) => setRequestedTime(e.target.value)} />
                  </label>
                  <label className="ds-field">
                    <span>출고일 (배송희망일보다 늦지 않게)</span>
                    <input type="date" value={readyDate} disabled={locked} onChange={(e) => setReadyDate(e.target.value)} />
                  </label>
                  <label className="ds-field">
                    <span>출고 시간</span>
                    <input type="time" value={readyTime} disabled={locked} onChange={(e) => setReadyTime(e.target.value)} />
                  </label>
                  <label className="ds-field">
                    <span>배송차종</span>
                    <select value={vehicle} disabled={locked} onChange={(e) => setVehicle(e.target.value)}>
                      <option value="">정하지 않음</option>
                      {VEHICLES.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          ) : (
            <div className="dlv-grid">
              <label className="ds-field">
                <span>인수자 *</span>
                <input value={receiverName} maxLength={100} disabled={locked} onChange={(e) => setReceiverName(e.target.value)} />
              </label>
              <label className="ds-field">
                <span>휴대폰 *</span>
                <input value={receiverMobile} maxLength={30} inputMode="tel" disabled={locked} onChange={(e) => setReceiverMobile(e.target.value)} />
              </label>
              <label className="ds-field">
                <span>전화</span>
                <input value={receiverTel} maxLength={30} inputMode="tel" disabled={locked} onChange={(e) => setReceiverTel(e.target.value)} />
              </label>
              <label className="ds-field">
                <span>우편번호 *</span>
                <input value={zipCode} maxLength={10} inputMode="numeric" disabled={locked} onChange={(e) => setZipCode(e.target.value)} />
              </label>
              <label className="ds-field dlv-wide">
                <span>주소 *</span>
                <input value={address} maxLength={255} disabled={locked} onChange={(e) => setAddress(e.target.value)} />
              </label>
              <label className="ds-field dlv-wide">
                <span>상세주소</span>
                <input value={addressDetail} maxLength={255} disabled={locked} onChange={(e) => setAddressDetail(e.target.value)} />
              </label>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { apiPost } from "../../services/http";

/* ============================================================
   출고 불가 알림 (예전 '출고 거부') — 출고 확정 · 피킹 화면이 같이 쓴다
   출고를 끝내지 않고 보류로 멈춘 뒤 주문 시스템에 알린다. 영업이 주문을 취소하면 출고도 취소되고
   (집어 둔 물건은 피킹한 LOT 그대로 제자리로), 문제가 풀리면 물류팀이 [다시 출고]로 이어 간다.
   ============================================================ */

export type HoldTarget = { id: number; outboundNo: string; customerName: string | null };

const REASONS = ["재고부족", "파손", "주소 오류", "품질 이슈", "기타"];

type Props = {
  target: HoldTarget | null;
  onClose: () => void;
  /** 보낸 뒤 — 알림 문구 */
  onDone: (message: string) => void;
};

export const HoldDialog = ({ target, onClose, onDone }: Props) => {
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setReason(REASONS[0]);
    setNote("");
    setError(null);
  }, [target]);

  const submit = async () => {
    if (!target) return;
    const full = note.trim() ? `${reason} · ${note.trim()}` : reason;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/outbounds/${target.id}/hold`, { reason: full });
      onDone(`${target.outboundNo} 출고 불가 알림 — 보류로 두고 주문 시스템에 알렸습니다 (${full}). 영업이 주문을 취소하거나, 문제가 풀리면 [다시 출고]를 누르세요.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "출고 불가 알림 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      title="출고 불가 알림"
      desc={target ? `${target.outboundNo} · ${target.customerName ?? ""}` : ""}
      icon="ban"
      iconBg="var(--c-danger-bg)"
      iconColor="var(--c-danger)"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>닫기</button>
          <button
            type="button"
            className="btn-primary"
            style={{ background: "var(--c-danger)", borderColor: "var(--c-danger)" }}
            disabled={busy}
            onClick={submit}
          >
            출고 불가 알리기
          </button>
        </>
      }
    >
      <div className="ds-callout warning" style={{ marginBottom: 14 }}>
        <Icon name="alert" size={18} />
        <span>
          출고는 <b>보류</b>로 멈추고 주문 시스템에 사유를 알립니다. 영업이 주문을 취소하면 출고도 취소되고,
          집어 둔 물건은 피킹한 LOT 그대로 제자리로 돌아갑니다. 문제가 풀리면 <b>[다시 출고]</b>로 이어서 진행합니다.
        </span>
      </div>
      {error ? (
        <div className="ds-callout danger" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      ) : null}
      <label className="ds-field">
        <span>사유</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="ds-field">
        <span>자세히 (선택)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={150} placeholder="예: 세면대 1개 파손, 다음 주 입고 예정" />
      </label>
    </Modal>
  );
};

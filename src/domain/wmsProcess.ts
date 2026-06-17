import type { Step } from "../components/ui/Stepper";
import type { BadgeTone } from "../components/ui/StatusBadge";

/* ============================================================
   WMS 프로세스 단계/상태 모델 (canonical)
   기준 문서: DOCS/WMS_프로세스_정리.md
   화면의 Stepper / 상태 배지는 이 파일을 단일 출처로 사용한다.
   ============================================================ */

/* ---------- 출고 (WMS 담당 구간) — v2 ----------
   출고요청 수신 → 피킹(QR 검증·피킹재고 차감) → 출고확정(송장 필수, ERP 전송) → (재고차감·결과전송 자동)
   ※ 부분출고 불가 — 전량 확정 또는 거부. */
export const OUTBOUND_STEPS: Step[] = [
  { key: "received", label: "출고요청" },
  { key: "picking", label: "피킹" },
  { key: "shipped", label: "출고확정" }
];

/* ---------- 입고 (일반) — v2 ----------
   입고예정 → 입고등록 → 창고/로케이션 지정 → 입고확정(검수, 격납대기 생성) → 격납(가용 전환) */
export const INBOUND_STEPS: Step[] = [
  { key: "scheduled", label: "입고예정" },
  { key: "register", label: "입고등록" },
  { key: "locate", label: "창고/로케이션" },
  { key: "confirm", label: "입고확정" },
  { key: "putaway", label: "격납" }
];

/* ---------- 격납 (Putaway) ----------
   격납대기 → 피킹/보충 로케이션 선택 → 로케이션 QR 확인 → 격납완료(가용재고 전환) */
export const PUTAWAY_STEPS: Step[] = [
  { key: "wait", label: "격납대기" },
  { key: "location", label: "로케이션 선택" },
  { key: "qr", label: "QR 확인" },
  { key: "done", label: "격납완료" }
];

/* ---------- 재고이동 ----------
   이동요청 → 이동확정 → 반영(일반: 중계서버→ERP / 외주: WMS만, ERP 미연동) */
export const TRANSFER_STEPS: Step[] = [
  { key: "request", label: "이동요청" },
  { key: "confirm", label: "이동확정" },
  { key: "reflect", label: "반영" }
];

/* ---------- 출고 화면 운영 상태값 (v2: 피킹 단계 도입) ----------
   출고대기(요청수신) → 피킹중 → 피킹완료(송장입력) → 출고완료 / 거부
   거부: 재고부족 등으로 주문 실패 회신 (부분출고 불가 → 전량 확정 또는 거부) */
export type OutboundScreenStatus = "출고대기" | "피킹중" | "피킹완료" | "출고완료" | "거부";

export const OUTBOUND_STATUS_TONE: Record<OutboundScreenStatus, BadgeTone> = {
  출고대기: "gray",
  피킹중: "info",
  피킹완료: "violet",
  출고완료: "success",
  거부: "danger"
};

/* ---------- 중계서버 연동 상태값 (모니터링) ---------- */
export type InterfaceState =
  | "success"
  | "fail"
  | "waiting"
  | "sending"
  | "reprocess"
  | "dup"
  | "excluded";

export const INTERFACE_STATUS: Record<InterfaceState, { label: string; tone: BadgeTone }> = {
  success: { label: "성공", tone: "success" },
  fail: { label: "실패", tone: "danger" },
  waiting: { label: "대기", tone: "gray" },
  sending: { label: "전송중", tone: "gray" },
  reprocess: { label: "재처리대기", tone: "warning" },
  dup: { label: "중복차단", tone: "yellow" },
  excluded: { label: "전송제외", tone: "info" }
};

/* ---------- 재고이동 허용 규칙 ----------
   일반→일반: ERP 반영 / 외주→외주: ERP 미연동 / 일반↔외주: 불가 */
export type WarehouseKind = "일반" | "외주";

export const isTransferAllowed = (from: WarehouseKind, to: WarehouseKind): boolean => from === to;

/** 이동이 ERP에 반영되는지 (일반↔일반만 반영, 외주는 미연동) */
export const isErpReflected = (from: WarehouseKind, to: WarehouseKind): boolean =>
  from === "일반" && to === "일반";

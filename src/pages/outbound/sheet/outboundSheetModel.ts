/* ============================================================
   출고요청서(인쇄) 데이터 — 서버 GET /outbounds/{id}/sheet
   기준: 기존 OMS 출고요청서 출력물의 칸 배치

   · 반드시 오는 칸 = WMS 가 지금 가진 값 (출고번호 · 납품처 · 주소 · 요청일 · 로케이션 · 수량)
   · `oms` · 줄의 `setAlias`/`colorName`/`lineMemo`/`separateLoading` = OMS 연동 계약(비공개 문서 2.4·2.5)으로
     받아 저장한 뒤에 채워진다. 그 전에는 오지 않고, 출고요청서에는 빈칸으로 찍힌다.
     칸 이름은 계약서와 같게 둔다 — 서버가 채우기 시작하면 화면은 손대지 않는다.
   ============================================================ */

export type OutboundSheetOms = {
  /** 오더유형 (일반주문 · A/S주문(유상) …) */
  orderTypeName?: string | null;
  /** 요청내용 요약 — 맨 위 큰 글씨 */
  requestSummary?: string | null;
  salesGroupName?: string | null;
  salesRepName?: string | null;
  salesRepTel?: string | null;
  salesRepMobile?: string | null;
  /** 고객명 (주문자) */
  ordererName?: string | null;
  ordererTel?: string | null;
  ordererMobile?: string | null;
  /** 거주여부 — 시공 주문만 O/X, 아니면 null(-) */
  residing?: boolean | null;
  receiverName?: string | null;
  receiverMobile?: string | null;
  zipCode?: string | null;
  /** 요청시간 HHmm */
  requestedTime?: string | null;
  /** 세대반입 유무 */
  householdCarryIn?: boolean | null;
  /** 출고메모 (주문 화면의 주문자 "기타") */
  shippingMemo?: string | null;
};

export type OutboundSheetLine = {
  locationCode: string | null;
  itemCode: string;
  itemName: string;
  unit?: string | null;
  qty: number;
  /** 세트 별칭 (욕실 기본 · 거실 욕실 …) — 같은 이름끼리 묶어 합계를 낸다. 없으면 한 묶음 */
  setAlias?: string | null;
  /** 색상 — 제품명 뒤에 [색상] 으로 붙인다 (기존 출고요청서와 같게) */
  colorName?: string | null;
  /** 비고 */
  lineMemo?: string | null;
  /** 별도상차 — 기존 출고요청서처럼 노랗게 칠한다 */
  separateLoading?: boolean;
};

export type OutboundSheet = {
  id: number;
  /** WMS 출고번호 — QR 에 그대로 넣는다 (피킹 화면 "오더 QR 스캔" 칸이 이 값과 비교한다) */
  outboundNo: string;
  /** 오더번호 (OMS 주문번호) */
  omsOrderNo: string | null;
  /** 출하번호 (기존 OMS 배송번호) */
  shipNo: string | null;
  outType: string | null;
  status: string;
  /** 출고요청일 yyyy-MM-dd */
  scheduledDate: string | null;
  warehouseName: string | null;
  customerCode: string | null;
  customerName: string | null;
  carrier: string | null;
  /** 현장주소 */
  shipAddress: string | null;
  oms?: OutboundSheetOms | null;
  lines: OutboundSheetLine[];
};

export type SheetGroup = { name: string; lines: OutboundSheetLine[]; totalQty: number };

/** 세트 이름 없는 줄의 묶음 이름 */
export const NO_SET = "출고 품목";

/** 세트별로 묶는다 — 처음 나온 순서를 지킨다 (줄 순서는 서버가 정한 로케이션 순) */
export const groupBySet = (lines: OutboundSheetLine[]): SheetGroup[] => {
  const groups = new Map<string, OutboundSheetLine[]>();
  lines.forEach((line) => {
    const name = line.setAlias?.trim() || NO_SET;
    groups.set(name, [...(groups.get(name) ?? []), line]);
  });
  return Array.from(groups, ([name, list]) => ({ name, lines: list, totalQty: list.reduce((sum, l) => sum + l.qty, 0) }));
};

/** 오더번호 뒷자리 — 기존 출고요청서의 큰 숫자 (OD2610000935 → 000935) */
export const orderIndexOf = (orderNo: string | null) => (orderNo && orderNo.length > 6 ? orderNo.slice(6) : orderNo ?? "");

/** 0800 → 08:00 */
export const fmtTime = (hhmm: string | null | undefined) =>
  hhmm && /^\d{4}$/.test(hhmm) ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : hhmm ?? "";

/** 제품명 [색상] — 기존 출고요청서 표기 */
export const itemLabel = (line: OutboundSheetLine) => (line.colorName ? `${line.itemName} [${line.colorName}]` : line.itemName);

/** O / X / - — 기존 출고요청서 표기 */
export const ox = (value: boolean | null | undefined) => (value == null ? "-" : value ? "O" : "X");

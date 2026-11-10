/**
 * 품목 마스터 '물류 정보' — 서버(GET /items · GET /items/logistics-options · PUT /items/{id}/logistics)와 같은 모양.
 * 물류 쪽 칸(제원 · TI · HI · 안전재고 · 리드타임 · 발주 담당자 · 피킹 로케이션 · 비고)은 소싱 · 물류가 고친다.
 */

/** 품목 마스터 · 처리 — '물류 정보' 고치기 (처음 값: 물류 · 소싱) */
export const ITEM_WORK = "master/item-master:work";

export const MAX_TI = 999;
export const MAX_HI = 99;
export const MIN_LEAD_DAYS = 1;
export const MAX_LEAD_DAYS = 365;
export const MAX_REMARK = 500;

/** 창고 하나의 피킹 로케이션 — valid = false 면 그 칸이 이제 피킹 칸이 아니거나 쓰지 않는다('확인 필요') */
export type PickLocation = {
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  locationId: number;
  locationCode: string;
  valid: boolean;
};

export type ItemRow = {
  id: number;
  code: string;
  name: string;
  spec?: string | null;
  category: string | null;
  unit: string;
  safetyStock: number;
  barcode?: string | null;
  /** 주문 시스템의 출고요청이 품목을 찾는 열쇠 — 비어 있으면 그 품목은 출고요청으로 받을 수 없다 */
  erpItemCode?: string | null;
  consign: boolean;
  active: boolean;
  /**
   * 물류 제원 — null = 미등록. 배차 총중량 · 차량 추천 · 파레트 수가 이 값을 쓴다.
   * 미등록 품목이 섞인 주문은 합계가 '모름'으로 나온다 (0 으로 치지 않는다)
   */
  unitWeightKg: number | null;
  unitVolumeCm3: number | null;
  /** TI · HI 가 둘 다 있으면 TI × HI */
  unitsPerPallet: number | null;
  ti: number | null;
  hi: number | null;
  leadTimeDays: number;
  purchaseManagerId: string | null;
  purchaseManagerName: string | null;
  purchaseManagerLocked: boolean;
  remark: string | null;
  pickLocations: PickLocation[];
};

export type UserChoice = { id: string; name: string; roles: string | null; locked: boolean };
export type WarehouseSpots = { id: number; code: string; name: string; locations: { id: number; code: string }[] };
export type LogisticsOptions = { users: UserChoice[]; warehouses: WarehouseSpots[] };
export type LogisticsSaved = { item: ItemRow; changes: string[]; warnings: string[] };

/** 14 → "14일 (약 2주)", 90 → "90일 (약 3개월)", 7 → "7일" */
export const leadText = (days: number) => {
  if (days >= 60) return `${days}일 (약 ${Math.round(days / 30)}개월)`;
  if (days >= 14) return `${days}일 (약 ${Math.round(days / 7)}주)`;
  return `${days}일`;
};

/** 지금도 쓰는 피킹 칸인 피킹 로케이션 */
export const validPicks = (item: Pick<ItemRow, "pickLocations">) => item.pickLocations.filter((p) => p.valid);

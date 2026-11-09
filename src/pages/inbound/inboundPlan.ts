/* ============================================================
   입고예정 등록 · 고치기 · 엑셀 가져오기 — 화면이 주고받는 모양
   서버(또는 데모의 목)가 칸을 검사한다. 화면은 넣기 쉽게 돕고 서버 문구를 그대로 보여 준다.
   ============================================================ */

/** 등록 · 수정 · 가져오기 기능 — 없으면 단추가 보이지 않는다 */
export const PLAN_WORK = "inbound/inbound-schedule:work";

export type PlanType = "일반" | "외주" | "이동";
export const PLAN_TYPES: PlanType[] = ["일반", "외주", "이동"];

/** 구분마다 고를 공급사 종류 */
export const SUPPLIER_KIND: Record<PlanType, string> = { 일반: "공급사", 외주: "외주업체", 이동: "공장" };
/** 공급사 칸 이름 */
export const SUPPLIER_LABEL: Record<PlanType, string> = { 일반: "공급사", 외주: "외주업체", 이동: "출발 공장" };
/** 번호 칸 이름 — 이동은 이동 번호 */
export const NUMBER_LABEL: Record<PlanType, string> = { 일반: "PO 번호", 외주: "PO 번호", 이동: "이동 번호" };

/** 차량 보기 — 고르거나 직접 적는다 */
export const VEHICLES = ["1톤", "2.5톤", "3.5톤", "5톤", "11톤", "25톤", "컨테이너", "택배"];

export type SupplierOption = { id: number; code: string; name: string; type: string; erpCode: string | null };
export type WarehouseChoice = { id: number; code: string; name: string; type: string };
export type PlanOptions = { suppliers: SupplierOption[]; warehouses: WarehouseChoice[]; defaultWarehouseId: number | null };
export type PlanItem = { id: number; code: string; erpItemCode: string | null; name: string; spec: string | null; unit: string };

export type PlanEditLine = {
  id: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  spec: string | null;
  unit: string;
  qty: number;
  receivedQty: number;
  closedQty: number;
  /** 받음 + 닫음 (그 아래로 못 줄인다) */
  minQty: number;
  /** 받은 것도 닫은 것도 없는 줄만 지운다 */
  removable: boolean;
};

/** 고치기 창 — ALL 받기 전(전부) · PARTIAL 나눠 입고 중(일부) · NONE 못 고침 */
export type PlanEdit = {
  id: number;
  inboundNo: string;
  status: string;
  mode: "ALL" | "PARTIAL" | "NONE";
  lockReason: string | null;
  type: PlanType;
  supplierId: number | null;
  supplierCode: string | null;
  supplierName: string | null;
  supplierType: string | null;
  poNo: string | null;
  moveRef: string | null;
  warehouseId: number | null;
  warehouseName: string | null;
  expectedDate: string | null;
  arrivalTime: string | null;
  vehicle: string | null;
  palletQty: number | null;
  driverPhone: string | null;
  remark: string | null;
  version: string;
  lines: PlanEditLine[];
};

export type PlanSaved = { id: number; inboundNo: string; warnings: string[] };
export type SupplierSaved = { supplier: SupplierOption; existing: boolean };

/** 12:00 이후 도착 — 물류2팀과 먼저 협의하도록 알린다 (막지 않음) */
export const isAfternoon = (hm: string | null | undefined) => Boolean(hm) && Number(String(hm).slice(0, 2)) >= 12;

/** 검색용 — 띄어쓰기 · 대소문자 무시 */
export const searchKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, "");

import type { AccessUser } from "../app/access";
import { useAuthStore } from "../app/store/authStore";
import { MOCK_TODAY } from "../shared/appDate";
import type { LoginResult } from "./authService";
import { createAccessMock } from "./mockAccess";
import { createAccountMock, type MockAccount } from "./mockAccountAdmin";
import { createDashboardMock, regionOf } from "./mockDashboard";
import { createItemImportMock } from "./mockItemImport";
import { createOmsChangeMock } from "./mockOmsChange";
import { createOutboundPhotoMock } from "./mockOutboundPhoto";
import { createWarehouseMock } from "./mockWarehouse";

type AnyRecord = Record<string, any>;

const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
// 시드 기준일 — 화면 날짜 필터 기본값도 같은 값을 쓴다(shared/appDate)
const today = MOCK_TODAY;

const nowText = () => `${MOCK_TODAY} ${new Date().toTimeString().slice(0, 5)}`;

/** 데모 계정 — 비밀번호는 데모 값. 사용자 관리 화면(목)이 이 표를 고친다 (메모리에만) */
export const mockAccounts: Record<string, MockAccount> = {
  admin: { password: "1234", id: "admin", name: "관리자", lastLoginAt: `${MOCK_TODAY} 08:42`, createdAt: "2026-06-01 09:00" },
  logistics: { password: "1234", id: "logistics", name: "물류담당", lastLoginAt: `${MOCK_TODAY} 08:15`, createdAt: "2026-06-01 09:00" },
  inbound: { password: "1234", id: "inbound", name: "입고담당", lastLoginAt: `${MOCK_TODAY} 07:58`, createdAt: "2026-06-01 09:00" },
  outbound: { password: "1234", id: "outbound", name: "출고담당", lastLoginAt: `${MOCK_TODAY} 08:03`, createdAt: "2026-06-01 09:00" },
  inventory: { password: "1234", id: "inventory", name: "재고담당", lastLoginAt: "2026-06-16 17:20", createdAt: "2026-06-01 09:00" },
  sourcing: { password: "1234", id: "sourcing", name: "소싱담당", lastLoginAt: "2026-06-16 10:11", createdAt: "2026-06-10 09:00" },
  partner: { password: "1234", id: "partner", name: "협력사", lastLoginAt: "2026-06-15 14:30", createdAt: "2026-06-01 09:00" },
  sales: { password: "1234", id: "sales", name: "영업담당", lastLoginAt: "2026-06-16 09:30", createdAt: "2026-06-12 09:00" },
  // 사용자 관리 화면이 비지 않게 — 잠긴 계정 · 첫 로그인 전 계정 · 역할이 둘인 계정 (가짜)
  "temp.worker": { password: "Demo2026x", id: "temp.worker", name: "단기근무", locked: true, lockedAt: "2026-06-12 18:00", lastLoginAt: "2026-06-12 17:40", createdAt: "2026-06-02 09:00" },
  "new.sourcing": { password: "Kq7mPx3Rt2", id: "new.sourcing", name: "신규소싱", mustChangePassword: true, createdAt: "2026-06-16 16:00" },
  "night.lead": { password: "Night2026x", id: "night.lead", name: "야간조장", lastLoginAt: "2026-06-16 22:10", createdAt: "2026-06-05 09:00" }
};

/* 계정 · 권한 — 역할 · 권한 · 메뉴 · 이력 (서버 access 와 같은 규칙). 처음 역할 = 계정 아이디와 같은 이름 */
const accessMock = createAccessMock(
  {
    me: () => useAuthStore.getState().user?.id,
    now: nowText,
    nameOf: (userId) => mockAccounts[userId]?.name
  },
  {
    admin: ["admin"], logistics: ["logistics"], inbound: ["inbound"], outbound: ["outbound"], inventory: ["inventory"],
    sourcing: ["sourcing"], partner: ["partner"], sales: ["sales"], "temp.worker": ["inbound"], "new.sourcing": ["sourcing"],
    "night.lead": ["outbound", "inventory"]
  }
);

/** 지금 권한 버전 — http.ts 가 요청마다 보고, 바뀌었으면 내 정보를 다시 받는다 (서버의 X-Auth-Version) */
export const mockAuthVersion = () => accessMock.version();

/** 데모의 기능 검사 — 서버와 같은 기능 · 같은 문구 */
const can = (...features: string[]) => accessMock.can(...features);
function requireFeature(feature: string, message: string) {
  if (!accessMock.can(feature)) throw new Error(message);
}

export async function mockLogin(id: string, password: string): Promise<LoginResult> {
  await delay();
  const account = mockAccounts[id.trim().toLowerCase()];
  if (!account || account.password !== password) {
    throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  if (account.locked) throw new Error("잠긴 계정입니다 — 관리자에게 문의하세요.");
  account.lastLoginAt = nowText();
  return { user: accessMock.me(account.id, account.name, Boolean(account.mustChangePassword)), token: `mock-jwt-${account.id}` };
}

/** 내 정보 (GET /auth/me) — 역할 · 기능 · 보이는 메뉴 · 권한 버전 */
export async function mockMe(): Promise<AccessUser> {
  await delay(60);
  const account = mockAccounts[(useAuthStore.getState().user?.id ?? "").toLowerCase()];
  if (!account || account.locked) throw new Error("로그인이 끊겼습니다 — 다시 로그인하세요.");
  return accessMock.me(account.id, account.name, Boolean(account.mustChangePassword));
}

/* 사용자 관리 · 내 비밀번호 — 서버와 같은 규칙 */
const accountMock = createAccountMock({
  accounts: mockAccounts,
  access: () => accessMock,
  me: () => useAuthStore.getState().user?.id,
  now: nowText
});

const warehouses = [
  { id: 1, code: "CW", name: "창원공장", type: "일반" },
  { id: 2, code: "JC", name: "제천공장", type: "일반" },
  { id: 3, code: "AS", name: "안산공장", type: "일반" },
  // 구 용인물류센터 — 이천으로 이전 (코드도 이천 기준: 창고 IC · 로케이션 PI-)
  { id: 4, code: "IC", name: "이천물류센터", type: "일반" },
  { id: 5, code: "OEM", name: "외주공장", type: "외주" }
];

const zones = [
  { id: 11, code: "C-A", name: "창원 A존", warehouseName: "창원공장" },
  { id: 12, code: "C-B", name: "창원 B존", warehouseName: "창원공장" },
  { id: 21, code: "J-A", name: "제천 A존", warehouseName: "제천공장" },
  { id: 31, code: "A-A", name: "안산 A존", warehouseName: "안산공장" },
  // 이천물류센터 구역(41~52)은 레이아웃과 함께 mockWarehouse.ts 에서 만든다
  { id: 51, code: "O-X", name: "외주 X존", warehouseName: "외주공장" }
] as Array<Record<string, any>>;

let locations = [
  { id: 101, code: "PC-A-01", locationType: "PICKING", status: "가용", maxQty: 500, active: true, zoneId: 11, zoneName: "창원 A존", warehouseName: "창원공장", stockCount: 2 },
  { id: 102, code: "PC-A-02", locationType: "PICKING", status: "가용", maxQty: 500, active: true, zoneId: 11, zoneName: "창원 A존", warehouseName: "창원공장", stockCount: 1 },
  { id: 103, code: "PC-B-01", locationType: "RESERVE", status: "가용", maxQty: 900, active: true, zoneId: 12, zoneName: "창원 B존", warehouseName: "창원공장", stockCount: 2 },
  { id: 105, code: "XD-C-01", locationType: "CROSS_DOCK", status: "가용", maxQty: 400, active: true, zoneId: 11, zoneName: "창원 A존", warehouseName: "창원공장", stockCount: 0 },
  { id: 201, code: "PJ-A-01", locationType: "PICKING", status: "가용", maxQty: 500, active: true, zoneId: 21, zoneName: "제천 A존", warehouseName: "제천공장", stockCount: 1 },
  { id: 202, code: "PJ-B-01", locationType: "RESERVE", status: "가용", maxQty: 900, active: true, zoneId: 21, zoneName: "제천 A존", warehouseName: "제천공장", stockCount: 1 },
  { id: 203, code: "PJ-A-02", locationType: "PICKING", status: "가용", maxQty: 500, active: true, zoneId: 21, zoneName: "제천 A존", warehouseName: "제천공장", stockCount: 0 },
  { id: 204, code: "XD-J-01", locationType: "CROSS_DOCK", status: "가용", maxQty: 300, active: true, zoneId: 21, zoneName: "제천 A존", warehouseName: "제천공장", stockCount: 0 },
  { id: 301, code: "PA-A-01", locationType: "PICKING", status: "가용", maxQty: 450, active: true, zoneId: 31, zoneName: "안산 A존", warehouseName: "안산공장", stockCount: 1 },
  { id: 401, code: "PI-A-01", locationType: "PICKING", status: "가용", maxQty: 650, active: true, zoneId: 41, zoneName: "이천 A존", warehouseName: "이천물류센터", stockCount: 1 },
  { id: 501, code: "OT-X-01", locationType: "PICKING", status: "가용", maxQty: 400, active: true, zoneId: 51, zoneName: "외주 X존", warehouseName: "외주공장", stockCount: 1 },
  { id: 900, code: "QC-WAIT", locationType: "RESERVE", status: "가용", maxQty: 1000, active: true, zoneId: 11, zoneName: "창원 A존", warehouseName: "창원공장", stockCount: 2 }
];

const items = [
  // 물류 제원 — unitWeightKg 단위 중량(랙 허용 하중 · 배차 총중량), unitVolumeCm3 단위 부피(배차), unitsPerPallet 파레트 입수.
  // 비어 있으면(null) 미등록 — 배차 · 출고 요청서의 합계가 '모름'이 된다 (0 으로 치지 않는다)
  // erpItemCode — 주문 시스템의 출고요청이 품목을 찾는 열쇠 (가짜 값). 비어 있는 품목은 "ERP 단품코드 없음" 으로 보인다
  { id: 1, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", spec: "BT5.3", unit: "EA", safetyStock: 120, unitsPerPallet: 60, unitWeightKg: 0.25 as number | null, unitVolumeCm3: 1500 as number | null, category: "음향기기", consign: false, active: true, erpItemCode: "ERP-10241" as string | null, barcode: null as string | null },
  { id: 2, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", spec: "1.2m", unit: "EA", safetyStock: 180, unitsPerPallet: 50, unitWeightKg: 0.08 as number | null, unitVolumeCm3: 500 as number | null, category: "케이블", consign: false, active: true, erpItemCode: "ERP-10822" as string | null, barcode: null as string | null },
  { id: 3, itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", spec: "20Ah", unit: "EA", safetyStock: 80, unitsPerPallet: 20, unitWeightKg: 0.45 as number | null, unitVolumeCm3: 1200 as number | null, category: "배터리", consign: false, active: true, erpItemCode: "ERP-12044" as string | null, barcode: null as string | null },
  { id: 4, itemCode: "SKU-20114", itemName: "[외주] 시즌 한정 머그컵 세트", spec: "2P", unit: "SET", safetyStock: 40, unitsPerPallet: 12, unitWeightKg: 1.2 as number | null, unitVolumeCm3: 2500 as number | null, category: "주방용품", consign: true, active: true, erpItemCode: null as string | null, barcode: null as string | null },
  { id: 5, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", spec: "M8", unit: "EA", safetyStock: 300, unitsPerPallet: 100, unitWeightKg: 0.03 as number | null, unitVolumeCm3: 100 as number | null, category: "부자재", consign: false, active: true, erpItemCode: null as string | null, barcode: null as string | null }
];

/** 품목 목록 행 — 서버 ItemResponse 와 같은 모양 (제원은 null = 미등록) */
const itemRow = (it: AnyRecord) => {
  const positive = (value: unknown) => (Number(value) > 0 ? Number(value) : null);
  return {
    id: it.id,
    code: it.itemCode,
    name: it.itemName,
    spec: it.spec ?? null,
    category: it.category,
    unit: it.unit,
    safetyStock: it.safetyStock,
    barcode: it.barcode ?? null,
    erpItemCode: it.erpItemCode ?? null,
    consign: it.consign,
    active: it.active,
    unitWeightKg: positive(it.unitWeightKg),
    unitVolumeCm3: positive(it.unitVolumeCm3),
    unitsPerPallet: positive(it.unitsPerPallet)
  };
};

/**
 * 주문 제원 합계 — 서버 DispatchMapper aggCols · OutboundMapper findAll 과 같은 규칙.
 * 제원 미등록 품목이 하나라도 있으면 그 합계는 null(모름). *Missing = 미등록 품목 수.
 */
function orderTotals(outboundId: number) {
  const lines = outboundLines[outboundId] ?? [];
  const specOf = (code: string) => items.find((it) => it.itemCode === code) as AnyRecord | undefined;
  const missing = (key: string) => new Set(lines.filter((ln) => !(Number(specOf(ln.itemCode)?.[key]) > 0)).map((ln) => ln.itemCode)).size;
  const sum = (f: (ln: AnyRecord, spec: AnyRecord) => number) => lines.reduce((acc, ln) => acc + f(ln, specOf(ln.itemCode) ?? {}), 0);
  const weightMissing = missing("unitWeightKg");
  const volumeMissing = missing("unitVolumeCm3");
  const palletMissing = missing("unitsPerPallet");
  const known = (missingCount: number) => lines.length > 0 && missingCount === 0;
  return {
    totalWeightKg: known(weightMissing) ? Math.round(sum((ln, s) => Number(ln.orderQty) * Number(s.unitWeightKg)) * 10) / 10 : null,
    totalVolumeM3: known(volumeMissing) ? Math.round((sum((ln, s) => Number(ln.orderQty) * Number(s.unitVolumeCm3)) / 1e6) * 1000) / 1000 : null,
    palletCount: known(palletMissing) ? sum((ln, s) => Math.ceil(Number(ln.orderQty) / Number(s.unitsPerPallet))) : null,
    weightMissing,
    volumeMissing,
    palletMissing
  };
}

/** 서버 DispatchService.recommendVehicle 과 같은 기준 — 모르면 추천하지 않는다 */
const recommendVehicle = (weightKg: number | null, pallets: number | null) =>
  weightKg == null || pallets == null
    ? null
    : weightKg <= 1000 && pallets <= 2 ? "1톤" : weightKg <= 2500 && pallets <= 5 ? "2.5톤" : weightKg <= 5000 && pallets <= 10 ? "5톤" : "11톤";

let stocks = [
  { stockId: 1, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", zoneName: "창원 A존", locationCode: "PC-A-01", locationType: "PICKING", lotNo: "LOT260407-0006", stockStatus: "AVAILABLE", receivedDate: "2026-04-07", onHand: 260, allocated: 45, available: 215, safetyStock: 120, unit: "EA" },
  { stockId: 2, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", zoneName: "창원 B존", locationCode: "PC-B-01", locationType: "RESERVE", lotNo: "LOT260418-0005", stockStatus: "AVAILABLE", receivedDate: "2026-04-18", onHand: 480, allocated: 0, available: 480, safetyStock: 120, unit: "EA" },
  { stockId: 3, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", warehouseId: 4, warehouseName: "이천물류센터", warehouseType: "일반", zoneName: "이천 A존", locationCode: "PI-A-01", locationType: "PICKING", lotNo: "LOT260515-0008", stockStatus: "AVAILABLE", receivedDate: "2026-05-15", onHand: 95, allocated: 35, available: 60, safetyStock: 180, unit: "EA" },
  { stockId: 4, itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", warehouseId: 2, warehouseName: "제천공장", warehouseType: "일반", zoneName: "제천 A존", locationCode: "PJ-A-01", locationType: "PICKING", lotNo: "LOT-IN-20260606-003", stockStatus: "PUTAWAY_WAIT", receivedDate: "2026-06-06", onHand: 295, allocated: 0, available: 0, safetyStock: 80, unit: "EA" },
  { stockId: 5, itemCode: "SKU-20114", itemName: "[외주] 시즌 한정 머그컵 세트", warehouseId: 5, warehouseName: "외주공장", warehouseType: "외주", zoneName: "외주 X존", locationCode: "OT-X-01", locationType: "PICKING", lotNo: "LOT-OEM-0605", stockStatus: "AVAILABLE", receivedDate: "2026-06-05", onHand: 160, allocated: 12, available: 148, safetyStock: 40, unit: "SET" },
  { stockId: 6, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", zoneName: "창원 B존", locationCode: "PC-B-01", locationType: "RESERVE", lotNo: "LOT260405-0013", stockStatus: "AVAILABLE", receivedDate: "2026-04-05", onHand: 1200, allocated: 0, available: 1200, safetyStock: 300, unit: "EA" },
  { stockId: 7, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", zoneName: "창원 A존", locationCode: "PC-A-02", locationType: "PICKING", lotNo: "LOT260520-0014", stockStatus: "AVAILABLE", receivedDate: "2026-05-20", onHand: 90, allocated: 15, available: 75, safetyStock: 300, unit: "EA" },
  { stockId: 8, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", warehouseId: 3, warehouseName: "안산공장", warehouseType: "일반", zoneName: "안산 A존", locationCode: "PA-A-01", locationType: "PICKING", lotNo: "LOT260610-0021", stockStatus: "DEFECT", receivedDate: "2026-06-10", onHand: 12, allocated: 0, available: 0, safetyStock: 180, unit: "EA" }
];

// 격납 분할 배정 등으로 신규 생성되는 재고 행의 stockId 시퀀스
let stockSeq = 9000;

// BOM(세트) 구성 — 비운영 주문에서 세트 선택 시 필수 구성품 자동 전개용
const boms: Record<string, { itemName: string; unit: string; components: { itemCode: string; itemName: string; qtyPer: number; unit: string }[] }> = {
  "SET-GIFT-01": {
    itemName: "명절 선물세트 (이어버드+케이블)", unit: "SET",
    components: [
      { itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", qtyPer: 1, unit: "EA" },
      { itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", qtyPer: 2, unit: "EA" }
    ]
  },
  "SET-DESK-01": {
    itemName: "데스크 정리세트", unit: "SET",
    components: [
      { itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", qtyPer: 1, unit: "EA" },
      { itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", qtyPer: 1, unit: "EA" },
      { itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", qtyPer: 4, unit: "EA" }
    ]
  }
};

// 비운영 주문(상품 선택 기반) 생성 결과 보관
let manualOrders: AnyRecord[] = [
  { id: 1, orderNo: "MO-260616-001", customerName: "대림 직영몰", createdAt: "2026-06-16", lineCount: 2, lines: [
    { itemCode: "SET-GIFT-01", itemName: "명절 선물세트 (이어버드+케이블)", isBom: true, qty: 3, unit: "SET", parentCode: null },
    { itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", isBom: false, qty: 20, unit: "EA", parentCode: null }
  ] }
];

let inbounds = [
  { id: 112, inboundNo: "IN-20260620-001", poNo: "PO-9018", supplierCode: "SUP001", supplierName: "다온테크놀로지", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", type: "일반", inTypeCode: "DGR", inTypeName: "국내입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: "운송장 별도 확인", status: "scheduled", expectedAt: "2026-06-20", qty: 660 },
  { id: 113, inboundNo: "IN-20260613-001", poNo: "PO-9014", supplierCode: "SUP001", supplierName: "다온테크놀로지", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", type: "일반", inTypeCode: "DGR", inTypeName: "국내입고", purchaseGroupCode: "PG41", purchaseGroupName: "이지은", remark: "긴급 입고", status: "registered", expectedAt: "2026-06-13", qty: 330 },
  { id: 111, inboundNo: "IN-20260607-001", poNo: "OPO-002", supplierCode: "OEM002", supplierName: "인천외주가공", warehouseId: 5, warehouseName: "외주공장", warehouseType: "외주", type: "외주", inTypeCode: "OEM", inTypeName: "외주입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: null, status: "located", expectedAt: "2026-06-07", qty: 120 },
  // 나눠 입고 — 1차로 295 만 와서 남은 125 를 입고예정으로 기다린다 (receipts 1회차)
  { id: 116, inboundNo: "IN-20260606-003", poNo: "PO-9003", supplierCode: "SUP001", supplierName: "다온테크놀로지", warehouseId: 2, warehouseName: "제천공장", warehouseType: "일반", type: "일반", inTypeCode: "DGR", inTypeName: "국내입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: "분할 납품 1차", status: "scheduled", expectedAt: "2026-06-05", qty: 420 },
  // 적게 와서 끝낸 건 — 덜 온 10 은 닫았다
  { id: 125, inboundNo: "IN-20260530-001", poNo: "PO-9006", supplierCode: "SUP003", supplierName: "대성정밀공업", warehouseId: 3, warehouseName: "안산공장", warehouseType: "일반", type: "일반", inTypeCode: "IMP", inTypeName: "수입입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: "통관 완료분", status: "confirmed", expectedAt: "2026-05-30", qty: 600, closedAt: "2026-05-30 16:20", closeReason: "통관 수량 차이 — 발주 줄임" },
  // 공장 간 재고 이동 → 입고 프로세스로 처리(이동입고). 일반입고와 구분(type=이동, MVR).
  { id: 140, inboundNo: "IN-MV-20260616-001", poNo: null, moveRef: "MV-20260616-001", supplierCode: "WH-CW", supplierName: "창원공장(출발)", warehouseId: 2, warehouseName: "제천공장", warehouseType: "일반", type: "이동", inTypeCode: "MVR", inTypeName: "공장간이동", purchaseGroupCode: "PG41", purchaseGroupName: "이지은", remark: "창원→제천 공장 간 재고 이동 (로케이션 지정 완료)", status: "located", expectedAt: "2026-06-16", qty: 150 },
  { id: 141, inboundNo: "IN-MV-20260617-002", poNo: null, moveRef: "MV-20260617-002", supplierCode: "WH-AS", supplierName: "안산공장(출발)", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", type: "이동", inTypeCode: "MVR", inTypeName: "공장간이동", purchaseGroupCode: "PG41", purchaseGroupName: "이지은", remark: "안산→창원 공장 간 재고 이동 (입고예정)", status: "scheduled", expectedAt: today, qty: 80 }
];

const inboundLines: Record<number, AnyRecord[]> = {
  112: [
    { id: 1001, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", spec: "BT5.3", unit: "EA", consign: false, locationCode: null, locationId: null, trackingNo: "TR-IN-112-1", inspected: false, expectedQty: 360, receivedQty: 0 },
    { id: 1002, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", spec: "1.2m", unit: "EA", consign: false, locationCode: null, locationId: null, trackingNo: "TR-IN-112-2", inspected: false, expectedQty: 300, receivedQty: 0 }
  ],
  113: [
    { id: 1003, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", spec: "M8", unit: "EA", consign: false, locationCode: null, locationId: null, trackingNo: "TR-IN-113-1", inspected: true, expectedQty: 330, receivedQty: 0 }
  ],
  111: [
    { id: 1004, itemCode: "SKU-20114", itemName: "[외주] 시즌 한정 머그컵 세트", spec: "2P", unit: "SET", consign: true, locationCode: "OT-X-01", locationId: 501, trackingNo: "OEM-111", inspected: true, expectedQty: 120, receivedQty: 0 }
  ],
  116: [
    { id: 1005, itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", spec: "20Ah", unit: "EA", consign: false, locationCode: "PJ-A-01", locationId: 201, trackingNo: "TR-IN-116", inspected: true, expectedQty: 420, receivedQty: 295 }
  ],
  125: [
    { id: 1006, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", spec: "1.2m", unit: "EA", consign: false, locationCode: "PA-A-01", locationId: 301, trackingNo: "TR-IN-125", inspected: true, expectedQty: 600, receivedQty: 590, closedQty: 10 }
  ],
  140: [
    { id: 1007, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", spec: "M8", unit: "EA", consign: false, locationCode: "PJ-A-01", locationId: 201, trackingNo: "MV-140", inspected: true, expectedQty: 150, receivedQty: 0 }
  ],
  141: [
    { id: 1008, itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", spec: "20Ah", unit: "EA", consign: false, locationCode: null, locationId: null, trackingNo: "MV-141", inspected: false, expectedQty: 80, receivedQty: 0 }
  ]
};

/* ---------- 나눠 입고 (서버 inbound_receipt 와 같은 모양) — 입고확정 한 번이 회차 하나, 회차마다 LOT ---------- */
let receiptSeq = 100;
const inboundReceipts: Record<number, AnyRecord[]> = {
  116: [{ id: 1, seq: 1, lotNo: "LOT-IN-20260606-003", warehouseName: "제천공장", receivedDate: "2026-06-05", qty: 295, confirmedBy: "inbound", confirmedByName: "입고담당", createdAt: "2026-06-05 10:40",
    lines: [{ receiptId: 1, inboundLineId: 1005, itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", locationCode: "PJ-A-01", qty: 295 }] }],
  125: [{ id: 2, seq: 1, lotNo: "LOT-IN-20260530-001", warehouseName: "안산공장", receivedDate: "2026-05-30", qty: 590, confirmedBy: "inbound", confirmedByName: "입고담당", createdAt: "2026-05-30 15:10",
    lines: [{ receiptId: 2, inboundLineId: 1006, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", locationCode: "PA-A-01", qty: 590 }] }]
};

/** 1회차 LOT-{입고번호}, 2회차부터 LOT-{입고번호}-{회차} (서버 InboundLots) */
const lotOf = (inboundNo: string, seq: number) => (seq <= 1 ? `LOT-${inboundNo}` : `LOT-${inboundNo}-${seq}`);

/** 닫은 수량 — 칸이 없는 시드 중 확정된 건은 나눠 입고 전 방식(덜 온 수량은 확정 때 닫힘)으로 본다 (서버 DDL 과 같다) */
const closedOf = (row: AnyRecord | undefined, ln: AnyRecord) =>
  ln.closedQty != null ? Number(ln.closedQty) : row?.status === "confirmed" ? Math.max(0, Number(ln.expectedQty) - Number(ln.receivedQty || 0)) : 0;

function inboundLineView(row: AnyRecord | undefined, ln: AnyRecord): AnyRecord {
  const closedQty = closedOf(row, ln);
  return { ...ln, closedQty, remainingQty: Math.max(0, Number(ln.expectedQty) - Number(ln.receivedQty || 0) - closedQty) };
}

function inboundView(row: AnyRecord) {
  const lines = (inboundLines[row.id] ?? []).map((ln) => inboundLineView(row, ln));
  const sum = (key: string) => lines.reduce((acc, ln) => acc + Number(ln[key] || 0), 0);
  const receivedQty = sum("receivedQty");
  const receiptCount = inboundReceipts[row.id]?.length ?? (receivedQty > 0 ? 1 : 0);
  const done = row.status === "confirmed" || row.status === "closed";
  // 아직 격납 안 한 수량 — 회차 LOT 의 격납대기 재고 (서버 InboundMapper.findAll 과 같다)
  const lots = new Set(Array.from({ length: receiptCount }, (_, i) => lotOf(row.inboundNo, i + 1)));
  const putawayWaitQty = stocks
    .filter((s) => s.stockStatus === "PUTAWAY_WAIT" && lots.has(s.lotNo) && Number(s.onHand) > 0)
    .reduce((acc, s) => acc + Number(s.onHand), 0);
  return {
    ...row,
    receivedQty,
    closedQty: sum("closedQty"),
    remainingQty: sum("remainingQty"),
    receiptCount,
    nextLotNo: done ? null : lotOf(row.inboundNo, receiptCount + 1),
    lastLotNo: receiptCount > 0 ? lotOf(row.inboundNo, receiptCount) : null,
    closedAt: row.closedAt ?? null,
    closeReason: row.closeReason ?? null,
    putawayWaitQty
  };
}

const WORKERS_ONLY = "입고 확정 · 처리 권한이 없습니다.";
const PLANNERS_ONLY = "입고 예정 · 남은 수량 닫기 권한이 없습니다.";
const nowHm = () => new Date().toTimeString().slice(0, 5);

/**
 * 입고 처리 — 서버 InboundService 와 같은 규칙 (도착 → 지정 → 입고확정 = 회차 하나, 남은 수량은 입고예정으로 대기,
 * 도착 취소, 남은 수량 닫기). 처리하지 않는 주소면 undefined.
 */
function inboundMutation(clean: string, body: AnyRecord): unknown {
  const match = clean.match(/^\/inbounds\/(\d+)\/(register|assign|confirm|undo-arrival|close)$/);
  if (!match) return undefined;
  const id = Number(match[1]);
  const action = match[2];
  if (action === "close") requireFeature("inbound/inbound-schedule:close", PLANNERS_ONLY);
  else requireFeature("inbound/inbound-confirm:work", WORKERS_ONLY);
  const row = inbounds.find((r) => r.id === id) as AnyRecord | undefined;
  if (!row) throw new Error("입고 건을 찾을 수 없습니다.");
  const lines = inboundLines[id] ?? [];
  const operator = useAuthStore.getState().user;
  const log = (actionName: string, detail: string, qty?: number) =>
    activityLogs.push({ id: activityLogs.length + 1, refType: "INBOUND", refNo: row.inboundNo, action: actionName, detail, erpSent: false,
      operator: operator?.id ?? "system", createdAt: `${today} ${nowHm()}`, ...(qty != null ? { qty } : {}) });

  if (action === "register") {
    if (row.status !== "scheduled") throw new Error("입고예정 상태에서만 입고등록할 수 있습니다.");
    row.status = "registered";
    log("입고등록", "입고예정 → 입고등록");
    return { ok: true };
  }
  if (action === "assign") {
    if (row.status !== "registered") throw new Error("입고등록 후에 창고·로케이션을 지정할 수 있습니다.");
    const whId = Number(body.warehouseId);
    const wh = warehouses.find((w) => w.id === whId);
    if (!wh) throw new Error("창고를 선택하세요.");
    const options = asWarehouseLocations(whId);
    const given: AnyRecord[] = Array.isArray(body.lines) ? body.lines : [];
    given.forEach((g) => {
      const ln = lines.find((l) => l.id === Number(g.lineId));
      if (!ln) throw new Error(`이 입고 건의 품목 줄이 아닙니다: ${g.lineId}`);
      if (g.locationId == null) return;
      const loc = options.find((o) => o.id === Number(g.locationId));
      if (!loc) throw new Error("고른 창고에 없는 로케이션이 있습니다 — 창고를 바꿨다면 로케이션을 다시 고르세요.");
      ln.locationId = loc.id;
      ln.locationCode = loc.code;
    });
    Object.assign(row, { warehouseId: wh.id, warehouseName: wh.name, warehouseType: wh.type, status: "located" });
    log("창고·로케이션 지정", "창고/로케이션 지정 완료");
    return { ok: true };
  }
  if (action === "undo-arrival") {
    if (row.status !== "registered" && row.status !== "located") throw new Error("입고등록(도착) 뒤 입고확정 전에만 도착을 취소할 수 있습니다.");
    row.status = "scheduled";
    log("도착 취소", "입고예정으로 되돌림 (받은 것 없음)");
    return { ok: true };
  }
  if (action === "confirm") {
    if (row.status !== "located") throw new Error("창고·로케이션 지정 후에 입고확정할 수 있습니다.");
    const entered = new Map<number, number>();
    (Array.isArray(body.lines) ? body.lines : []).forEach((x: AnyRecord) => {
      if (!lines.some((l) => l.id === Number(x.lineId))) throw new Error(`이 입고 건의 품목 줄이 아닙니다: ${x.lineId}`);
      if (x.receivedQty != null) entered.set(Number(x.lineId), Number(x.receivedQty));
    });
    let total = 0;
    let over = 0;
    let remainingAfter = 0;
    const plan = lines.map((ln) => {
      const remaining = inboundLineView(row, ln).remainingQty;
      const qty = entered.get(ln.id) ?? remaining;
      if (!Number.isFinite(qty) || qty < 0) throw new Error("실입고 수량은 0 이상이어야 합니다.");
      if (qty > 0 && ln.locationId == null) throw new Error("로케이션이 지정되지 않은 라인이 있습니다.");
      total += qty;
      over += Math.max(0, qty - remaining);
      remainingAfter += Math.max(0, remaining - qty);
      return { ln, qty };
    });
    if (total === 0) throw new Error("받은 수량이 없습니다 — 아무것도 오지 않았으면 '도착 취소'로 입고예정에 되돌리세요.");
    const receipts = (inboundReceipts[id] ??= []);
    const seq = receipts.length + 1;
    const lotNo = lotOf(row.inboundNo, seq);
    const receiptId = ++receiptSeq;
    const receiptLines: AnyRecord[] = [];
    plan.forEach(({ ln, qty }) => {
      if (qty <= 0) return;
      const loc = locations.find((l) => l.id === ln.locationId);
      const wh = warehouses.find((w) => w.id === row.warehouseId) || warehouses.find((w) => w.name === loc?.warehouseName);
      stocks.push({
        stockId: ++stockSeq,
        itemCode: ln.itemCode,
        itemName: ln.itemName,
        warehouseId: row.warehouseId ?? wh?.id ?? 1,
        warehouseName: row.warehouseName ?? loc?.warehouseName ?? "-",
        warehouseType: row.warehouseType ?? wh?.type ?? "일반",
        zoneName: loc?.zoneName ?? "-",
        locationCode: loc?.code ?? ln.locationCode ?? "-",
        locationType: loc?.locationType ?? "PICKING",
        lotNo,
        stockStatus: "PUTAWAY_WAIT",
        receivedDate: today,
        onHand: qty,
        allocated: 0,
        available: 0,
        safetyStock: items.find((it) => it.itemCode === ln.itemCode)?.safetyStock ?? 0,
        unit: ln.unit
      });
      ln.receivedQty = Number(ln.receivedQty || 0) + qty;
      receiptLines.push({ receiptId, inboundLineId: ln.id, itemCode: ln.itemCode, itemName: ln.itemName, locationCode: ln.locationCode, qty });
    });
    receipts.push({ id: receiptId, seq, lotNo, warehouseName: row.warehouseName, receivedDate: today, qty: total,
      confirmedBy: operator?.id ?? null, confirmedByName: operator?.name ?? null, createdAt: `${today} ${nowHm()}`, lines: receiptLines });
    const status = remainingAfter > 0 ? "scheduled" : "confirmed";
    row.status = status;
    // ERP 쪽 — 서버 InboundService 와 같은 문구 (ERP 입고결과 자동 전송은 아직 없다 — ERP 담당 답을 받은 뒤)
    const moveInbound = row.inTypeCode === "MVR" || row.type === "이동";
    const consign = row.type === "외주" || row.warehouseType === "외주";
    const erpNote = moveInbound ? ", 공장간이동 · ERP 미전송" : consign ? ", 외주 · ERP 미연동" : ", ERP 자동 전송 전 — ERP 입고 등록은 지금 방식대로";
    log("입고확정", `검수 후 입고확정 (격납대기 재고 생성, LOT=${lotNo}${erpNote})${seq > 1 || remainingAfter > 0 ? ` · ${seq}회차` : ""}`
      + `${remainingAfter > 0 ? ` · 남은 수량(${remainingAfter})은 입고예정으로 대기` : ""}${over > 0 ? ` · 예정보다 ${over} 많이 받음` : ""}`, total);
    // 대시보드 시간별 처리량 · 금일 입고확정에 반영
    dashboardMock.record("inbound-confirm", total, row.inboundNo);
    return { status, receiptSeq: seq, lotNo, receivedQty: total, remainingQty: remainingAfter, overQty: over };
  }

  // close — 남은 수량 닫기
  const reason = String(body.reason ?? "").replace(/\s+/g, " ").trim();
  if (!reason) throw new Error("닫는 이유를 넣으세요 (예: 공급사 결품 — ERP 발주 줄임).");
  if (reason.length > 200) throw new Error("닫는 이유는 200자까지입니다.");
  if (row.status === "registered" || row.status === "located") throw new Error("도착 처리 중입니다 — 입고확정이나 도착 취소를 먼저 하세요.");
  if (row.status !== "scheduled") throw new Error("이미 끝난 입고입니다.");
  const views = lines.map((ln) => ({ ln, view: inboundLineView(row, ln) }));
  const toClose = new Map<number, number>();
  const asked: AnyRecord[] = Array.isArray(body.lines) ? body.lines : [];
  if (!asked.length) views.forEach(({ ln, view }) => toClose.set(ln.id, view.remainingQty));
  asked.forEach((x) => {
    const found = views.find(({ ln }) => ln.id === Number(x.lineId));
    if (!found) throw new Error(`이 입고 건의 품목 줄이 아닙니다: ${x.lineId}`);
    const qty = x.qty == null ? found.view.remainingQty : Number(x.qty);
    const next = (toClose.get(found.ln.id) ?? 0) + qty;
    if (!Number.isFinite(qty) || qty < 0) throw new Error("닫을 수량은 0 이상이어야 합니다.");
    if (next > found.view.remainingQty) throw new Error(`${found.ln.itemCode} 는 남은 수량(${found.view.remainingQty})보다 많이 닫을 수 없습니다.`);
    toClose.set(found.ln.id, next);
  });
  const closedNow = [...toClose.values()].reduce((a, b) => a + b, 0);
  if (closedNow === 0) throw new Error("닫을 남은 수량이 없습니다.");
  views.forEach(({ ln, view }) => {
    ln.closedQty = view.closedQty + (toClose.get(ln.id) ?? 0);
  });
  const remainingAfter = views.reduce((a, { view }) => a + view.remainingQty, 0) - closedNow;
  const receivedTotal = views.reduce((a, { ln }) => a + Number(ln.receivedQty || 0), 0);
  let status = "scheduled";
  if (remainingAfter === 0) {
    status = receivedTotal > 0 ? "confirmed" : "closed";
    Object.assign(row, { status, closedAt: `${today} ${nowHm()}`, closeReason: reason });
  }
  log("입고예정 닫기", `남은 수량 ${closedNow} 닫음 — ${reason}${remainingAfter > 0 ? ` · 아직 ${remainingAfter} 대기` : receivedTotal > 0 ? ` · 입고 끝 (받은 ${receivedTotal})` : " · 받은 것 없이 닫힘"}`);
  return { status, closedQty: closedNow, remainingQty: remainingAfter };
}

let outbounds = [
  { id: 46, outboundNo: "DN20260601020", scheduledDate: "2026-06-19", customerCode: "051794", customerName: "대림바스(주)", outType: "A/S 출고(유상)", qty: 5, carrier: "사내차량", shipAddress: "충북 청주시 흥덕구 가경로 50", invoiceNo: null, status: "출고대기", rejectReason: null },
  { id: 62, outboundNo: "DN20260601021", scheduledDate: "2026-06-20", customerCode: "219475", customerName: "대림 스마트몰", outType: "도소매출고", qty: 32, carrier: "가람택배", shipAddress: "경기 화성시 동탄대로 620", invoiceNo: "GR2606210088", status: "피킹완료", rejectReason: null },
  { id: 57, outboundNo: "DN20260601019", scheduledDate: "2026-06-18", customerCode: "132906", customerName: "주식회사 나래유통", outType: "도소매출고", qty: 31, carrier: "한길택배", shipAddress: "경기 부천시 길주로 210", invoiceNo: "HG2606190077", status: "출고완료", rejectReason: null },
  { id: 52, outboundNo: "DN20260601018", scheduledDate: "2026-06-17", customerCode: "127419", customerName: "(주)가온마트", outType: "도소매출고", qty: 19, carrier: "온길택배", shipAddress: "경기 고양시 일산동구 중앙로 1275", invoiceNo: null, status: "보류", rejectReason: "주소 오류" },
  { id: 70, outboundNo: "DN20260601022", scheduledDate: today, customerCode: "771205", customerName: "한울 트레이더스", outType: "도소매출고", qty: 84, carrier: "나루택배", shipAddress: "서울 강남구 테헤란로 152", invoiceNo: null, status: "피킹중", rejectReason: null }
];

const outboundLines: Record<number, AnyRecord[]> = {
  46: [{ id: 1, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", unit: "EA", consign: false, orderQty: 5, pickedQty: 0, availableQty: 60, lotNo: "LOT260515-0008", locationCode: "PI-A-01", scanned: false }],
  62: [{ id: 2, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", unit: "EA", consign: false, orderQty: 32, pickedQty: 32, availableQty: 215, lotNo: "LOT260407-0006", locationCode: "PC-A-01", scanned: true }],
  70: [
    { id: 3, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", unit: "EA", consign: false, orderQty: 84, pickedQty: 36, availableQty: 75, lotNo: "LOT260520-0014", locationCode: "PC-A-02", scanned: true },
    { id: 4, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", unit: "EA", consign: false, orderQty: 10, pickedQty: 0, availableQty: 215, lotNo: "LOT260407-0006", locationCode: "PC-A-01", scanned: false }
  ]
};

/**
 * 출고요청서(인쇄)용 OMS 칸 — 서버는 OMS 연동 계약을 받아 저장하기 전이라 아직 보내지 않는다.
 * 목은 연동 뒤의 모양을 보여 준다. 사람 이름 · 전화번호는 모두 가짜 값이다.
 */
const SHEET_OMS: Record<number, { orderNo: string; shipNo: string; sets: string[]; separate?: number[]; memos?: Record<number, string>; colors?: Record<number, string>; oms: AnyRecord }> = {
  46: {
    orderNo: "AU2606000046", shipNo: "DL2606000146", sets: ["욕실 기본"],
    oms: { orderTypeName: "A/S주문(유상)", requestSummary: "오전 도착 · 하차 전 연락", salesGroupName: "충청영업팀", salesRepName: "김영업", salesRepTel: "043-000-0000", salesRepMobile: "010-0000-0001", ordererName: "박고객", ordererTel: null, ordererMobile: "010-0000-0002", residing: true, receiverName: "박고객", receiverMobile: "010-0000-0002", zipCode: "28455", requestedTime: "0800", householdCarryIn: false, shippingMemo: "현관 비밀번호는 전화로 확인" }
  },
  62: {
    orderNo: "OD2606000062", shipNo: "DL2606000162", sets: ["욕실 기본"], memos: { 2: "박스 2개로 나눠 포장" },
    oms: { orderTypeName: "일반주문", requestSummary: null, salesGroupName: "경기영업팀", salesRepName: "이영업", salesRepTel: null, salesRepMobile: "010-0000-0003", ordererName: "최고객", ordererTel: "031-000-0000", ordererMobile: "010-0000-0004", residing: null, receiverName: "최고객", receiverMobile: "010-0000-0004", zipCode: "18456", requestedTime: "1300", householdCarryIn: true, shippingMemo: null }
  },
  57: {
    orderNo: "OD2606000057", shipNo: "DL2606000157", sets: ["욕실 기본"],
    oms: { orderTypeName: "일반주문", requestSummary: null, salesGroupName: "경기영업팀", salesRepName: "이영업", salesRepTel: null, salesRepMobile: "010-0000-0003", ordererName: "정고객", ordererTel: null, ordererMobile: "010-0000-0005", residing: null, receiverName: "정현장", receiverMobile: "010-0000-0006", zipCode: "14544", requestedTime: "0900", householdCarryIn: false, shippingMemo: null }
  },
  52: {
    orderNo: "OD2606000052", shipNo: "DL2606000152", sets: ["욕실 기본"],
    oms: { orderTypeName: "일반주문", requestSummary: "주소 확인 필요", salesGroupName: "서울영업팀", salesRepName: "한영업", salesRepTel: null, salesRepMobile: "010-0000-0007", ordererName: "윤고객", ordererTel: null, ordererMobile: "010-0000-0008", residing: null, receiverName: "윤고객", receiverMobile: "010-0000-0008", zipCode: null, requestedTime: "1000", householdCarryIn: false, shippingMemo: null }
  },
  70: {
    orderNo: "OD2606000070", shipNo: "DL2606000170", sets: ["거실 욕실", "욕실 기본"], separate: [3], memos: { 4: "양변기 박스 안에 포함" }, colors: { 3: "실버" },
    oms: { orderTypeName: "일반주문", requestSummary: "2.5톤 진입 불가 — 1톤으로", salesGroupName: "서울영업팀", salesRepName: "한영업", salesRepTel: "02-000-0000", salesRepMobile: "010-0000-0007", ordererName: "강고객", ordererTel: null, ordererMobile: "010-0000-0009", residing: true, receiverName: "강현장", receiverMobile: "010-0000-0010", zipCode: "06164", requestedTime: "0800", householdCarryIn: true, shippingMemo: "엘리베이터 사용 가능 (관리실 사전 신청 완료)" }
  }
};

/** 출고요청서 한 건 — 서버 GET /outbounds/{id}/sheet 와 같은 모양 (줄은 로케이션 순) */
function outboundSheet(id: number) {
  const o = outbounds.find((x) => x.id === id);
  if (!o) throw new Error("출고 건을 찾을 수 없습니다.");
  const extra = SHEET_OMS[id];
  const lines = (outboundLines[id] ?? [])
    .map((ln, idx) => ({
      locationCode: ln.locationCode ?? null,
      itemCode: ln.itemCode,
      itemName: ln.itemName,
      unit: ln.unit,
      qty: Number(ln.orderQty) || 0,
      setAlias: extra ? extra.sets[idx % extra.sets.length] : null,
      colorName: extra?.colors?.[ln.id] ?? null,
      lineMemo: extra?.memos?.[ln.id] ?? null,
      separateLoading: extra?.separate?.includes(ln.id) ?? false
    }))
    .sort((a, b) => String(a.locationCode ?? "~").localeCompare(String(b.locationCode ?? "~")) || a.itemCode.localeCompare(b.itemCode));
  const warehouseName = locations.find((l) => l.code === lines[0]?.locationCode)?.warehouseName ?? null;
  return {
    id: o.id, outboundNo: o.outboundNo, omsOrderNo: extra?.orderNo ?? null, shipNo: extra?.shipNo ?? null,
    outType: o.outType, status: o.status, scheduledDate: o.scheduledDate, warehouseName,
    customerCode: o.customerCode, customerName: o.customerName, carrier: o.carrier, shipAddress: o.shipAddress,
    oms: extra?.oms ?? null, lines
  };
}

let carriers: AnyRecord[] = [
  { id: 1, code: "HG", name: "한길택배", region: "전국", manager: "김배송", phone: "1588-0001", accountUser: "carrier_hg", portalRole: "배차공유", active: true },
  { id: 2, code: "GARAM", name: "가람택배", region: "수도권", manager: "이수도", phone: "1588-0002", accountUser: "carrier_garam", portalRole: "조회", active: true },
  { id: 3, code: "NARU", name: "나루택배", region: "지방권", manager: "박지방", phone: "1588-0003", accountUser: "carrier_naru", portalRole: "조회", active: true },
  { id: 4, code: "INHOUSE", name: "사내차량", region: "전국", manager: "물류팀", phone: "055-000-0000", accountUser: null, portalRole: "조회", active: true }
];

let dispatched: AnyRecord[] = [
  { id: 1, dispatchNo: "DP-260617-001", outboundNo: "DN20260601019", customerName: "주식회사 나래유통", shipAddress: "경기 부천시 길주로 210", region: "수도권", carrierName: "한길택배", vehicleType: "1톤", totalWeightKg: 420, totalVolumeM3: 2.8, palletCount: 2, dispatchDate: today }
];

let notices = [
  { id: 1, category: "공지", title: "프론트 화면 검수용 mock 데이터 적용", content: "현재 화면은 백엔드와 DB 없이 동작하는 시연 모드입니다.", author: "관리자", pinned: true, createdAt: "2026-06-17T10:30:00" },
  { id: 2, category: "업무협조", title: "입고 확정 화면 버튼 흐름 확인 요청", content: "입고등록, 로케이션 지정, 확정 흐름을 검수해 주세요.", author: "입고담당", pinned: false, createdAt: "2026-06-16T15:20:00" }
];

let returns = [
  { id: 1, returnNo: "RT-260617-001", omsOrderNo: "OMS-RT-26061701", customerCode: "219475", customerName: "대림 스마트몰", itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", unit: "EA", qty: 3, reason: "초기불량", manager: "이지은", warehouseName: "이천물류센터", locationCode: "PI-A-01", status: "received", rejectReason: null, receivedAt: today + " 09:20", processedAt: null },
  { id: 2, returnNo: "RT-260616-002", omsOrderNo: "OMS-RT-26061602", customerCode: "127419", customerName: "(주)가온마트", itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", unit: "EA", qty: 2, reason: "단순변심", manager: "박서준", warehouseName: "창원공장", locationCode: "QC-WAIT", status: "rejected", rejectReason: "반품 기한 초과", receivedAt: "2026-06-16 14:10", processedAt: "2026-06-17 10:00" },
  { id: 3, returnNo: "RT-260615-003", omsOrderNo: "OMS-RT-26061503", customerCode: "771205", customerName: "한울 트레이더스", itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", unit: "EA", qty: 10, reason: "오배송", manager: "박서준", warehouseName: "창원공장", locationCode: "QC-WAIT", status: "approved", rejectReason: null, receivedAt: "2026-06-15 11:05", processedAt: "2026-06-16 09:30" }
];

let stocktakings: AnyRecord[] = [
  { id: 1, countDate: today, warehouseName: "창원공장", locationCode: "PC-A-01", itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", lotNo: "LOT260407-0006", systemQty: 260, countedQty: 258, diff: -2, status: "COUNTED", memo: null, createdBy: "admin", adjustedAt: null },
  { id: 2, countDate: today, warehouseName: "이천물류센터", locationCode: "PI-A-01", itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", lotNo: "LOT260515-0008", systemQty: 95, countedQty: 95, diff: 0, status: "COUNTED", memo: null, createdBy: "admin", adjustedAt: null }
];

let policies = [
  { policyKey: "reserve_reflect", label: "예약재고 반영", enabled: true, description: "예약(할당) 수량을 가용재고에서 차감합니다." },
  { policyKey: "exclude_defect", label: "불량재고 제외", enabled: true, description: "불량 재고를 가용재고에서 제외합니다." },
  { policyKey: "exclude_moving", label: "이동중 재고 제외", enabled: false, description: "이동중(창고간 이동) 재고를 가용재고에서 제외합니다." },
  { policyKey: "exclude_putaway", label: "격납대기 재고 제외", enabled: true, description: "격납대기(입고 후 미격납) 재고를 가용재고에서 제외합니다." }
];

const policyBuckets = { onHand: 2574, allocated: 107, defect: 12, moving: 50, putawayWait: 295 };

// 대시보드 요약(/dashboard/summary · /progress)은 mockDashboard.ts 가 아래 배열들에서 계산한다

const interfaceLogs: AnyRecord[] = [
  { id: "IF-260617-001", type: "출고결과", direction: "SEND", refNo: "DN20260601019", state: "success", retry: 0, message: "ERP 전송 완료", createdAt: "2026-06-17 09:30" },
  { id: "IF-260617-002", type: "재고차감", direction: "SEND", refNo: "DN20260601021", state: "fail", retry: 1, message: "ERP 응답 없음 (timeout)", createdAt: "2026-06-17 09:45" },
  { id: "IF-260617-003", type: "외주이동", direction: "SEND", refNo: "TR-OEM-001", state: "excluded", retry: 0, message: "외주 재고는 ERP 미연동", createdAt: "2026-06-17 10:10" }
];

/** 사이드바 연동 상태 — 데모는 주문 시스템이 운영 중이고 몇 분 전에 받은 것으로 (서버 GET /interfaces/status 와 같은 칸) */
const linkStatus = () => {
  const checkedAt = nowText();
  const [hour, minute] = checkedAt.slice(11).split(":").map(Number);
  const at = Math.max(0, hour * 60 + minute - 4);
  const pad = (n: number) => String(n).padStart(2, "0");
  const quiet = { receivedFail: 0, replyWaiting: 0, replyRetrying: 0, replyFail: 0 };
  return {
    checkedAt,
    replySending: true,
    systems: [
      { systemCode: "OMS", mode: "LIVE", server: "UP", lastReceivedAt: `${today} ${pad(Math.floor(at / 60))}:${pad(at % 60)}`, ...quiet },
      { systemCode: "OMS2", mode: "OFF", server: "UNKNOWN", lastReceivedAt: null, ...quiet }
    ]
  };
};

const shortageRows: AnyRecord[] = [
  { itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", unit: "EA", safetyStock: 180, leadTime: 5, available: 60, out30: 540, avgDailyOut: 18, reorderPoint: 270, daysOfStock: 3.3, shortageEta: "2026-06-21", risk: "위험" },
  { itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", unit: "EA", safetyStock: 300, leadTime: 7, available: 75, out30: 900, avgDailyOut: 30, reorderPoint: 510, daysOfStock: 2.5, shortageEta: "2026-06-20", risk: "위험" },
  { itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", unit: "EA", safetyStock: 120, leadTime: 4, available: 695, out30: 360, avgDailyOut: 12, reorderPoint: 168, daysOfStock: 57.9, shortageEta: null, risk: "정상" }
];

/* 입고 예정 — 도크·검수라인 예약 (분 단위, 08:00=480)
   실서버: 도크 예약 테이블. 화면은 하루씩 조회하고(/inbounds/dock-schedule?date=),
   그날 입고 예정인데 예약이 없는 건은 미배정으로 따로 받는다. 오늘 작업 건의 예약은 mockDashboard 시드가 넣는다. */
const DOCK_LANES = [
  { name: "DOCK 1", sub: "대형 · 리프트 2", tone: "info" },
  { name: "DOCK 2", sub: "일반 · 리프트 1", tone: "warning" },
  { name: "DOCK 3", sub: "소형 · 수작업", tone: "success" },
  { name: "검수라인 A", sub: "검사품 전용", tone: "violet" }
];
const DOCK_START = 8 * 60;
const DOCK_END = 18 * 60;
const DOCK_PROGRESS: Record<string, number> = { scheduled: 0, registered: 25, located: 50, confirmed: 100, closed: 100 };
/** lane = DOCK_LANES 순번 */
const dockReservations: AnyRecord[] = [
  { inboundNo: "IN-20260530-001", date: "2026-05-30", lane: 3, from: 540, to: 580 },
  { inboundNo: "IN-20260606-003", date: "2026-06-05", lane: 0, from: 480, to: 540 },
  { inboundNo: "IN-20260607-001", date: "2026-06-07", lane: 2, from: 600, to: 645 },
  { inboundNo: "IN-20260613-001", date: "2026-06-13", lane: 0, from: 570, to: 660 },
  { inboundNo: "IN-MV-20260616-001", date: "2026-06-16", lane: 3, from: 630, to: 720 },
  { inboundNo: "IN-MV-20260617-002", date: today, lane: 2, from: 510, to: 555 },
  { inboundNo: "IN-20260620-001", date: "2026-06-20", lane: 1, from: 780, to: 900 }
];

/* 관제 대시보드 — 주요 작업 현황(입고/출고 통합 타임라인) */
const inboundStatusLabel: Record<string, string> = {
  scheduled: "입고예정",
  registered: "입고등록",
  located: "로케이션지정",
  confirmed: "입고확정",
  closed: "닫힘"
};
const taskTone = (status: string) => {
  if (status.includes("완료") || status.includes("확정")) return "success";
  if (status.includes("보류") || status.includes("거부") || status.includes("반려")) return "danger";
  if (status.includes("예정") || status.includes("대기")) return "warning";
  return "info";
};
function dashboardTasks() {
  const times = ["14:26", "13:50", "13:12", "11:40", "10:55", "10:12", "09:38", "09:05"];
  const inRows = inbounds.slice(0, 4).map((row, idx) => {
    const status = inboundStatusLabel[String(row.status)] ?? String(row.status);
    return {
      taskNo: row.inboundNo,
      kind: "입고",
      partner: row.supplierName,
      qty: row.qty,
      unit: "EA",
      status,
      tone: taskTone(status),
      time: times[idx * 2] ?? "09:00",
      to: "/inbound/inbound-confirm"
    };
  });
  const outRows = outbounds.slice(0, 4).map((row, idx) => ({
    taskNo: row.outboundNo,
    kind: "출고",
    partner: row.customerName,
    qty: row.qty,
    unit: "EA",
    status: String(row.status),
    tone: taskTone(String(row.status)),
    time: times[idx * 2 + 1] ?? "09:00",
    to: "/outbound/outbound-order"
  }));
  return [...inRows, ...outRows].sort((a, b) => b.time.localeCompare(a.time));
}

/* 관제 대시보드 — 보관 구분별 재고 구성 */
function stockMix() {
  const buckets: Array<{ name: string; qty: number; tone: string }> = [
    { name: "피킹 재고", qty: 0, tone: "info" },
    { name: "보관 재고", qty: 0, tone: "success" },
    { name: "격납 대기", qty: 0, tone: "warning" },
    { name: "외주 재고", qty: 0, tone: "violet" }
  ];
  for (const stock of stocks) {
    const idx =
      stock.warehouseType === "외주" ? 3
      : stock.stockStatus === "PUTAWAY_WAIT" ? 2
      : stock.locationType === "PICKING" ? 0
      : 1;
    buckets[idx].qty += stock.onHand;
  }
  const total = buckets.reduce((sum, bucket) => sum + bucket.qty, 0);
  return { total, buckets };
}

const analyticsRows = {
  periodRows: [
    { period: "2026-06-15", cnt: 3, qty: 480 },
    { period: "2026-06-16", cnt: 4, qty: 620 },
    { period: "2026-06-17", cnt: 5, qty: 540 }
  ],
  itemRows: items.slice(0, 4).map((item, idx) => ({ itemCode: item.itemCode, itemName: item.itemName, cnt: 2 + idx, qty: 120 * (idx + 1) }))
};

function stripQuery(path: string) {
  return path.split("?")[0];
}

function asWarehouseLocations(warehouseId: number) {
  const wh = warehouses.find((w) => w.id === warehouseId);
  return locations
    .filter((l) => !wh || l.warehouseName === wh.name)
    .map((l) => {
      // 지금 든 재고 — 격납할 칸을 고를 때 무엇과 섞이는지 보여 준다 (서버 LocationService.optionsFor 와 같은 모양)
      const inside = stocks
        .filter((s) => s.locationCode === l.code && Number(s.onHand) > 0)
        .map((s) => ({ itemCode: s.itemCode, itemName: s.itemName, lotNo: s.lotNo, onHand: Number(s.onHand), unit: s.unit, stockStatus: s.stockStatus }));
      return {
        id: l.id,
        code: l.code,
        status: l.status,
        locationType: l.locationType,
        zoneName: l.zoneName,
        skuCount: new Set(inside.map((s) => s.itemCode)).size,
        stocks: inside
      };
    });
}

function dispatchTargets(region: string) {
  return outbounds
    .filter((o) => (o.status === "피킹완료" || o.status === "출고완료") && regionOf(o.shipAddress) === region && !dispatched.some((d) => d.outboundNo === o.outboundNo))
    .map((o) => {
      // 예전에는 건마다 지어낸 중량(180 + 75kg …)을 줬다 — 이제 라인 × 품목 제원으로 계산한다
      const totals = orderTotals(o.id);
      return {
        outboundId: o.id,
        outboundNo: o.outboundNo,
        customerName: o.customerName,
        shipAddress: o.shipAddress,
        region,
        status: o.status,
        scheduledDate: o.scheduledDate,
        ...totals,
        recommendedVehicle: recommendVehicle(totals.totalWeightKg, totals.palletCount)
      };
    });
}

/** 하루치 도크 스케줄 — 예약 블록(입고 상태·진행률·지연)과 예약 없는 그날 입고 예정 */
function dockScheduleOf(date: string) {
  const clock = new Date();
  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  const isToday = date === today;
  const reserved = dockReservations.filter((r) => r.date === date);
  const reservedNos = new Set(reserved.map((r) => r.inboundNo));
  const blocksOf = (lane: number) =>
    reserved
      .filter((r) => r.lane === lane)
      .flatMap((r) => {
        const row = inbounds.find((x) => x.inboundNo === r.inboundNo);
        if (!row) return [];
        return [{
          id: row.id,
          inboundNo: row.inboundNo,
          partner: row.supplierName,
          from: r.from,
          to: r.to,
          status: row.status,
          pct: DOCK_PROGRESS[row.status] ?? 0,
          // 예약 시간이 지났는데 입고확정 전 — 지난 날짜이거나, 오늘 예약 끝 시각이 지남
          warn: row.status !== "confirmed" && row.status !== "closed" && (date < today || (isToday && r.to <= nowMin))
        }];
      })
      .sort((a, b) => a.from - b.from);
  return {
    date,
    isToday,
    now: `${String(clock.getHours()).padStart(2, "0")}:${String(clock.getMinutes()).padStart(2, "0")}`,
    nowMin,
    startMin: DOCK_START,
    endMin: DOCK_END,
    lanes: DOCK_LANES.map((lane, index) => ({ ...lane, blocks: blocksOf(index) })),
    unassigned: inbounds
      .filter((row) => row.expectedAt === date && !reservedNos.has(row.inboundNo))
      .map((row) => ({ id: row.id, inboundNo: row.inboundNo, partner: row.supplierName, type: row.type, warehouseName: row.warehouseName, qty: row.qty, status: row.status }))
  };
}

function stockTrace(q: string) {
  const kw = q.toLowerCase();
  const matched = stocks.filter((s) => s.itemCode.toLowerCase().includes(kw) || s.lotNo.toLowerCase().includes(kw));
  return {
    stocks: matched,
    history: [
      { createdAt: "2026-06-16 13:19", transferNo: "TR260616131934-6", type: "일반→일반", itemCode: "SKU-10241", lotNo: "LOT260407-0006", fromLocation: "PC-A-01", toLocation: "PC-A-02", qty: 50, status: "done", reason: "창고 내 재배치", createdBy: "admin" },
      { createdAt: "2026-06-12 16:32", transferNo: "RP260612163200-13", type: "보충", itemCode: "SKU-30001", lotNo: "LOT260405-0013", fromLocation: "PC-B-01", toLocation: "PC-A-01", qty: 200, status: "done", reason: "피킹재고 보충", createdBy: "admin" }
    ].filter((h) => !q || h.itemCode.toLowerCase().includes(kw) || (h.lotNo ?? "").toLowerCase().includes(kw))
  };
}

function chatbotAnswer(q: string) {
  const text = q ?? "";
  if (text.includes("쇼트") || text.includes("부족")) return { intent: "shortage", answer: "쇼트 예상 품목은 2건입니다 (USB-C 케이블, 볼트 M8).", rows: [{ label: "USB-C 케이블", value: "가용 60 / 안전 180 · 위험" }, { label: "볼트 M8", value: "가용 75 / 안전 300 · 위험" }] };
  if (text.includes("출고")) return { intent: "outbound", answer: "금일 출고는 5건입니다.", rows: [{ label: "출고대기", value: "1건" }, { label: "피킹중", value: "1건" }, { label: "출고완료", value: "1건" }] };
  if (text.includes("장기")) return { intent: "aging", answer: "장기재고(1년+)는 2건, 재고금액 ₩652,200입니다.", rows: [{ label: "장기재고", value: "2건" }, { label: "장기재고 금액", value: "₩652,200" }] };
  if (text.includes("보충")) return { intent: "replenish", answer: "보충 대상은 2건입니다.", rows: [{ label: "보충 대상", value: "2건" }] };
  if (text.includes("격납")) return { intent: "putaway", answer: "격납대기는 1건(295 EA)입니다.", rows: [{ label: "격납대기", value: "1건 / 295 EA" }] };
  if (text.includes("입고")) return { intent: "inbound", answer: "금일 입고는 입고예정 1건, 입고확정 2건입니다.", rows: [{ label: "입고예정", value: "1건" }, { label: "입고확정", value: "2건" }] };
  return { intent: "stock", answer: "현재 총 재고는 2,574 EA이고 보충 대상은 2건입니다.", rows: [{ label: "총 재고", value: "2,574 EA" }, { label: "보충 대상", value: "2건" }] };
}

function orderProducts() {
  return [
    ...items.map((it) => ({ itemCode: it.itemCode, itemName: it.itemName, unit: it.unit, isBom: false, components: [] as AnyRecord[] })),
    ...Object.entries(boms).map(([code, b]) => ({ itemCode: code, itemName: b.itemName, unit: b.unit, isBom: true, components: b.components }))
  ];
}

// B-1: 보충 대상 = 파레트 구성 기준. 피킹 로케이션 재고가 파레트 배수가 아니면(낱개 발생)
// 다음 파레트를 채우기 위한 부족 수량을 산정하고, 동일 품목 보충(RESERVE) FIFO 재고를 출발지로 추천.
function computeReplenishment() {
  const rows: AnyRecord[] = [];
  // 같은 피킹 로케이션·같은 품목은 LOT 가 달라도 합쳐서 본다 — 보충하면 LOT 가 둘로 나뉘기 때문
  const groups = new Map<string, typeof stocks>();
  stocks.filter((s) => s.stockStatus === "AVAILABLE" && s.locationType === "PICKING" && s.onHand > 0).forEach((s) => {
    const key = `${s.locationCode}|${s.itemCode}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  });
  groups.forEach((list) => {
    const s = list[0];
    const item = items.find((it) => it.itemCode === s.itemCode);
    const upp = item?.unitsPerPallet ?? 0;
    if (!upp) return;
    const total = list.reduce((sum, row) => sum + row.onHand, 0);
    const loose = total % upp;
    if (loose === 0) return; // 파레트 정합 — 보충 불필요
    const shortQty = upp - loose;
    const source = stocks
      .filter((x) => x.itemCode === s.itemCode && x.stockStatus === "AVAILABLE" && x.locationType === "RESERVE" && x.available > 0)
      .sort((a, b) => (a.receivedDate ?? "").localeCompare(b.receivedDate ?? ""))[0];
    const targetLoc = locations.find((l) => l.code === s.locationCode);
    rows.push({
      itemCode: s.itemCode, itemName: s.itemName, unit: s.unit, warehouseName: s.warehouseName,
      unitsPerPallet: upp, unitWeightKg: Number(item?.unitWeightKg) || 0, pickingLocationCode: s.locationCode, pickingQty: total,
      wholePallets: Math.floor(total / upp), looseQty: loose, shortQty, suggestQty: shortQty,
      sourceStockId: source?.stockId ?? null, sourceLocationCode: source?.locationCode ?? null,
      sourceLot: source?.lotNo ?? null, sourceReceivedDate: source?.receivedDate ?? null, sourceAvail: source?.available ?? 0,
      targetLocationId: targetLoc?.id ?? null, targetLocationCode: s.locationCode
    });
  });
  return rows.sort((a, b) => b.shortQty - a.shortQty);
}

// B-2: ERP/WMS 시점 재고 비교 — 일별(과거 날짜 지정), 상품·로케이션·수량별 차이. 시드 불일치 3건.
const erpDiffSeed: Record<string, number> = { "SKU-10241|PC-A-01": 2, "SKU-10822|PI-A-01": -3, "SKU-30001|PC-A-02": 5 };
function erpCompareRows(date: string) {
  return stocks
    .filter((s) => s.stockStatus === "AVAILABLE")
    .map((s) => {
      const diff = erpDiffSeed[`${s.itemCode}|${s.locationCode}`] ?? 0;
      return {
        compareDate: date, itemCode: s.itemCode, itemName: s.itemName,
        warehouseName: s.warehouseName, locationCode: s.locationCode, lotNo: s.lotNo,
        wmsQty: s.onHand, erpQty: s.onHand - diff, diff // diff = wms - erp
      };
    })
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

// B-3: 선입선출 현황(파레트 단위, 관리용). 품목별 가용 재고를 입고일 오름차순으로 나열, FIFO 순번 부여.
function fifoRows() {
  const byItem: Record<string, AnyRecord[]> = {};
  stocks.filter((s) => s.stockStatus === "AVAILABLE").forEach((s) => {
    (byItem[s.itemCode] ??= []).push(s);
  });
  const out: AnyRecord[] = [];
  Object.values(byItem).forEach((list) => {
    list.sort((a, b) => (a.receivedDate ?? "").localeCompare(b.receivedDate ?? ""));
    list.forEach((s, idx) => {
      const upp = items.find((it) => it.itemCode === s.itemCode)?.unitsPerPallet ?? 0;
      out.push({
        itemCode: s.itemCode, itemName: s.itemName, unit: s.unit, lotNo: s.lotNo,
        receivedDate: s.receivedDate, warehouseName: s.warehouseName, locationCode: s.locationCode,
        qty: s.onHand, unitsPerPallet: upp, pallets: upp ? Math.ceil(s.onHand / upp) : null,
        fifoRank: idx + 1, priorityOut: idx === 0
      });
    });
  });
  return out.sort((a, b) => a.itemCode.localeCompare(b.itemCode) || (a.receivedDate ?? "").localeCompare(b.receivedDate ?? ""));
}

/* 창고 레이아웃 · 로케이션 마스터 · 재고 이동/조정 — 같은 배열을 공유한다 */
const warehouseMock = createWarehouseMock({
  today,
  warehouses,
  zones,
  items,
  locations: () => locations,
  stocks: () => stocks,
  nextStockId: () => ++stockSeq,
  outbounds: () => outbounds,
  outboundLines,
  replenishment: () => computeReplenishment()
});

/* 대시보드 현황 · 작업 알림 — 오늘 작업 건을 위 배열에 시드하고, 숫자는 배열에서 계산한다 (이천 재고가 생긴 뒤에 만든다) */
const dashboardMock = createDashboardMock({
  today,
  items,
  warehouses,
  inbounds: () => inbounds,
  inboundLines,
  dockReservations: () => dockReservations,
  outbounds: () => outbounds,
  outboundLines,
  stocks: () => stocks,
  nextStockId: () => ++stockSeq,
  returns: () => returns,
  stocktakings: () => stocktakings,
  interfaces: () => interfaceLogs,
  dispatched: () => dispatched,
  replenishment: () => computeReplenishment(),
  shortage: () => shortageRows,
  erpRows: () => erpCompareRows(today),
  slots: () => ((warehouseMock.get("/warehouse/layout", new URLSearchParams("warehouseId=4")) as AnyRecord | undefined)?.slots ?? []) as AnyRecord[]
});

/* 입고 · 출고 처리 이력 — 출고 사진을 올리고 · 지우고 · 내려받으면 여기에 쌓여 출고 이력에 보인다 */
const activityLogs: AnyRecord[] = [
  { id: 1, refType: "OUTBOUND", refNo: "DN20260601019", action: "출고확정", detail: "출고확정 및 ERP 전송", erpSent: true, operator: "outbound", createdAt: "2026-06-17 09:30" },
  { id: 2, refType: "INBOUND", refNo: "IN-20260606-003", action: "입고확정", detail: "검수 후 격납대기 생성", erpSent: false, operator: "inbound", createdAt: "2026-06-16 14:05" },
  { id: 3, refType: "INBOUND", refNo: "IN-MV-20260616-001", action: "공장간이동 입고확정", detail: "창원→제천 이동입고 · 격납대기 생성 (일반입고와 구분, ERP 미전송)", erpSent: false, operator: "logistics", createdAt: "2026-06-16 15:20" }
];

/* 출고 사진(증빙) — 출고 건에 사진을 올린다. 사진은 메모리에만 있다 (설계 DOCS/WMS_출고사진_설계.md) */
const outboundPhotoMock = createOutboundPhotoMock({
  today,
  outbounds: () => outbounds,
  // 로그인한 사람의 기능을 따른다 — 권한 관리에서 바꾸면 바로 규칙이 바뀐다
  can: (feature) => can(feature),
  operator: () => useAuthStore.getState().user?.name ?? "system",
  log: (entry) => activityLogs.push({ id: activityLogs.length + 1, refType: "OUTBOUND", erpSent: false, ...entry })
});

/* 품목 가져오기 (엑셀 · CSV) — 서버와 같은 규칙. 관리자 역할일 때만 */
const itemImportMock = createItemImportMock({
  items: () => items,
  can: (feature) => can(feature)
});

/* 변경·취소 확인 — 피킹이 시작된 뒤 주문 시스템에서 온 변경 · 취소. 승인 · 거절은 머리글의 역할 선택을 따른다 */
const omsChangeMock = createOmsChangeMock({
  today,
  outbounds: () => outbounds,
  outboundLines: () => outboundLines,
  removeDispatch: (outboundNo) => {
    dispatched = dispatched.filter((d) => d.outboundNo !== outboundNo);
  },
  can: (feature) => can(feature),
  operator: () => useAuthStore.getState().user?.name ?? "system",
  log: (entry) => activityLogs.push({ id: activityLogs.length + 1, refType: "OUTBOUND", erpSent: false, ...entry })
});

/** 입고 · 출고 이력 — 종류 · 검색어로 거르고 최근 것부터. 출고 이력에는 그 출고 건의 사진 장수를 싣는다 (서버와 같은 칸) */
function activityHistory(endpoint: string, keyword: string) {
  const refType = endpoint === "outbound" ? "OUTBOUND" : "INBOUND";
  // 사진 시드가 이력에 남긴 줄까지 보이게 — 시드는 처음 쓸 때 만들어진다
  outboundPhotoMock.ready();
  const kw = keyword.trim().toLowerCase();
  return activityLogs
    .filter((row) => row.refType === refType)
    .filter((row) => !kw || [row.refNo, row.action, row.detail, row.operator].some((value) => String(value ?? "").toLowerCase().includes(kw)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id)
    .map((row) => (refType === "OUTBOUND" ? { ...row, photoCount: outboundPhotoMock.countByNo(row.refNo) } : row));
}

/** 파일 내려받기(목) — 지금은 출고 사진 증빙 ZIP 하나 */
export async function mockDownload(path: string): Promise<Blob> {
  await delay();
  const url = new URL(path, "http://mock.local");
  const blob = outboundPhotoMock.download(stripQuery(url.pathname));
  if (!blob) throw new Error("내려받을 파일이 없습니다.");
  return blob;
}

/** 관리 화면의 저장 메시지 (서버 ApiResponse.message 와 같은 문구) — 바로 다음 mockRequestWithMessage 가 가져간다 */
let lastMessage: string | null = null;

/** 저장 + 서버 메시지 ("저장했습니다 — 바로 적용됩니다") */
export async function mockRequestWithMessage<T>(path: string, init?: RequestInit): Promise<{ data: T; message: string | null }> {
  lastMessage = null;
  const data = await mockRequest<T>(path, init);
  return { data, message: lastMessage };
}

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await delay();
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(path, "http://mock.local");
  const clean = stripQuery(url.pathname);

  if (method !== "GET") {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    // 계정 · 권한 — 관리 화면 (저장 메시지도 함께)
    const accessHandled = accessMock.mutate(method, clean, body) ?? accountMock.mutate(method, clean, body);
    if (accessHandled !== undefined) {
      lastMessage = accessHandled[1];
      return copy(accessHandled[0]) as T;
    }
    // 출고확정 · 출고일 변경은 서버가 주문 시스템 · ERP 반영을 기다린다 — 목도 조금 더 기다려 그 화면을 보인다
    if (/^\/outbounds\/\d+\/(confirm|schedule)$/.test(clean)) await delay(900);
    if (clean === "/chatbot/ask") return copy(chatbotAnswer(body.question ?? "")) as T;
    const handled = warehouseMock.mutate(method, clean, body);
    if (handled !== undefined) return copy(handled) as T;
    const photoHandled = outboundPhotoMock.mutate(method, clean, body, url.searchParams);
    if (photoHandled !== undefined) return copy(photoHandled) as T;
    const changeHandled = omsChangeMock.mutate(method, clean, body);
    if (changeHandled !== undefined) return copy(changeHandled) as T;
    const itemImportHandled = itemImportMock.mutate(method, clean, body);
    if (itemImportHandled !== undefined) return copy(itemImportHandled) as T;
    const inboundHandled = inboundMutation(clean, body);
    if (inboundHandled !== undefined) return copy(inboundHandled) as T;
    // 서버처럼 결과를 돌려주는 처리(예: 품목 제원 저장)는 그 값을, 나머지는 { ok: true }
    const result = handleMutation(clean, body);
    return copy(result ?? { ok: true }) as T;
  }

  const warehouseData = warehouseMock.get(clean, url.searchParams);
  if (warehouseData !== undefined) return copy(warehouseData) as T;

  const dashboardData = dashboardMock.get(clean);
  if (dashboardData !== undefined) return copy(dashboardData) as T;

  const photoData = outboundPhotoMock.get(clean, url.searchParams);
  if (photoData !== undefined) return copy(photoData) as T;

  const changeData = omsChangeMock.get(clean, url.searchParams);
  if (changeData !== undefined) return copy(changeData) as T;

  const accessData = accessMock.get(clean, url.searchParams) ?? accountMock.get(clean);
  if (accessData !== undefined) return copy(accessData) as T;

  if (clean === "/dashboard/tasks") return copy(dashboardTasks()) as T;
  if (clean === "/dashboard/stock-mix") return copy(stockMix()) as T;
  if (clean === "/inbounds") return copy(inbounds.map(inboundView)) as T;
  if (clean === "/inbounds/dock-schedule") return copy(dockScheduleOf(url.searchParams.get("date") ?? today)) as T;
  if (clean.match(/^\/inbounds\/\d+\/lines$/)) {
    const id = Number(clean.split("/")[2]);
    const row = inbounds.find((r) => r.id === id);
    return copy((inboundLines[id] ?? []).map((ln) => inboundLineView(row, ln))) as T;
  }
  if (clean.match(/^\/inbounds\/\d+\/receipts$/)) return copy(inboundReceipts[Number(clean.split("/")[2])] ?? []) as T;
  if (clean === "/outbounds") return copy(outbounds.map((o) => {
    const { totalWeightKg, weightMissing } = orderTotals(o.id);
    // 사진 장수 — 출고 확정 때 "사진 없음" 경고 · 확인 대기 변경 — 출고 확정 막기 (서버 OutboundMapper.findAll 과 같은 칸)
    return { ...o, totalWeightKg, weightMissing, photoCount: outboundPhotoMock.count(o.id), pendingChanges: omsChangeMock.pendingCount(o.id) };
  })) as T;
  if (clean.match(/^\/outbounds\/\d+\/lines$/)) return copy(outboundLines[Number(clean.split("/")[2])] ?? []) as T;
  if (clean.match(/^\/outbounds\/\d+\/sheet$/)) return copy(outboundSheet(Number(clean.split("/")[2]))) as T;
  if (clean.match(/^\/outbounds\/\d+\/delivery$/)) return copy(deliveryOf(Number(clean.split("/")[2]))) as T;
  if (clean === "/stocks") return copy(stocks) as T;
  if (clean === "/stocks/putaway") return copy(stocks.filter((s) => s.stockStatus === "PUTAWAY_WAIT").map(({ allocated, available, safetyStock, ...s }) => ({ ...s, qty: s.onHand }))) as T;
  if (clean === "/stocks/replenishment") return copy(computeReplenishment()) as T;
  if (clean === "/stocks/fifo") return copy(fifoRows()) as T;
  if (clean === "/erp-compare/dates") return copy([today, "2026-06-16", "2026-06-15"]) as T;
  if (clean === "/erp-compare") return copy(erpCompareRows(url.searchParams.get("date") ?? today)) as T;
  if (clean === "/stocks/trace") return copy(stockTrace(url.searchParams.get("q") ?? "")) as T;
  if (clean === "/warehouses") return copy(warehouses) as T;
  if (clean.match(/^\/warehouses\/\d+\/locations$/)) return copy(asWarehouseLocations(Number(clean.split("/")[2]))) as T;
  if (clean === "/items") return copy(items.map(itemRow)) as T;
  if (clean === "/carriers") return copy(carriers) as T;
  if (clean === "/dispatch/targets") return copy(dispatchTargets(url.searchParams.get("region") ?? "수도권")) as T;
  if (clean === "/dispatch") return copy(dispatched.filter((d) => !url.searchParams.get("region") || d.region === url.searchParams.get("region"))) as T;
  if (clean === "/dispatch/deliveries") return copy(dispatched.map((d) => {
    const o = outbounds.find((x) => x.outboundNo === d.outboundNo);
    return { ...d, deliveryNo: d.dispatchNo, customerCode: o?.customerCode ?? null, invoiceNo: o?.invoiceNo ?? ("MOCK-" + d.id), qty: o?.qty ?? 0, scheduledDate: o?.scheduledDate ?? null, photoCount: outboundPhotoMock.countByNo(d.outboundNo) };
  })) as T;
  if (clean === "/analytics/aging") return copy(stocks.map((s) => {
    // 경과일은 입고일 기준 — 목 재고가 늘어도 장기재고 판정이 실제 데이터를 따른다
    const agingDays = Math.max(0, Math.round((Date.parse(today) - Date.parse(s.receivedDate)) / 86400000));
    const unitPrice = 1500 + ([...s.itemCode].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 20) * 400;
    return { itemCode: s.itemCode, itemName: s.itemName, warehouseName: s.warehouseName, locationCode: s.locationCode, lotNo: s.lotNo, receivedDate: s.receivedDate, agingDays, qty: s.onHand, unitPrice, amount: s.onHand * unitPrice, longTerm: agingDays >= 365 };
  })) as T;
  if (clean === "/analytics/shortage") return copy(shortageRows) as T;
  if (clean === "/analytics/inbound-summary" || clean === "/analytics/outbound-summary") return copy(analyticsRows) as T;
  if (clean === "/snapshots/months") return copy(["2026-06", "2026-05"]) as T;
  if (clean === "/snapshots") return copy(items.slice(0, 4).map((item, idx) => ({ snapshotMonth: url.searchParams.get("month") ?? "2026-06", itemCode: item.itemCode, itemName: item.itemName, warehouseName: warehouses[idx]?.name ?? "창원공장", wmsQty: 120 + idx * 85, erpQty: 118 + idx * 85, diff: idx % 2 === 0 ? 2 : 0, capturedAt: "2026-06-17 10:00" }))) as T;
  if (clean === "/stocktakings") return copy(stocktakings) as T;
  if (clean === "/stocktakings/dates") return copy([today, "2026-06-16"]) as T;
  if (clean === "/returns") return copy(returns) as T;
  if (clean === "/order-products") return copy(orderProducts()) as T;
  if (clean === "/manual-orders") return copy(manualOrders) as T;
  if (clean === "/notices") return copy(notices) as T;
  if (clean === "/interfaces/status") return copy(linkStatus()) as T;
  if (clean === "/interfaces") return copy(interfaceLogs) as T;
  if (clean.startsWith("/history/")) return copy(activityHistory(clean.split("/")[2], url.searchParams.get("keyword") ?? "")) as T;
  if (clean === "/policies") return copy({ policies, buckets: policyBuckets }) as T;
  // /chatbot/ask 는 POST 이므로 위 mutation 분기(chatbotAnswer)에서 처리합니다.

  return copy([]) as T;
}

/* ---------- 출고일 · 인수자 (서버 GET /outbounds/{id}/delivery · PUT schedule · receiver 와 같은 모양) ----------
   목 출고는 모두 주문 시스템에서 온 것으로 본다. 인수자는 가짜 값 */
const deliveryExtra: Record<number, AnyRecord> = {};
const EDITABLE = ["출고대기", "피킹중", "피킹완료", "보류"];
const dayBefore = (date: string | null) => {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);   // UTC 로만 — 시간대에 밀리지 않게
};
function deliveryOf(id: number) {
  const row = outbounds.find((r) => r.id === id);
  if (!row) throw new Error("출고 건을 찾을 수 없습니다.");
  const extra = (deliveryExtra[id] ??= {
    requestedTime: "09:00", readyDate: dayBefore(row.scheduledDate), readyTime: null, vehicleType: "04", vehicleTypeName: "1톤",
    receiverName: "김인수", receiverMobile: "010-0000-0000", receiverTel: null, zipCode: "00000",
    address: row.shipAddress, addressDetail: null
  });
  return {
    id: row.id, outboundNo: row.outboundNo, status: row.status, fromOms: true, source: "OMS",
    scheduledDate: row.scheduledDate, shipAddress: row.shipAddress, requestedDate: row.scheduledDate, ...extra,
    editable: EDITABLE.includes(row.status)
  };
}
const filled = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
function requireEditable(id: number) {
  const row = outbounds.find((r) => r.id === id);
  if (!row) throw new Error("출고 건을 찾을 수 없습니다.");
  if (!EDITABLE.includes(row.status)) throw new Error(`${row.status} 상태라 출고일 · 인수자를 바꿀 수 없습니다.`);
  return row;
}
function changeSchedule(id: number, body: AnyRecord) {
  const row = requireEditable(id);
  const requested = filled(body.requestedDate);
  if (!requested) throw new Error("배송희망일을 넣으세요.");
  const ready = filled(body.readyDate);
  if (ready && ready > requested) throw new Error(`출고일(${ready})이 배송희망일(${requested})보다 늦습니다.`);
  deliveryOf(id);
  row.scheduledDate = requested;
  const vehicle = filled(body.vehicleTypeName);
  const codes: Record<string, string> = { 없음: "00", 다마스: "02", 라보: "03", "1톤": "04", "1.4톤": "05", "2.5톤": "06", "3.5톤": "07", "5톤이상": "08", 택배: "09" };
  if (vehicle && !codes[vehicle]) throw new Error(`알 수 없는 배송차종입니다: ${vehicle}`);
  Object.assign(deliveryExtra[id], {
    requestedTime: filled(body.requestedTime), readyDate: ready, readyTime: filled(body.readyTime),
    vehicleTypeName: vehicle, vehicleType: vehicle ? codes[vehicle] : null
  });
  // notified — 서버처럼 주문 시스템 · ERP 반영을 기다린 뒤 저장했다 (변경 응답에서만)
  return { ...deliveryOf(id), notified: true };
}
function changeReceiver(id: number, body: AnyRecord) {
  const row = requireEditable(id);
  const need = (key: string, label: string) => {
    const value = filled(body[key]);
    if (!value) throw new Error(`${label} 칸이 비어 있습니다.`);
    return value;
  };
  const values = {
    receiverName: need("receiverName", "인수자"), receiverMobile: need("receiverMobile", "인수자 휴대폰"),
    receiverTel: filled(body.receiverTel), zipCode: need("zipCode", "우편번호"), address: need("address", "주소"),
    addressDetail: filled(body.addressDetail)
  };
  deliveryOf(id);
  Object.assign(deliveryExtra[id], values);
  row.shipAddress = values.addressDetail ? `${values.address} ${values.addressDetail}` : values.address;
  return deliveryOf(id);
}

function handleMutation(clean: string, body: AnyRecord) {
  // 입고 처리(도착 · 지정 · 입고확정 · 도착 취소 · 닫기)는 inboundMutation 이 먼저 받는다
  if (clean.match(/^\/outbounds\/\d+\/pick-start$/)) {
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) row.status = "피킹중";
  } else if (clean.match(/^\/outbounds\/\d+\/pick-complete$/)) {
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) {
      row.status = "피킹완료";
      // 스킵하지 않은 라인은 다 집었다 — 이번에 새로 집은 수량만 대시보드 처리량에 남긴다
      const skipped = new Set<number>(Array.isArray(body.skippedLineIds) ? body.skippedLineIds.map(Number) : []);
      const lines = outboundLines[row.id] ?? [];
      let pickedNow = lines.length ? 0 : Number(row.qty) || 0;
      lines.forEach((ln) => {
        if (skipped.has(ln.id)) return;
        pickedNow += Math.max(Number(ln.orderQty) - Number(ln.pickedQty), 0);
        ln.pickedQty = ln.orderQty;
        ln.scanned = true;
      });
      dashboardMock.record("picking", pickedNow, row.outboundNo);
    }
  } else if (clean.match(/^\/outbounds\/\d+\/confirm$/)) {
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row && omsChangeMock.pendingCount(row.id) > 0) {
      // 서버 OutboundService.confirm 과 같다 — 나간 뒤에는 승인할 수 없다
      throw new Error("OMS 변경 · 취소 요청이 물류팀 확인을 기다립니다 — 변경 확인 화면에서 먼저 승인하거나 거절하세요.");
    }    if (row) {
      row.status = "출고완료";
      // 확정한 날 — 출고 사진은 이날까지만 누구나 더한다 (다음 날부터는 관리자 · 물류)
      (row as AnyRecord).confirmedDate = today;
      dashboardMock.record("outbound-confirm", Number(row.qty) || 0, row.outboundNo);
    }
    // 서버 ConfirmResult 와 같은 모양 — 목 출고는 모두 주문 시스템에서 온 것으로 본다 (주문 시스템 · ERP 반영 뒤 확정)
    return { skippedLines: 0, notified: true };
  } else if (clean.match(/^\/outbounds\/\d+\/(hold|reject)$/)) {
    // 출고 불가 알림 → 보류 (서버 OutboundService.hold 와 같다. /reject 는 예전 주소)
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row && !["출고대기", "피킹중", "피킹완료"].includes(row.status)) {
      throw new Error(`${row.status} 상태라 출고 불가 알림을 보낼 수 없습니다.`);
    }
    if (row) {
      row.status = "보류";
      row.rejectReason = body.reason || "재고부족";
    }
  } else if (clean.match(/^\/outbounds\/\d+\/resume$/)) {
    // 다시 출고 — 집어 둔 물건이 있으면 피킹완료, 없으면 출고대기
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row && row.status !== "보류") throw new Error("보류 중인 출고만 다시 출고할 수 있습니다.");
    if (row) {
      row.status = (outboundLines[row.id] ?? []).some((ln) => Number(ln.pickedQty) > 0) ? "피킹완료" : "출고대기";
      row.rejectReason = null;
    }
  } else if (clean.match(/^\/outbounds\/\d+\/schedule$/)) {
    return changeSchedule(Number(clean.split("/")[2]), body);
  } else if (clean.match(/^\/outbounds\/\d+\/receiver$/)) {
    return changeReceiver(Number(clean.split("/")[2]), body);
  } else if (clean.match(/^\/outbounds\/\d+\/invoice$/)) {
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) row.invoiceNo = body.invoiceNo ?? null;
  } else if (clean === "/dispatch/assign") {
    const row = outbounds.find((r) => r.id === body.outboundId);
    const carrier = carriers.find((c) => c.id === body.carrierId);
    if (row) {
      // 합계는 서버처럼 라인 × 제원 — 미등록 품목이 있으면 모름(null)으로 남긴다
      const totals = orderTotals(row.id);
      const vehicle = body.vehicleType || recommendVehicle(totals.totalWeightKg, totals.palletCount);
      if (!vehicle) throw new Error(`제원(중량·파레트 입수) 미등록 품목이 있어 차량을 추천할 수 없습니다 — 차량을 직접 고르세요. (${row.outboundNo})`);
      dispatched.unshift({ id: Date.now(), dispatchNo: `DP-${Date.now()}`, outboundNo: row.outboundNo, customerName: row.customerName, shipAddress: row.shipAddress, region: regionOf(row.shipAddress), carrierName: carrier?.name ?? null, vehicleType: vehicle, totalWeightKg: totals.totalWeightKg, totalVolumeM3: totals.totalVolumeM3, palletCount: totals.palletCount, dispatchDate: today });
    }
  } else if (clean.match(/^\/items\/\d+\/specs$/)) {
    // 물류 제원 — 서버 ItemService.updateSpecs 와 같은 검증 (비우면 미등록)
    const item = items.find((it) => it.id === Number(clean.split("/")[2])) as AnyRecord | undefined;
    if (!item) throw new Error("품목을 찾을 수 없습니다.");
    const kg = body.unitWeightKg == null || body.unitWeightKg === "" ? null : Number(body.unitWeightKg);
    if (kg != null && (!(kg > 0) || kg > 10000)) throw new Error("단위 중량은 0 보다 크고 10000 kg 이하여야 합니다. 모르면 비워 두세요.");
    if (kg != null && Math.round(kg * 1000) < 1) throw new Error("단위 중량은 0.001 kg(1g) 이상이어야 합니다.");
    const whole = (value: unknown, max: number, label: string) => {
      if (value == null || value === "") return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0 || n > max) throw new Error(`${label}은(는) 1 이상 ${max} 이하여야 합니다. 모르면 비워 두세요.`);
      return n;
    };
    const volume = whole(body.unitVolumeCm3, 10_000_000, "단위 부피(cm³)");
    const upp = whole(body.unitsPerPallet, 100_000, "파레트당 수량");
    item.unitWeightKg = kg == null ? null : Math.round(kg * 1000) / 1000;
    item.unitVolumeCm3 = volume;
    item.unitsPerPallet = upp;
    return itemRow(item);
  } else if (clean === "/notices") {
    notices.unshift({ id: Date.now(), category: body.category, title: body.title, content: body.content, author: "관리자", pinned: Boolean(body.pinned), createdAt: new Date().toISOString() });
  } else if (clean === "/carriers") {
    carriers.unshift({ id: Date.now(), active: true, ...body });
  } else if (clean.match(/^\/stocktakings\/\d+\/adjust$/)) {
    const row = stocktakings.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) {
      row.status = "ADJUSTED";
      row.adjustedAt = "2026-06-17 11:00";
    }
  } else if (clean.match(/^\/stocks\/putaway\/\d+\/complete$/)) {
    // 격납 확정 — 단일 또는 다중(분할) 로케이션 배정 지원
    requireFeature("stock/putaway:work", "격납 대기 · 처리 권한이 없습니다.");
    const stockId = Number(clean.split("/")[3]);
    const src = stocks.find((s) => s.stockId === stockId);
    if (src) {
      const rawAssigns: AnyRecord[] = Array.isArray(body.assignments) && body.assignments.length
        ? body.assignments
        : [{ toLocationId: body.toLocationId, qty: src.onHand }];
      // 칸 허용 하중 — 같은 로케이션에 나눠 넣은 수량은 합쳐서 보고, 하나라도 넘으면 격납 전체를 막는다
      const perLocation = new Map<number, number>();
      rawAssigns.forEach((a) => {
        const qty = Number(a.qty) || 0;
        if (qty > 0) perLocation.set(Number(a.toLocationId), (perLocation.get(Number(a.toLocationId)) ?? 0) + qty);
      });
      perLocation.forEach((qty, locationId) => {
        // 입고 때 지정한 칸 그대로면 이미 그 칸에 격납대기로 실려 있다 — 늘어나는 하중만 본다 (2026-10-30)
        const sameSpot = locations.find((l) => l.id === locationId)?.code === src.locationCode;
        const extra = sameSpot ? qty - Number(src.onHand) : qty;
        if (extra > 0) warehouseMock.assertLoad(locationId, src.itemCode, extra);
      });
      let moved = 0;
      const placed = rawAssigns.filter((a) => (Number(a.qty) || 0) > 0 && locations.some((l) => l.id === Number(a.toLocationId)));
      rawAssigns.forEach((a) => {
        const loc = locations.find((l) => l.id === Number(a.toLocationId));
        const qty = Number(a.qty) || 0;
        if (!loc || qty <= 0) return;
        const wh = warehouses.find((w) => w.name === loc.warehouseName);
        moved += qty;
        // 이동 이력에 '격납' 줄 — 서버 StockService.completePutaway 와 같은 번호(PT…) · 사유 문구 (예전 목은 안 남겼다)
        const part = placed.indexOf(a) + 1;
        warehouseMock.logTransfer({
          prefix: "PT",
          itemCode: src.itemCode,
          itemName: src.itemName,
          fromWarehouse: src.warehouseName,
          toWarehouse: loc.warehouseName,
          fromLocation: src.locationCode,
          toLocation: loc.code,
          qty,
          type: "격납",
          lotNo: src.lotNo,
          erpLinked: false,
          reason: placed.length > 1 ? `격납 완료(분할 ${part}/${placed.length}, 가용 전환)` : "격납 완료(가용 전환)",
          createdBy: body.operator ? String(body.operator) : "system"
        });
        stocks.push({
          stockId: ++stockSeq,
          itemCode: src.itemCode,
          itemName: src.itemName,
          warehouseId: wh?.id ?? src.warehouseId,
          warehouseName: loc.warehouseName,
          warehouseType: wh?.type ?? src.warehouseType,
          zoneName: loc.zoneName,
          locationCode: loc.code,
          locationType: loc.locationType,
          lotNo: src.lotNo,
          stockStatus: "AVAILABLE",
          receivedDate: src.receivedDate,
          onHand: qty,
          allocated: 0,
          available: qty,
          safetyStock: src.safetyStock,
          unit: src.unit
        });
        loc.stockCount += 1;
      });
      if (moved >= src.onHand) {
        stocks = stocks.filter((s) => s.stockId !== stockId);
      } else if (moved > 0) {
        src.onHand -= moved;
      }
      dashboardMock.record("putaway", moved, src.lotNo);
    }
  } else if (clean === "/manual-orders") {
    const seq = String(manualOrders.length + 1).padStart(3, "0");
    const orderNo = `MO-${today.replace(/-/g, "").slice(2)}-${seq}`;
    const lines: AnyRecord[] = Array.isArray(body.lines) ? body.lines : [];
    manualOrders.unshift({ id: ++stockSeq, orderNo, customerName: body.customerName || "비운영 고객", createdAt: today, lineCount: lines.length, lines });
  } else if (clean.match(/^\/returns\/\d+\/approve$/)) {
    const row = returns.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) { row.status = "approved"; row.processedAt = today + " 11:30"; }
  } else if (clean.match(/^\/returns\/\d+\/reject$/)) {
    const row = returns.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) { row.status = "rejected"; row.rejectReason = body.reason ?? "반려"; row.processedAt = today + " 11:30"; }
  } else if (clean.match(/^\/policies\//)) {
    const key = decodeURIComponent(clean.split("/")[2]);
    const policy = policies.find((p) => p.policyKey === key);
    if (policy) policy.enabled = body.enabled ?? policy.enabled;
  }
}

import type { LoginResult } from "./authService";

type AnyRecord = Record<string, any>;

const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const today = "2026-06-17";

export const mockAccounts: Record<string, { password: string; user: LoginResult["user"] }> = {
  admin: { password: "1234", user: { id: "admin", name: "관리자", role: "admin" } },
  logistics: { password: "1234", user: { id: "logistics", name: "물류담당", role: "logistics" } },
  inbound: { password: "1234", user: { id: "inbound", name: "입고담당", role: "inbound" } },
  outbound: { password: "1234", user: { id: "outbound", name: "출고담당", role: "outbound" } },
  inventory: { password: "1234", user: { id: "inventory", name: "재고담당", role: "inventory" } },
  partner: { password: "1234", user: { id: "partner", name: "협력사", role: "partner" } }
};

export async function mockLogin(id: string, password: string): Promise<LoginResult> {
  await delay();
  const account = mockAccounts[id.trim()];
  if (!account || account.password !== password) {
    throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  return { user: account.user, token: `mock-jwt-${account.user.id}` };
}

const warehouses = [
  { id: 1, code: "CW", name: "창원공장", type: "일반" },
  { id: 2, code: "JC", name: "제천공장", type: "일반" },
  { id: 3, code: "AS", name: "안산공장", type: "일반" },
  { id: 4, code: "YI", name: "용인물류센터", type: "일반" },
  { id: 5, code: "OEM", name: "외주공장", type: "외주" }
];

const zones = [
  { id: 11, code: "C-A", name: "창원 A존", warehouseName: "창원공장" },
  { id: 12, code: "C-B", name: "창원 B존", warehouseName: "창원공장" },
  { id: 21, code: "J-A", name: "제천 A존", warehouseName: "제천공장" },
  { id: 31, code: "A-A", name: "안산 A존", warehouseName: "안산공장" },
  { id: 41, code: "Y-A", name: "용인 A존", warehouseName: "용인물류센터" },
  { id: 51, code: "O-X", name: "외주 X존", warehouseName: "외주공장" }
];

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
  { id: 401, code: "PY-A-01", locationType: "PICKING", status: "가용", maxQty: 650, active: true, zoneId: 41, zoneName: "용인 A존", warehouseName: "용인물류센터", stockCount: 1 },
  { id: 501, code: "OT-X-01", locationType: "PICKING", status: "가용", maxQty: 400, active: true, zoneId: 51, zoneName: "외주 X존", warehouseName: "외주공장", stockCount: 1 },
  { id: 900, code: "QC-WAIT", locationType: "RESERVE", status: "가용", maxQty: 1000, active: true, zoneId: 11, zoneName: "창원 A존", warehouseName: "창원공장", stockCount: 2 }
];

const items = [
  { id: 1, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", spec: "BT5.3", unit: "EA", safetyStock: 120, unitsPerPallet: 60, category: "음향기기", consign: false, active: true },
  { id: 2, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", spec: "1.2m", unit: "EA", safetyStock: 180, unitsPerPallet: 50, category: "케이블", consign: false, active: true },
  { id: 3, itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", spec: "20Ah", unit: "EA", safetyStock: 80, unitsPerPallet: 20, category: "배터리", consign: false, active: true },
  { id: 4, itemCode: "SKU-20114", itemName: "[외주] 시즌 한정 머그컵 세트", spec: "2P", unit: "SET", safetyStock: 40, unitsPerPallet: 12, category: "주방용품", consign: true, active: true },
  { id: 5, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", spec: "M8", unit: "EA", safetyStock: 300, unitsPerPallet: 100, category: "부자재", consign: false, active: true }
];

let stocks = [
  { stockId: 1, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", zoneName: "창원 A존", locationCode: "PC-A-01", locationType: "PICKING", lotNo: "LOT260407-0006", stockStatus: "AVAILABLE", receivedDate: "2026-04-07", onHand: 260, allocated: 45, available: 215, safetyStock: 120, unit: "EA" },
  { stockId: 2, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", zoneName: "창원 B존", locationCode: "PC-B-01", locationType: "RESERVE", lotNo: "LOT260418-0005", stockStatus: "AVAILABLE", receivedDate: "2026-04-18", onHand: 480, allocated: 0, available: 480, safetyStock: 120, unit: "EA" },
  { stockId: 3, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", warehouseId: 4, warehouseName: "용인물류센터", warehouseType: "일반", zoneName: "용인 A존", locationCode: "PY-A-01", locationType: "PICKING", lotNo: "LOT260515-0008", stockStatus: "AVAILABLE", receivedDate: "2026-05-15", onHand: 95, allocated: 35, available: 60, safetyStock: 180, unit: "EA" },
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
  { id: 112, inboundNo: "IN-20260620-001", poNo: "PO-9018", supplierCode: "SUP001", supplierName: "한성테크놀로지", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", type: "일반", inTypeCode: "DGR", inTypeName: "국내입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: "운송장 별도 확인", status: "scheduled", expectedAt: "2026-06-20", qty: 660 },
  { id: 113, inboundNo: "IN-20260613-001", poNo: "PO-9014", supplierCode: "SUP001", supplierName: "한성테크놀로지", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", type: "일반", inTypeCode: "DGR", inTypeName: "국내입고", purchaseGroupCode: "PG41", purchaseGroupName: "이지은", remark: "긴급 입고", status: "registered", expectedAt: "2026-06-13", qty: 330 },
  { id: 111, inboundNo: "IN-20260607-001", poNo: "OPO-002", supplierCode: "OEM002", supplierName: "인천외주가공", warehouseId: 5, warehouseName: "외주공장", warehouseType: "외주", type: "외주", inTypeCode: "OEM", inTypeName: "외주입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: null, status: "located", expectedAt: "2026-06-07", qty: 120 },
  { id: 116, inboundNo: "IN-20260606-003", poNo: "PO-9003", supplierCode: "SUP001", supplierName: "한성테크놀로지", warehouseId: 2, warehouseName: "제천공장", warehouseType: "일반", type: "일반", inTypeCode: "DGR", inTypeName: "국내입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: "분할 납품 1차", status: "confirmed", expectedAt: "2026-06-05", qty: 420 },
  { id: 125, inboundNo: "IN-20260530-001", poNo: "PO-9006", supplierCode: "SUP003", supplierName: "대성정밀공업", warehouseId: 3, warehouseName: "안산공장", warehouseType: "일반", type: "일반", inTypeCode: "IMP", inTypeName: "수입입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: "통관 완료분", status: "confirmed", expectedAt: "2026-05-30", qty: 600 },
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
    { id: 1004, itemCode: "SKU-20114", itemName: "[외주] 시즌 한정 머그컵 세트", spec: "2P", unit: "SET", consign: true, locationCode: "OT-X-01", locationId: 501, trackingNo: "OEM-111", inspected: true, expectedQty: 120, receivedQty: 118 }
  ],
  116: [
    { id: 1005, itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", spec: "20Ah", unit: "EA", consign: false, locationCode: "QC-WAIT", locationId: 900, trackingNo: "TR-IN-116", inspected: true, expectedQty: 420, receivedQty: 420 }
  ],
  125: [
    { id: 1006, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", spec: "1.2m", unit: "EA", consign: false, locationCode: "PA-A-01", locationId: 301, trackingNo: "TR-IN-125", inspected: true, expectedQty: 600, receivedQty: 590 }
  ],
  140: [
    { id: 1007, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", spec: "M8", unit: "EA", consign: false, locationCode: "PJ-A-01", locationId: 201, trackingNo: "MV-140", inspected: true, expectedQty: 150, receivedQty: 0 }
  ],
  141: [
    { id: 1008, itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", spec: "20Ah", unit: "EA", consign: false, locationCode: null, locationId: null, trackingNo: "MV-141", inspected: false, expectedQty: 80, receivedQty: 0 }
  ]
};

let outbounds = [
  { id: 46, outboundNo: "DN20260601020", scheduledDate: "2026-06-19", customerCode: "051794", customerName: "대림바스(주)", outType: "A/S 출고(유상)", qty: 5, carrier: "사내차량", shipAddress: "충북 청주시 흥덕구 가경로 50", invoiceNo: null, status: "출고대기", rejectReason: null },
  { id: 62, outboundNo: "DN20260601021", scheduledDate: "2026-06-20", customerCode: "219475", customerName: "대림 스마트몰", outType: "도소매출고", qty: 32, carrier: "롯데택배", shipAddress: "경기 화성시 동탄대로 620", invoiceNo: "LT2606210088", status: "피킹완료", rejectReason: null },
  { id: 57, outboundNo: "DN20260601019", scheduledDate: "2026-06-18", customerCode: "132906", customerName: "주식회사 부방유통", outType: "도소매출고", qty: 31, carrier: "CJ대한통운", shipAddress: "경기 부천시 길주로 210", invoiceNo: "CJ2606190077", status: "출고완료", rejectReason: null },
  { id: 52, outboundNo: "DN20260601018", scheduledDate: "2026-06-17", customerCode: "127419", customerName: "(주)코스트코리아", outType: "도소매출고", qty: 19, carrier: "로젠택배", shipAddress: "경기 고양시 일산동구 중앙로 1275", invoiceNo: null, status: "거부", rejectReason: "주소 오류" },
  { id: 70, outboundNo: "DN20260601022", scheduledDate: today, customerCode: "771205", customerName: "이마트 트레이더스", outType: "도소매출고", qty: 84, carrier: "한진택배", shipAddress: "서울 강남구 테헤란로 152", invoiceNo: null, status: "피킹중", rejectReason: null }
];

const outboundLines: Record<number, AnyRecord[]> = {
  46: [{ id: 1, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", unit: "EA", consign: false, orderQty: 5, pickedQty: 0, availableQty: 60, lotNo: "LOT260515-0008", locationCode: "PY-A-01", scanned: false }],
  62: [{ id: 2, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", unit: "EA", consign: false, orderQty: 32, pickedQty: 32, availableQty: 215, lotNo: "LOT260407-0006", locationCode: "PC-A-01", scanned: true }],
  70: [
    { id: 3, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", unit: "EA", consign: false, orderQty: 84, pickedQty: 36, availableQty: 75, lotNo: "LOT260520-0014", locationCode: "PC-A-02", scanned: true },
    { id: 4, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", unit: "EA", consign: false, orderQty: 10, pickedQty: 0, availableQty: 215, lotNo: "LOT260407-0006", locationCode: "PC-A-01", scanned: false }
  ]
};

let carriers: AnyRecord[] = [
  { id: 1, code: "CJ", name: "CJ대한통운", region: "전국", manager: "김배송", phone: "1588-1255", accountUser: "carrier_cj", portalRole: "배차공유", active: true },
  { id: 2, code: "LOTTE", name: "롯데택배", region: "수도권", manager: "이수도", phone: "1588-2121", accountUser: "carrier_lotte", portalRole: "조회", active: true },
  { id: 3, code: "HANJIN", name: "한진택배", region: "지방권", manager: "박지방", phone: "1588-0011", accountUser: "carrier_hanjin", portalRole: "조회", active: true },
  { id: 4, code: "INHOUSE", name: "사내차량", region: "전국", manager: "물류팀", phone: "055-000-0000", accountUser: null, portalRole: "조회", active: true }
];

let dispatched: AnyRecord[] = [
  { id: 1, dispatchNo: "DP-260617-001", outboundNo: "DN20260601019", customerName: "주식회사 부방유통", shipAddress: "경기 부천시 길주로 210", region: "수도권", carrierName: "CJ대한통운", vehicleType: "1톤", totalWeightKg: 420, totalVolumeM3: 2.8, palletCount: 2, dispatchDate: today }
];

let notices = [
  { id: 1, category: "공지", title: "프론트 화면 검수용 mock 데이터 적용", content: "현재 화면은 백엔드와 DB 없이 동작하는 시연 모드입니다.", author: "관리자", pinned: true, createdAt: "2026-06-17T10:30:00" },
  { id: 2, category: "업무협조", title: "입고 확정 화면 버튼 흐름 확인 요청", content: "입고등록, 로케이션 지정, 확정 흐름을 검수해 주세요.", author: "입고담당", pinned: false, createdAt: "2026-06-16T15:20:00" }
];

let returns = [
  { id: 1, returnNo: "RT-260617-001", omsOrderNo: "OMS-RT-26061701", customerCode: "219475", customerName: "대림 스마트몰", itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", unit: "EA", qty: 3, reason: "초기불량", manager: "이지은", warehouseName: "용인물류센터", locationCode: "PY-A-01", status: "received", rejectReason: null, receivedAt: today + " 09:20", processedAt: null },
  { id: 2, returnNo: "RT-260616-002", omsOrderNo: "OMS-RT-26061602", customerCode: "127419", customerName: "(주)코스트코리아", itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", unit: "EA", qty: 2, reason: "단순변심", manager: "박서준", warehouseName: "창원공장", locationCode: "QC-WAIT", status: "rejected", rejectReason: "반품 기한 초과", receivedAt: "2026-06-16 14:10", processedAt: "2026-06-17 10:00" },
  { id: 3, returnNo: "RT-260615-003", omsOrderNo: "OMS-RT-26061503", customerCode: "771205", customerName: "이마트 트레이더스", itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", unit: "EA", qty: 10, reason: "오배송", manager: "박서준", warehouseName: "창원공장", locationCode: "QC-WAIT", status: "approved", rejectReason: null, receivedAt: "2026-06-15 11:05", processedAt: "2026-06-16 09:30" }
];

let stocktakings: AnyRecord[] = [
  { id: 1, countDate: today, warehouseName: "창원공장", locationCode: "PC-A-01", itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", lotNo: "LOT260407-0006", systemQty: 260, countedQty: 258, diff: -2, status: "COUNTED", memo: null, createdBy: "admin", adjustedAt: null },
  { id: 2, countDate: today, warehouseName: "용인물류센터", locationCode: "PY-A-01", itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", lotNo: "LOT260515-0008", systemQty: 95, countedQty: 95, diff: 0, status: "COUNTED", memo: null, createdBy: "admin", adjustedAt: null }
];

let policies = [
  { policyKey: "reserve_reflect", label: "예약재고 반영", enabled: true, description: "예약(할당) 수량을 가용재고에서 차감합니다." },
  { policyKey: "exclude_defect", label: "불량재고 제외", enabled: true, description: "불량 재고를 가용재고에서 제외합니다." },
  { policyKey: "exclude_moving", label: "이동중 재고 제외", enabled: false, description: "이동중(창고간 이동) 재고를 가용재고에서 제외합니다." },
  { policyKey: "exclude_putaway", label: "격납대기 재고 제외", enabled: true, description: "격납대기(입고 후 미격납) 재고를 가용재고에서 제외합니다." }
];

const policyBuckets = { onHand: 2574, allocated: 107, defect: 12, moving: 50, putawayWait: 295 };

const summary = {
  logistics: { todayInbound: 4, todayOutbound: 5, totalStock: 2574, working: 9 },
  inbound: { scheduled: 1, confirmed: 2, putawayWait: 1, returnReceived: 2 },
  outbound: { waiting: 1, picking: 1, picked: 1, completed: 1, rejected: 1 },
  stock: { total: 2574, available: 2178, defect: 12, longTerm: 480 },
  alerts: { replenish: 2, shortage: 2, interfaceError: 2, returnRejected: 1 }
};

const progress = {
  inbound: { 입고예정: 1, 입고등록: 1, 로케이션지정: 1, 입고확정: 2, total: 5, progressPct: 40 },
  outbound: { 출고대기: 1, 피킹중: 1, 피킹완료: 1, 출고완료: 1, 거부: 1, total: 5, progressPct: 20 }
};

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
    .map((l) => ({ id: l.id, code: l.code, status: l.status, locationType: l.locationType, zoneName: l.zoneName }));
}

function dispatchTargets(region: string) {
  return outbounds
    .filter((o) => (o.status === "피킹완료" || o.status === "출고완료") && !dispatched.some((d) => d.outboundNo === o.outboundNo))
    .map((o, idx) => ({
      outboundId: o.id,
      outboundNo: o.outboundNo,
      customerName: o.customerName,
      shipAddress: o.shipAddress,
      region,
      status: o.status,
      scheduledDate: o.scheduledDate,
      totalWeightKg: 180 + idx * 75,
      totalVolumeM3: 1.8 + idx * 0.7,
      palletCount: 1 + idx,
      recommendedVehicle: idx > 1 ? "2.5톤" : "1톤"
    }));
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
  stocks.filter((s) => s.stockStatus === "AVAILABLE" && s.locationType === "PICKING").forEach((s) => {
    const item = items.find((it) => it.itemCode === s.itemCode);
    const upp = item?.unitsPerPallet ?? 0;
    if (!upp) return;
    const loose = s.onHand % upp;
    if (loose === 0) return; // 파레트 정합 — 보충 불필요
    const shortQty = upp - loose;
    const source = stocks
      .filter((x) => x.itemCode === s.itemCode && x.stockStatus === "AVAILABLE" && x.locationType === "RESERVE" && x.available > 0)
      .sort((a, b) => (a.receivedDate ?? "").localeCompare(b.receivedDate ?? ""))[0];
    const targetLoc = locations.find((l) => l.code === s.locationCode);
    rows.push({
      itemCode: s.itemCode, itemName: s.itemName, unit: s.unit, warehouseName: s.warehouseName,
      unitsPerPallet: upp, pickingLocationCode: s.locationCode, pickingQty: s.onHand,
      wholePallets: Math.floor(s.onHand / upp), looseQty: loose, shortQty, suggestQty: shortQty,
      sourceStockId: source?.stockId ?? null, sourceLocationCode: source?.locationCode ?? null,
      sourceLot: source?.lotNo ?? null, sourceReceivedDate: source?.receivedDate ?? null, sourceAvail: source?.available ?? 0,
      targetLocationId: targetLoc?.id ?? null, targetLocationCode: s.locationCode
    });
  });
  return rows.sort((a, b) => b.shortQty - a.shortQty);
}

// B-2: ERP/WMS 시점 재고 비교 — 일별(과거 날짜 지정), 상품·로케이션·수량별 차이. 시드 불일치 3건.
const erpDiffSeed: Record<string, number> = { "SKU-10241|PC-A-01": 2, "SKU-10822|PY-A-01": -3, "SKU-30001|PC-A-02": 5 };
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

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await delay();
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(path, "http://mock.local");
  const clean = stripQuery(url.pathname);

  if (method !== "GET") {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (clean === "/chatbot/ask") return copy(chatbotAnswer(body.question ?? "")) as T;
    handleMutation(clean, body);
    return copy({ ok: true }) as T;
  }

  if (clean === "/dashboard/summary") return copy(summary) as T;
  if (clean === "/dashboard/progress") return copy(progress) as T;
  if (clean === "/inbounds") return copy(inbounds) as T;
  if (clean.match(/^\/inbounds\/\d+\/lines$/)) return copy(inboundLines[Number(clean.split("/")[2])] ?? []) as T;
  if (clean === "/outbounds") return copy(outbounds) as T;
  if (clean.match(/^\/outbounds\/\d+\/lines$/)) return copy(outboundLines[Number(clean.split("/")[2])] ?? []) as T;
  if (clean === "/stocks") return copy(stocks) as T;
  if (clean === "/stocks/putaway") return copy(stocks.filter((s) => s.stockStatus === "PUTAWAY_WAIT").map(({ allocated, available, safetyStock, ...s }) => ({ ...s, qty: s.onHand }))) as T;
  if (clean === "/stocks/replenishment") return copy(computeReplenishment()) as T;
  if (clean === "/stocks/fifo") return copy(fifoRows()) as T;
  if (clean === "/erp-compare/dates") return copy([today, "2026-06-16", "2026-06-15"]) as T;
  if (clean === "/erp-compare") return copy(erpCompareRows(url.searchParams.get("date") ?? today)) as T;
  if (clean === "/stocks/trace") return copy(stockTrace(url.searchParams.get("q") ?? "")) as T;
  if (clean === "/warehouses") return copy(warehouses) as T;
  if (clean.match(/^\/warehouses\/\d+\/locations$/)) return copy(asWarehouseLocations(Number(clean.split("/")[2]))) as T;
  if (clean === "/locations") return copy(locations) as T;
  if (clean === "/zones") return copy(zones) as T;
  if (clean === "/items") return copy(items.map((it) => ({ id: it.id, code: it.itemCode, name: it.itemName, category: it.category, unit: it.unit, safetyStock: it.safetyStock, consign: it.consign, active: it.active }))) as T;
  if (clean === "/carriers") return copy(carriers) as T;
  if (clean === "/dispatch/targets") return copy(dispatchTargets(url.searchParams.get("region") ?? "수도권")) as T;
  if (clean === "/dispatch") return copy(dispatched.filter((d) => !url.searchParams.get("region") || d.region === url.searchParams.get("region"))) as T;
  if (clean === "/dispatch/deliveries") return copy(dispatched.map((d) => {
    const o = outbounds.find((x) => x.outboundNo === d.outboundNo);
    return { ...d, deliveryNo: d.dispatchNo, customerCode: o?.customerCode ?? null, invoiceNo: o?.invoiceNo ?? ("MOCK-" + d.id), qty: o?.qty ?? 0, scheduledDate: o?.scheduledDate ?? null };
  })) as T;
  if (clean === "/analytics/aging") return copy(stocks.map((s, idx) => {
    const agingDays = 25 + idx * 60;
    const unitPrice = 1500 + idx * 800;
    return { itemCode: s.itemCode, itemName: s.itemName, warehouseName: s.warehouseName, locationCode: s.locationCode, lotNo: s.lotNo, receivedDate: s.receivedDate, agingDays, qty: s.onHand, unitPrice, amount: s.onHand * unitPrice, longTerm: agingDays >= 365 };
  })) as T;
  if (clean === "/analytics/shortage") return copy([
    { itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", unit: "EA", safetyStock: 180, leadTime: 5, available: 60, out30: 540, avgDailyOut: 18, reorderPoint: 270, daysOfStock: 3.3, shortageEta: "2026-06-21", risk: "위험" },
    { itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", unit: "EA", safetyStock: 300, leadTime: 7, available: 75, out30: 900, avgDailyOut: 30, reorderPoint: 510, daysOfStock: 2.5, shortageEta: "2026-06-20", risk: "위험" },
    { itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", unit: "EA", safetyStock: 120, leadTime: 4, available: 695, out30: 360, avgDailyOut: 12, reorderPoint: 168, daysOfStock: 57.9, shortageEta: null, risk: "정상" }
  ]) as T;
  if (clean === "/analytics/inbound-summary" || clean === "/analytics/outbound-summary") return copy(analyticsRows) as T;
  if (clean === "/snapshots/months") return copy(["2026-06", "2026-05"]) as T;
  if (clean === "/snapshots") return copy(items.slice(0, 4).map((item, idx) => ({ snapshotMonth: url.searchParams.get("month") ?? "2026-06", itemCode: item.itemCode, itemName: item.itemName, warehouseName: warehouses[idx]?.name ?? "창원공장", wmsQty: 120 + idx * 85, erpQty: 118 + idx * 85, diff: idx % 2 === 0 ? 2 : 0, capturedAt: "2026-06-17 10:00" }))) as T;
  if (clean === "/stocktakings") return copy(stocktakings) as T;
  if (clean === "/stocktakings/dates") return copy([today, "2026-06-16"]) as T;
  if (clean === "/returns") return copy(returns) as T;
  if (clean === "/order-products") return copy(orderProducts()) as T;
  if (clean === "/manual-orders") return copy(manualOrders) as T;
  if (clean === "/notices") return copy(notices) as T;
  if (clean === "/interfaces") return copy([
    { id: "IF-260617-001", type: "출고결과", direction: "SEND", refNo: "DN20260601019", state: "success", retry: 0, message: "ERP 전송 완료", createdAt: "2026-06-17 09:30" },
    { id: "IF-260617-002", type: "재고차감", direction: "SEND", refNo: "DN20260601021", state: "fail", retry: 1, message: "중계서버 timeout", createdAt: "2026-06-17 09:45" },
    { id: "IF-260617-003", type: "외주이동", direction: "SEND", refNo: "TR-OEM-001", state: "excluded", retry: 0, message: "외주 재고는 ERP 미연동", createdAt: "2026-06-17 10:10" }
  ]) as T;
  if (clean.startsWith("/history/transfer")) return copy([
    { id: 1, transferNo: "TR260616131934-6", itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", fromWarehouse: "창원공장", toWarehouse: "창원공장", fromLocation: "PC-A-01", toLocation: "PC-A-02", qty: 50, type: "일반→일반", lotNo: "LOT260407-0006", erpLinked: true, status: "done", reason: "창고 내 재배치", createdBy: "admin", createdAt: "2026-06-16 13:19" }
  ]) as T;
  if (clean.startsWith("/history/")) return copy([
    { id: 1, refType: "OUTBOUND", refNo: "DN20260601019", action: "출고확정", detail: "출고확정 및 ERP 전송", erpSent: true, operator: "outbound", createdAt: "2026-06-17 09:30" },
    { id: 2, refType: "INBOUND", refNo: "IN-20260606-003", action: "입고확정", detail: "검수 후 격납대기 생성", erpSent: false, operator: "inbound", createdAt: "2026-06-16 14:05" },
    { id: 3, refType: "INBOUND", refNo: "IN-MV-20260616-001", action: "공장간이동 입고확정", detail: "창원→제천 이동입고 · 격납대기 생성 (일반입고와 구분, ERP 미전송)", erpSent: false, operator: "logistics", createdAt: "2026-06-16 15:20" }
  ]) as T;
  if (clean === "/transfers") return copy([]) as T;
  if (clean === "/policies") return copy({ policies, buckets: policyBuckets }) as T;
  // /chatbot/ask 는 POST 이므로 위 mutation 분기(chatbotAnswer)에서 처리합니다.

  return copy([]) as T;
}

function handleMutation(clean: string, body: AnyRecord) {
  if (clean.match(/^\/inbounds\/\d+\/register$/)) {
    const row = inbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) row.status = "registered";
  } else if (clean.match(/^\/inbounds\/\d+\/assign$/)) {
    const row = inbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) row.status = "located";
  } else if (clean.match(/^\/inbounds\/\d+\/confirm$/)) {
    const id = Number(clean.split("/")[2]);
    const row = inbounds.find((r) => r.id === id);
    if (row) {
      row.status = "confirmed";
      // 입고확정 → 검수 수량만큼 격납대기(PUTAWAY_WAIT) 재고 생성 (LOT = LOT-{입고번호})
      // 일반/외주/이동입고(공장간이동) 모두 동일하게 격납대기로 이동
      const recvLines: AnyRecord[] = Array.isArray(body.lines) ? body.lines : [];
      (inboundLines[id] ?? []).forEach((ln) => {
        const recv = recvLines.find((x) => x.lineId === ln.id);
        const qty = recv ? Number(recv.receivedQty) : ln.expectedQty;
        if (!qty || qty <= 0) return;
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
          lotNo: `LOT-${row.inboundNo}`,
          stockStatus: "PUTAWAY_WAIT",
          receivedDate: today,
          onHand: qty,
          allocated: 0,
          available: 0,
          safetyStock: items.find((it) => it.itemCode === ln.itemCode)?.safetyStock ?? 0,
          unit: ln.unit
        });
      });
    }
  } else if (clean.match(/^\/outbounds\/\d+\/pick-start$/)) {
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) row.status = "피킹중";
  } else if (clean.match(/^\/outbounds\/\d+\/pick-complete$/)) {
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) row.status = "피킹완료";
  } else if (clean.match(/^\/outbounds\/\d+\/confirm$/)) {
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) row.status = "출고완료";
  } else if (clean.match(/^\/outbounds\/\d+\/reject$/)) {
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) {
      row.status = "거부";
      row.rejectReason = body.reason ?? "재고부족";
    }
  } else if (clean.match(/^\/outbounds\/\d+\/invoice$/)) {
    const row = outbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) row.invoiceNo = body.invoiceNo ?? null;
  } else if (clean === "/dispatch/assign") {
    const row = outbounds.find((r) => r.id === body.outboundId);
    const carrier = carriers.find((c) => c.id === body.carrierId);
    if (row) dispatched.unshift({ id: Date.now(), dispatchNo: `DP-${Date.now()}`, outboundNo: row.outboundNo, customerName: row.customerName, shipAddress: row.shipAddress, region: "수도권", carrierName: carrier?.name ?? null, vehicleType: body.vehicleType ?? null, totalWeightKg: 260, totalVolumeM3: 2.1, palletCount: 2, dispatchDate: today });
  } else if (clean === "/notices") {
    notices.unshift({ id: Date.now(), category: body.category, title: body.title, content: body.content, author: "관리자", pinned: Boolean(body.pinned), createdAt: new Date().toISOString() });
  } else if (clean === "/carriers") {
    carriers.unshift({ id: Date.now(), active: true, ...body });
  } else if (clean === "/locations") {
    const z = zones.find((zone) => zone.id === body.zoneId);
    locations.unshift({ id: Date.now(), code: body.code, locationType: body.locationType, status: "가용", maxQty: body.maxQty ?? null, active: true, zoneId: body.zoneId, zoneName: z?.name ?? "-", warehouseName: z?.warehouseName ?? "-", stockCount: 0 });
  } else if (clean.match(/^\/stocktakings\/\d+\/adjust$/)) {
    const row = stocktakings.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) {
      row.status = "ADJUSTED";
      row.adjustedAt = "2026-06-17 11:00";
    }
  } else if (clean.match(/^\/stocks\/putaway\/\d+\/complete$/)) {
    // 격납 확정 — 단일 또는 다중(분할) 로케이션 배정 지원
    const stockId = Number(clean.split("/")[3]);
    const src = stocks.find((s) => s.stockId === stockId);
    if (src) {
      const rawAssigns: AnyRecord[] = Array.isArray(body.assignments) && body.assignments.length
        ? body.assignments
        : [{ toLocationId: body.toLocationId, qty: src.onHand }];
      let moved = 0;
      rawAssigns.forEach((a) => {
        const loc = locations.find((l) => l.id === Number(a.toLocationId));
        const qty = Number(a.qty) || 0;
        if (!loc || qty <= 0) return;
        const wh = warehouses.find((w) => w.name === loc.warehouseName);
        moved += qty;
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
    }
  } else if (clean === "/stocks/replenishment/complete") {
    // 보충 이동 — 출발(RESERVE) 재고 차감 → 도착(피킹) 로케이션 재고 가산 (파레트 정합 복원)
    const src = stocks.find((s) => s.stockId === body.sourceStockId);
    const targetLoc = locations.find((l) => l.id === body.toLocationId);
    const qty = Number(body.qty) || 0;
    if (src && targetLoc && qty > 0) {
      src.onHand -= qty; src.available = Math.max(0, src.available - qty);
      const tgt = stocks.find((s) => s.itemCode === src.itemCode && s.locationCode === targetLoc.code && s.stockStatus === "AVAILABLE");
      if (tgt) { tgt.onHand += qty; tgt.available += qty; }
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

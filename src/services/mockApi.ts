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
  { id: 201, code: "PJ-A-01", locationType: "PICKING", status: "가용", maxQty: 500, active: true, zoneId: 21, zoneName: "제천 A존", warehouseName: "제천공장", stockCount: 1 },
  { id: 202, code: "PJ-B-01", locationType: "RESERVE", status: "가용", maxQty: 900, active: true, zoneId: 21, zoneName: "제천 A존", warehouseName: "제천공장", stockCount: 1 },
  { id: 301, code: "PA-A-01", locationType: "PICKING", status: "가용", maxQty: 450, active: true, zoneId: 31, zoneName: "안산 A존", warehouseName: "안산공장", stockCount: 1 },
  { id: 401, code: "PY-A-01", locationType: "PICKING", status: "가용", maxQty: 650, active: true, zoneId: 41, zoneName: "용인 A존", warehouseName: "용인물류센터", stockCount: 1 },
  { id: 501, code: "OT-X-01", locationType: "PICKING", status: "가용", maxQty: 400, active: true, zoneId: 51, zoneName: "외주 X존", warehouseName: "외주공장", stockCount: 1 },
  { id: 900, code: "QC-WAIT", locationType: "RESERVE", status: "가용", maxQty: 1000, active: true, zoneId: 11, zoneName: "창원 A존", warehouseName: "창원공장", stockCount: 2 }
];

const items = [
  { id: 1, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", spec: "BT5.3", unit: "EA", safetyStock: 120, active: true },
  { id: 2, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", spec: "1.2m", unit: "EA", safetyStock: 180, active: true },
  { id: 3, itemCode: "SKU-12044", itemName: "20000mAh 보조배터리", spec: "20Ah", unit: "EA", safetyStock: 80, active: true },
  { id: 4, itemCode: "SKU-20114", itemName: "[외주] 시즌 한정 머그컵 세트", spec: "2P", unit: "SET", safetyStock: 40, active: true },
  { id: 5, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", spec: "M8", unit: "EA", safetyStock: 300, active: true }
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

let inbounds = [
  { id: 112, inboundNo: "IN-20260620-001", poNo: "PO-9018", supplierCode: "SUP001", supplierName: "한성테크놀로지", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", type: "일반", inTypeCode: "DGR", inTypeName: "국내입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: "운송장 별도 확인", status: "scheduled", expectedAt: "2026-06-20", qty: 660 },
  { id: 113, inboundNo: "IN-20260613-001", poNo: "PO-9014", supplierCode: "SUP001", supplierName: "한성테크놀로지", warehouseId: 1, warehouseName: "창원공장", warehouseType: "일반", type: "일반", inTypeCode: "DGR", inTypeName: "국내입고", purchaseGroupCode: "PG41", purchaseGroupName: "이지은", remark: "긴급 입고", status: "registered", expectedAt: "2026-06-13", qty: 330 },
  { id: 111, inboundNo: "IN-20260607-001", poNo: "OPO-002", supplierCode: "OEM002", supplierName: "인천외주가공", warehouseId: 5, warehouseName: "외주공장", warehouseType: "외주", type: "외주", inTypeCode: "OEM", inTypeName: "외주입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: null, status: "located", expectedAt: "2026-06-07", qty: 120 },
  { id: 116, inboundNo: "IN-20260606-003", poNo: "PO-9003", supplierCode: "SUP001", supplierName: "한성테크놀로지", warehouseId: 2, warehouseName: "제천공장", warehouseType: "일반", type: "일반", inTypeCode: "DGR", inTypeName: "국내입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: "분할 납품 1차", status: "confirmed", expectedAt: "2026-06-05", qty: 420 },
  { id: 125, inboundNo: "IN-20260530-001", poNo: "PO-9006", supplierCode: "SUP003", supplierName: "대성정밀공업", warehouseId: 3, warehouseName: "안산공장", warehouseType: "일반", type: "일반", inTypeCode: "IMP", inTypeName: "수입입고", purchaseGroupCode: "PG33", purchaseGroupName: "박서준", remark: "통관 완료분", status: "confirmed", expectedAt: "2026-05-30", qty: 600 }
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
  46: [{ id: 1, itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", unit: "EA", orderQty: 5, pickedQty: 0, stockQty: 60, lotNo: "LOT260515-0008", locationCode: "PY-A-01", scanned: false }],
  62: [{ id: 2, itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", unit: "EA", orderQty: 32, pickedQty: 32, stockQty: 215, lotNo: "LOT260407-0006", locationCode: "PC-A-01", scanned: true }],
  70: [{ id: 3, itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", unit: "EA", orderQty: 84, pickedQty: 36, stockQty: 75, lotNo: "LOT260520-0014", locationCode: "PC-A-02", scanned: true }]
};

let carriers: AnyRecord[] = [
  { id: 1, name: "CJ대한통운", region: "전국", active: true },
  { id: 2, name: "롯데택배", region: "수도권", active: true },
  { id: 3, name: "한진택배", region: "지방권", active: true },
  { id: 4, name: "사내차량", region: "전국", active: true }
];

let dispatched: AnyRecord[] = [
  { id: 1, dispatchNo: "DP-260617-001", outboundNo: "DN20260601019", customerName: "주식회사 부방유통", shipAddress: "경기 부천시 길주로 210", region: "수도권", carrierName: "CJ대한통운", vehicleType: "1톤", totalWeightKg: 420, totalVolumeM3: 2.8, palletCount: 2, dispatchDate: today }
];

let notices = [
  { id: 1, category: "공지", title: "프론트 화면 검수용 mock 데이터 적용", content: "현재 화면은 백엔드와 DB 없이 동작하는 시연 모드입니다.", author: "관리자", pinned: true, createdAt: "2026-06-17T10:30:00" },
  { id: 2, category: "업무협조", title: "입고 확정 화면 버튼 흐름 확인 요청", content: "입고등록, 로케이션 지정, 확정 흐름을 검수해 주세요.", author: "입고담당", pinned: false, createdAt: "2026-06-16T15:20:00" }
];

let stocktakings: AnyRecord[] = [
  { id: 1, countDate: today, warehouseName: "창원공장", locationCode: "PC-A-01", itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", lotNo: "LOT260407-0006", systemQty: 260, countedQty: 258, diff: -2, status: "COUNTED", memo: null, createdBy: "admin", adjustedAt: null },
  { id: 2, countDate: today, warehouseName: "용인물류센터", locationCode: "PY-A-01", itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", lotNo: "LOT260515-0008", systemQty: 95, countedQty: 95, diff: 0, status: "COUNTED", memo: null, createdBy: "admin", adjustedAt: null }
];

let policies = [
  { policyKey: "AUTO_REPLENISH", name: "피킹존 자동 보충 감지", enabled: true, description: "가용재고가 안전재고 아래로 내려가면 보충 대상으로 표시합니다." },
  { policyKey: "ERP_SEND_AFTER_SHIP", name: "출고확정 후 ERP 전송", enabled: true, description: "출고완료 시 중계서버로 출고 결과를 전송합니다." }
];

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

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await delay();
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(path, "http://mock.local");
  const clean = stripQuery(url.pathname);

  if (method !== "GET") {
    handleMutation(clean, init?.body ? JSON.parse(String(init.body)) : {});
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
  if (clean === "/stocks/replenishment") return copy([
    { itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", unit: "EA", safetyStock: 180, pickingAvail: 60, shortQty: 120, suggestQty: 160, sourceStockId: 2, sourceLocationCode: "PC-B-01", sourceLot: "LOT260418-0005", sourceReceivedDate: "2026-04-18", targetLocationId: 401, targetLocationCode: "PY-A-01" },
    { itemCode: "SKU-30001", itemName: "스테인리스 볼트 M8", unit: "EA", safetyStock: 300, pickingAvail: 75, shortQty: 225, suggestQty: 300, sourceStockId: 6, sourceLocationCode: "PC-B-01", sourceLot: "LOT260405-0013", sourceReceivedDate: "2026-04-05", targetLocationId: 102, targetLocationCode: "PC-A-02" }
  ]) as T;
  if (clean === "/stocks/trace") return copy(stockTrace(url.searchParams.get("q") ?? "")) as T;
  if (clean === "/warehouses") return copy(warehouses) as T;
  if (clean.match(/^\/warehouses\/\d+\/locations$/)) return copy(asWarehouseLocations(Number(clean.split("/")[2]))) as T;
  if (clean === "/locations") return copy(locations) as T;
  if (clean === "/zones") return copy(zones) as T;
  if (clean === "/items") return copy(items) as T;
  if (clean === "/carriers") return copy(carriers) as T;
  if (clean === "/dispatch/targets") return copy(dispatchTargets(url.searchParams.get("region") ?? "수도권")) as T;
  if (clean === "/dispatch") return copy(dispatched.filter((d) => !url.searchParams.get("region") || d.region === url.searchParams.get("region"))) as T;
  if (clean === "/dispatch/deliveries") return copy(dispatched.map((d) => ({ ...d, deliveryNo: d.dispatchNo, invoiceNo: "MOCK-" + d.id }))) as T;
  if (clean === "/analytics/aging") return copy(stocks.map((s, idx) => ({ ...s, agingDays: 25 + idx * 18, ageBucket: idx > 3 ? "90일+" : "30일" }))) as T;
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
  if (clean === "/returns") return copy([
    { id: 1, returnNo: "RT-260617-001", customerName: "대림 스마트몰", itemCode: "SKU-10822", itemName: "USB-C 고속충전 케이블 1.2m", qty: 3, reason: "초기불량", status: "received", requestedAt: today, processedAt: null },
    { id: 2, returnNo: "RT-260616-002", customerName: "(주)코스트코리아", itemCode: "SKU-10241", itemName: "무선 블루투스 이어버드 (블랙)", qty: 2, reason: "단순변심", status: "rejected", requestedAt: "2026-06-16", processedAt: "2026-06-17" }
  ]) as T;
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
    { id: 2, refType: "INBOUND", refNo: "IN-20260606-003", action: "입고확정", detail: "검수 후 격납대기 생성", erpSent: false, operator: "inbound", createdAt: "2026-06-16 14:05" }
  ]) as T;
  if (clean === "/transfers") return copy([]) as T;
  if (clean === "/policies") return copy({ policies, buckets: { enabled: policies.filter((p) => p.enabled).length, disabled: policies.filter((p) => !p.enabled).length } }) as T;
  if (clean === "/chatbot/ask") return copy({ answer: "mock 모드입니다. 현재 총 재고는 2,574 EA이고 보충 대상은 2건입니다.", cards: [{ label: "총 재고", value: "2,574 EA" }, { label: "보충 대상", value: "2건" }] }) as T;

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
    const row = inbounds.find((r) => r.id === Number(clean.split("/")[2]));
    if (row) row.status = "confirmed";
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
  } else if (clean.match(/^\/policies\//)) {
    const key = decodeURIComponent(clean.split("/")[2]);
    const policy = policies.find((p) => p.policyKey === key);
    if (policy) policy.enabled = body.enabled ?? policy.enabled;
  }
}

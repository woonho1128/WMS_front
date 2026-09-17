/* ============================================================
   대시보드 현황 화면 데이터 계약
   GET /dashboard/inbound · /dashboard/outbound · /dashboard/stock · /dashboard/alerts
   숫자는 서버가 계산해 내려준다 (목: services/mockDashboard.ts)
   ============================================================ */

export type Tone = "info" | "success" | "warning" | "danger" | "violet" | "teal" | "gray";

export type KpiTrend = { kind: "line" | "bars"; values: number[] };

export type Kpi = {
  key: string;
  label: string;
  value: number;
  unit?: string;
  /** 소수 자리 (비율 등) */
  digits?: number;
  sub?: string;
  tone: Tone;
  badge?: { text: string; tone: Tone } | null;
  /** 전일 대비 — good: 이 방향 변화가 좋은가 (null = 좋고 나쁨 없음) */
  delta?: { value: number; unit: string; basis: string; good: boolean | null; digits?: number } | null;
  /** 최근 7일 (마지막이 오늘) */
  trend?: KpiTrend | null;
  to?: string | null;
  /** 지표 정의 — 카드에 마우스를 올리면 보인다 */
  hint?: string;
};

export type FlowStage = { key: string; label: string; hint: string; tone: Tone; count: number; qty: number };

export type Hourly = {
  series: Array<{ key: string; label: string; tone: Tone }>;
  points: Array<{ hour: number; values: number[] }>;
  total: number;
  unit: string;
};

export type BreakdownRow = { key: string; label: string; count: number; qty: number; tone: Tone };

export type AlertSeverity = "danger" | "warning" | "info";
export type AlertCategory = "재고" | "입고" | "출고" | "반품" | "연동";

export type AlertItem = {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  /** 메시지 안에서 강조할 코드 (입고번호 · 로케이션 · LOT …) */
  refs: string[];
  /** 일이 생긴 시각 (MM-DD HH:mm) — 상태에서 계산한 알림은 null */
  at: string | null;
  action: { label: string; to: string } | null;
};

export type InboundRow = {
  id: number;
  inboundNo: string;
  kind: string;
  supplierName: string;
  warehouseName: string;
  expectedAt: string;
  overdue: boolean;
  qty: number;
  receivedQty: number;
  stage: string;
  stageLabel: string;
  progress: number;
  tone: Tone;
  to: string;
};

export type InboundDashboard = {
  generatedAt: string;
  today: string;
  kpis: Kpi[];
  stages: FlowStage[];
  rows: InboundRow[];
  hourly: Hourly;
  breakdown: BreakdownRow[];
  alerts: AlertItem[];
};

export type OutboundRow = {
  id: number;
  outboundNo: string;
  customerName: string;
  outType: string;
  region: string;
  scheduledDate: string;
  overdue: boolean;
  qty: number;
  pickedQty: number;
  progress: number;
  carrier: string | null;
  invoiceNo: string | null;
  dispatched: boolean;
  stage: string;
  stageLabel: string;
  tone: Tone;
  rejectReason: string | null;
  to: string;
};

export type OutboundDashboard = {
  generatedAt: string;
  today: string;
  kpis: Kpi[];
  stages: FlowStage[];
  rejected: { count: number; qty: number };
  rows: OutboundRow[];
  hourly: Hourly;
  breakdown: BreakdownRow[];
  alerts: AlertItem[];
};

export type StockDashboard = {
  generatedAt: string;
  today: string;
  kpis: Kpi[];
  composition: Array<{ key: string; label: string; qty: number; tone: Tone }>;
  warehouses: Array<{ name: string; type: string; total: number; available: number; allocated: number; putaway: number; defect: number; skus: number }>;
  aging: Array<{ key: string; label: string; qty: number; lots: number; tone: Tone }>;
  risks: Array<{
    itemCode: string;
    itemName: string;
    unit: string;
    available: number;
    safetyStock: number;
    daysOfStock: number;
    shortageEta: string | null;
    risk: string;
  }>;
  alerts: AlertItem[];
};

export type AlertsDashboard = { generatedAt: string; today: string; alerts: AlertItem[] };

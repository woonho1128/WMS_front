import { Suspense, lazy } from "react";
import { Button } from "../../components/ui/Button";
import { getFeatureScreenConfig } from "../menu/featureScreenConfig";

type Props = {
  sectionSlug: string;
  featureSlug: string;
  title: string;
};

const LogisticsStatusPage = lazy(() => import("../dashboard/DashboardStatus").then((m) => ({ default: m.LogisticsStatusPage })));
const InboundStatusPage = lazy(() => import("../dashboard/DashboardStatus").then((m) => ({ default: m.InboundStatusPage })));
const OutboundStatusPage = lazy(() => import("../dashboard/DashboardStatus").then((m) => ({ default: m.OutboundStatusPage })));
const StockStatusPage = lazy(() => import("../dashboard/DashboardStatus").then((m) => ({ default: m.StockStatusPage })));
const WorkAlertsPage = lazy(() => import("../dashboard/DashboardStatus").then((m) => ({ default: m.WorkAlertsPage })));
const DashboardInbound = lazy(() => import("../dashboard/DashboardInbound").then((m) => ({ default: m.DashboardInbound })));
const DashboardOutbound = lazy(() => import("../dashboard/DashboardOutbound").then((m) => ({ default: m.DashboardOutbound })));
const DashboardTransfer = lazy(() => import("../dashboard/DashboardTransfer").then((m) => ({ default: m.DashboardTransfer })));
const InboundConfirmPage = lazy(() => import("../inbound/InboundConfirmPage").then((m) => ({ default: m.InboundConfirmPage })));
const ReturnSchedulePage = lazy(() => import("../inbound/ReturnSchedulePage").then((m) => ({ default: m.ReturnSchedulePage })));
const ReturnConfirmPage = lazy(() => import("../inbound/ReturnConfirmPage").then((m) => ({ default: m.ReturnConfirmPage })));
const PickingPage = lazy(() => import("../outbound/PickingPage").then((m) => ({ default: m.PickingPage })));
const OutboundConfirmPage = lazy(() => import("../outbound/OutboundConfirmPage").then((m) => ({ default: m.OutboundConfirmPage })));
const DeliveryNotePage = lazy(() => import("../outbound/DeliveryNotePage").then((m) => ({ default: m.DeliveryNotePage })));
const CarrierMasterPage = lazy(() => import("../master/CarrierMasterPage").then((m) => ({ default: m.CarrierMasterPage })));
const DispatchMetroPage = lazy(() => import("../dispatch/DispatchMetroPage").then((m) => ({ default: m.DispatchMetroPage })));
const DispatchRegionalPage = lazy(() => import("../dispatch/DispatchRegionalPage").then((m) => ({ default: m.DispatchRegionalPage })));
const StockPolicyPage = lazy(() => import("../master/StockPolicyPage").then((m) => ({ default: m.StockPolicyPage })));
const ProgressPage = lazy(() => import("../analytics/ProgressPage").then((m) => ({ default: m.ProgressPage })));
const NoticePage = lazy(() => import("../communication/NoticePage").then((m) => ({ default: m.NoticePage })));
const ChatbotPage = lazy(() => import("../communication/ChatbotPage").then((m) => ({ default: m.ChatbotPage })));
const PutawayPage = lazy(() => import("../stock/PutawayPage").then((m) => ({ default: m.PutawayPage })));
const ReplenishmentPage = lazy(() => import("../stock/ReplenishmentPage").then((m) => ({ default: m.ReplenishmentPage })));
const AvailableStockPage = lazy(() => import("../stock/AvailableStockPage").then((m) => ({ default: m.AvailableStockPage })));
const BarcodeLookupPage = lazy(() => import("../stock/BarcodeLookupPage").then((m) => ({ default: m.BarcodeLookupPage })));
const StocktakingPage = lazy(() => import("../stock/StocktakingPage").then((m) => ({ default: m.StocktakingPage })));
const MonthlyStockPage = lazy(() => import("../stock/MonthlyStockPage").then((m) => ({ default: m.MonthlyStockPage })));
const InventoryLocationPage = lazy(() => import("../inventory/InventoryLocationPage").then((m) => ({ default: m.InventoryLocationPage })));
const InventoryItemPage = lazy(() => import("../inventory/InventoryItemPage").then((m) => ({ default: m.InventoryItemPage })));
const StockPage = lazy(() => import("../logistics/StockPage").then((m) => ({ default: m.StockPage })));
const InterfaceMonitorPage = lazy(() => import("../integration/InterfaceMonitorPage").then((m) => ({ default: m.InterfaceMonitorPage })));
const InboundHistoryPage = lazy(() => import("../history/InboundHistoryPage").then((m) => ({ default: m.InboundHistoryPage })));
const OutboundHistoryPage = lazy(() => import("../history/OutboundHistoryPage").then((m) => ({ default: m.OutboundHistoryPage })));
const TransferHistoryPage = lazy(() => import("../history/TransferHistoryPage").then((m) => ({ default: m.TransferHistoryPage })));
const InboundSummaryPage = lazy(() => import("../analytics/InboundSummaryPage").then((m) => ({ default: m.InboundSummaryPage })));
const OutboundSummaryPage = lazy(() => import("../analytics/OutboundSummaryPage").then((m) => ({ default: m.OutboundSummaryPage })));
const AgingStockPage = lazy(() => import("../analytics/AgingStockPage").then((m) => ({ default: m.AgingStockPage })));
const ShortagePage = lazy(() => import("../analytics/ShortagePage").then((m) => ({ default: m.ShortagePage })));

const LoadingFallback = () => <section className="app-surface" style={{ padding: 16 }}>화면을 불러오는 중...</section>;

export const WorkbenchPage = ({ sectionSlug, featureSlug, title }: Props) => {
  const fallbackConfig = getFeatureScreenConfig(featureSlug);
  // 화면설계(9모듈) 슬러그 ↔ 구현 화면 매핑. 없는 슬러그는 featureScreenConfig 기반 "준비중" 패널.
  const featureScreens: Record<string, JSX.Element> = {
    "logistics-status": <LogisticsStatusPage />,
    "inbound-status": <InboundStatusPage />,
    "outbound-status": <OutboundStatusPage />,
    "stock-status": <StockStatusPage />,
    "work-alerts": <WorkAlertsPage />,
    "inbound-schedule": <DashboardInbound />,
    "inbound-confirm": <InboundConfirmPage />,
    "return-schedule": <ReturnSchedulePage />,
    "return-confirm": <ReturnConfirmPage />,
    putaway: <PutawayPage />,
    replenishment: <ReplenishmentPage />,
    "outbound-order": <DashboardOutbound />,
    picking: <PickingPage />,
    "outbound-confirm": <OutboundConfirmPage />,
    "delivery-note": <DeliveryNotePage />,
    "dispatch-metro": <DispatchMetroPage />,
    "dispatch-regional": <DispatchRegionalPage />,
    "carrier-master": <CarrierMasterPage />,
    transfer: <DashboardTransfer />,
    "stock-realtime": <StockPage />,
    "stock-available": <AvailableStockPage />,
    "barcode-lookup": <BarcodeLookupPage />,
    stocktaking: <StocktakingPage />,
    "stock-monthly": <MonthlyStockPage />,
    progress: <ProgressPage />,
    "stock-policy": <StockPolicyPage />,
    "item-master": <InventoryItemPage />,
    "location-master": <InventoryLocationPage />,
    "system-logs": <InterfaceMonitorPage />,
    // 8. 이력관리
    // 9. 커뮤니케이션
    notice: <NoticePage />,
    "ai-chatbot": <ChatbotPage />,
    // 8. 이력관리
    "inbound-history": <InboundHistoryPage />,
    "outbound-history": <OutboundHistoryPage />,
    "transfer-history": <TransferHistoryPage />,
    // 7. 분석/집계
    "inbound-summary": <InboundSummaryPage />,
    "outbound-summary": <OutboundSummaryPage />,
    "aging-stock": <AgingStockPage />,
    shortage: <ShortagePage />
  };

  const selected = featureScreens[featureSlug];
  if (selected) {
    return <Suspense fallback={<LoadingFallback />}>{selected}</Suspense>;
  }

  return (
    <section className="workbench-page">
      <div className="workbench-head app-surface">
        <div>
          <h2>{title}</h2>
          <p>/{sectionSlug}/{featureSlug}</p>
        </div>
        <div className="workbench-actions">
          <Button variant="outline" disabled>필터</Button>
          <Button variant="outline" disabled>내보내기</Button>
          <Button disabled>준비중</Button>
        </div>
      </div>

      <section className="app-surface workbench-ready-panel">
        <div>
          <strong>화면 준비중</strong>
          <p>이 메뉴는 아직 전용 업무 화면이 연결되지 않았습니다.</p>
        </div>
        <div className="workbench-preview-grid">
          <div>
            <span>예정 필터</span>
            <ul>
              {fallbackConfig.filters.map((filter) => (
                <li key={filter}>{filter}</li>
              ))}
            </ul>
          </div>
          <div>
            <span>예정 컬럼</span>
            <ul>
              {fallbackConfig.columns.map((column) => (
                <li key={column}>{column}</li>
              ))}
            </ul>
          </div>
          <div>
            <span>예정 액션</span>
            <ul>
              {fallbackConfig.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </section>
  );
};

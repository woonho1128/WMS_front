import { ActivityHistoryPage } from "./ActivityHistoryPage";

/** 출고 이력 — 출고요청·피킹·출고확정·ERP전송·거부 */
export const OutboundHistoryPage = () => <ActivityHistoryPage endpoint="outbound" refLabel="출하번호" />;

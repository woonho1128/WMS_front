export type UserRole =
  | "admin"
  | "logistics"
  | "inbound"
  | "outbound"
  | "inventory"
  | "partner";

export const roleLabels: Record<UserRole, string> = {
  admin: "관리자",
  logistics: "물류 담당자",
  inbound: "입고 담당자",
  outbound: "출고 담당자",
  inventory: "재고 담당자",
  partner: "거래처 사용자"
};

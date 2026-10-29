export type UserRole =
  | "admin"
  | "logistics"
  | "inbound"
  | "outbound"
  | "inventory"
  | "sourcing"
  | "partner";

/** 순서 = 계정 관리 · 역할 고르기의 순서 (서버와 같은 이름) */
export const roleLabels: Record<UserRole, string> = {
  admin: "관리자",
  logistics: "물류 담당자",
  inbound: "입고 담당자",
  outbound: "출고 담당자",
  inventory: "재고 담당자",
  sourcing: "소싱 담당자",
  partner: "거래처 사용자"
};

export const isUserRole = (value: string | null | undefined): value is UserRole =>
  Boolean(value) && Object.prototype.hasOwnProperty.call(roleLabels, value as string);

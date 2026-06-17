import type { UserRole } from "../app/roles";
import { mockAccounts, mockLogin } from "./mockApi";

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
};

export type LoginResult = {
  user: AuthUser;
  token: string;
};

/**
 * VITE_API_BASE_URL 이 설정돼 있으면 백엔드(/auth/login)를 호출하고,
 * 없으면 목업으로 동작한다. (.env: VITE_API_BASE_URL=http://localhost:8080/api)
 */
export const API_BASE =
  (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL ?? "";
const USE_MOCK_API =
  ((import.meta.env as Record<string, string | undefined>).VITE_USE_MOCK_API ?? "").toLowerCase() === "true" ||
  !API_BASE;

type MockAccount = { password: string; name: string; role: UserRole };

// 백엔드 미설정 시 사용하는 데모 계정 (비밀번호 공통 1234)
const MOCK_ACCOUNTS: Record<string, MockAccount> = {
  admin: { password: mockAccounts.admin.password, name: mockAccounts.admin.user.name, role: mockAccounts.admin.user.role },
  logistics: { password: mockAccounts.logistics.password, name: mockAccounts.logistics.user.name, role: mockAccounts.logistics.user.role },
  inbound: { password: mockAccounts.inbound.password, name: mockAccounts.inbound.user.name, role: mockAccounts.inbound.user.role },
  outbound: { password: mockAccounts.outbound.password, name: mockAccounts.outbound.user.name, role: mockAccounts.outbound.user.role },
  inventory: { password: mockAccounts.inventory.password, name: mockAccounts.inventory.user.name, role: mockAccounts.inventory.user.role },
  partner: { password: mockAccounts.partner.password, name: mockAccounts.partner.user.name, role: mockAccounts.partner.user.role }
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function login(id: string, password: string): Promise<LoginResult> {
  const key = id.trim();

  if (USE_MOCK_API) {
    return mockLogin(key, password);
  }

  // ── 백엔드 연동 ──
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: key, password })
    });
    const json = (await res.json().catch(() => null)) as
      | { success: boolean; data: LoginResult | null; message: string | null }
      | null;
    if (!res.ok || !json?.success || !json.data) {
      throw new Error(json?.message ?? "로그인에 실패했습니다.");
    }
    return { user: json.data.user, token: json.data.token };
  }

  // ── 목업 폴백 (백엔드 미설정 시) ──
  await delay(450);
  const account = MOCK_ACCOUNTS[key];
  if (!account || account.password !== password) {
    throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  return {
    user: { id: key, name: account.name, role: account.role },
    token: "mock-token"
  };
}

export async function logout(): Promise<void> {
  await delay(50);
}

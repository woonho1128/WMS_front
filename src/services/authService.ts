import type { UserRole } from "../app/roles";
import { API_BASE, USE_MOCK_API, fetchApi } from "./apiMode";

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
};

export type LoginResult = {
  user: AuthUser;
  token: string;
};

export { API_BASE };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 로그인.
 *
 * 데모 빌드면 목 계정, 아니면 백엔드 `/auth/login`. **폴백은 없다** —
 * 백엔드가 안 붙으면 목 계정으로 들여보내지 않고 오류를 낸다 (apiMode.ts 참고).
 */
export async function login(id: string, password: string): Promise<LoginResult> {
  const key = id.trim();

  if (USE_MOCK_API) {
    // 데모 빌드에서만 목 코드를 불러온다 — 실서비스 빌드에서는 이 줄이 통째로 빠진다
    const { mockLogin } = await import("./mockApi");
    return mockLogin(key, password);
  }

  const res = await fetchApi("/auth/login", {
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

export async function logout(): Promise<void> {
  await delay(50);
}

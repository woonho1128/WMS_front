import { authHeader } from "../app/store/authStore";
import { USE_MOCK_API, fetchApi } from "./apiMode";

type ApiResponse<T> = { success: boolean; data: T | null; message: string | null };

/**
 * 모든 화면이 쓰는 요청 함수.
 *
 * 데모 빌드면 목 데이터, 아니면 백엔드. **중간은 없다** — 백엔드가 죽어 있거나
 * 주소가 안 잡혀 있으면 목으로 넘어가지 않고 오류를 던진다 (apiMode.ts 참고).
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCK_API) {
    // 데모 빌드에서만 목 코드를 불러온다 — 실서비스 빌드에서는 이 줄이 통째로 빠진다
    const { mockRequest } = await import("./mockApi");
    return mockRequest<T>(path, init);
  }

  const res = await fetchApi(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeader(),
      ...init?.headers
    }
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.message ?? `요청 실패 (${res.status})`);
  }
  return json.data as T;
}

export const apiGet = <T>(path: string) => request<T>(path);
export const apiPost = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) =>
  request<T>(path, { method: "DELETE" });

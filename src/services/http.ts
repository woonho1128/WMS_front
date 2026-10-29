import { authHeader, useAuthStore } from "../app/store/authStore";
import { USE_MOCK_API, fetchApi } from "./apiMode";

type ApiResponse<T> = { success: boolean; data: T | null; message: string | null };

const LOGIN_AGAIN = "로그인이 끊겼습니다 — 다시 로그인하세요.";

/**
 * 401 = 로그인이 끊겼다 (계정 잠금 · 역할 변경 · 비밀번호 초기화 · 시간 만료). 로그인 화면으로 보내고 사유를 띄운다.
 * 403 은 끊긴 게 아니라 "그 일은 내 역할이 아니다" — 화면에 사유만 보인다.
 */
const expireIfLoggedOut = (status: number, message: string | null | undefined) => {
  if (status === 401 && useAuthStore.getState().token) useAuthStore.getState().expire(message ?? LOGIN_AGAIN);
};

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
    expireIfLoggedOut(res.status, json?.message);
    throw new Error(json?.message ?? `요청 실패 (${res.status})`);
  }
  return json.data as T;
}

/**
 * 파일 내려받기 (출고 사진 증빙 ZIP 등) — JSON 이 아니라 파일이 온다.
 * 링크(&lt;a href&gt;)로는 로그인 토큰을 못 붙여서 fetch 로 받아 저장한다(shared/download.saveBlob).
 * 실패하면 서버가 준 사유를 그대로 던진다. 여기도 목으로 대신하지 않는다.
 */
export async function apiDownload(path: string): Promise<Blob> {
  if (USE_MOCK_API) {
    const { mockDownload } = await import("./mockApi");
    return mockDownload(path);
  }

  const res = await fetchApi(path, { headers: authHeader() });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
    expireIfLoggedOut(res.status, json?.message);
    throw new Error(json?.message ?? `내려받기 실패 (${res.status})`);
  }
  return res.blob();
}

export const apiGet = <T>(path: string) => request<T>(path);
export const apiPost = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) =>
  request<T>(path, { method: "DELETE" });

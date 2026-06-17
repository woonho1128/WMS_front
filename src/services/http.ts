import { authHeader } from "../app/store/authStore";
import { mockRequest } from "./mockApi";

const API_BASE =
  (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL ?? "";
const USE_MOCK_API =
  ((import.meta.env as Record<string, string | undefined>).VITE_USE_MOCK_API ?? "").toLowerCase() === "true" ||
  !API_BASE;

type ApiResponse<T> = { success: boolean; data: T | null; message: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCK_API) {
    return mockRequest<T>(path, init);
  }

  const res = await fetch(`${API_BASE}${path}`, {
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

/* ============================================================
   데이터를 어디서 가져오는가 — 딱 한 곳에서 정한다.
   ------------------------------------------------------------
   ⚠ **폴백은 없다.** 백엔드에 못 붙으면 화면은 오류를 보여주고 멈춘다.
   못 붙었을 때 목 데이터로 대신 채우면, 현장에서 그 숫자가 진짜인지 아닌지
   알 방법이 없다 — 틀린 재고를 믿고 일하는 것보다 안 보이는 편이 낫다.
   (2026-09-20 사용자 결정)

   모드는 **빌드할 때** 정해지고 실행 중에 바뀌지 않는다.

   | 빌드 | VITE_USE_MOCK_API | VITE_API_BASE_URL | 데이터 |
   |---|---|---|---|
   | 데모 (GitHub Pages) | `true`  | (빈 값)                   | 브라우저 안 목 데이터 |
   | 사내 배포 · 연동 개발 | `false` | `https://…/api`          | 백엔드 · DB **만** |

   `VITE_USE_MOCK_API=true` 가 아니면 목 데이터는 **번들에 들어가지도 않는다**
   (http.ts · authService.ts 에서 조건부 import — 빌드 때 통째로 빠진다).
   ============================================================ */

/**
 * 목 데이터로 도는 데모 빌드인가 — 오직 이 플래그로만 켜진다.
 * ⚠ `import.meta.env.VITE_USE_MOCK_API` 를 **그대로** 비교해야 한다.
 * Vite 가 빌드 때 문자열을 박아 넣어 `false` 로 접히고, 그래야 목 코드가 번들에서 빠진다
 * (변수에 담거나 `.toLowerCase()` 를 끼우면 상수로 접히지 않아 목 데이터가 같이 실린다).
 */
export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === "true";

/** 백엔드 주소 (예: https://wms.example.co.kr/api) */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const CONFIG_ERROR =
  "API 주소가 설정되지 않았습니다 (VITE_API_BASE_URL). 목 데이터로 대신 보여주지 않습니다 — 배포 설정을 확인하세요.";

/**
 * 실서비스 빌드인데 주소가 없으면 **요청할 때마다 오류**를 낸다.
 * 예전에는 주소가 비면 조용히 목 데이터로 넘어갔다 — 설정을 빠뜨린 채 배포하면
 * 아무도 모르게 가짜 숫자가 현장에 떴다. 그 경로를 없앴다.
 */
export const assertApiConfig = () => {
  if (!USE_MOCK_API && !API_BASE) throw new Error(CONFIG_ERROR);
};

// 화면을 열기 전에 콘솔에도 남긴다 (배포 직후 확인용)
if (!USE_MOCK_API && !API_BASE) console.error(`[WMS] ${CONFIG_ERROR}`);

/**
 * fetch 자체가 실패한 경우(서버가 안 떠 있음 · 주소 오타 · CORS)를 읽을 수 있는 말로 바꾼다.
 * 브라우저 기본 메시지는 "Failed to fetch" 하나뿐이라 현장에서 원인을 못 찾는다.
 * — 여기서도 목 데이터로 대신하지 않는다. 오류는 오류로 보여준다.
 */
export const fetchApi = async (path: string, init?: RequestInit) => {
  assertApiConfig();
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new Error(`서버에 연결할 수 없습니다 (${API_BASE}) — 백엔드가 떠 있는지, 주소가 맞는지 확인하세요.`);
  }
};

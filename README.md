# DAELIM WMS Front

React + Vite 프론트엔드. 백엔드(`WMS_back`)는 **비공개 저장소**에 따로 있습니다.

## 데이터 출처 규칙 (중요)

이 한 소스에서 **두 가지 빌드**가 나옵니다. 어느 쪽인지는 **빌드할 때** 정해지고, 실행 중에 바뀌지 않습니다.

| 빌드 | `VITE_USE_MOCK_API` | `VITE_API_BASE_URL` | 데이터 | 쓰는 곳 |
|---|---|---|---|---|
| **데모** | `true` | (빈 값) | 브라우저 안 목 데이터 | GitHub Pages — 화면 시연 |
| **사내 배포 · 연동 개발** | `false` | `https://…/api` | 백엔드 · DB **만** | 실제 업무 |

### ⚠ 폴백은 없습니다

백엔드에 못 붙으면 **화면은 오류를 보여주고 멈춥니다.** 목 데이터로 대신 채우지 않습니다.

> 못 붙었을 때 목 데이터가 나오면, 현장에서 그 숫자가 진짜인지 아닌지 알 방법이 없습니다.
> 틀린 재고를 믿고 일하는 것보다 안 보이는 편이 낫습니다. (2026-09-20 결정)

- `VITE_USE_MOCK_API=false` 인데 주소가 비어 있으면 → 모든 화면이 `API 주소가 설정되지 않았습니다` 오류
- 백엔드가 꺼져 있으면 → `서버에 연결할 수 없습니다 (주소)` 오류
- 데모 빌드가 아니면 **목 코드가 번들에 들어가지도 않습니다** (조건부 import — `src/services/apiMode.ts`)
- 데모 빌드에서는 화면 위에 **`샘플 데이터`** 배지가 붙고, 로그인 화면에 데모 계정 안내가 나옵니다

## 실행

```powershell
npm install
npm run dev                                  # 목 데이터 (http://localhost:5173)
npm run dev -- --mode api --port 5175        # 백엔드 연동 (백엔드를 18080 으로 먼저 띄울 것)
```

데모 계정은 목 모드에서만 동작합니다: `admin` / `1234` (그 외 logistics · inbound · outbound · inventory · partner).

## 빌드

```powershell
npx vite build                 # 데모 빌드 (.env → 목 데이터)
npx vite build --mode api      # 사내 배포 빌드 (.env.api → 백엔드)
```

사내 서버에 올릴 때는 `.env.api` 의 주소를 그 환경 주소로 바꾸거나, 빌드 시 환경변수로 덮어씁니다.

```powershell
$env:VITE_USE_MOCK_API="false"; $env:VITE_API_BASE_URL="https://wms.사내주소/api"; npx vite build
```

GitHub Pages 배포(`.github/workflows/deploy.yml`)는 항상 `VITE_USE_MOCK_API=true` 로 빌드합니다 — 데모는 DB에 붙지 않습니다.

/// <reference types="vite/client" />

/* 빌드 때 값이 박히는 설정 (services/apiMode.ts).
   ⚠ `import.meta.env.VITE_X` 를 **그대로** 써야 Vite 가 상수로 치환하고,
   그래야 `if (USE_MOCK_API)` 가지 안의 목 코드가 실서비스 번들에서 빠진다.
   변수에 담아 쓰면(`const env = import.meta.env`) 치환이 안 된다. */
interface ImportMetaEnv {
  /** "true" 일 때만 목 데이터 데모 빌드 (정확히 소문자 true) */
  readonly VITE_USE_MOCK_API?: string;
  /** 백엔드 주소 (예: https://wms.example/api) */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

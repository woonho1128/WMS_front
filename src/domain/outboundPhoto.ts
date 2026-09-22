/* ============================================================
   출고 사진 — 화면 · 목 · 서버가 같이 쓰는 값 (DOCS/WMS_출고사진_설계.md)
   목 모듈(services/mockOutboundPhoto)에 두면 화면이 목을 import 하게 되어
   사내 빌드에 목 코드가 실린다 — 그래서 여기로 뺐다 (2026-09-22).
   ============================================================ */

export type PhotoKind = "LOAD" | "PACK" | "LABEL" | "ETC";

export const PHOTO_KINDS: Array<{ value: PhotoKind; label: string }> = [
  { value: "LOAD", label: "상차" },
  { value: "PACK", label: "포장" },
  { value: "LABEL", label: "송장" },
  { value: "ETC", label: "기타" }
];

export const KIND_LABEL: Record<string, string> = Object.fromEntries(PHOTO_KINDS.map((k) => [k.value, k.label]));

/** 장당 한도 15MB · 한 번에 10장 (설계 §3 — 서버 OutboundPhotoService 와 같은 값) */
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_MAX_PER_REQUEST = 10;

import jsQR from "jsqr";

/* ============================================================
   QR · 바코드 판독 — 휴대폰 카메라용 (현장에 PDA·스캐너가 없다, 2026-10-14)
   · 안드로이드 크롬: 브라우저에 든 판독기(BarcodeDetector) — QR 과 1차원 바코드(제품 박스)를 같이 읽는다
   · 아이폰 사파리처럼 판독기가 없는 브라우저: jsQR — QR 만 읽는다
   판독은 전부 휴대폰 안에서 한다. 화면을 미리 열어 두면 인터넷이 없는 창고 안쪽에서도 읽힌다.
   ============================================================ */

type DetectedBarcode = { rawValue: string };
type NativeDetector = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type NativeDetectorCtor = {
  new (options?: { formats?: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

/** 읽을 형식 — 우리 라벨(QR)과 제품 박스에 흔한 1차원 바코드 */
const WANTED = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "itf", "upc_a"];

let nativePromise: Promise<NativeDetector | null> | null = null;

/** 브라우저에 든 판독기 — 없거나 QR 을 못 읽으면 null */
const nativeDetector = () => {
  if (!nativePromise) {
    nativePromise = (async () => {
      const Ctor = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
      if (!Ctor) return null;
      try {
        const supported = (await Ctor.getSupportedFormats?.()) ?? WANTED;
        const formats = WANTED.filter((format) => supported.includes(format));
        return formats.includes("qr_code") ? new Ctor({ formats }) : null;
      } catch {
        return null;
      }
    })();
  }
  return nativePromise;
};

/** 캔버스에 그린 그림에서 코드 하나를 읽는다. 못 읽으면 null */
export const decodeCanvas = async (
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  tryHarder = false
): Promise<string | null> => {
  const native = await nativeDetector();
  if (native) {
    try {
      const value = (await native.detect(canvas)).find((found) => found.rawValue)?.rawValue;
      if (value) return value.trim();
    } catch {
      /* 판독기 오류 — 아래 jsQR 로 */
    }
  }
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const qr = jsQR(image.data, image.width, image.height, { inversionAttempts: tryHarder ? "attemptBoth" : "dontInvert" });
  return qr?.data ? qr.data.trim() : null;
};

/** 카메라 앱으로 찍은 사진에서 읽는다 — 큰 사진은 느리고 오히려 못 읽어서 줄여 가며 시도 */
export const decodeImageFile = async (file: File): Promise<string | null> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("사진을 열 수 없습니다"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    for (const max of [1280, 800]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const value = await decodeCanvas(canvas, ctx, true);
      if (value) return value;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** 카메라를 바로 켜서 비출 수 있나 — 브라우저가 https(또는 localhost) 주소에서만 허락한다 */
export const canUseLiveCamera = () =>
  typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

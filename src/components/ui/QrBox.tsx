import { useMemo } from "react";
import qrcode from "qrcode-generator";

/* QR 은 라벨 인쇄/스캔 대상이라 테마와 무관하게 흑/백 고정이다.
   (테마 토큰을 쓰면 다크 모드에서 대비가 무너져 스캔이 불가능해진다.
    감열 프린터는 짙은 회색을 망점으로 찍어 인식률이 떨어지므로 순흑을 쓴다) */
const QR_DARK = "#000000";
const QR_LIGHT = "#ffffff";

type EccLevel = "L" | "M" | "Q" | "H";

/** 한글 같은 비ASCII 도 스캐너가 UTF-8 로 읽도록 바이트 문자열로 바꿔 넣는다 */
const toByteString = (value: string) =>
  Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join("");

/** 스캔 가능한 QR — 가로로 이어진 칸을 한 조각으로 묶은 path (인쇄 시 칸 사이 틈이 생기지 않는다) */
export const qrPath = (value: string, level: EccLevel = "M") => {
  const qr = qrcode(0, level);
  qr.addData(toByteString(value));
  qr.make();
  const count = qr.getModuleCount();
  let d = "";
  for (let row = 0; row < count; row += 1) {
    let col = 0;
    while (col < count) {
      if (!qr.isDark(row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < count && qr.isDark(row, col)) col += 1;
      d += `M${start} ${row}h${col - start}v1h${start - col}z`;
    }
  }
  return { count, d };
};

/**
 * QR 코드 (ISO/IEC 18004) — 값이 그대로 스캔된다.
 * size 는 px 숫자 또는 "38mm" 같은 CSS 길이. margin 은 테두리 여백(모듈 수).
 */
export const QrBox = ({
  value,
  size = 108,
  margin = 2,
  level = "M"
}: {
  value: string;
  size?: number | string;
  margin?: number;
  level?: EccLevel;
}) => {
  const qr = useMemo(() => {
    try {
      return qrPath(value, level);
    } catch {
      return null; // 담을 수 있는 길이를 넘은 값
    }
  }, [value, level]);
  const view = (qr?.count ?? 21) + margin * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-margin} ${-margin} ${view} ${view}`}
      role="img"
      aria-label={`QR: ${value}`}
      shapeRendering="crispEdges"
    >
      <rect x={-margin} y={-margin} width={view} height={view} fill={QR_LIGHT} />
      {qr ? <path d={qr.d} fill={QR_DARK} /> : null}
    </svg>
  );
};

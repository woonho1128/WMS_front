import type { CSSProperties } from "react";

/** 디자인(standalone)에서 가져온 stroke 아이콘 세트 (24 viewbox) */
export const ICON_PATHS: Record<string, string> = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  inbox: "M3 12h5l2 3h4l2-3h5M5 5h14l2 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z",
  truck: "M3 6h11v9H3zM14 9h4l3 3v3h-7M6.5 18.5a1.5 1.5 0 1 0 0-.01M17.5 18.5a1.5 1.5 0 1 0 0-.01",
  boxes: "M3.3 7 12 11l8.7-4M12 11v9M3 7l9-4 9 4v9l-9 4-9-4z",
  move: "M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20",
  swap: "M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8",
  clipboard: "M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4",
  plug: "M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0zM12 17v4",
  db: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  plus: "M12 5v14M5 12h14",
  chevR: "M9 6l6 6-6 6",
  chevL: "M15 6l-6 6 6 6",
  chevD: "M6 9l6 6 6-6",
  check: "M20 6 9 17l-5-5",
  checkCircle: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.5l-3-3",
  xCircle: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6",
  x: "M18 6 6 18M6 6l12 12",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  refresh: "M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M5 12l7 7 7-7",
  arrowR: "M5 12h14M13 6l6 6-6 6",
  layers: "M12 2 2 7l10 5 10-5zM2 12l10 5 10-5M2 17l10 5 10-5",
  user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 2",
  ban: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM5 5l14 14",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  menu: "M3 6h18M3 12h18M3 18h18",
  box: "M21 8v8l-9 4-9-4V8l9-4zM3.3 7 12 11l8.7-4",
  flag: "M4 22V4M4 4h13l-2 4 2 4H4",
  warehouse: "M3 21V8l9-5 9 5v13M3 21h18M7 21v-7h10v7",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  maximize: "M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3",
  minus: "M5 12h14",
  crosshair: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM22 12h-4M6 12H2M12 6V2M12 22v-4",
  pin: "M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  dots: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  cube3d: "M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h3l7 4V6L7 10H4a1 1 0 0 0-1 1zM18 9a4 4 0 0 1 0 6",
  upload: "M12 20V8M7 13l5-5 5 5M5 4h14",
  printer: "M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z",
  rotateCw: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5",
  rotateCcw: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5",
  /* 탭 닫기 메뉴 */
  closeOthers: "M3 5h8v14H3zM15 9l6 6M21 9l-6 6",
  closeLeft: "M4 4v16M20 12H9M13 8l-4 4 4 4",
  closeRight: "M20 4v16M4 12h11M11 8l4 4-4 4",
  closeAll: "M3 5h18v14H3zM9 9l6 6M15 9l-6 6",
  /* 탭 고정 (압정) */
  pinTab: "M15 4.5l-4 4-4 1.5-1.5 1.5 7 7 1.5-1.5 1.5-4 4-4M9 15l-4.5 4.5M14.5 4l5.5 5.5",
  pinOff: "M3 3l18 18M15 4.5l-3.25 3.25M9.18 9.18 7 10l-1.5 1.5 7 7 1.5-1.5.82-2.19M16.25 11.69 19.5 8.5M9 15l-4.5 4.5M14.5 4l5.5 5.5"
};

type Props = {
  /** 아이콘 이름 (ICON_PATHS 키) */
  name?: keyof typeof ICON_PATHS | string;
  /** 직접 path d 문자열을 넘길 때 (menuConfig.iconPath 등) */
  path?: string;
  /** 직접 넘긴 path 가 fill 기반이면 true */
  filled?: boolean;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
};

/** 디자인 시스템 아이콘. name 또는 path 중 하나 사용. */
export const Icon = ({ name, path, filled = false, size = 24, strokeWidth = 2, style, className }: Props) => {
  const d = path ?? (name ? ICON_PATHS[name] : undefined) ?? "";

  if (filled) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" style={style} className={className} aria-hidden="true">
        <path d={d} />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {d
        .split("M")
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={"M" + seg} />
        ))}
    </svg>
  );
};

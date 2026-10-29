import type { Access, MenuGroup } from "./access";

export type MenuFeature = {
  slug: string;
  label: string;
  description: string;
  /** 화면 주소 — 메뉴 관리에서 다른 모듈로 옮긴 화면도 주소는 그대로다. 없으면 /섹션/화면 */
  path?: string;
};

export type MenuSection = {
  slug: string;
  label: string;
  group: "GENERAL" | "OPERATIONS" | "REPORT" | "SETTINGS";
  iconPath: string;
  description: string;
  features: MenuFeature[];
};

/**
 * 화면 목록 (코드가 정한다) — 주소 · 기본 이름 · 설명 · 아이콘.
 * 누가 어느 화면을 보는지는 여기 없다: 로그인 · /auth/me 가 준 메뉴(menus)와 기능(features)으로 정한다.
 * 화면설계 기준: DOCS/WMS_화면설계_개발요청.md (반품 예정 OMS2 이관, 출고 사진·현장 전광판 신규 2026-09-20)
 * + 시스템관리 3개 (계정 · 권한, 2026-10-29)
 */
export const menuSections: MenuSection[] = [
  {
    slug: "dashboard",
    label: "대시보드",
    group: "GENERAL",
    iconPath: "M4 13h7V4H4v9zm0 7h7v-5H4v5zm9 0h7V11h-7v9zm0-16v5h7V4h-7z",
    description: "물류 현황과 작업 알림을 실시간으로 확인합니다.",
    features: [
      { slug: "logistics-status", label: "물류 현황", description: "금일 입고·출고·재고·작업중 건수를 조회합니다." },
      { slug: "inbound-status", label: "입고 현황", description: "입고예정·입고확정·격납대기 현황을 확인합니다." },
      { slug: "outbound-status", label: "출고 현황", description: "출고대기·피킹중·출고완료 현황을 확인합니다." },
      { slug: "stock-status", label: "재고 현황", description: "총 재고·가용재고·불량재고·장기재고를 확인합니다." },
      { slug: "work-alerts", label: "작업 알림", description: "보충대상·쇼트발생·인터페이스 오류·반품반려 알림을 관리합니다." },
      { slug: "floor-board", label: "현장 전광판", description: "입고·출고 현황을 한 화면에 크게 띄웁니다. 창고 벽 TV 용." }
    ]
  },
  {
    slug: "inbound",
    label: "입고관리",
    group: "OPERATIONS",
    iconPath: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
    description: "입고예정부터 입고확정·반품까지 관리합니다.",
    features: [
      { slug: "inbound-schedule", label: "입고 예정", description: "입고예정 조회·등록과 ERP PO 검증, CAPA를 관리합니다." },
      { slug: "inbound-confirm", label: "입고 확정", description: "당일 입고 검수, QR 입고라벨 출력, 입고확정을 처리합니다." },
      // 반품 예정(반품오더 조회)은 OMS2 메뉴 — 사이트맵 사용 부서 OMS2 (2026-09-17 WMS 에서 제거)
      { slug: "return-confirm", label: "반품 확정", description: "OMS2 에서 수신한 반품오더의 승인·반려와 반품재고 생성을 처리합니다." }
    ]
  },
  {
    slug: "stock",
    label: "재고관리",
    group: "OPERATIONS",
    iconPath: "M12 3 3 7.5 12 12l9-4.5L12 3zm-9 7.5V17l9 4.5V15l-9-4.5zm18 0L12 15v6.5L21 17v-6.5z",
    description: "격납·보충·이동과 재고 조회·실사를 관리합니다.",
    features: [
      { slug: "putaway", label: "격납 대기", description: "격납대기 목록과 피킹/보충/직출 로케이션 격납(다중 분할 배정)을 처리합니다." },
      { slug: "replenishment", label: "보충 작업", description: "피킹 로케이션 파레트 구성 부족 감지와 FIFO 보충 이동을 처리합니다." },
      { slug: "fifo-status", label: "선입선출 현황", description: "파레트 단위 선입선출(입고일자) 우선출고 현황을 관리용으로 조회합니다." },
      { slug: "transfer", label: "재고 이동", description: "일반 재고이동 등록·확정과 이동이력을 관리합니다." },
      { slug: "stock-realtime", label: "실시간 재고 조회", description: "창고·로케이션·품목·LOT별 재고를 조회합니다." },
      { slug: "stock-available", label: "가용 재고 조회", description: "가용재고를 창고·로케이션·품목·LOT별로 조회합니다." },
      { slug: "erp-compare", label: "ERP 재고 비교", description: "일별 ERP-WMS 재고 차이를 상품·로케이션별로 비교하고 과거 이력을 조회합니다." },
      { slug: "stock-monthly", label: "월말 재고 조회", description: "월말 스냅샷 조회와 ERP 재고 비교를 제공합니다." },
      { slug: "stocktaking", label: "일일 재고 실사", description: "실사결과 입력과 차이분석, 재고조정을 처리합니다." },
      { slug: "barcode-lookup", label: "바코드 조회", description: "QR/바코드로 입고일자·LOT·이동이력을 추적합니다." }
    ]
  },
  {
    slug: "outbound",
    label: "출고관리",
    group: "OPERATIONS",
    iconPath: "M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z",
    description: "출고요청 수신부터 피킹·출고확정·배송까지 관리합니다.",
    features: [
      { slug: "outbound-order", label: "출고 요청서", description: "OMS 오더 수신·조회와 오더라벨 출력, 상태관리를 처리합니다." },
      { slug: "manual-order", label: "비운영 주문 등록", description: "상품 선택 기반 비운영 주문 등록과 BOM 구성품 자동 전개를 제공합니다." },
      { slug: "picking", label: "피킹 작업", description: "오더 QR 스캔과 로케이션 안내, 피킹재고 차감을 처리합니다." },
      { slug: "change-review", label: "변경·취소 확인", description: "피킹이 시작된 뒤 주문 시스템에서 온 변경·취소를 승인(집은 재고 되돌림)하거나 거절합니다." },
      { slug: "outbound-confirm", label: "출고 확정", description: "출고확정과 ERP I/F 전송, 실패건 예외처리를 관리합니다." },
      { slug: "outbound-photo", label: "출고 사진", description: "출고 건별 상차·포장·송장 사진을 찍어 증빙으로 남깁니다." },
      { slug: "delivery-note", label: "배송 내역서", description: "일일 출고·배송·운송정보 조회와 내역서 출력을 제공합니다." }
    ]
  },
  {
    slug: "dispatch",
    label: "배차관리",
    group: "OPERATIONS",
    iconPath: "M3 7h13v9H3V7zm14 2h2l2 3v4h-4v-7zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    description: "수도권·지방권 배차와 배송사 배정을 관리합니다.",
    features: [
      { slug: "dispatch-metro", label: "수도권 배차", description: "중량·부피 계산과 차량 자동추천, 배송사 배정을 처리합니다." },
      { slug: "dispatch-regional", label: "지방권 배차", description: "파렛트·중량 자동계산과 배송사 화면 공유를 제공합니다." }
    ]
  },
  {
    slug: "master",
    label: "기준정보관리",
    group: "SETTINGS",
    iconPath: "M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z",
    description: "품목·로케이션·배송사·재고정책 기준정보를 관리합니다.",
    features: [
      { slug: "item-master", label: "품목 마스터", description: "품목 등록·수정과 TI/HI·중량·부피·안전재고를 관리합니다." },
      { slug: "location-master", label: "로케이션 관리", description: "로케이션 생성·수정과 유형(피킹/보충/직출/불량/파손)을 관리합니다." },
      { slug: "carrier-master", label: "배송사 관리", description: "배송사 등록·수정·삭제와 계정 권한을 관리합니다." },
      { slug: "stock-policy", label: "가용재고 정책관리", description: "예약·불량·이동중 재고 반영 설정과 계산식을 관리합니다." }
    ]
  },
  {
    slug: "analytics",
    label: "분석/집계",
    group: "REPORT",
    iconPath: "M3 13h4v8H3v-8zm7-9h4v17h-4V4zm7 5h4v12h-4V9z",
    description: "입출고 집계와 진행률, 쇼트·장기재고를 분석합니다.",
    features: [
      { slug: "inbound-summary", label: "입고 집계", description: "일/주/월별·품목별 입고 실적을 집계합니다." },
      { slug: "outbound-summary", label: "출고 집계", description: "일/주/월별·품목별 출고 실적을 집계합니다." },
      { slug: "progress", label: "진행 현황", description: "실시간 진행률과 오더·피킹·출고 집계를 모니터링합니다." },
      { slug: "shortage", label: "쇼트 관리", description: "안전재고·발주시점 계산과 쇼트예상 품목을 관리합니다." },
      { slug: "aging-stock", label: "장기재고 관리", description: "1년 미출고 분석과 장기재고 목록·금액을 조회합니다." }
    ]
  },
  {
    slug: "history",
    label: "이력관리",
    group: "REPORT",
    iconPath: "M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 7 7v2a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
    description: "입고·이동·출고 처리이력과 전체 로그를 조회합니다.",
    features: [
      { slug: "inbound-history", label: "입고 이력", description: "입고등록·확정·수정·ERP전송 이력을 조회합니다." },
      { slug: "transfer-history", label: "재고 이동 이력", description: "격납·보충·일반이동·조정 이력을 조회합니다." },
      { slug: "outbound-history", label: "출고 이력", description: "출고요청·피킹·출고확정·ERP전송 이력을 조회합니다." },
      { slug: "system-logs", label: "전체 로그 조회", description: "사용자·접속·인터페이스·오류 로그와 중요 메모를 조회합니다." }
    ]
  },
  {
    slug: "communication",
    label: "커뮤니케이션",
    group: "GENERAL",
    iconPath: "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z",
    description: "업무 연락과 AI 챗봇을 제공합니다.",
    features: [
      { slug: "notice", label: "업무 연락", description: "DECO 업무 연락을 조회합니다." },
      { slug: "ai-chatbot", label: "AI 챗봇", description: "재고/입고/출고/쇼트 Q&A와 자연어 데이터 조회를 제공합니다." }
    ]
  },
  {
    slug: "system",
    label: "시스템관리",
    group: "SETTINGS",
    iconPath: "M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 13.5c-2.33-.73-4.37-2.33-5.6-4.5.03-1.86 3.73-2.88 5.6-2.88s5.57 1.02 5.6 2.88c-1.23 2.17-3.27 3.77-5.6 4.5z",
    description: "사용자 · 메뉴 · 권한을 관리합니다. 저장하면 다시 로그인 없이 바로 적용됩니다.",
    features: [
      { slug: "users", label: "사용자 관리", description: "계정 만들기·잠그기·비밀번호 초기화와 역할 주기(여러 개), 가진 권한 보기." },
      { slug: "menus", label: "메뉴 관리", description: "메뉴 이름·순서·사용·모듈과 화면을 여는 권한을 관리합니다." },
      { slug: "permissions", label: "권한 관리", description: "역할(권한의 묶음)과 권한(기능의 묶음)을 만들고 고칩니다." }
    ]
  }
];

/** 로그인만 하면 보이는 화면 — 기능이 없다 (서버 AccessCatalog 와 같다) */
export const LOGIN_ONLY_SCREENS: ReadonlySet<string> = new Set(["communication/notice"]);

/** 메뉴 묶음 아이콘 — 관리자가 만든 묶음은 기본 아이콘 */
const GROUP_ICON = "M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z";

export const findSection = (sectionSlug?: string) =>
  menuSections.find((section) => section.slug === sectionSlug);

/** 화면 하나 — 주소로 */
export const findScreen = (path: string) => {
  const [sectionSlug, featureSlug] = path.split("/").filter(Boolean);
  const section = findSection(sectionSlug);
  const feature = section?.features.find((item) => item.slug === featureSlug);
  return section && feature ? { section, feature } : null;
};

/** 메뉴 항목의 주소 — 다른 모듈로 옮긴 화면도 제 주소로 */
export const featurePath = (section: MenuSection, feature: MenuFeature) => feature.path ?? `/${section.slug}/${feature.slug}`;

/** 이 화면을 볼 수 있나 — 그 화면의 보기 기능 (업무 연락은 로그인만). 메뉴에서 숨긴 화면도 기능이 있으면 열린다 */
export const canOpenScreen = (access: Access, sectionSlug: string, featureSlug: string) => {
  const code = `${sectionSlug}/${featureSlug}`;
  return LOGIN_ONLY_SCREENS.has(code) || access.features.has(`${code}:view`);
};

/**
 * 사이드 메뉴 — 서버가 준 메뉴(관리자가 메뉴 관리에서 고친 이름 · 순서 · 모듈) 그대로.
 * 아이콘 · 설명은 코드의 화면 목록에서. 코드에 없는 화면(새 버전 전)은 뺀다.
 */
export const getMenuSections = (access: Access): MenuSection[] =>
  access.menus
    .map((group: MenuGroup) => {
      const own = findSection(group.code);
      const features = group.screens
        .map((screen) => {
          const found = findScreen(`/${screen.code}`);
          if (!found) return null;
          return {
            slug: found.feature.slug,
            label: screen.name || found.feature.label,
            description: found.feature.description,
            path: `/${screen.code}`
          } satisfies MenuFeature;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      return {
        slug: group.code,
        label: group.name,
        group: own?.group ?? "OPERATIONS",
        iconPath: own?.iconPath ?? GROUP_ICON,
        description: own?.description ?? `${group.name} 화면 모음`,
        features
      } satisfies MenuSection;
    })
    .filter((section) => section.features.length > 0);

/** 경로가 메뉴의 어느 묶음에 있나 (옮긴 화면이면 옮겨 간 묶음) */
export const sectionOfMenuPath = (sections: MenuSection[], path: string) =>
  sections.find((section) => section.features.some((feature) => featurePath(section, feature) === path));

/**
 * 즐겨찾기가 비어 있을 때 "추천으로 채우기" — 역할마다 실제로 자주 여는 화면.
 * (설계 DOCS/WMS_메뉴방식_즐겨찾기_설계.md §2 · 못 보는 화면은 채울 때 걸러진다. 추천이 없는 역할은 메뉴의 앞 화면들)
 */
export const RECOMMENDED_FAVORITES: Record<string, string[]> = {
  inbound: ["/inbound/inbound-schedule", "/inbound/inbound-confirm", "/stock/putaway", "/stock/stock-realtime", "/stock/barcode-lookup"],
  outbound: ["/outbound/outbound-order", "/outbound/picking", "/outbound/outbound-confirm", "/outbound/outbound-photo", "/dispatch/dispatch-metro"],
  inventory: ["/stock/stock-realtime", "/stock/replenishment", "/stock/stocktaking", "/stock/erp-compare", "/stock/fifo-status"],
  sourcing: ["/inbound/inbound-schedule", "/dashboard/inbound-status", "/analytics/shortage", "/stock/stock-realtime", "/history/inbound-history"],
  logistics: ["/dashboard/logistics-status", "/dashboard/inbound-status", "/dashboard/outbound-status", "/dashboard/work-alerts", "/dashboard/floor-board"],
  admin: ["/dashboard/logistics-status", "/dashboard/inbound-status", "/dashboard/outbound-status", "/dashboard/work-alerts", "/system/users"],
  partner: ["/dispatch/dispatch-metro", "/dispatch/dispatch-regional"]
};

export const recommendedFavorites = (access: Access): string[] => {
  const ok = (path: string) => resolveScreenPath(path, access).status === "ok";
  for (const role of access.roles) {
    const list = RECOMMENDED_FAVORITES[role.code]?.filter(ok);
    if (list?.length) return list;
  }
  return getMenuSections(access)
    .flatMap((section) => section.features.map((feature) => featurePath(section, feature)))
    .filter((path) => path !== "/communication/notice")
    .slice(0, 5);
};

/**
 * 첫 화면 — 보통은 preferred(물류 현황). 그 화면을 못 보는 사람은 메뉴의 첫 화면으로
 * ("접근 권한이 없습니다" 로 시작하지 않게).
 */
export const homePathFor = (access: Access, preferred: string) => {
  if (resolveScreenPath(preferred, access).status === "ok") return preferred;
  const first = getMenuSections(access)[0];
  return first?.features[0] ? featurePath(first, first.features[0]) : preferred;
};

/** 경로 하나가 어떤 화면인가 — 코드에 있는 화면인지, 이 사람이 볼 수 있는지까지 본다 */
export type ScreenTarget =
  | { status: "ok"; sectionSlug: string; featureSlug: string; label: string }
  | { status: "unknown" | "denied" };

/**
 * 라우터 밖에서도 화면을 그려야 할 때(분할 보기의 오른쪽 패널) 경로를 화면으로 푼다.
 * 라우터가 그리는 FeaturePage 와 같은 판정을 쓴다 — 없는 화면은 unknown, 기능이 없으면 denied.
 * 이름은 메뉴 관리에서 고친 이름(보이는 메뉴에 있으면).
 */
export const resolveScreenPath = (path: string, access: Access): ScreenTarget => {
  const found = findScreen(path);
  if (!found) return { status: "unknown" };
  const { section, feature } = found;
  if (!canOpenScreen(access, section.slug, feature.slug)) return { status: "denied" };
  const code = `${section.slug}/${feature.slug}`;
  const named = access.menus.flatMap((group) => group.screens).find((screen) => screen.code === code);
  return { status: "ok", sectionSlug: section.slug, featureSlug: feature.slug, label: named?.name || feature.label };
};

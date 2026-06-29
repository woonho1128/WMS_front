export type MenuFeature = {
  slug: string;
  label: string;
  description: string;
};

export type MenuSection = {
  slug: string;
  label: string;
  group: "GENERAL" | "OPERATIONS" | "REPORT" | "SETTINGS";
  iconPath: string;
  description: string;
  features: MenuFeature[];
};

export type MenuConfigByRole = Record<string, Array<{ section: string; features?: string[] }>>;

// 화면설계 기준: DOCS/WMS_화면설계_개발요청.md (9개 모듈 / 38개 화면)
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
      { slug: "work-alerts", label: "작업 알림", description: "보충대상·쇼트발생·인터페이스 오류·반품반려 알림을 관리합니다." }
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
      { slug: "return-schedule", label: "반품 예정", description: "OMS 반품오더 자동수신 내역을 조회합니다." },
      { slug: "return-confirm", label: "반품 확정", description: "반품 승인·반려와 반품재고 생성을 처리합니다." }
    ]
  },
  {
    slug: "stock",
    label: "재고관리",
    group: "OPERATIONS",
    iconPath: "M12 3 3 7.5 12 12l9-4.5L12 3zm-9 7.5V17l9 4.5V15l-9-4.5zm18 0L12 15v6.5L21 17v-6.5z",
    description: "격납·보충·이동과 재고 조회·실사를 관리합니다.",
    features: [
      { slug: "putaway", label: "격납 대기", description: "격납대기 목록과 피킹/보충 로케이션 격납을 처리합니다." },
      { slug: "replenishment", label: "보충 작업", description: "피킹재고 부족 감지와 FIFO 보충 이동을 처리합니다." },
      { slug: "transfer", label: "재고 이동", description: "일반 재고이동 등록·확정과 이동이력을 관리합니다." },
      { slug: "stock-realtime", label: "실시간 재고 조회", description: "창고·로케이션·품목·LOT별 재고를 조회합니다." },
      { slug: "stock-available", label: "가용 재고 조회", description: "가용재고를 창고·로케이션·품목·LOT별로 조회합니다." },
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
      { slug: "picking", label: "피킹 작업", description: "오더 QR 스캔과 로케이션 안내, 피킹재고 차감을 처리합니다." },
      { slug: "outbound-confirm", label: "출고 확정", description: "출고확정과 ERP I/F 전송, 실패건 예외처리를 관리합니다." },
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
      { slug: "location-master", label: "로케이션 관리", description: "로케이션 생성·수정과 상태(피킹/보충/불량/파손)를 관리합니다." },
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
  }
];

// 좌측 메뉴에서 하위 화면을 펼치지 않고, 본문 상단 탭으로 전환하는 섹션.
export const TABBED_SECTIONS = ["inbound", "outbound"];
export const isTabbedSection = (slug?: string) =>
  Boolean(slug) && TABBED_SECTIONS.includes(slug as string);

export const findSection = (sectionSlug?: string) =>
  menuSections.find((section) => section.slug === sectionSlug);

export const roleMenuConfig: MenuConfigByRole = {
  admin: [
    { section: "dashboard" },
    { section: "inbound" },
    { section: "stock" },
    { section: "outbound" },
    { section: "dispatch" },
    { section: "master" },
    { section: "analytics" },
    { section: "history" },
    { section: "communication" }
  ],
  logistics: [
    { section: "dashboard" },
    { section: "inbound" },
    { section: "stock" },
    { section: "outbound" },
    { section: "dispatch" },
    { section: "analytics" },
    { section: "history" },
    { section: "communication" }
  ],
  inbound: [
    { section: "dashboard", features: ["logistics-status", "inbound-status", "work-alerts"] },
    { section: "inbound" },
    { section: "stock", features: ["putaway", "replenishment", "stock-realtime", "barcode-lookup"] },
    { section: "master", features: ["item-master", "location-master"] },
    { section: "history", features: ["inbound-history", "transfer-history"] },
    { section: "communication", features: ["notice"] }
  ],
  outbound: [
    { section: "dashboard", features: ["logistics-status", "outbound-status", "work-alerts"] },
    { section: "outbound" },
    { section: "stock", features: ["transfer", "stock-realtime", "stock-available"] },
    { section: "dispatch" },
    { section: "master", features: ["item-master", "carrier-master"] },
    { section: "history", features: ["outbound-history"] },
    { section: "communication", features: ["notice"] }
  ],
  inventory: [
    { section: "dashboard", features: ["logistics-status", "stock-status", "work-alerts"] },
    { section: "stock" },
    { section: "master", features: ["item-master", "location-master", "stock-policy"] },
    { section: "analytics", features: ["inbound-summary", "outbound-summary", "shortage", "aging-stock"] },
    { section: "history", features: ["transfer-history"] },
    { section: "communication", features: ["notice"] }
  ],
  partner: [
    { section: "dashboard", features: ["outbound-status"] },
    { section: "outbound", features: ["delivery-note"] },
    { section: "dispatch", features: ["dispatch-regional"] },
    { section: "communication", features: ["notice"] }
  ]
};

export const getMenuSectionsForRole = (role: string) => {
  const roleMenu = roleMenuConfig[role] ?? roleMenuConfig.admin;
  const sectionMap = new Map(menuSections.map((section) => [section.slug, section]));

  return roleMenu
    .map((rule) => {
      const section = sectionMap.get(rule.section);
      if (!section) return null;
      if (!rule.features) return section;

      return {
        ...section,
        features: section.features.filter((feature) => rule.features!.includes(feature.slug))
      };
    })
    .filter((section): section is MenuSection => Boolean(section))
    .filter((section) => section.features.length > 0);
};

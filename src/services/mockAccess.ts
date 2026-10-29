/* ============================================================
   목(mock) — 계정 · 권한 (기능 · 권한 · 역할 · 메뉴 · 이력)
   서버(access 패키지)와 같은 규칙:
   · 기능 = 화면 하나 · 단추 하나 (코드가 정한다), 권한 = 기능의 묶음, 역할 = 권한의 묶음, 사람 ↔ 역할 여러 개
   · 관리자 역할은 시스템 역할(모든 기능 · 잠김), '계정 · 권한 관리' 권한은 잠김, 시스템관리 기능은 그 권한에만
   · 처리 · 단추를 넣으면 그 화면의 보기도 함께 · 메뉴에서 여는 권한을 떼면 그 화면의 보기 · 처리 · 단추가 빠진다
   · 저장마다 이력 한 줄(그때 상태 전체) + 권한 버전 + 1 → 화면이 내 정보를 다시 받는다
   ⚠ 목이라 메모리에만 있다 — 새로고침하면 처음 값으로 돌아간다.
   ============================================================ */

import { LOGIN_ONLY_SCREENS, menuSections } from "../app/menuConfig";
import type { AccessUser, MenuGroup } from "../app/access";
import type {
  FeatureKind,
  HistKind,
  HistView,
  ModuleView,
  PermissionKind,
  PermissionView,
  RoleView,
  Saved,
  ScreenView,
  UserAccessView
} from "./accessApi";

type AnyRecord = Record<string, any>;

export type MockFeature = { code: string; menuCode: string; action: string; kind: FeatureKind; name: string; label: string };

/* ---------- 기능 목록 (서버 AccessCatalog 와 같다) ---------- */

const WORK: Record<string, string> = {
  "inbound/inbound-schedule": "등록 · 수정 · 가져오기",
  "inbound/inbound-confirm": "도착 · 지정 · 검수 · 확정",
  "inbound/return-confirm": "승인 · 반려",
  "stock/putaway": "격납",
  "stock/replenishment": "보충",
  "stock/transfer": "이동",
  "stock/stock-monthly": "월말 재고 찍기",
  "stock/stocktaking": "실사 반영 · 재고 조정",
  "outbound/manual-order": "등록",
  "outbound/picking": "피킹",
  "outbound/change-review": "승인 · 거절",
  "outbound/outbound-confirm": "출고확정 · 보류 · 다시 출고",
  "outbound/outbound-photo": "사진 올리기 · 고치기",
  "dispatch/dispatch-metro": "차량 추천 · 배송사 배정",
  "dispatch/dispatch-regional": "차량 추천 · 배송사 배정",
  "master/item-master": "수정",
  "master/location-master": "수정 · 3D 배치 게시",
  "master/carrier-master": "수정",
  "master/stock-policy": "수정",
  "system/users": "관리",
  "system/menus": "관리",
  "system/permissions": "관리"
};

const BUTTONS: Record<string, Array<[string, string]>> = {
  "inbound/inbound-schedule": [["close", "남은 수량 닫기"]],
  "outbound/outbound-order": [["delivery-edit", "출고일 · 인수자 변경"]],
  "outbound/change-review": [["link", "운영 전환 · 다시 보내기"]],
  "outbound/outbound-photo": [["manage", "지난 날 · 남의 사진 고치기"]],
  "master/item-master": [["import", "엑셀 가져오기"]]
};

export const FEATURES: MockFeature[] = menuSections.flatMap((section) =>
  section.features.flatMap((screen) => {
    const code = `${section.slug}/${screen.slug}`;
    if (LOGIN_ONLY_SCREENS.has(code)) return [];
    const list: MockFeature[] = [{ code: `${code}:view`, menuCode: code, action: "view", kind: "VIEW", name: `${screen.label} · 보기`, label: "보기" }];
    if (WORK[code]) list.push({ code: `${code}:work`, menuCode: code, action: "work", kind: "WORK", name: `${screen.label} · 처리`, label: WORK[code] });
    for (const [action, name] of BUTTONS[code] ?? []) {
      list.push({ code: `${code}:${action}`, menuCode: code, action, kind: "BUTTON", name: `${screen.label} · ${name}`, label: name });
    }
    return list;
  })
);
const FEATURE = new Map(FEATURES.map((f) => [f.code, f]));
const ORDER = new Map(FEATURES.map((f, i) => [f.code, i]));
const isSystemFeature = (code: string) => code.startsWith("system/");
const viewOf = (menuCode: string) => `${menuCode}:view`;
const inOrder = (codes: Iterable<string>) => [...new Set(codes)].filter((c) => FEATURE.has(c)).sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);

/* ---------- 처음 권한 22개 · 역할 10개 (서버 DDL 2026-10-29 와 같다) ---------- */

const views = (...screens: string[]) => screens.map(viewOf);
const viewWork = (...screens: string[]) => screens.flatMap((s) => [viewOf(s), `${s}:work`]);

type MPerm = Omit<PermissionView, "roleCodes" | "userCount">;
type MRole = Omit<RoleView, "userCount">;
type MMenu = { id: number; code: string; parentId: number | null; name: string; order: number; active: boolean; loginOnly: boolean; updatedAt: string | null; updatedBy: string | null };

const SEED_AT = "2026-06-01 09:00";
const perm = (code: string, name: string, module: string, kind: PermissionKind, order: number, featureCodes: string[], system = false): MPerm => ({
  code, name, description: null, module, kind, system, active: true, order, featureCodes: inOrder(featureCodes),
  createdAt: SEED_AT, createdBy: "system", updatedAt: null, updatedBy: null
});

const seedPermissions = (): MPerm[] => [
  perm("WMS_DASHBOARD_VIEW", "현황 보기", "대시보드", "VIEW", 10, views("dashboard/logistics-status", "dashboard/inbound-status", "dashboard/outbound-status", "dashboard/stock-status", "dashboard/work-alerts", "dashboard/floor-board")),
  perm("WMS_INBOUND_VIEW", "입고 보기", "입고", "VIEW", 20, views("inbound/inbound-schedule", "inbound/inbound-confirm")),
  perm("WMS_INBOUND_PLAN", "입고예정 관리", "입고", "WORK", 21, [...viewWork("inbound/inbound-schedule"), "inbound/inbound-schedule:close"]),
  perm("WMS_INBOUND_WORK", "입고 처리", "입고", "WORK", 22, viewWork("inbound/inbound-confirm")),
  perm("WMS_RETURN_WORK", "반품 처리", "입고", "WORK", 23, viewWork("inbound/return-confirm")),
  perm("WMS_STOCK_VIEW", "재고 보기", "재고", "VIEW", 30, views("stock/fifo-status", "stock/stock-realtime", "stock/stock-available", "stock/erp-compare", "stock/stock-monthly", "stock/barcode-lookup")),
  perm("WMS_STOCK_WORK", "재고 처리", "재고", "WORK", 31, viewWork("stock/putaway", "stock/replenishment", "stock/transfer")),
  perm("WMS_STOCK_ADJUST", "재고 조정", "재고", "SPECIAL", 32, viewWork("stock/stocktaking", "stock/stock-monthly")),
  perm("WMS_OUTBOUND_VIEW", "출고 보기", "출고", "VIEW", 40, views("outbound/outbound-order", "outbound/delivery-note")),
  perm("WMS_OUTBOUND_WORK", "출고 처리", "출고", "WORK", 41, viewWork("outbound/picking", "outbound/outbound-confirm", "outbound/outbound-photo")),
  perm("WMS_OUTBOUND_DELIVERY_EDIT", "출고일 · 인수자 변경", "출고", "SPECIAL", 42, [viewOf("outbound/outbound-order"), "outbound/outbound-order:delivery-edit"]),
  perm("WMS_OMS_LINK_MANAGE", "주문 연동 관리", "출고", "SPECIAL", 43, [...viewWork("outbound/change-review"), "outbound/change-review:link"]),
  perm("WMS_MANUAL_ORDER", "비운영 주문", "출고", "SPECIAL", 44, viewWork("outbound/manual-order")),
  perm("WMS_OUTBOUND_PHOTO_MANAGE", "출고 사진 관리", "출고", "SPECIAL", 45, [...viewWork("outbound/outbound-photo"), "outbound/outbound-photo:manage"]),
  perm("WMS_DISPATCH_VIEW", "배차 보기", "배차", "VIEW", 50, views("dispatch/dispatch-metro", "dispatch/dispatch-regional")),
  perm("WMS_DISPATCH_WORK", "배차 처리", "배차", "WORK", 51, viewWork("dispatch/dispatch-metro", "dispatch/dispatch-regional")),
  perm("WMS_MASTER_VIEW", "기준정보 보기", "기준정보", "VIEW", 60, views("master/item-master", "master/location-master", "master/carrier-master", "master/stock-policy")),
  perm("WMS_MASTER_EDIT", "기준정보 수정", "기준정보", "WORK", 61, viewWork("master/item-master", "master/location-master", "master/carrier-master", "master/stock-policy")),
  perm("WMS_ITEM_IMPORT", "품목 가져오기", "기준정보", "SPECIAL", 62, [viewOf("master/item-master"), "master/item-master:import"]),
  perm("WMS_REPORT_VIEW", "분석 · 이력 보기", "분석 · 이력", "VIEW", 70, views("analytics/inbound-summary", "analytics/outbound-summary", "analytics/progress", "analytics/shortage", "analytics/aging-stock", "history/inbound-history", "history/transfer-history", "history/outbound-history", "communication/ai-chatbot")),
  perm("WMS_SYSTEM_LOG_VIEW", "전체 로그 보기", "분석 · 이력", "SPECIAL", 71, views("history/system-logs")),
  perm("WMS_ACCOUNT_MANAGE", "계정 · 권한 관리", "시스템", "SPECIAL", 80, viewWork("system/users", "system/menus", "system/permissions"), true)
];

const VIEWERS = ["WMS_DASHBOARD_VIEW", "WMS_INBOUND_VIEW", "WMS_STOCK_VIEW", "WMS_OUTBOUND_VIEW", "WMS_DISPATCH_VIEW", "WMS_MASTER_VIEW", "WMS_REPORT_VIEW"];
const role = (id: number, code: string, name: string, description: string, permissionCodes: string[], extra: Partial<MRole> = {}): MRole => ({
  id, code, name, description, system: false, outside: false, active: true, order: id * 10, permissionCodes: [...permissionCodes].sort(),
  createdAt: SEED_AT, createdBy: "system", updatedAt: null, updatedBy: null, ...extra
});

const seedRoles = (): MRole[] => [
  role(1, "admin", "관리자", "모든 기능 · 시스템 역할이라 지우거나 바꿀 수 없음", [], { system: true }),
  role(2, "logistics", "물류팀", "물류 전체 · 입고 · 재고 · 출고 · 배차 · 기준정보", ["WMS_DASHBOARD_VIEW", "WMS_INBOUND_VIEW", "WMS_INBOUND_PLAN", "WMS_INBOUND_WORK", "WMS_RETURN_WORK", "WMS_STOCK_VIEW", "WMS_STOCK_WORK", "WMS_STOCK_ADJUST", "WMS_OUTBOUND_VIEW", "WMS_OUTBOUND_WORK", "WMS_OUTBOUND_DELIVERY_EDIT", "WMS_OUTBOUND_PHOTO_MANAGE", "WMS_OMS_LINK_MANAGE", "WMS_MANUAL_ORDER", "WMS_DISPATCH_VIEW", "WMS_DISPATCH_WORK", "WMS_MASTER_VIEW", "WMS_MASTER_EDIT", "WMS_REPORT_VIEW", "WMS_SYSTEM_LOG_VIEW"]),
  role(3, "inbound", "입고 담당", "입고예정 · 도착 · 검수 · 입고확정 · 격납", ["WMS_DASHBOARD_VIEW", "WMS_INBOUND_VIEW", "WMS_INBOUND_PLAN", "WMS_INBOUND_WORK", "WMS_STOCK_VIEW", "WMS_STOCK_WORK", "WMS_MASTER_VIEW", "WMS_REPORT_VIEW"]),
  role(4, "outbound", "출고 담당", "피킹 · 출고확정 · 출고일 · 인수자 · 배차", ["WMS_DASHBOARD_VIEW", "WMS_OUTBOUND_VIEW", "WMS_OUTBOUND_WORK", "WMS_OUTBOUND_DELIVERY_EDIT", "WMS_DISPATCH_VIEW", "WMS_DISPATCH_WORK", "WMS_STOCK_VIEW", "WMS_MASTER_VIEW", "WMS_REPORT_VIEW"]),
  role(5, "inventory", "재고 담당", "격납 · 보충 · 이동 · 실사", ["WMS_DASHBOARD_VIEW", "WMS_STOCK_VIEW", "WMS_STOCK_WORK", "WMS_STOCK_ADJUST", "WMS_MASTER_VIEW", "WMS_REPORT_VIEW"]),
  role(6, "sourcing", "소싱팀", "입고예정 넣기 · 고치기 · 남은 수량 닫기", ["WMS_DASHBOARD_VIEW", "WMS_INBOUND_VIEW", "WMS_INBOUND_PLAN", "WMS_STOCK_VIEW", "WMS_MASTER_VIEW", "WMS_REPORT_VIEW"]),
  role(7, "partner", "배송사", "바깥 사람 · 배차 보기 · 자기 건만(범위는 나중)", ["WMS_DISPATCH_VIEW"], { outside: true }),
  role(8, "sales", "영업팀", "보기만 · 전체 로그 빼고", VIEWERS),
  role(9, "cs", "CS팀", "보기만 · 전체 로그 빼고", VIEWERS),
  role(10, "purchase", "구매팀", "보기만 · 전체 로그 빼고", VIEWERS)
];

const seedMenus = (): MMenu[] => {
  const menus: MMenu[] = [];
  let id = 1;
  menuSections.forEach((section, i) => {
    const moduleId = id++;
    menus.push({ id: moduleId, code: section.slug, parentId: null, name: section.label, order: (i + 1) * 100, active: true, loginOnly: false, updatedAt: null, updatedBy: null });
    section.features.forEach((screen, j) => {
      const code = `${section.slug}/${screen.slug}`;
      menus.push({ id: id++, code, parentId: moduleId, name: screen.label, order: (j + 1) * 10, active: true, loginOnly: LOGIN_ONLY_SCREENS.has(code), updatedAt: null, updatedBy: null });
    });
  });
  return menus;
};

/* ---------- 상태 ---------- */

type Hist = { kind: HistKind; histId: number; ref: string; targetKey: string; targetName: string | null; active: boolean | null; items: string[]; parentId?: number | null; order?: number; changedBy: string; changedAt: string };

export type AccessMockCtx = {
  /** 지금 로그인한 아이디 */
  me: () => string | undefined;
  now: () => string;
  /** 아이디 → 이름 (이력 · 가진 것 보기) */
  nameOf: (userId: string) => string | undefined;
};

export function createAccessMock(ctx: AccessMockCtx, initialUserRoles: Record<string, string[]>) {
  let permissions = seedPermissions();
  let roles = seedRoles();
  let menus = seedMenus();
  const userRoles: Record<string, string[]> = Object.fromEntries(Object.entries(initialUserRoles).map(([k, v]) => [k, [...v]]));
  let version = 1;
  let histSeq = 0;
  const hist: Hist[] = [];

  const actor = () => ctx.me() ?? "system";
  const push = (h: Omit<Hist, "histId" | "changedAt" | "changedBy"> & { changedBy?: string }) =>
    hist.push({ ...h, histId: ++histSeq, changedBy: h.changedBy ?? actor(), changedAt: h.changedBy === "system" ? SEED_AT : ctx.now() });
  const permHist = (p: MPerm, by?: string) => push({ kind: "permission", ref: p.code, targetKey: p.code, targetName: p.name, active: p.active, items: [...p.featureCodes].sort(), changedBy: by });
  const roleHist = (r: MRole, by?: string) => push({ kind: "role", ref: String(r.id), targetKey: r.code, targetName: r.name, active: r.active, items: r.system ? ["*"] : [...r.permissionCodes].sort(), changedBy: by });
  const userHist = (userId: string, by?: string) => push({ kind: "user", ref: userId, targetKey: userId, targetName: ctx.nameOf(userId) ?? null, active: null, items: rolesOfUser(userId), changedBy: by });
  const menuHist = (m: MMenu, by?: string) => push({ kind: "menu", ref: String(m.id), targetKey: m.code, targetName: m.name, active: m.active, items: [], parentId: m.parentId, order: m.order, changedBy: by });

  const saved = (key: string): Saved => ({ changed: true, authVersion: ++version, key });
  const unchanged = (key: string): Saved => ({ changed: false, authVersion: version, key });

  function roleByCode(code: string) {
    return roles.find((r) => r.code === code);
  }
  function permByCode(code: string) {
    return permissions.find((p) => p.code === code);
  }
  function rolesOfUser(userId: string) {
    return (userRoles[userId] ?? []).filter((c) => roleByCode(c)).sort((a, b) => roleByCode(a)!.order - roleByCode(b)!.order);
  }
  const activeRoles = (codes: string[]) => roles.filter((r) => r.active && codes.includes(r.code));

  // 처음 값도 이력에 한 줄씩 (수정자 system)
  permissions.forEach((p) => permHist(p, "system"));
  roles.forEach((r) => roleHist(r, "system"));
  Object.keys(userRoles).forEach((u) => userHist(u, "system"));
  menus.forEach((m) => menuHist(m, "system"));

  const featuresOf = (codes: string[]): string[] => {
    const rs = activeRoles(codes);
    if (rs.some((r) => r.system)) return FEATURES.map((f) => f.code);
    const set = new Set<string>();
    for (const r of rs) for (const pc of r.permissionCodes) {
      const p = permByCode(pc);
      if (p?.active) p.featureCodes.forEach((f) => set.add(f));
    }
    return inOrder(set);
  };
  const permissionsOf = (codes: string[]) => {
    const rs = activeRoles(codes);
    if (rs.some((r) => r.system)) return permissions.filter((p) => p.active).map((p) => p.code);
    return permissions.filter((p) => p.active && rs.some((r) => r.permissionCodes.includes(p.code))).map((p) => p.code);
  };
  const byOrder = <T extends { order: number; id: number }>(a: T, b: T) => a.order - b.order || a.id - b.id;
  const menusFor = (features: string[]): MenuGroup[] => {
    const has = new Set(features);
    return menus
      .filter((m) => m.parentId === null && m.active)
      .sort(byOrder)
      .map((m) => ({
        id: m.id, code: m.code, name: m.name, order: m.order,
        screens: menus
          .filter((s) => s.parentId === m.id && s.active && (s.loginOnly || has.has(viewOf(s.code))))
          .sort(byOrder)
          .map((s) => ({ id: s.id, code: s.code, name: s.name, order: s.order }))
      }))
      .filter((g) => g.screens.length > 0);
  };

  const me = (userId: string, name: string, mustChangePassword: boolean): AccessUser => {
    const codes = rolesOfUser(userId);
    const features = featuresOf(codes);
    return {
      id: userId,
      name,
      mustChangePassword,
      roles: activeRoles(codes).sort((a, b) => a.order - b.order).map((r) => ({ code: r.code, name: r.name })),
      permissions: permissionsOf(codes),
      features,
      menus: menusFor(features),
      authVersion: version,
      admin: activeRoles(codes).some((r) => r.system)
    };
  };

  /** 지금 로그인한 사람에게 이 기능이 있나 (데모의 서버 검사) */
  const can = (...features: string[]) => {
    const mine = new Set(featuresOf(rolesOfUser(ctx.me() ?? "")));
    return features.some((f) => mine.has(f));
  };
  const requireFeature = (...features: string[]) => {
    if (!can(...features)) throw new Error(`${FEATURE.get(features[0])?.name ?? "이 일"} 권한이 없습니다.`);
  };

  /* ---------- 검사 도우미 (서버 AccessAdminService 와 같은 문구) ---------- */

  const nameCheck = (raw: unknown, what: string) => {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!name) throw new Error(`${what} 이름을 넣으세요.`);
    if (name.length > 50) throw new Error(`${what} 이름은 50자까지입니다.`);
    return name;
  };
  const descCheck = (raw: unknown) => {
    const text = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (text.length > 200) throw new Error("설명은 200자까지입니다.");
    return text || null;
  };
  const featuresCheck = (codes: unknown, strict = true): string[] => {
    const wanted = new Set<string>();
    for (const raw of (Array.isArray(codes) ? codes : []) as string[]) {
      const f = FEATURE.get(String(raw).trim());
      if (!f) {
        if (strict) throw new Error(`모르는 기능입니다: ${raw}`);
        continue;
      }
      if (strict && isSystemFeature(f.code)) throw new Error("사용자 · 메뉴 · 권한 관리 기능은 '계정 · 권한 관리' 권한에만 담을 수 있습니다.");
      wanted.add(f.code);
      if (f.kind !== "VIEW") wanted.add(viewOf(f.menuCode));
    }
    return inOrder(wanted);
  };
  const rolePermsCheck = (codes: unknown, before: string[]) => {
    const result = new Set<string>();
    for (const raw of (Array.isArray(codes) ? codes : []) as string[]) {
      const p = permByCode(String(raw).trim());
      if (!p) throw new Error(`모르는 권한입니다: ${raw}`);
      if (p.system) throw new Error("'계정 · 권한 관리' 권한은 관리자 역할에만 넣을 수 있습니다.");
      if (!p.active && !before.includes(p.code)) throw new Error(`사용 안 하는 권한은 넣을 수 없습니다: ${p.name}`);
      result.add(p.code);
    }
    return [...result].sort();
  };
  const MODULE_LABEL: Record<string, string> = { dashboard: "대시보드", inbound: "입고", stock: "재고", outbound: "출고", dispatch: "배차", master: "기준정보", analytics: "분석 · 이력", history: "분석 · 이력", communication: "분석 · 이력", system: "시스템" };
  const moduleOf = (raw: unknown, features: string[]) => {
    const m = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (m) {
      if (m.length > 30) throw new Error("모듈 이름은 30자까지입니다.");
      return m;
    }
    const first = FEATURE.get(features[0] ?? "");
    return MODULE_LABEL[first?.menuCode.split("/")[0] ?? ""] ?? "직접 만든 권한";
  };
  const kindOf = (raw: unknown, features: string[]): PermissionKind => {
    const k = String(raw ?? "").trim().toUpperCase();
    if (k === "VIEW" || k === "WORK" || k === "SPECIAL") return k;
    if (k) throw new Error("구분은 VIEW(보기) · WORK(처리) · SPECIAL(따로) 중 하나입니다.");
    return features.every((f) => f.endsWith(":view")) ? "VIEW" : "WORK";
  };
  const isSystemMenu = (code: string) => code === "system" || code.startsWith("system/");

  /* ---------- 사람 ↔ 역할 (사용자 관리 목이 부른다) ---------- */

  const roleCodesCheck = (raw: unknown): string[] => {
    const codes: string[] = [];
    for (const r of (Array.isArray(raw) ? raw : []) as string[]) {
      const code = String(r ?? "").trim().toLowerCase();
      if (!code) continue;
      const found = roleByCode(code);
      if (!found) throw new Error(`모르는 역할입니다: ${r}`);
      if (!found.active) throw new Error(`사용 안 하는 역할입니다: ${found.name}`);
      if (!codes.includes(code)) codes.push(code);
    }
    if (!codes.length) throw new Error("역할을 하나 이상 고르세요.");
    return codes;
  };
  const activeAdminCount = (isLocked: (userId: string) => boolean) =>
    Object.keys(userRoles).filter((u) => !isLocked(u) && rolesOfUser(u).some((c) => roleByCode(c)?.system && roleByCode(c)?.active)).length;
  const isAdmin = (userId: string) => rolesOfUser(userId).some((c) => roleByCode(c)?.system && roleByCode(c)?.active);

  const setUserRoles = (userId: string, raw: unknown, opts: { newAccount: boolean; locked: boolean; isLocked: (u: string) => boolean }) => {
    const codes = roleCodesCheck(raw);
    const before = rolesOfUser(userId);
    if (!opts.newAccount && [...before].sort().join() === [...codes].sort().join()) return false;
    if (!opts.newAccount) {
      if ((ctx.me() ?? "").toLowerCase() === userId.toLowerCase()) throw new Error("내 역할은 바꿀 수 없습니다 — 다른 관리자에게 부탁하세요.");
      const willBeAdmin = codes.some((c) => roleByCode(c)?.system);
      if (isAdmin(userId) && !willBeAdmin && !opts.locked && activeAdminCount(opts.isLocked) <= 1) {
        throw new Error("마지막 관리자입니다 — 다른 관리자 계정을 먼저 만들어 두세요.");
      }
    }
    userRoles[userId] = codes;
    userHist(userId);
    version++;
    return true;
  };

  /* ---------- 관리 화면 보기 ---------- */

  const roleViews = (): RoleView[] =>
    [...roles].sort((a, b) => a.order - b.order || a.id - b.id).map((r) => ({
      ...r,
      permissionCodes: [...r.permissionCodes].sort((a, b) => (permByCode(a)?.order ?? 999) - (permByCode(b)?.order ?? 999)),
      userCount: Object.values(userRoles).filter((codes) => codes.includes(r.code)).length
    }));

  const permissionViews = (): PermissionView[] =>
    [...permissions].sort((a, b) => a.order - b.order).map((p) => {
      const using = roles.filter((r) => r.permissionCodes.includes(p.code));
      const people = new Set(Object.entries(userRoles).filter(([, codes]) => using.some((r) => r.active && codes.includes(r.code))).map(([u]) => u));
      return { ...p, featureCodes: inOrder(p.featureCodes), roleCodes: using.sort((a, b) => a.order - b.order).map((r) => r.code), userCount: people.size };
    });

  const menuViews = (): ModuleView[] => {
    const openers = (screenCode: string) => permissions.filter((p) => p.featureCodes.includes(viewOf(screenCode))).map((p) => p.code);
    const own = (code: string) => menuSections.find((s) => s.slug === code);
    const screenName = (code: string) => {
      const [sec, slug] = code.split("/");
      return own(sec)?.features.find((f) => f.slug === slug)?.label ?? null;
    };
    return menus
      .filter((m) => m.parentId === null)
      .sort(byOrder)
      .map((m) => ({
        id: m.id, code: m.code, name: m.name, defaultName: own(m.code)?.label ?? null, order: m.order, active: m.active,
        system: isSystemMenu(m.code), custom: !own(m.code), updatedAt: m.updatedAt, updatedBy: m.updatedBy,
        screens: menus
          .filter((s) => s.parentId === m.id)
          .sort(byOrder)
          .map((s): ScreenView => ({
            id: s.id, code: s.code, parentId: s.parentId, name: s.name, defaultName: screenName(s.code), order: s.order, active: s.active,
            loginOnly: s.loginOnly, system: isSystemMenu(s.code),
            features: FEATURES.filter((f) => f.menuCode === s.code).map((f) => ({ code: f.code, action: f.action, kind: f.kind, name: f.name, label: f.label })),
            openers: openers(s.code), updatedAt: s.updatedAt, updatedBy: s.updatedBy
          }))
      }));
  };

  const userAccess = (userId: string): UserAccessView => {
    const codes = rolesOfUser(userId);
    const rs = activeRoles(codes);
    const admin = rs.some((r) => r.system);
    const features = featuresOf(codes);
    return {
      id: userId,
      name: ctx.nameOf(userId) ?? userId,
      roles: rs.sort((a, b) => a.order - b.order).map((r) => ({ code: r.code, name: r.name })),
      permissions: permissionsOf(codes).map((pc) => ({
        code: pc,
        name: permByCode(pc)?.name ?? pc,
        viaRoles: admin ? rs.filter((r) => r.system).map((r) => r.code) : rs.filter((r) => r.permissionCodes.includes(pc)).map((r) => r.code)
      })),
      features,
      menus: menusFor(features),
      admin
    };
  };

  /** 이력 — 같은 대상의 바로 앞 줄과 비교 (새것부터) */
  const histViews = (rows: Hist[]): HistView[] =>
    rows
      .map((h) => {
        const prev = [...hist].reverse().find((x) => x.kind === h.kind && x.ref === h.ref && x.histId < h.histId);
        const first = !prev;
        const notes: string[] = [];
        if (first) notes.push("처음");
        else if (h.kind === "menu") {
          if (prev.targetName !== h.targetName) notes.push(`이름 ${prev.targetName} → ${h.targetName}`);
          if (prev.active !== h.active) notes.push(h.active ? "다시 보임" : "숨김");
          if (prev.parentId !== h.parentId) notes.push("모듈 옮김");
          if (prev.order !== h.order) notes.push(`순서 ${prev.order} → ${h.order}`);
        } else {
          if (prev.targetName && h.targetName && prev.targetName !== h.targetName) notes.push(`이름 ${prev.targetName} → ${h.targetName}`);
          if (prev.active != null && h.active != null && prev.active !== h.active) notes.push(h.active ? "다시 사용" : "사용 안 함");
        }
        return {
          kind: h.kind, histId: h.histId, targetKey: h.targetKey, targetName: h.targetName, changedBy: h.changedBy, changedAt: h.changedAt,
          first, active: h.active, items: h.items,
          added: first ? [] : h.items.filter((i) => !prev.items.includes(i)),
          removed: first ? [] : prev.items.filter((i) => !h.items.includes(i)),
          notes
        };
      })
      .sort((a, b) => b.histId - a.histId);

  /* ---------- 저장 ---------- */

  const createRole = (body: AnyRecord): Saved => {
    const name = nameCheck(body.name, "역할");
    if (roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new Error(`이미 있는 역할 이름입니다: ${name}`);
    let perms: string[];
    if (body.permissionCodes == null && body.copyFrom != null) {
      const from = roles.find((r) => r.id === Number(body.copyFrom));
      if (!from) throw new Error("복사할 역할을 찾을 수 없습니다.");
      if (from.system) throw new Error("관리자 역할은 복사할 수 없습니다 — 권한 목록이 아니라 '모든 기능' 입니다.");
      perms = from.permissionCodes.filter((pc) => permByCode(pc)?.active && !permByCode(pc)?.system);
    } else perms = rolePermsCheck(body.permissionCodes, []);
    const id = Math.max(...roles.map((r) => r.id)) + 1;
    const created: MRole = role(id, `role_${String(id).padStart(3, "0")}`, name, descCheck(body.description) ?? "", perms, {
      description: descCheck(body.description), outside: Boolean(body.outside), order: Math.max(...roles.map((r) => r.order)) + 10,
      createdAt: ctx.now(), createdBy: actor()
    });
    roles.push(created);
    roleHist(created);
    return saved(created.code);
  };

  const updateRole = (id: number, body: AnyRecord): Saved => {
    const r = roles.find((x) => x.id === id);
    if (!r) throw new Error("역할을 찾을 수 없습니다.");
    if (r.system) throw new Error("관리자 역할은 시스템 역할이라 바꿀 수 없습니다 — 늘 모든 기능을 갖습니다.");
    const name = body.name == null ? r.name : nameCheck(body.name, "역할");
    if (name !== r.name && roles.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) throw new Error(`이미 있는 역할 이름입니다: ${name}`);
    const next: MRole = {
      ...r, name,
      description: body.description == null ? r.description : descCheck(body.description),
      outside: body.outside == null ? r.outside : Boolean(body.outside),
      active: body.active == null ? r.active : Boolean(body.active),
      order: body.sortOrder == null ? r.order : Number(body.sortOrder),
      permissionCodes: body.permissionCodes == null ? r.permissionCodes : rolePermsCheck(body.permissionCodes, r.permissionCodes)
    };
    const same = JSON.stringify({ ...next, updatedAt: null, updatedBy: null }) === JSON.stringify({ ...r, updatedAt: null, updatedBy: null });
    if (same) return unchanged(r.code);
    next.updatedAt = ctx.now();
    next.updatedBy = actor();
    roles = roles.map((x) => (x.id === id ? next : x));
    if (r.active && !next.active) {
      for (const [u, codes] of Object.entries(userRoles)) if (codes.includes(r.code)) {
        userRoles[u] = codes.filter((c) => c !== r.code);
        userHist(u);
      }
    }
    roleHist(next);
    return saved(next.code);
  };

  const createPermission = (body: AnyRecord): Saved => {
    const name = nameCheck(body.name, "권한");
    if (permissions.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error(`이미 있는 권한 이름입니다: ${name}`);
    let features: string[];
    if (body.featureCodes == null && body.copyFrom != null) {
      const from = permByCode(String(body.copyFrom));
      if (!from) throw new Error("복사할 권한을 찾을 수 없습니다.");
      if (from.system) throw new Error("'계정 · 권한 관리' 는 복사할 수 없습니다 — 시스템 권한입니다.");
      features = featuresCheck(from.featureCodes);
    } else features = featuresCheck(body.featureCodes);
    if (!features.length) throw new Error("기능을 하나 이상 고르세요.");
    let n = Math.max(permissions.length, ...permissions.map((p) => Number(p.code.match(/^WMS_P_(\d+)$/)?.[1] ?? 0))) + 1;
    while (permByCode(`WMS_P_${String(n).padStart(3, "0")}`)) n++;
    const code = `WMS_P_${String(n).padStart(3, "0")}`;
    const created: MPerm = {
      ...perm(code, name, moduleOf(body.module, features), kindOf(body.kind, features), Math.max(...permissions.map((p) => p.order)) + 1, features),
      description: descCheck(body.description), createdAt: ctx.now(), createdBy: actor()
    };
    permissions.push(created);
    permHist(created);
    return saved(code);
  };

  const updatePermission = (code: string, body: AnyRecord): Saved => {
    const p = permByCode(code);
    if (!p) throw new Error(`권한을 찾을 수 없습니다: ${code}`);
    if (p.system) throw new Error("'계정 · 권한 관리' 는 시스템 권한이라 바꿀 수 없습니다 — 관리자 역할만 갖습니다.");
    const name = body.name == null ? p.name : nameCheck(body.name, "권한");
    if (name !== p.name && permissions.some((x) => x.code !== code && x.name.toLowerCase() === name.toLowerCase())) throw new Error(`이미 있는 권한 이름입니다: ${name}`);
    const features = body.featureCodes == null ? p.featureCodes : featuresCheck(body.featureCodes);
    const active = body.active == null ? p.active : Boolean(body.active);
    if (active && !features.length) throw new Error("기능을 하나 이상 고르세요 — 쓰지 않을 권한은 '사용 안 함' 으로.");
    const next: MPerm = {
      ...p, name, active, featureCodes: features,
      description: body.description == null ? p.description : descCheck(body.description),
      module: body.module == null ? p.module : moduleOf(body.module, features),
      kind: body.kind == null ? p.kind : kindOf(body.kind, features)
    };
    const same = JSON.stringify({ ...next, updatedAt: null, updatedBy: null }) === JSON.stringify({ ...p, updatedAt: null, updatedBy: null });
    if (same) return unchanged(code);
    next.updatedAt = ctx.now();
    next.updatedBy = actor();
    permissions = permissions.map((x) => (x.code === code ? next : x));
    if (p.active && !active) {
      roles = roles.map((r) => {
        if (!r.permissionCodes.includes(code)) return r;
        const changed = { ...r, permissionCodes: r.permissionCodes.filter((c) => c !== code) };
        roleHist(changed);
        return changed;
      });
    }
    permHist(next);
    return saved(code);
  };

  const updateMenu = (id: number, body: AnyRecord): Saved => {
    const m = menus.find((x) => x.id === id);
    if (!m) throw new Error("메뉴를 찾을 수 없습니다.");
    const isModule = m.parentId === null;
    const system = isSystemMenu(m.code);
    const name = body.name == null ? m.name : nameCheck(body.name, "메뉴");
    const order = body.sortOrder == null ? m.order : Number(body.sortOrder);
    if (!Number.isInteger(order) || order < 0 || order > 99999) throw new Error("순서는 0 ~ 99999 사이 숫자입니다.");
    const active = body.active == null ? m.active : Boolean(body.active);
    let parentId = m.parentId;
    if (isModule && body.parentId != null) throw new Error("모듈은 다른 모듈 안에 넣을 수 없습니다.");
    if (!isModule && body.parentId != null && Number(body.parentId) !== m.parentId) {
      const target = menus.find((x) => x.id === Number(body.parentId));
      if (!target || target.parentId !== null) throw new Error("옮길 모듈을 고르세요.");
      if (system || isSystemMenu(target.code)) throw new Error("시스템관리 화면은 다른 모듈로 옮기지 않습니다 — 그 모듈로 옮겨 넣지도 않습니다.");
      parentId = target.id;
    }
    if (system && !active) throw new Error("시스템관리 메뉴는 숨길 수 없습니다 — 관리 화면에 다시 들어올 길이 없어집니다.");
    if (name === m.name && order === m.order && active === m.active && parentId === m.parentId) return unchanged(m.code);
    const next = { ...m, name, order, active, parentId, updatedAt: ctx.now(), updatedBy: actor() };
    menus = menus.map((x) => (x.id === id ? next : x));
    menuHist(next);
    return saved(next.code);
  };

  const createModule = (body: AnyRecord): Saved => {
    const name = nameCheck(body.name, "모듈");
    const n = Math.max(0, ...menus.map((m) => Number(m.code.match(/^group-(\d+)$/)?.[1] ?? 0))) + 1;
    const id = Math.max(...menus.map((m) => m.id)) + 1;
    const created: MMenu = {
      id, code: `group-${n}`, parentId: null, name, active: true, loginOnly: false,
      order: body.sortOrder != null ? Number(body.sortOrder) : Math.max(...menus.filter((m) => m.parentId === null).map((m) => m.order)) + 10,
      updatedAt: ctx.now(), updatedBy: actor()
    };
    menus.push(created);
    menuHist(created);
    return saved(String(id));
  };

  const setOpeners = (id: number, codes: unknown): Saved => {
    const m = menus.find((x) => x.id === id);
    if (!m) throw new Error("메뉴를 찾을 수 없습니다.");
    if (m.parentId === null) throw new Error("모듈이 아니라 화면을 고르세요.");
    if (m.loginOnly) throw new Error(`${m.name} 은 로그인만 보는 화면이라 여는 권한이 없습니다.`);
    if (isSystemMenu(m.code)) throw new Error("시스템관리 화면은 '계정 · 권한 관리' 권한만 엽니다 (잠김).");
    const wanted = new Set<string>();
    for (const raw of (Array.isArray(codes) ? codes : []) as string[]) {
      const p = permByCode(String(raw).trim());
      if (!p) throw new Error(`모르는 권한입니다: ${raw}`);
      if (p.system) throw new Error("'계정 · 권한 관리' 는 시스템 권한이라 바꿀 수 없습니다 — 관리자 역할만 갖습니다.");
      wanted.add(p.code);
    }
    const view = viewOf(m.code);
    const screenFeatures = FEATURES.filter((f) => f.menuCode === m.code).map((f) => f.code);
    let changed = 0;
    permissions = permissions.map((p) => {
      if (p.system || (!p.active && !wanted.has(p.code))) return p;
      const opens = p.featureCodes.includes(view);
      let features: string[] | null = null;
      if (wanted.has(p.code) && !opens) {
        if (!p.active) throw new Error(`사용 안 하는 권한에는 붙일 수 없습니다: ${p.name}`);
        features = inOrder([...p.featureCodes, view]);
      } else if (!wanted.has(p.code) && opens) {
        features = p.featureCodes.filter((f) => !screenFeatures.includes(f));
      }
      if (!features) return p;
      const next = { ...p, featureCodes: features, updatedAt: ctx.now(), updatedBy: actor() };
      permHist(next);
      changed++;
      return next;
    });
    return changed ? saved(m.code) : unchanged(m.code);
  };

  const messageOf = (s: Saved, yes: string) => (s.changed ? yes : "바뀐 것이 없습니다.");

  return {
    me,
    can,
    requireFeature,
    version: () => version,
    rolesOfUser,
    setUserRoles,
    checkRoles: roleCodesCheck,
    isAdmin,
    activeAdminCount,
    /** 계정 아이디가 바뀌거나 새로 생길 때 */
    forget: (userId: string) => {
      delete userRoles[userId];
    },

    get: (clean: string, params: URLSearchParams): unknown => {
      if (clean === "/access/roles") {
        requireFeature("system/permissions:view", "system/users:view");
        return roleViews();
      }
      if (clean === "/access/permissions") {
        requireFeature("system/permissions:view", "system/menus:view", "system/users:view");
        return permissionViews();
      }
      if (clean === "/access/menus") {
        requireFeature("system/menus:view", "system/permissions:view");
        return menuViews();
      }
      const menuHistory = clean.match(/^\/access\/menus\/(\d+)\/history$/);
      if (menuHistory) {
        requireFeature("system/menus:view");
        const id = Number(menuHistory[1]);
        const m = menus.find((x) => x.id === id);
        const prefix = m ? `${m.code}:` : "\u0000";
        const own = histViews(hist.filter((h) => h.kind === "menu" && h.ref === String(id)));
        const perms = histViews(hist.filter((h) => h.kind === "permission"))
          .filter((h) => h.added.some((f) => f.startsWith(prefix)) || h.removed.some((f) => f.startsWith(prefix)) || (h.first && h.items.some((f) => f.startsWith(prefix))));
        return [...own, ...perms].sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.histId - a.histId);
      }
      if (clean === "/access/history") {
        const kind = (params.get("kind") ?? "") as HistKind;
        if (!["permission", "role", "user", "menu"].includes(kind)) throw new Error("이력 종류는 permission · role · user · menu 중 하나입니다.");
        requireFeature(kind === "user" ? "system/users:view" : kind === "menu" ? "system/menus:view" : "system/permissions:view");
        const key = params.get("key");
        const limit = Number(params.get("limit") ?? 200) || 200;
        const ref = (h: Hist) => {
          if (!key) return true;
          if (kind === "role") return h.ref === key || h.targetKey === key;
          return h.ref === key || h.targetKey === key;
        };
        return histViews(hist.filter((h) => h.kind === kind && ref(h))).slice(0, limit);
      }
      const access = clean.match(/^\/accounts\/([^/]+)\/access$/);
      if (access) {
        requireFeature("system/users:view");
        const id = decodeURIComponent(access[1]).trim().toLowerCase();
        if (!ctx.nameOf(id)) throw new Error(`계정을 찾을 수 없습니다: ${id}`);
        return userAccess(id);
      }
      return undefined;
    },

    /** 저장 — [결과, 서버와 같은 메시지] */
    mutate: (method: string, clean: string, body: AnyRecord): [unknown, string] | undefined => {
      if (!clean.startsWith("/access/")) return undefined;
      if (method === "POST" && clean === "/access/roles") {
        requireFeature("system/permissions:work");
        return [createRole(body), "역할을 만들었습니다 — 사용자 관리에서 사람에게 주면 바로 적용됩니다."];
      }
      const roleMatch = clean.match(/^\/access\/roles\/(\d+)$/);
      if (method === "PUT" && roleMatch) {
        requireFeature("system/permissions:work");
        const s = updateRole(Number(roleMatch[1]), body);
        return [s, messageOf(s, "저장했습니다 — 이 역할을 가진 사람에게 바로 적용됩니다.")];
      }
      if (method === "POST" && clean === "/access/permissions") {
        requireFeature("system/permissions:work");
        return [createPermission(body), "권한을 만들었습니다 — 역할 탭에서 역할에 넣으면 바로 적용됩니다."];
      }
      const permMatch = clean.match(/^\/access\/permissions\/([^/]+)$/);
      if (method === "PUT" && permMatch) {
        requireFeature("system/permissions:work");
        const s = updatePermission(decodeURIComponent(permMatch[1]), body);
        return [s, messageOf(s, "저장했습니다 — 이 권한을 쓰는 역할에 바로 적용됩니다.")];
      }
      if (method === "POST" && clean === "/access/menus") {
        requireFeature("system/menus:work");
        return [createModule(body), "모듈을 만들었습니다 — 화면을 옮겨 담으세요."];
      }
      const openers = clean.match(/^\/access\/menus\/(\d+)\/openers$/);
      if (method === "PUT" && openers) {
        requireFeature("system/menus:work");
        const s = setOpeners(Number(openers[1]), body.permissionCodes);
        return [s, messageOf(s, "저장했습니다 — 이 화면을 여는 권한이 바뀌었습니다.")];
      }
      const menuMatch = clean.match(/^\/access\/menus\/(\d+)$/);
      if (method === "PUT" && menuMatch) {
        requireFeature("system/menus:work");
        const s = updateMenu(Number(menuMatch[1]), body);
        return [s, messageOf(s, "저장했습니다 — 메뉴가 바로 바뀝니다.")];
      }
      return undefined;
    }
  };
}

export type AccessMock = ReturnType<typeof createAccessMock>;

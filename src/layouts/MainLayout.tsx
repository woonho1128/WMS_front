import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { featurePath, findScreen, findSection, getMenuSections, recommendedFavorites, resolveScreenPath, sectionOfMenuPath } from "../app/menuConfig";
import { roleNames, useAccess } from "../app/access";
import { useUiStore } from "../app/store/uiStore";
import { useAuthStore } from "../app/store/authStore";
import { FAVORITES_KEY, useNavPrefsStore, type NavMode } from "../app/store/navPrefsStore";
import { SPLIT_MIN_QUERY, isMenuPath, useTabsStore } from "../app/store/tabsStore";
import { useMediaQuery } from "../shared/useMediaQuery";
import { USE_MOCK_API } from "../services/apiMode";
import { Icon } from "../components/ui/Icon";
import { WorkspaceTabs } from "../components/layout/WorkspaceTabs";
import { CategoryTabBar } from "../components/layout/CategoryTabBar";
import { SideMenu } from "../components/layout/SideMenu";
import { SplitView } from "../components/layout/SplitView";

/** 데모 — 다른 데모 계정으로 바꿔 들어가 메뉴 · 단추를 본다 (비밀번호는 데모 값) */
const DEMO_ACCOUNTS: Array<[string, string]> = [
  ["admin", "관리자"],
  ["logistics", "물류팀"],
  ["inbound", "입고 담당"],
  ["outbound", "출고 담당"],
  ["inventory", "재고 담당"],
  ["sourcing", "소싱팀"],
  ["sales", "영업팀"],
  ["partner", "배송사"]
];
const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches;

/** 헤더의 메뉴 방식 토글 (DOCS/WMS_메뉴방식_즐겨찾기_설계.md §1-2) */
const NAV_MODES: Array<{ mode: NavMode; label: string; icon: string; hint: string }> = [
  { mode: "list", label: "목록형", icon: "listMode", hint: "좌측에 화면 목록, 위에 연 화면 탭" },
  { mode: "tabs", label: "탭형", icon: "tabsMode", hint: "좌측에 카테고리만, 위에 그 카테고리의 화면 탭" }
];

export const MainLayout = () => {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const relogin = useAuthStore((state) => state.login);
  const access = useAccess();
  const openTab = useTabsStore((state) => state.openTab);
  const splitPath = useTabsStore((state) => state.splitPath);
  const openSplit = useTabsStore((state) => state.openSplit);
  const wideEnough = useMediaQuery(SPLIT_MIN_QUERY);
  const navMode = useNavPrefsStore((state) => state.navMode);
  const navSync = useNavPrefsStore((state) => state.sync);
  const favorites = useNavPrefsStore((state) => state.favorites);
  const activeCategory = useNavPrefsStore((state) => state.activeCategory);
  const lastScreenBySection = useNavPrefsStore((state) => state.lastScreenBySection);
  const setNavMode = useNavPrefsStore((state) => state.setNavMode);
  const toggleFavorite = useNavPrefsStore((state) => state.toggleFavorite);
  const reorderFavorite = useNavPrefsStore((state) => state.reorderFavorite);
  const fillFavorites = useNavPrefsStore((state) => state.fillFavorites);
  const setActiveCategory = useNavPrefsStore((state) => state.setActiveCategory);
  const recordVisit = useNavPrefsStore((state) => state.recordVisit);

  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // 화면 배치(메뉴 방식 · 즐겨찾기)는 로그인한 사람 것으로 navPrefsStore 가 이미 맞춰 두었다

  const userName = user?.name ?? "사용자";
  const roleText = access.admin ? "관리자 · 모든 기능" : roleNames(user?.roles);
  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };
  /** 데모 — 다른 데모 계정으로 바꿔 들어간다 */
  const switchDemoAccount = async (id: string) => {
    if (!id || id === user?.id) return;
    if (await relogin(id, "1234")) navigate("/", { replace: true });
  };

  // 메뉴는 서버가 준 대로 (관리자가 메뉴 관리에서 고친 이름 · 순서 · 모듈) — 권한이 바뀌면 다시 그려진다
  const allowedMenuSections = useMemo(() => getMenuSections(access), [access]);
  const [sectionSlug, featureSlug] = location.pathname.split("/").filter(Boolean);
  const currentSection = sectionOfMenuPath(allowedMenuSections, location.pathname);
  const currentFeature = currentSection?.features.find((feature) => featurePath(currentSection, feature) === location.pathname);
  const currentLabel = currentFeature?.label ?? findScreen(location.pathname)?.feature.label ?? currentSection?.label ?? "대시보드";

  // 경로 이동 시 모바일 드로어 닫기
  useEffect(() => {
    setMobileOpen(false);
  }, [sectionSlug, featureSlug]);

  // 화면을 열 때마다: 카테고리별 마지막 화면 · 최근 본 화면 · 탭형의 고른 칸
  const prevPath = useRef<string | null>(null);
  useEffect(() => {
    const path = location.pathname;
    const previous = prevPath.current;
    prevPath.current = path;
    recordVisit(path);
    // 탭형: 오른쪽 패널의 화면을 위 탭에서 고르면 좌우를 맞바꾼다 (목록형은 openTab 이 한다)
    if (navMode === "tabs" && splitPath === path && previous && previous !== path && isMenuPath(previous)) openSplit(previous);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // 목록형: 화면 이동 시 본문 상단 탭으로 등록(이미 있으면 유지). 좌측 메뉴 클릭 = 탭 열기.
  // 탭형에서는 등록하지 않는다 — 작업 탭은 그대로 두었다가 목록형으로 돌아오면 이어 쓴다
  // (카테고리 탭을 오가는 것만으로 작업 탭이 밀려나지 않게). 돌아오는 순간 지금 화면은 탭이 된다.
  useEffect(() => {
    if (navMode !== "list" || !sectionSlug) return;
    const source = findSection(sectionSlug);
    if (!source) return;
    const sourceFeature = featureSlug
      ? source.features.find((item) => item.slug === featureSlug)
      : undefined;
    if (featureSlug && !sourceFeature) return; // 메뉴에 없는 화면(제거된 메뉴·잘못 친 주소)은 탭을 만들지 않는다
    const target = resolveScreenPath(location.pathname, access);
    openTab({ path: location.pathname, label: target.status === "ok" ? target.label : sourceFeature?.label ?? source.label });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, navMode]);

  /** 지금 볼 수 있는 화면인가 (그 화면의 보기 기능) */
  const canOpen = (path: string | undefined): path is string =>
    Boolean(path) && resolveScreenPath(path as string, access).status === "ok";
  /** 탭형 칸 — 경로가 지금 메뉴의 어느 묶음에 있나 (옮긴 화면이면 옮겨 간 묶음) */
  const groupOf = (path: string) => sectionOfMenuPath(allowedMenuSections, path)?.slug;

  /**
   * 탭형 좌측에서 칸(★ 또는 카테고리)을 골랐을 때.
   * 카테고리 → 그 카테고리에서 마지막으로 보던 화면(처음이면 첫 화면).
   * ★ → 지금 화면이 즐겨찾기면 그대로, 아니면 ★ 에서 마지막으로 보던 화면(없으면 첫 즐겨찾기).
   */
  const pickCategory = (key: string) => {
    setMobileOpen(false);
    setActiveCategory(key);
    const here = location.pathname;
    if (key === FAVORITES_KEY) {
      const mine = favorites.filter(canOpen);
      if (!mine.length) return; // 위 탭 줄에 안내와 "추천으로 채우기"가 뜬다
      if (mine.includes(here)) {
        recordVisit(here); // ★ 의 마지막 화면으로 기억
        return;
      }
      const last = lastScreenBySection[FAVORITES_KEY];
      navigate(last && mine.includes(last) ? last : mine[0]);
      return;
    }
    const section = allowedMenuSections.find((item) => item.slug === key);
    const first = section?.features[0];
    if (!section || !first) return;
    const last = lastScreenBySection[key];
    const target = canOpen(last) && groupOf(last) === key ? last : featurePath(section, first);
    if (target !== here) navigate(target);
  };

  /** 추천 즐겨찾기 — 비어 있을 때 한 번에 채우기 (못 여는 화면은 뺀다) */
  const recommended = useMemo(() => recommendedFavorites(access), [access]);

  const toggleSidebar = () => {
    if (isMobile()) setMobileOpen((open) => !open);
    else setCollapsed(!collapsed);
  };

  // 메뉴 검색 진입 시 사이드바가 보이도록 연다 (Ctrl+K 에서 쓰므로 참조를 고정)
  const openSidebar = useCallback(() => {
    if (isMobile()) setMobileOpen(true);
    else setCollapsed(false);
  }, [setCollapsed]);

  /**
   * 절반으로 보기 — 오른쪽 패널에 띄울 경로.
   * 화면이 좁으면(폰·태블릿·좁은 노트북) 반쪽이 너무 작아 둘 다 못 읽으므로 분할을 접고,
   * 왼쪽과 같은 화면이면 나눌 이유가 없다. 상태는 지우지 않으므로 창을 넓히면 다시 나뉜다.
   */
  const split = wideEnough && splitPath && splitPath !== location.pathname ? splitPath : null;

  // 분할 중에는 셸 높이를 화면에 맞춘다 — 문서가 아니라 패널이 각자 스크롤해야 한다
  const appClass = `wms-app${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}${split ? " is-split" : ""}`;

  return (
    <div className={appClass}>
      <aside className="wms-side">
        <div className="wms-brand">
          <div className="wms-brand-logo">
            <Icon name="cube3d" size={20} />
          </div>
          <div className="wms-brand-text">
            <div className="wms-brand-title">DAELIM WMS</div>
            <div className="wms-brand-sub">SMART FULFILLMENT</div>
          </div>
        </div>

        <SideMenu
          sections={allowedMenuSections}
          activeSection={currentSection?.slug ?? sectionSlug}
          collapsed={collapsed}
          isMobile={isMobile}
          onRequestOpen={openSidebar}
          mode={navMode}
          activeCategory={activeCategory ?? currentSection?.slug ?? sectionSlug ?? null}
          onPickCategory={pickCategory}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onReorderFavorite={reorderFavorite}
          onFillRecommended={recommended.length ? () => fillFavorites(recommended) : undefined}
        />

        <div className="wms-sysstat">
          <div className="wms-sysstat-title">SYSTEM STATUS</div>
          <div className="wms-sysstat-row">
            <span className="wms-sysdot" />
            모든 연동 정상
          </div>
        </div>

        <div className="wms-user">
          <div className="wms-avatar">{userName.charAt(0)}</div>
          <div className="wms-user-text">
            <div className="wms-user-name">{userName}</div>
            <div className="wms-user-role" title={roleText}>{roleText}</div>
          </div>
          <button
            type="button"
            className="wms-logout wms-password"
            onClick={() => navigate("/password")}
            title="비밀번호 바꾸기"
            aria-label="비밀번호 바꾸기"
          >
            <Icon name="key" size={16} />
          </button>
          <button type="button" className="wms-logout" onClick={handleLogout} title="로그아웃" aria-label="로그아웃">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <div className="wms-main">
        <header className="wms-header">
          <button type="button" className="wms-hbtn" onClick={toggleSidebar} aria-label="사이드바 토글">
            <Icon name="menu" size={18} />
          </button>
          <div className="wms-crumb">
            <div className="wms-crumb-top">WMS · 본사창고(1F){currentSection ? ` · ${currentSection.label}` : ""}</div>
            <div className="wms-crumb-now">{currentLabel}</div>
          </div>

          <div className="wms-navmode" role="group" aria-label="메뉴 방식">
            {NAV_MODES.map((item) => (
              <button
                key={item.mode}
                type="button"
                className={navMode === item.mode ? "is-on" : undefined}
                aria-pressed={navMode === item.mode}
                onClick={() => setNavMode(item.mode)}
                title={`${item.label} — ${item.hint}`}
              >
                <Icon name={item.icon} size={15} />
                <span>{item.label}</span>
              </button>
            ))}
            {/* 메뉴 방식 · 즐겨찾기를 서버에 못 올렸을 때만 — 화면 배치라 이 브라우저 것으로 계속 쓴다 */}
            {navSync === "failed" ? (
              <span
                className="wms-navmode-warn"
                role="status"
                title="메뉴 방식 · 즐겨찾기를 서버에 저장하지 못했습니다. 이 브라우저에는 남아 있고, 연결되면 다시 올립니다."
                aria-label="메뉴 설정을 서버에 저장하지 못했습니다"
              >
                <Icon name="alert" size={14} />
              </span>
            ) : null}
          </div>

          <div className="wms-spacer" />

          <div className="wms-search">
            <Icon name="search" size={16} />
            <input placeholder="작업번호, 거래처, 로케이션 검색" />
          </div>

          {/* 데모만 — 다른 데모 계정으로 바꿔 들어가 본다. 사내 빌드는 내 역할 그대로 (권한은 서버가 본다) */}
          {USE_MOCK_API ? (
            <select
              className="wms-role"
              value={DEMO_ACCOUNTS.some(([id]) => id === user?.id) ? user?.id : ""}
              onChange={(event) => void switchDemoAccount(event.target.value)}
              aria-label="데모 계정 바꾸기"
              title="다른 데모 계정으로 들어가 메뉴 · 단추 보기"
            >
              {DEMO_ACCOUNTS.some(([id]) => id === user?.id) ? null : <option value="">{userName}</option>}
              {DEMO_ACCOUNTS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            className="wms-hbtn"
            onClick={toggleTheme}
            title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
            aria-label="테마 전환"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>

          <button type="button" className="wms-hbtn wms-bell" aria-label="알림 3건">
            <Icon name="bell" size={18} />
            <span className="wms-dot">3</span>
          </button>

          <button type="button" className="wms-userchip" onClick={handleLogout} title="로그아웃">
            <span className="wms-avatar">{userName.charAt(0)}</span>
            <span className="wms-userchip-text">
              <span className="wms-userchip-name">{userName}</span>
              <span className="wms-userchip-role">{roleText}</span>
            </span>
          </button>
        </header>

        {navMode === "tabs" ? <CategoryTabBar activePath={location.pathname} /> : <WorkspaceTabs activePath={location.pathname} />}

        <main className={`wms-content${split ? " is-split" : ""}`}>
          {split ? (
            <SplitView mainLabel={currentLabel} splitPath={split}>
              <Outlet />
            </SplitView>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <div className={`wms-backdrop${mobileOpen ? " show" : ""}`} onClick={() => setMobileOpen(false)} />
    </div>
  );
};

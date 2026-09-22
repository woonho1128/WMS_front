import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { RECOMMENDED_FAVORITES, findSection, getMenuSectionsForRole, resolveScreenPath } from "../app/menuConfig";
import { roleLabels, type UserRole } from "../app/roles";
import { useUiStore } from "../app/store/uiStore";
import { useAuthStore } from "../app/store/authStore";
import { FAVORITES_KEY, sectionOfPath, useNavPrefsStore, type NavMode } from "../app/store/navPrefsStore";
import { SPLIT_MIN_QUERY, isMenuPath, useTabsStore } from "../app/store/tabsStore";
import { useMediaQuery } from "../shared/useMediaQuery";
import { Icon } from "../components/ui/Icon";
import { WorkspaceTabs } from "../components/layout/WorkspaceTabs";
import { CategoryTabBar } from "../components/layout/CategoryTabBar";
import { SideMenu } from "../components/layout/SideMenu";
import { SplitView } from "../components/layout/SplitView";

const roleOptions = Object.entries(roleLabels) as Array<[UserRole, string]>;
const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches;

/** 헤더의 메뉴 방식 토글 (DOCS/WMS_메뉴방식_즐겨찾기_설계.md §1-2) */
const NAV_MODES: Array<{ mode: NavMode; label: string; icon: string; hint: string }> = [
  { mode: "list", label: "목록형", icon: "listMode", hint: "좌측에 화면 목록, 위에 연 화면 탭" },
  { mode: "tabs", label: "탭형", icon: "tabsMode", hint: "좌측에 카테고리만, 위에 그 카테고리의 화면 탭" }
];

export const MainLayout = () => {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const currentRole = useUiStore((state) => state.currentRole);
  const setCurrentRole = useUiStore((state) => state.setCurrentRole);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const openTab = useTabsStore((state) => state.openTab);
  const splitPath = useTabsStore((state) => state.splitPath);
  const openSplit = useTabsStore((state) => state.openSplit);
  const wideEnough = useMediaQuery(SPLIT_MIN_QUERY);
  const navMode = useNavPrefsStore((state) => state.navMode);
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
  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const allowedMenuSections = useMemo(() => getMenuSectionsForRole(currentRole), [currentRole]);
  const [sectionSlug, featureSlug] = location.pathname.split("/").filter(Boolean);
  const currentSection = allowedMenuSections.find((section) => section.slug === sectionSlug);
  const currentFeature = currentSection?.features.find((feature) => feature.slug === featureSlug);
  const currentLabel = currentFeature?.label ?? currentSection?.label ?? "대시보드";

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
    openTab({ path: location.pathname, label: sourceFeature?.label ?? source.label });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, navMode]);

  /** 이 역할이 지금 볼 수 있는 화면인가 */
  const canOpen = (path: string | undefined): path is string =>
    Boolean(path) && resolveScreenPath(path as string, currentRole).status === "ok";

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
    if (!first) return;
    const last = lastScreenBySection[key];
    const target = canOpen(last) && sectionOfPath(last) === key ? last : `/${key}/${first.slug}`;
    if (target !== here) navigate(target);
  };

  /** 역할별 추천 즐겨찾기 — 비어 있을 때 한 번에 채우기 (이 역할이 못 여는 화면은 뺀다) */
  const recommended = useMemo(
    () => (RECOMMENDED_FAVORITES[currentRole] ?? []).filter((path) => resolveScreenPath(path, currentRole).status === "ok"),
    [currentRole]
  );

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
          activeSection={sectionSlug}
          collapsed={collapsed}
          isMobile={isMobile}
          onRequestOpen={openSidebar}
          mode={navMode}
          activeCategory={activeCategory ?? sectionSlug ?? null}
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
            <div className="wms-user-role">{roleLabels[currentRole]}</div>
          </div>
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
          </div>

          <div className="wms-spacer" />

          <div className="wms-search">
            <Icon name="search" size={16} />
            <input placeholder="작업번호, 거래처, 로케이션 검색" />
          </div>

          <select
            className="wms-role"
            value={currentRole}
            onChange={(event) => setCurrentRole(event.target.value as UserRole)}
            aria-label="역할 선택"
          >
            {roleOptions.map(([role, label]) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
          </select>

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
              <span className="wms-userchip-role">{roleLabels[currentRole]}</span>
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

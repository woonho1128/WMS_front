import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { findSection, getMenuSectionsForRole } from "../app/menuConfig";
import { roleLabels, type UserRole } from "../app/roles";
import { useUiStore } from "../app/store/uiStore";
import { useAuthStore } from "../app/store/authStore";
import { useTabsStore } from "../app/store/tabsStore";
import { Icon } from "../components/ui/Icon";
import { WorkspaceTabs } from "../components/layout/WorkspaceTabs";
import { SideMenu } from "../components/layout/SideMenu";

const roleOptions = Object.entries(roleLabels) as Array<[UserRole, string]>;
const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches;

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

  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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

  // 화면 이동 시 본문 상단 탭으로 등록(이미 있으면 유지). 좌측 메뉴 클릭 = 탭 열기.
  useEffect(() => {
    if (!sectionSlug) return;
    const source = findSection(sectionSlug);
    if (!source) return;
    const sourceFeature = featureSlug
      ? source.features.find((item) => item.slug === featureSlug)
      : undefined;
    if (featureSlug && !sourceFeature) return; // 메뉴에 없는 화면(제거된 메뉴·잘못 친 주소)은 탭을 만들지 않는다
    openTab({ path: location.pathname, label: sourceFeature?.label ?? source.label });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleSidebar = () => {
    if (isMobile()) setMobileOpen((open) => !open);
    else setCollapsed(!collapsed);
  };

  // 메뉴 검색 진입 시 사이드바가 보이도록 연다 (Ctrl+K 에서 쓰므로 참조를 고정)
  const openSidebar = useCallback(() => {
    if (isMobile()) setMobileOpen(true);
    else setCollapsed(false);
  }, [setCollapsed]);

  const appClass = `wms-app${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`;

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

        <WorkspaceTabs activePath={location.pathname} />

        <main className="wms-content">
          <Outlet />
        </main>
      </div>

      <div className={`wms-backdrop${mobileOpen ? " show" : ""}`} onClick={() => setMobileOpen(false)} />
    </div>
  );
};

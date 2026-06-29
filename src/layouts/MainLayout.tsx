import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getMenuSectionsForRole, isTabbedSection } from "../app/menuConfig";
import { roleLabels, type UserRole } from "../app/roles";
import { useUiStore } from "../app/store/uiStore";
import { useAuthStore } from "../app/store/authStore";
import { Icon } from "../components/ui/Icon";

const roleOptions = Object.entries(roleLabels) as Array<[UserRole, string]>;
const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches;

export const MainLayout = () => {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const currentRole = useUiStore((state) => state.currentRole);
  const setCurrentRole = useUiStore((state) => state.setCurrentRole);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const userName = user?.name ?? "사용자";
  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const allowedMenuSections = getMenuSectionsForRole(currentRole);
  const [sectionSlug, featureSlug] = location.pathname.split("/").filter(Boolean);
  const currentSection = allowedMenuSections.find((section) => section.slug === sectionSlug);
  const currentFeature = currentSection?.features.find((feature) => feature.slug === featureSlug);
  const currentLabel = currentFeature?.label ?? currentSection?.label ?? "대시보드";

  const [expanded, setExpanded] = useState<string>(sectionSlug ?? "dashboard");

  // 경로 이동 시 해당 섹션 자동 펼침 + 모바일 드로어 닫기
  useEffect(() => {
    if (sectionSlug) setExpanded(sectionSlug);
    setMobileOpen(false);
  }, [sectionSlug, featureSlug]);

  const toggleSidebar = () => {
    if (isMobile()) setMobileOpen((open) => !open);
    else setCollapsed(!collapsed);
  };

  const handleSectionClick = (slug: string, firstFeature?: string) => {
    // 탭형 섹션(입고/출고)은 펼치지 않고 첫 화면으로 바로 이동 → 하위는 본문 탭에서 전환.
    if (isTabbedSection(slug)) {
      if (firstFeature) navigate(`/${slug}/${firstFeature}`);
      return;
    }
    if (collapsed && !isMobile()) {
      if (firstFeature) navigate(`/${slug}/${firstFeature}`);
      return;
    }
    setExpanded((prev) => (prev === slug ? "" : slug));
  };

  const appClass = `wms-app${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`;

  return (
    <div className={appClass}>
      <aside className="wms-side">
        <div className="wms-brand">
          <div className="wms-brand-logo">W</div>
          <div className="wms-brand-text">
            <div className="wms-brand-title">DAELIM WMS</div>
            <div className="wms-brand-sub">창고관리시스템</div>
          </div>
        </div>

        <nav className="wms-nav">
          {allowedMenuSections.map((section) => {
            const activeSection = sectionSlug === section.slug;
            const tabbed = isTabbedSection(section.slug);
            const open = !tabbed && (expanded === section.slug || activeSection);
            return (
              <div key={section.slug} className={`wms-navgroup${open ? " open" : ""}`}>
                <button
                  type="button"
                  className={`wms-navitem${activeSection ? " active" : ""}`}
                  onClick={() => handleSectionClick(section.slug, section.features[0]?.slug)}
                  title={section.label}
                >
                  <span className="wms-ni-ico">
                    <Icon path={section.iconPath} filled size={20} />
                  </span>
                  <span className="wms-ni-label">{section.label}</span>
                  {tabbed ? null : (
                    <span className="wms-ni-caret">
                      <Icon name="chevR" size={16} />
                    </span>
                  )}
                </button>
                {open ? (
                  <div className="wms-subtree">
                    {section.features.map((feature) => (
                      <NavLink
                        key={feature.slug}
                        to={`/${section.slug}/${feature.slug}`}
                        className={({ isActive }) => `wms-sublink${isActive ? " active" : ""}`}
                      >
                        {feature.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

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

          <div className="wms-search">
            <Icon name="search" size={17} />
            <input placeholder="SKU, 출고번호, 거래처 검색" />
          </div>

          <button type="button" className="wms-hbtn wms-bell" aria-label="알림">
            <Icon name="bell" size={18} />
            <span className="wms-dot" />
          </button>
        </header>

        <main className="wms-content">
          <Outlet />
        </main>
      </div>

      <div className={`wms-backdrop${mobileOpen ? " show" : ""}`} onClick={() => setMobileOpen(false)} />
    </div>
  );
};

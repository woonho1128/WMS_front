import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { MenuSection } from "../../app/menuConfig";
import { SidebarSubmenu } from "./SidebarSubmenu";

type Props = {
  section: MenuSection;
  collapsed: boolean;
  onNavigate?: () => void;
};

export const SidebarItem = ({ section, collapsed, onNavigate }: Props) => {
  const location = useLocation();
  const isSectionActive =
    location.pathname === `/${section.slug}` || location.pathname.startsWith(`/${section.slug}/`);
  const [open, setOpen] = useState(isSectionActive);

  useEffect(() => {
    if (isSectionActive) {
      setOpen(true);
    }
  }, [isSectionActive]);

  return (
    <div className="menu-section-block">
      <button
        type="button"
        className={`menu-link menu-link-button ${isSectionActive ? "is-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? section.label : undefined}
        aria-expanded={open}
        aria-controls={`submenu-${section.slug}`}
      >
        <span className="menu-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={section.iconPath} />
          </svg>
        </span>
        {!collapsed && <span className="menu-label">{section.label}</span>}
      </button>

      {!collapsed && (
        <div id={`submenu-${section.slug}`} className={`submenu-accordion ${open ? "open" : ""}`}>
          <SidebarSubmenu sectionSlug={section.slug} features={section.features} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
};


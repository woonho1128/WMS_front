import type { UserRole } from "../../app/roles";
import { menuSections, roleMenuConfig } from "../../app/menuConfig";
import { SidebarSection } from "./SidebarSection";
import { SidebarToggle } from "./SidebarToggle";

const groups = ["GENERAL", "OPERATIONS", "REPORT", "SETTINGS"] as const;

type Props = {
  role: UserRole;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
};

export const Sidebar = ({ role, collapsed, onToggle, onNavigate }: Props) => {
  const roleMenu = roleMenuConfig[role] ?? roleMenuConfig.admin;
  const sectionMap = new Map(menuSections.map((s) => [s.slug, s]));

  const filteredSections = roleMenu
    .map((rule) => {
      const section = sectionMap.get(rule.section);
      if (!section) return null;
      if (!rule.features) return section;
      return {
        ...section,
        features: section.features.filter((f) => rule.features!.includes(f.slug))
      };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .filter((v) => v.features.length > 0);

  return (
    <aside className="sidebar" role="navigation" aria-label="주요 메뉴">
      <div className="sidebar-header">
        {!collapsed && <div className="brand-mark" />}
        {!collapsed && <p className="brand-name">DAELIM SMART WMS</p>}
        <SidebarToggle collapsed={collapsed} onToggle={onToggle} />
      </div>

      <nav className="sidebar-nav menu">
        {groups.map((group) => {
          const sections = filteredSections.filter((s) => s.group === group);
          if (!sections.length) return null;
          return (
            <SidebarSection
              key={group}
              title={group}
              sections={sections}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>

      <div className="sidebar-footer" />
    </aside>
  );
};

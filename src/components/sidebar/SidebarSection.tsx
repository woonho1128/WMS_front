import type { MenuSection } from "../../app/menuConfig";
import { SidebarItem } from "./SidebarItem";

type Props = {
  title: string;
  sections: MenuSection[];
  collapsed: boolean;
  onNavigate?: () => void;
};

export const SidebarSection = ({ title, sections, collapsed, onNavigate }: Props) => {
  return (
    <div className="menu-group">
      {!collapsed && <p className="menu-group-title">{title}</p>}
      {sections.map((section) => (
        <SidebarItem key={section.slug} section={section} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </div>
  );
};

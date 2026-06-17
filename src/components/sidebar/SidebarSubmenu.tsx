import { NavLink } from "react-router-dom";
import type { MenuFeature } from "../../app/menuConfig";

type Props = {
  sectionSlug: string;
  features: MenuFeature[];
  onNavigate?: () => void;
};

export const SidebarSubmenu = ({ sectionSlug, features, onNavigate }: Props) => {
  return (
    <div className="submenu-list">
      {features.map((feature) => (
        <NavLink
          key={feature.slug}
          to={`/${sectionSlug}/${feature.slug}`}
          className={({ isActive }) => (isActive ? "submenu-link active" : "submenu-link")}
          onClick={onNavigate}
        >
          {feature.label}
        </NavLink>
      ))}
    </div>
  );
};

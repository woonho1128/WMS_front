import { NavLink } from "react-router-dom";
import { getMenuSectionsForRole } from "../../app/menuConfig";
import { useUiStore } from "../../app/store/uiStore";
import "./SectionTabs.css";

type Props = {
  sectionSlug: string;
};

/**
 * 입고관리·출고관리처럼 좌측 메뉴 대신 본문 상단 탭으로 하위 화면을
 * 전환하는 섹션용 탭 바. 역할 권한에 맞춰 노출 화면을 필터링한다.
 */
export const SectionTabs = ({ sectionSlug }: Props) => {
  const currentRole = useUiStore((state) => state.currentRole);
  const section = getMenuSectionsForRole(currentRole).find((item) => item.slug === sectionSlug);

  if (!section || section.features.length <= 1) return null;

  return (
    <nav className="wms-sectiontabs" aria-label={`${section.label} 탭`}>
      {section.features.map((feature) => (
        <NavLink
          key={feature.slug}
          to={`/${sectionSlug}/${feature.slug}`}
          className={({ isActive }) => `wms-sectiontab${isActive ? " active" : ""}`}
        >
          {feature.label}
        </NavLink>
      ))}
    </nav>
  );
};

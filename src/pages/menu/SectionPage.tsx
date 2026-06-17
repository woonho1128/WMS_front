import { Link, useParams } from "react-router-dom";
import { findSection, getMenuSectionsForRole } from "../../app/menuConfig";
import { useUiStore } from "../../app/store/uiStore";

export const SectionPage = () => {
  const { sectionSlug } = useParams();
  const currentRole = useUiStore((state) => state.currentRole);
  const section = getMenuSectionsForRole(currentRole).find((item) => item.slug === sectionSlug);

  if (!findSection(sectionSlug)) {
    return <section>메뉴를 찾을 수 없습니다.</section>;
  }

  if (!section) {
    return <section>접근 권한이 없습니다.</section>;
  }

  return (
    <section>
      <header className="page-header">
        <h2>{section.label}</h2>
        <p>{section.description}</p>
      </header>
      <div className="table-wrap">
        <ul className="feature-list feature-grid">
          {section.features.map((feature) => (
            <li key={feature.slug}>
              <div className="feature-card-head">
                <strong>{feature.label}</strong>
              </div>
              <p>{feature.description}</p>
              <Link to={`/${section.slug}/${feature.slug}`}>화면 열기</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

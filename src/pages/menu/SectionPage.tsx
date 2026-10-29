import { Link, useParams } from "react-router-dom";
import { useAccess } from "../../app/access";
import { canOpenScreen, findSection } from "../../app/menuConfig";

export const SectionPage = () => {
  const { sectionSlug } = useParams();
  const access = useAccess();
  const source = findSection(sectionSlug);

  if (!source) {
    return <section>메뉴를 찾을 수 없습니다.</section>;
  }

  const features = source.features.filter((feature) => canOpenScreen(access, source.slug, feature.slug));
  if (!features.length) {
    return <section>권한이 없습니다.</section>;
  }

  return (
    <section>
      <header className="page-header">
        <h2>{source.label}</h2>
        <p>{source.description}</p>
      </header>
      <div className="table-wrap">
        <ul className="feature-list feature-grid">
          {features.map((feature) => (
            <li key={feature.slug}>
              <div className="feature-card-head">
                <strong>{feature.label}</strong>
              </div>
              <p>{feature.description}</p>
              <Link to={`/${source.slug}/${feature.slug}`}>화면 열기</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

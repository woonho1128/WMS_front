import { useParams } from "react-router-dom";
import { useAccess } from "../../app/access";
import { findSection, resolveScreenPath } from "../../app/menuConfig";
import { WorkbenchPage } from "../workbench/WorkbenchPage";

/**
 * 화면 하나 — 그 화면의 보기 기능이 있어야 열린다 (메뉴에서 숨긴 화면도 기능이 있으면 주소로 열린다).
 * 열려 있는 동안 관리자가 권한을 빼면 다음 응답에서 내 정보가 새로 오고, 이 자리에서 "권한이 없습니다" 로 바뀐다.
 */
export const FeaturePage = () => {
  const { sectionSlug, featureSlug } = useParams();
  const access = useAccess();
  const sourceSection = findSection(sectionSlug);
  const sourceFeature = sourceSection?.features.find((item) => item.slug === featureSlug);

  if (!sourceSection || !sourceFeature) {
    return <section>기능 화면을 찾을 수 없습니다.</section>;
  }

  const target = resolveScreenPath(`/${sourceSection.slug}/${sourceFeature.slug}`, access);
  if (target.status !== "ok") {
    return (
      <section className="app-surface" style={{ padding: 24 }}>
        <h2 style={{ margin: "0 0 6px" }}>권한이 없습니다</h2>
        <p style={{ margin: 0, color: "var(--ink-soft, #64748b)" }}>
          ‘{sourceFeature.label}’ 화면을 볼 권한이 없습니다 — 필요하면 관리자에게 권한(역할)을 요청하세요.
        </p>
      </section>
    );
  }

  return <WorkbenchPage sectionSlug={target.sectionSlug} featureSlug={target.featureSlug} title={target.label} />;
};

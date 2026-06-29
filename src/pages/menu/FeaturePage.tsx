import { useParams } from "react-router-dom";
import { findSection, getMenuSectionsForRole, isTabbedSection } from "../../app/menuConfig";
import { useUiStore } from "../../app/store/uiStore";
import { SectionTabs } from "../../components/layout/SectionTabs";
import { WorkbenchPage } from "../workbench/WorkbenchPage";

export const FeaturePage = () => {
  const { sectionSlug, featureSlug } = useParams();
  const currentRole = useUiStore((state) => state.currentRole);
  const section = getMenuSectionsForRole(currentRole).find((item) => item.slug === sectionSlug);
  const feature = section?.features.find((item) => item.slug === featureSlug);
  const sourceSection = findSection(sectionSlug);
  const sourceFeature = sourceSection?.features.find((item) => item.slug === featureSlug);

  if (!sourceSection || !sourceFeature) {
    return <section>기능 화면을 찾을 수 없습니다.</section>;
  }

  if (!section || !feature) {
    return <section>접근 권한이 없습니다.</section>;
  }

  if (isTabbedSection(section.slug)) {
    return (
      <section className="wms-tabbed-section">
        <SectionTabs sectionSlug={section.slug} />
        <WorkbenchPage sectionSlug={section.slug} featureSlug={feature.slug} title={feature.label} />
      </section>
    );
  }

  return <WorkbenchPage sectionSlug={section.slug} featureSlug={feature.slug} title={feature.label} />;
};

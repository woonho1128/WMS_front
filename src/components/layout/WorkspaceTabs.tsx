import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { findSection } from "../../app/menuConfig";
import { HOME_PATH, closeCount, tabsAfterClose, useTabsStore, type CloseKind, type OpenTab } from "../../app/store/tabsStore";
import { Icon } from "../ui/Icon";
import { TabContextMenu } from "./TabContextMenu";
import "./WorkspaceTabs.css";

type Props = {
  /** 현재 활성 경로 (location.pathname). 이 경로와 일치하는 탭이 활성 탭. */
  activePath: string;
};

type MenuState = { x: number; y: number; tab: OpenTab } | null;

const homeLabel = () => {
  const [, sectionSlug, featureSlug] = HOME_PATH.split("/");
  return findSection(sectionSlug)?.features.find((feature) => feature.slug === featureSlug)?.label ?? "대시보드";
};

/**
 * 본문 상단 전역 탭 바. 좌측 메뉴에서 화면을 열 때마다 탭이 추가되고,
 * 탭 클릭으로 화면 전환, × / 가운데 클릭으로 닫는다.
 * 우클릭 메뉴: 닫기 · 다른 탭 모두 · 왼쪽 모두 · 오른쪽 모두 · 모든 탭 닫기
 */
export const WorkspaceTabs = ({ activePath }: Props) => {
  const tabs = useTabsStore((state) => state.tabs);
  const closeTabs = useTabsStore((state) => state.closeTabs);
  const openTab = useTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState>(null);

  const dismissMenu = useCallback(() => setMenu(null), []);

  // 활성 탭이 탭바 밖에 있으면 보이도록 스크롤
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(".wms-tab.active");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath, tabs.length]);

  if (tabs.length === 0) return null;

  /**
   * 닫고 난 뒤 어디로 갈지 결정한다.
   * - 활성 탭이 남아 있으면 그대로
   * - 한 탭만 닫았으면 인접 탭(오른쪽 우선)
   * - 일괄 닫기면 기준 탭(우클릭한 탭)
   * - 남은 탭이 없으면 홈 탭을 다시 연다 (화면이 떠 있는 동안 탭이 0개가 되지 않게)
   */
  const runClose = (kind: CloseKind, path: string) => {
    const index = tabs.findIndex((tab) => tab.path === path);
    const remaining = tabsAfterClose(tabs, kind, path);
    closeTabs(kind, path);
    setMenu(null);

    if (remaining.some((tab) => tab.path === activePath)) return;

    if (remaining.length === 0) {
      openTab({ path: HOME_PATH, label: homeLabel() });
      navigate(HOME_PATH);
      return;
    }
    const next = kind === "self" ? remaining[Math.min(index, remaining.length - 1)] : remaining.find((tab) => tab.path === path);
    navigate((next ?? remaining[0]).path);
  };

  const handleClose = (event: MouseEvent, path: string) => {
    event.stopPropagation();
    runClose("self", path);
  };

  const openMenu = (event: MouseEvent, tab: OpenTab) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, tab });
  };

  // 홈 탭 하나만 남은 상태에서는 "전체 닫기" 할 것이 없다
  const closeAllDisabled = tabs.length === 1 && tabs[0].path === HOME_PATH;

  return (
    <div className="wms-tabs">
      <div className="wms-tabs-scroll" role="tablist" ref={scrollRef}>
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          return (
            <div
              key={tab.path}
              role="tab"
              aria-selected={active}
              className={`wms-tab${active ? " active" : ""}${menu?.tab.path === tab.path ? " is-menu" : ""}`}
              onClick={() => navigate(tab.path)}
              onAuxClick={(event) => {
                if (event.button === 1) handleClose(event, tab.path); // 가운데 클릭으로 닫기
              }}
              onContextMenu={(event) => openMenu(event, tab)}
              title={`${tab.label} · 우클릭: 탭 메뉴`}
            >
              <span className="wms-tab-label">{tab.label}</span>
              <button
                type="button"
                className="wms-tab-close"
                aria-label={`${tab.label} 탭 닫기`}
                onClick={(event) => handleClose(event, tab.path)}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="wms-tabs-actions">
        <span className="wms-tabs-count" title="열린 탭 수">
          {tabs.length}
        </span>
        <button
          type="button"
          className="wms-tabs-closeall"
          onClick={() => runClose("all", activePath)}
          disabled={closeAllDisabled}
          title={closeAllDisabled ? "닫을 탭이 없습니다" : `열린 탭 ${closeCount(tabs, "all", activePath)}개 모두 닫기`}
        >
          <Icon name="closeAll" size={14} />
          전체 닫기
        </button>
      </div>

      {menu ? (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          tab={menu.tab}
          tabs={tabs}
          onAction={(kind) => runClose(kind, menu.tab.path)}
          onDismiss={dismissMenu}
        />
      ) : null}
    </div>
  );
};

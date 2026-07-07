import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { HOME_PATH, useTabsStore } from "../../app/store/tabsStore";
import { Icon } from "../ui/Icon";
import "./WorkspaceTabs.css";

type Props = {
  /** 현재 활성 경로 (location.pathname). 이 경로와 일치하는 탭이 활성 탭. */
  activePath: string;
};

/**
 * 본문 상단 전역 탭 바. 좌측 메뉴에서 화면을 열 때마다 탭이 추가되고,
 * 탭 클릭으로 화면 전환, × 로 닫는다. 여러 화면을 탭으로 동시에 유지한다.
 */
export const WorkspaceTabs = ({ activePath }: Props) => {
  const tabs = useTabsStore((state) => state.tabs);
  const closeTab = useTabsStore((state) => state.closeTab);
  const navigate = useNavigate();

  if (tabs.length === 0) return null;

  const handleClose = (event: MouseEvent, path: string) => {
    event.stopPropagation();
    const index = tabs.findIndex((tab) => tab.path === path);
    const wasActive = path === activePath;
    closeTab(path);

    if (!wasActive) return;

    // 활성 탭을 닫으면 인접 탭(오른쪽 우선, 없으면 왼쪽)으로 이동한다.
    const remaining = tabs.filter((tab) => tab.path !== path);
    if (remaining.length === 0) {
      navigate(HOME_PATH);
      return;
    }
    const next = remaining[Math.min(index, remaining.length - 1)];
    navigate(next.path);
  };

  return (
    <div className="wms-tabs" role="tablist">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={active}
            className={`wms-tab${active ? " active" : ""}`}
            onClick={() => navigate(tab.path)}
            onAuxClick={(event) => {
              if (event.button === 1) handleClose(event, tab.path); // 가운데 클릭으로 닫기
            }}
            title={tab.label}
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
  );
};

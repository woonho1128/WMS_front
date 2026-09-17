import { useCallback, useEffect, useLayoutEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { findSection } from "../../app/menuConfig";
import {
  HOME_PATH,
  TAB_LIMIT,
  closeCount,
  evictionCandidate,
  tabsAfterClose,
  useTabsStore,
  type CloseKind,
  type OpenTab
} from "../../app/store/tabsStore";
import { Icon } from "../ui/Icon";
import { TabContextMenu } from "./TabContextMenu";
import { TabOverflowMenu } from "./TabOverflowMenu";
import "./WorkspaceTabs.css";

type Props = {
  /** 현재 활성 경로 (location.pathname). 이 경로와 일치하는 탭이 활성 탭. */
  activePath: string;
};

type MenuState = { x: number; y: number; tab: OpenTab } | null;

/** 탭 최소 폭·간격 — WorkspaceTabs.css 의 .wms-tab min-width, .wms-tabs-scroll gap 과 같게 둔다 */
const MIN_TAB = 84;
const TAB_GAP = 4;
/** "+N" 버튼 폭 (.wms-tabs-more) */
const MORE_WIDTH = 46;
/** 탭당 폭이 이보다 좁으면 촘촘 모드 — 안 보는 탭의 닫기 버튼을 마우스를 올릴 때만 보여 이름 자리를 넓힌다 */
const COMPACT_TAB = 128;
/** 자동으로 닫힌 탭 알림을 띄워 두는 시간 */
const NOTICE_MS = 6000;

const homeLabel = () => {
  const [, sectionSlug, featureSlug] = HOME_PATH.split("/");
  return findSection(sectionSlug)?.features.find((feature) => feature.slug === featureSlug)?.label ?? "대시보드";
};

/** 탭 바 폭에 최소 폭으로 몇 개까지 들어가나 — 전부 들어가면 전부, 아니면 "+N" 버튼 자리를 빼고 */
const fitCount = (width: number, count: number) => {
  if (!width) return count;
  const span = (n: number) => n * MIN_TAB + Math.max(0, n - 1) * TAB_GAP;
  if (span(count) <= width) return count;
  let n = count - 1;
  while (n > 1 && span(n) + TAB_GAP + MORE_WIDTH > width) n -= 1;
  return n;
};

/**
 * 본문 상단 전역 탭 바. 좌측 메뉴에서 화면을 열 때마다 탭이 추가되고,
 * 탭 클릭으로 화면 전환, × / 가운데 클릭으로 닫는다.
 * - 최대 TAB_LIMIT 개 — 넘치면 가장 오래 안 본 탭이 닫히고 "다시 열기" 알림이 뜬다
 * - 가로 스크롤 없음 — 공간이 모자라면 탭 폭을 줄이고, 최소 폭으로도 넘치면 "+N" 목록으로 모은다
 * - 우클릭 메뉴: 탭 고정/해제 · 닫기 · 다른 탭 모두 · 왼쪽 모두 · 오른쪽 모두 · 모든 탭 닫기 (고정 탭은 닫기에서 빠진다)
 */
export const WorkspaceTabs = ({ activePath }: Props) => {
  const tabs = useTabsStore((state) => state.tabs);
  const evicted = useTabsStore((state) => state.evicted);
  const closeTabs = useTabsStore((state) => state.closeTabs);
  const openTab = useTabsStore((state) => state.openTab);
  const togglePin = useTabsStore((state) => state.togglePin);
  const dismissEvicted = useTabsStore((state) => state.dismissEvicted);
  const navigate = useNavigate();
  const [menu, setMenu] = useState<MenuState>(null);
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [moreButton, setMoreButton] = useState<HTMLButtonElement | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [noticeHover, setNoticeHover] = useState(false);

  const dismissMenu = useCallback(() => setMenu(null), []);
  const dismissOverflow = useCallback(() => setOverflowOpen(false), []);

  // 탭 바 폭을 재서 몇 개를 보여 줄지 정한다
  useLayoutEffect(() => {
    if (!track) return;
    const update = () => setTrackWidth(track.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => observer.disconnect();
  }, [track]);

  // 자동으로 닫힌 탭 알림은 잠시 뒤 사라진다 — 마우스를 올려 두면 기다린다
  useEffect(() => {
    if (!evicted || noticeHover) return;
    const timer = window.setTimeout(dismissEvicted, NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [evicted, noticeHover, dismissEvicted]);

  if (tabs.length === 0) return null;

  // 보여 줄 탭 — 보고 있는 탭은 넘친 쪽에 있어도 마지막 칸과 맞바꿔 늘 보이게 한다
  const visibleCount = fitCount(trackWidth, tabs.length);
  let visible = tabs.slice(0, visibleCount);
  if (visibleCount < tabs.length && !visible.some((tab) => tab.path === activePath)) {
    const current = tabs.find((tab) => tab.path === activePath);
    if (current) visible = [...visible.slice(0, -1), current];
  }
  const hidden = tabs.filter((tab) => !visible.includes(tab));
  const compact = trackWidth > 0 && trackWidth / visible.length < COMPACT_TAB;

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
    setOverflowOpen(false);
    setMenu({ x: event.clientX, y: event.clientY, tab });
  };

  const closeNotice = () => {
    dismissEvicted();
    setNoticeHover(false);
  };

  // 고정 탭만 남았거나 홈 탭 하나뿐이면 "전체 닫기" 할 것이 없다
  const closableCount = closeCount(tabs, "all", activePath);
  const closeAllDisabled = closableCount === 0 || (tabs.length === 1 && tabs[0].path === HOME_PATH);

  const full = tabs.length >= TAB_LIMIT;
  const nextVictim = full ? evictionCandidate(tabs, activePath) : null;
  const countTitle = full
    ? `탭이 가득 찼습니다 (최대 ${TAB_LIMIT}개) — 새 화면을 열면 가장 오래 안 본${nextVictim ? ` ‘${nextVictim.label}’` : ""} 탭이 닫힙니다`
    : `열린 탭 ${tabs.length}개 · 최대 ${TAB_LIMIT}개`;

  return (
    <div className={`wms-tabs${compact ? " is-compact" : ""}`}>
      <div className="wms-tabs-scroll" role="tablist" ref={setTrack}>
        {visible.map((tab) => {
          const active = tab.path === activePath;
          return (
            <div
              key={tab.path}
              role="tab"
              aria-selected={active}
              className={`wms-tab${active ? " active" : ""}${tab.pinned ? " is-pinned" : ""}${menu?.tab.path === tab.path ? " is-menu" : ""}`}
              onClick={() => navigate(tab.path)}
              onAuxClick={(event) => {
                if (event.button === 1) handleClose(event, tab.path); // 가운데 클릭으로 닫기 (고정 탭은 그대로)
              }}
              onContextMenu={(event) => openMenu(event, tab)}
              title={`${tab.label}${tab.pinned ? " · 고정됨" : ""} · 우클릭: 탭 메뉴`}
            >
              {tab.pinned ? <Icon name="pinTab" size={13} className="wms-tab-pin" /> : null}
              <span className="wms-tab-label">{tab.label}</span>
              {tab.pinned ? null : (
                <button
                  type="button"
                  className="wms-tab-close"
                  aria-label={`${tab.label} 탭 닫기`}
                  onClick={(event) => handleClose(event, tab.path)}
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          );
        })}
        {hidden.length > 0 ? (
          <button
            ref={setMoreButton}
            type="button"
            className={`wms-tabs-more${overflowOpen ? " is-open" : ""}`}
            onClick={() => setOverflowOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            title={`탭 바에 다 안 들어간 탭 ${hidden.length}개`}
          >
            +{hidden.length}
            <Icon name="chevD" size={12} />
          </button>
        ) : null}
      </div>

      <div className="wms-tabs-actions">
        <span className={`wms-tabs-count${full ? " is-full" : ""}`} title={countTitle}>
          {tabs.length}/{TAB_LIMIT}
        </span>
        <button
          type="button"
          className="wms-tabs-closeall"
          onClick={() => runClose("all", activePath)}
          disabled={closeAllDisabled}
          title={closeAllDisabled ? "닫을 탭이 없습니다" : `고정 탭을 뺀 ${closableCount}개 모두 닫기`}
        >
          <Icon name="closeAll" size={14} />
          전체 닫기
        </button>
      </div>

      {evicted ? (
        <div className="wms-tabs-notice" role="status" onMouseEnter={() => setNoticeHover(true)} onMouseLeave={() => setNoticeHover(false)}>
          <span className="wms-tabs-notice-text">
            <b>‘{evicted.label}’</b> 탭을 닫았습니다
            <small>탭은 최대 {TAB_LIMIT}개 — 가장 오래 안 본 탭부터 닫힙니다</small>
          </span>
          <button
            type="button"
            className="wms-tabs-notice-btn"
            onClick={() => {
              const path = evicted.path;
              closeNotice();
              navigate(path);
            }}
          >
            <Icon name="rotateCcw" size={13} />
            다시 열기
          </button>
          <button type="button" className="wms-tabs-notice-x" aria-label="알림 닫기" onClick={closeNotice}>
            <Icon name="x" size={13} />
          </button>
        </div>
      ) : null}

      {menu ? (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          tab={menu.tab}
          tabs={tabs}
          onAction={(kind) => runClose(kind, menu.tab.path)}
          onTogglePin={() => {
            togglePin(menu.tab.path);
            setMenu(null);
          }}
          onDismiss={dismissMenu}
        />
      ) : null}

      {overflowOpen && hidden.length > 0 && moreButton ? (
        <TabOverflowMenu
          anchor={moreButton}
          tabs={hidden}
          activePath={activePath}
          onPick={(path) => {
            setOverflowOpen(false);
            navigate(path);
          }}
          onClose={(path) => runClose("self", path)}
          onDismiss={dismissOverflow}
        />
      ) : null}
    </div>
  );
};

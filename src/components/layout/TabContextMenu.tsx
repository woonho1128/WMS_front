import { createPortal } from "react-dom";
import { FAVORITES_LIMIT } from "../../app/store/navPrefsStore";
import { PIN_LIMIT, closeCount, type CloseKind, type OpenTab } from "../../app/store/tabsStore";
import { Icon } from "../ui/Icon";
import { usePopupMenu } from "./usePopupMenu";

type Props = {
  /** 우클릭 위치 (viewport 좌표) */
  x: number;
  y: number;
  tab: OpenTab;
  tabs: OpenTab[];
  /** 지금 보고 있는(왼쪽 패널) 경로 */
  activePath: string;
  /** 오른쪽 패널에 띄운 경로 */
  splitPath: string | null;
  /** 분할 보기를 켤 수 있는 폭인가 */
  canSplit: boolean;
  /** 이 탭의 화면이 내 즐겨찾기인가 · 즐겨찾기가 가득 찼나 */
  favorite: boolean;
  favoritesFull: boolean;
  onAction: (kind: CloseKind) => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onSplit: () => void;
  onUnsplit: () => void;
  onDismiss: () => void;
};

type Item = { kind: CloseKind; label: string; icon: string; danger?: boolean };

const ITEMS: Array<Item | "sep"> = [
  { kind: "self", label: "닫기", icon: "x" },
  { kind: "others", label: "다른 탭 모두 닫기", icon: "closeOthers" },
  { kind: "left", label: "왼쪽 탭 모두 닫기", icon: "closeLeft" },
  { kind: "right", label: "오른쪽 탭 모두 닫기", icon: "closeRight" },
  "sep",
  { kind: "all", label: "모든 탭 닫기", icon: "closeAll", danger: true }
];

/** 작업 탭 우클릭 메뉴 — 고정/해제 + 즐겨찾기 + 나란히 보기 + 닫기 5종. 고정 탭은 어떤 닫기에도 포함되지 않는다 */
export const TabContextMenu = ({
  x,
  y,
  tab,
  tabs,
  activePath,
  splitPath,
  canSplit,
  favorite,
  favoritesFull,
  onAction,
  onTogglePin,
  onToggleFavorite,
  onSplit,
  onUnsplit,
  onDismiss
}: Props) => {
  const { menuRef, pos, handleKeyDown } = usePopupMenu({ x, y, onDismiss, focusKey: tab.path });
  const pinnedCount = tabs.filter((item) => item.pinned).length;
  const pinFull = !tab.pinned && pinnedCount >= PIN_LIMIT;

  // 오른쪽 패널에 있는 탭이면 해제, 보고 있는 탭이면 나란히 열 상대가 없다
  const isSplit = tab.path === splitPath;
  const splitLabel = isSplit
    ? "분할 해제"
    : !canSplit
      ? "나란히 열기 — 1280px 이상에서"
      : tab.path === activePath
        ? "나란히 열기 — 다른 탭에서"
        : "오른쪽에 나란히 열기";

  return createPortal(
    <div
      ref={menuRef}
      className="wms-ctxmenu"
      role="menu"
      aria-label={`${tab.label} 탭 메뉴`}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="wms-ctxmenu-head" title={tab.label}>
        {tab.label}
        {tab.pinned ? <small>고정된 탭 — 고정을 풀어야 닫을 수 있습니다</small> : null}
      </div>
      <button type="button" role="menuitem" className="wms-ctxmenu-item" disabled={pinFull} onClick={onTogglePin}>
        <Icon name={tab.pinned ? "pinOff" : "pinTab"} size={15} />
        <span>{tab.pinned ? "고정 해제" : pinFull ? `탭 고정 — 최대 ${PIN_LIMIT}개` : "탭 고정"}</span>
        <span className="wms-ctxmenu-count">
          {pinnedCount}/{PIN_LIMIT}
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="wms-ctxmenu-item"
        disabled={!favorite && favoritesFull}
        onClick={onToggleFavorite}
      >
        <Icon name="star" size={15} className={favorite ? "is-fav" : undefined} />
        <span>{favorite ? "즐겨찾기에서 빼기" : favoritesFull ? `즐겨찾기 — 최대 ${FAVORITES_LIMIT}개` : "즐겨찾기에 추가"}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="wms-ctxmenu-item"
        disabled={!isSplit && (!canSplit || tab.path === activePath)}
        onClick={isSplit ? onUnsplit : onSplit}
      >
        <Icon name={isSplit ? "splitOff" : "split"} size={15} />
        <span>{splitLabel}</span>
      </button>
      <div className="wms-ctxmenu-sep" role="separator" />
      {ITEMS.map((item, idx) => {
        if (item === "sep") return <div key={`sep-${idx}`} className="wms-ctxmenu-sep" role="separator" />;
        const count = closeCount(tabs, item.kind, tab.path);
        return (
          <button
            key={item.kind}
            type="button"
            role="menuitem"
            className={`wms-ctxmenu-item${item.danger ? " is-danger" : ""}`}
            disabled={count === 0}
            onClick={() => onAction(item.kind)}
          >
            <Icon name={item.icon} size={15} />
            <span>{item.label}</span>
            {item.kind !== "self" && count > 0 ? <span className="wms-ctxmenu-count">{count}</span> : null}
          </button>
        );
      })}
    </div>,
    document.body
  );
};

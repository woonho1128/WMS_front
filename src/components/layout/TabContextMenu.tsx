import { createPortal } from "react-dom";
import { PIN_LIMIT, closeCount, type CloseKind, type OpenTab } from "../../app/store/tabsStore";
import { Icon } from "../ui/Icon";
import { usePopupMenu } from "./usePopupMenu";

type Props = {
  /** 우클릭 위치 (viewport 좌표) */
  x: number;
  y: number;
  tab: OpenTab;
  tabs: OpenTab[];
  onAction: (kind: CloseKind) => void;
  onTogglePin: () => void;
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

/** 작업 탭 우클릭 메뉴 — 고정/해제 + 닫기 5종. 고정 탭은 어떤 닫기에도 포함되지 않는다 */
export const TabContextMenu = ({ x, y, tab, tabs, onAction, onTogglePin, onDismiss }: Props) => {
  const { menuRef, pos, handleKeyDown } = usePopupMenu({ x, y, onDismiss, focusKey: tab.path });
  const pinnedCount = tabs.filter((item) => item.pinned).length;
  const pinFull = !tab.pinned && pinnedCount >= PIN_LIMIT;

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

import { createPortal } from "react-dom";
import type { OpenTab } from "../../app/store/tabsStore";
import { Icon } from "../ui/Icon";
import { usePopupMenu } from "./usePopupMenu";

type Props = {
  /** "+N" 버튼 — 메뉴는 버튼 오른쪽 끝에 맞춰 아래로 연다 */
  anchor: HTMLElement;
  tabs: OpenTab[];
  activePath: string;
  onPick: (path: string) => void;
  onClose: (path: string) => void;
  onDismiss: () => void;
};

/** 탭 바에 다 못 들어간 탭 목록 — 좁은 화면에서만 나타난다 (가로 스크롤 대신) */
export const TabOverflowMenu = ({ anchor, tabs, activePath, onPick, onClose, onDismiss }: Props) => {
  const rect = anchor.getBoundingClientRect();
  const { menuRef, pos, handleKeyDown } = usePopupMenu({ x: rect.right, y: rect.bottom + 4, align: "end", onDismiss, anchor });

  return createPortal(
    <div
      ref={menuRef}
      className="wms-ctxmenu wms-tabs-overflow"
      role="menu"
      aria-label="넘친 탭"
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="wms-ctxmenu-head">탭 바에 다 안 들어간 탭 {tabs.length}개</div>
      {tabs.map((tab) => (
        <div key={tab.path} className="wms-tabs-overflow-row">
          <button
            type="button"
            role="menuitem"
            className={`wms-ctxmenu-item${tab.path === activePath ? " is-active" : ""}`}
            onClick={() => onPick(tab.path)}
            title={tab.label}
          >
            <Icon name={tab.pinned ? "pinTab" : "menu"} size={15} />
            <span>{tab.label}</span>
          </button>
          {tab.pinned ? null : (
            <button type="button" className="wms-tabs-overflow-x" onClick={() => onClose(tab.path)} aria-label={`${tab.label} 탭 닫기`}>
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
};

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { closeCount, type CloseKind, type OpenTab } from "../../app/store/tabsStore";
import { Icon } from "../ui/Icon";

type Props = {
  /** 우클릭 위치 (viewport 좌표) */
  x: number;
  y: number;
  tab: OpenTab;
  tabs: OpenTab[];
  onAction: (kind: CloseKind) => void;
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

const EDGE = 8;

/** 작업 탭 우클릭 메뉴. 바깥 클릭·Esc·스크롤·창 크기 변경 시 닫힌다. */
export const TabContextMenu = ({ x, y, tab, tabs, onAction, onDismiss }: Props) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // 화면 밖으로 넘치지 않게 위치 보정
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE))
    });
  }, [x, y]);

  // 열리면 첫 활성 항목에 포커스
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [tab.path]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("blur", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("blur", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [onDismiss]);

  // ↑↓ 로 항목 이동 (비활성 항목은 건너뛴다)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Tab") return;
    event.preventDefault();
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
    buttons[(current + step + buttons.length) % buttons.length].focus();
  };

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
      </div>
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

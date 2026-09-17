import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

const EDGE = 8;

type Options = {
  /** 기준 좌표 (viewport) — align "end" 면 x 가 메뉴 오른쪽 끝 */
  x: number;
  y: number;
  align?: "start" | "end";
  onDismiss: () => void;
  /** 메뉴를 여는 버튼 — 여기서 누른 건 바깥 클릭으로 치지 않는다 (버튼이 직접 열고 닫음) */
  anchor?: HTMLElement | null;
  /** 바뀌면 첫 항목에 다시 포커스 (열린 채로 다른 탭을 우클릭한 경우) */
  focusKey?: string;
};

/**
 * 탭 바 팝업 메뉴 공용 (우클릭 메뉴 · 넘친 탭 목록)
 * 화면 밖으로 넘치지 않게 위치를 잡고, 바깥 클릭·Esc·스크롤·창 크기 변경·창 포커스 이탈에 닫히며, ↑↓·Tab 으로 항목을 옮긴다.
 */
export const usePopupMenu = ({ x, y, align = "start", onDismiss, anchor, focusKey }: Options) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = align === "end" ? x - width : x;
    setPos({
      left: Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE))
    });
  }, [x, y, align]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [focusKey]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchor?.contains(target)) return;
      onDismiss();
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
  }, [onDismiss, anchor]);

  // ↑↓ 로 항목 이동 (비활성 항목은 건너뛴다)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Tab") return;
    event.preventDefault();
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button[role='menuitem']:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
    buttons[(current + step + buttons.length) % buttons.length].focus();
  };

  return { menuRef, pos, handleKeyDown };
};

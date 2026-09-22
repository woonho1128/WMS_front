import { useLayoutEffect, useRef, type ReactNode } from "react";

/* ============================================================
   좁은 칸(≤980px)에서 표를 카드 목록으로 바꿔 주는 껍데기.
   화면 코드는 지금 쓰던 <table> 을 그대로 두고 이 껍데기로 감싸기만 한다.

   기준은 **화면 폭이 아니라 표가 놓인 칸의 폭**이다 — 폰에서도, 절반으로 보기
   (분할 패널)에서도 같은 규칙으로 카드가 된다. 폭을 재서 `rt-cards` 를 붙인다.

   - 각 칸에 열 제목을 data-label 로 심어, CSS 가 "제목: 값" 줄로 그린다
     (styles/responsive.css `.rt-wrap.rt-cards`).
   - 열 머리(th)에 붙인 rt-title · rt-actions · rt-hide 는 그 열의 모든 칸에 옮겨 준다.
       rt-title   카드 제목 줄 (라벨 없이 크게)
       rt-actions 카드 맨 아래 버튼 줄 (가로로 꽉)
       rt-hide    폰에서는 감춘다 (제목 줄에 이미 담긴 값 등)
   - colSpan 이 있는 칸(로딩 · "없습니다" 줄)은 한 줄 전체로 둔다.
   ============================================================ */

const COLUMN_HINTS = ["rt-title", "rt-actions", "rt-hide"];

/** 이 폭 이하면 카드 — responsive.css 의 --bp-narrow 와 같은 값 */
const CARD_MAX = 980;

type Props = {
  children: ReactNode;
  /** 껍데기 div 에 더 붙일 클래스 */
  className?: string;
  /**
   * 언제 카드로 바꾸나.
   * - 숫자(기본 980): 칸 폭이 이 값 이하면 카드. 화면 폭을 다 쓰는 목록 표.
   * - `"fit"`: **표가 칸에 안 들어갈 때만** 카드. 패널 안에 있는 표 — 대시보드 현황 · 출고 요청서 ·
   *   배차처럼 PC 에서도 패널 폭이 제각각이라 숫자 하나로는 PC 에서 카드가 되거나 폰에서 잘린다.
   */
  cardsBelow?: number | "fit";
};

export const ResponsiveTable = ({ children, className, cardsBelow = CARD_MAX }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  const apply = () => {
    const root = ref.current;
    if (!root) return;
    if (cardsBelow === "fit") {
      // 표로 놓아 보고 칸에 들어가는지 잰다. 같은 콜백 안에서 다시 정하므로 화면에 깜빡이지 않는다
      const table = root.querySelector("table");
      root.classList.remove("rt-cards");
      const fits = !table || table.scrollWidth <= root.clientWidth + 1;
      root.classList.toggle("rt-cards", !fits);
      return;
    }
    root.classList.toggle("rt-cards", root.clientWidth <= cardsBelow);
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // 이 껍데기가 놓인 칸의 폭을 보고 표 ↔ 카드를 정한다 (창 크기·패널 비율이 바뀌면 다시)
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    applyRef.current();
    const observer = new ResizeObserver(() => applyRef.current());
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // 렌더될 때마다 다시 심는다 — 목록이 바뀌면 새 행에도 라벨이 붙어야 한다
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    // 표 안에 표가 있을 수 있다(펼친 상세 줄) — 바로 아래 자식만 골라 서로 섞이지 않게 한다
    root.querySelectorAll("table").forEach((table) => {
      const heads = [...table.querySelectorAll<HTMLTableCellElement>(":scope > thead > tr > th")];
      const labels = heads.map((th) => (th.textContent ?? "").trim());
      const hints = heads.map((th) => COLUMN_HINTS.filter((hint) => th.classList.contains(hint)));
      table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr").forEach((row) => {
        [...row.children].forEach((node, index) => {
          const cell = node as HTMLTableCellElement;
          if (cell.colSpan > 1) {
            cell.classList.add("rt-full");
            cell.removeAttribute("data-label");
            return;
          }
          // 이미 같은 값이면 건드리지 않는다 (수백 줄짜리 목록에서 매 렌더 쓰기 방지)
          const label = labels[index] ?? "";
          if (cell.dataset.label !== label) cell.dataset.label = label;
          (hints[index] ?? []).forEach((hint) => cell.classList.add(hint));
        });
      });
    });
    // "fit" 은 칸 폭이 그대로여도 내용(더 긴 거래처명 · 줄 추가)이 바뀌면 들어가는지가 달라진다
    if (cardsBelow === "fit") applyRef.current();
  });

  return (
    <div ref={ref} className={`rt-wrap${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
};

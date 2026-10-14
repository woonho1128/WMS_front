import { useEffect, useState } from "react";

/**
 * 브라우저 인쇄 — 별도 리포트 서버 없이 화면이 그려 찍는 출력 방식 (2026-10-14 결정: 새 시스템의 출력물은 이 방식).
 *
 * 쓰는 법
 * 1. `const { printing, print } = usePrint("is-printing-xxx", "A4", "8mm")`
 * 2. printing 동안 인쇄할 내용을 `createPortal(<div className="xxx-print-root">…</div>, document.body)` 로 붙인다
 * 3. 페이지 CSS 에서 화면을 숨긴다
 *    `@media print { html.is-printing-xxx body > *:not(.xxx-print-root) { display: none !important; } }`
 *
 * 서버·라이선스·글꼴 설치가 필요 없다. 용지 크기는 @page 로 맞추고, 인쇄 창에서 "PDF 로 저장"하면 파일도 된다.
 * (로케이션 라벨 LocationLabels.tsx 도 같은 방식이다)
 */
export const usePrint = (rootClass: string, pageSize: string, pageMargin = "0") => {
  const [printing, setPrinting] = useState(false);

  // 포털이 DOM 에 들어간 뒤 @page 를 맞추고 인쇄 창을 연다
  // (rAF 는 화면에 안 보이는 탭에서 멈추므로 타이머로 넘긴다)
  useEffect(() => {
    if (!printing) return;
    const style = document.createElement("style");
    style.textContent = `@page { size: ${pageSize}; margin: ${pageMargin}; }`;
    document.head.appendChild(style);
    const root = document.documentElement;
    root.classList.add(rootClass);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      style.remove();
      root.classList.remove(rootClass);
      window.removeEventListener("afterprint", finish);
      setPrinting(false);
    };
    window.addEventListener("afterprint", finish);
    const timer = window.setTimeout(() => window.print(), 30);
    return () => {
      window.clearTimeout(timer);
      finish();
    };
  }, [printing, rootClass, pageSize, pageMargin]);

  return { printing, print: () => setPrinting(true) };
};

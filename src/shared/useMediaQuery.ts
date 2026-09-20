import { useEffect, useState } from "react";

/**
 * 지금 이 화면 폭 조건에 맞는가.
 * 보이는 모양만 바꿀 때는 CSS 로 하고(app/styles/responsive.css), **다른 화면을 그려야 할 때만** 쓴다.
 * 예: 폰에서 배치 편집기를 목록 화면으로 바꿀 때, 좁은 화면에서 분할 보기를 접을 때.
 */
export const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
};

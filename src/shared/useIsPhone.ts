import { useEffect, useState } from "react";

/** 폰 기준 폭 — styles/responsive.css 의 --bp-phone 과 같은 값 */
export const PHONE_QUERY = "(max-width: 640px)";

/**
 * 지금 폰 폭인가.
 * 보이는 모양만 바꿀 때는 CSS 로 하고(styles/responsive.css), **다른 화면을 보여줘야 할 때만** 쓴다.
 * 예: 배치 편집기처럼 폰에서 아예 쓸 수 없는 화면을 안내로 바꿀 때.
 */
export const useIsPhone = () => {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setPhone(event.matches);
    setPhone(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return phone;
};

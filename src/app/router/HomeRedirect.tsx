import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { homePathFor, resolveScreenPath } from "../menuConfig";
import { FAVORITES_KEY, navPrefsReady, useNavPrefsStore } from "../store/navPrefsStore";
import { HOME_PATH } from "../store/tabsStore";
import { useUiStore } from "../store/uiStore";

/**
 * 첫 화면 (`/` — 로그인 직후 · 주소 없이 들어올 때).
 * 탭형이고 즐겨찾기가 있으면 ★ 에서 마지막으로 보던 화면, 아니면 물류 현황
 * (DOCS/WMS_메뉴방식_즐겨찾기_설계.md §2 "탭형 첫 화면").
 *
 * 설정은 로그인과 함께 navPrefsStore 가 불러온다. 사내 빌드는 서버에서 받는 중일 수 있어
 * 받을 때까지(길어도 1.5초) 기다렸다가 정한다 — 새 PC 에서 로그인해도 쓰던 배치의 첫 화면으로 가게.
 * (로그인 화면에서 기다릴 수는 없다: 로그인되는 순간 라우터가 곧바로 여기로 보낸다)
 */
export const HomeRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    void navPrefsReady().then(() => {
      if (!alive) return;
      const { navMode, favorites, lastScreenBySection, setActiveCategory } = useNavPrefsStore.getState();
      const role = useUiStore.getState().currentRole;
      const mine = navMode === "tabs" ? favorites.filter((path) => resolveScreenPath(path, role).status === "ok") : [];
      if (!mine.length) {
        navigate(homePathFor(role, HOME_PATH), { replace: true });
        return;
      }
      const last = lastScreenBySection[FAVORITES_KEY];
      setActiveCategory(FAVORITES_KEY);
      navigate(last && mine.includes(last) ? last : mine[0], { replace: true });
    });
    return () => {
      alive = false;
    };
  }, [navigate]);

  return null;
};

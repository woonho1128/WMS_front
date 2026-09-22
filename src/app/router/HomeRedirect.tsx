import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { resolveScreenPath } from "../menuConfig";
import { FAVORITES_KEY, useNavPrefsStore } from "../store/navPrefsStore";
import { HOME_PATH } from "../store/tabsStore";
import { useUiStore } from "../store/uiStore";

/**
 * 첫 화면 (`/` — 로그인 직후 · 주소 없이 들어올 때).
 * 탭형이고 즐겨찾기가 있으면 ★ 에서 마지막으로 보던 화면, 아니면 물류 현황
 * (DOCS/WMS_메뉴방식_즐겨찾기_설계.md §2 "탭형 첫 화면").
 *
 * 설정은 로그인과 함께 navPrefsStore 가 이미 불러 둔다. 한 번만 정하면 되므로 effect 에서 그때 값을 읽는다.
 */
export const HomeRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const { navMode, favorites, lastScreenBySection, setActiveCategory } = useNavPrefsStore.getState();
    const role = useUiStore.getState().currentRole;
    const mine = navMode === "tabs" ? favorites.filter((path) => resolveScreenPath(path, role).status === "ok") : [];
    if (!mine.length) {
      navigate(HOME_PATH, { replace: true });
      return;
    }
    const last = lastScreenBySection[FAVORITES_KEY];
    setActiveCategory(FAVORITES_KEY);
    navigate(last && mine.includes(last) ? last : mine[0], { replace: true });
  }, [navigate]);

  return null;
};

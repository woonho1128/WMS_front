import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { RECOMMENDED_FAVORITES, getMenuSectionsForRole, resolveScreenPath } from "../../app/menuConfig";
import { FAVORITES_KEY, FAVORITES_LIMIT, sectionOfPath, useNavPrefsStore } from "../../app/store/navPrefsStore";
import { SPLIT_MIN_QUERY, useTabsStore } from "../../app/store/tabsStore";
import { useUiStore } from "../../app/store/uiStore";
import { useMediaQuery } from "../../shared/useMediaQuery";
import { Icon } from "../ui/Icon";
import { usePopupMenu } from "./usePopupMenu";
import "./WorkspaceTabs.css";

/* ============================================================
   탭형 메뉴의 위 탭 줄 (설계 DOCS/WMS_메뉴방식_즐겨찾기_설계.md)
   - 고른 카테고리의 화면들을 메뉴 순서 그대로 보여 준다. 닫기 · 한도가 없는 "메뉴 탭"이다.
   - ★ 를 고르면 내 즐겨찾기 — 사람마다 다른 탭 줄. 끌어서(또는 편집에서 ◀ ▶) 순서를 바꾼다.
   - 오른쪽: 최근 본 화면 8개 · 나란히 보기.
   목록형의 작업 탭(WorkspaceTabs)과 모양은 같게, 성질은 다르게 둔다.
   ============================================================ */

type Item = { path: string; label: string; sectionLabel: string };
type MenuState = { x: number; y: number; item: Item } | null;

type Props = {
  /** 지금 주소 (왼쪽 패널에 보이는 화면) */
  activePath: string;
};

export const CategoryTabBar = ({ activePath }: Props) => {
  const navigate = useNavigate();
  const role = useUiStore((state) => state.currentRole);
  const favorites = useNavPrefsStore((state) => state.favorites);
  const recent = useNavPrefsStore((state) => state.recent);
  const activeCategory = useNavPrefsStore((state) => state.activeCategory);
  const toggleFavorite = useNavPrefsStore((state) => state.toggleFavorite);
  const reorderFavorite = useNavPrefsStore((state) => state.reorderFavorite);
  const fillFavorites = useNavPrefsStore((state) => state.fillFavorites);
  const splitPath = useTabsStore((state) => state.splitPath);
  const openSplit = useTabsStore((state) => state.openSplit);
  const closeSplit = useTabsStore((state) => state.closeSplit);
  const canSplit = useMediaQuery(SPLIT_MIN_QUERY);

  const [menu, setMenu] = useState<MenuState>(null);
  const [recentButton, setRecentButton] = useState<HTMLButtonElement | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const dragFrom = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 가로로 더 밀 수 있는 쪽 — 가장자리를 흐리게 해서 "더 있다"를 보인다 */
  const [edges, setEdges] = useState({ left: false, right: false });

  const sections = getMenuSectionsForRole(role);
  const category = activeCategory ?? sectionOfPath(activePath);
  const onFavorites = category === FAVORITES_KEY;
  const section = sections.find((item) => item.slug === category) ?? null;

  /** 이 역할이 볼 수 있는 화면만 — 역할이 바뀌어 못 보게 된 즐겨찾기는 숨기기만 한다(지우지 않음) */
  const describe = (path: string): Item | null => {
    const target = resolveScreenPath(path, role);
    if (target.status !== "ok") return null;
    return { path, label: target.label, sectionLabel: sections.find((item) => item.slug === target.sectionSlug)?.label ?? "" };
  };

  const items: Item[] = onFavorites
    ? favorites.map(describe).filter((item): item is Item => item !== null)
    : section
      ? section.features.map((feature) => ({ path: `/${section.slug}/${feature.slug}`, label: feature.label, sectionLabel: section.label }))
      : [];
  const recentItems = recent
    .filter((path) => path !== activePath)
    .map(describe)
    .filter((item): item is Item => item !== null);
  const recommended = (RECOMMENDED_FAVORITES[role] ?? []).filter((path) => describe(path) !== null);
  const full = favorites.length >= FAVORITES_LIMIT;
  const splitPartner = recentItems[0] ?? null;

  /* ---------- 넘치는 탭 줄 (재고관리 10개 · 좁은 창 · 나란히 보기) ----------
     줄이지 않고 가로로 민다. 마우스 휠(세로)도 가로로 돌리고, 보고 있는 탭은 늘 보이게 당긴다 */
  const measureEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // React 의 onWheel 은 passive 라 막을 수 없다 — 직접 단다
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || el.scrollWidth <= el.clientWidth) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    const observer = new ResizeObserver(measureEdges);
    observer.observe(el);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemKey = items.map((item) => item.path).join("|");
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const tab = el?.querySelector<HTMLElement>(".wms-tab.active");
    if (el && tab) {
      const pad = 24;
      if (tab.offsetLeft < el.scrollLeft + pad) el.scrollLeft = tab.offsetLeft - pad;
      else if (tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth - pad) {
        el.scrollLeft = tab.offsetLeft + tab.offsetWidth - el.clientWidth + pad;
      }
    }
    measureEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, itemKey, editing]);

  const stop = (action: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    action();
  };

  const onDragStart = (path: string) => (event: DragEvent) => {
    dragFrom.current = path;
    event.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (path: string) => (event: DragEvent) => {
    event.preventDefault();
    if (dragFrom.current !== null) reorderFavorite(dragFrom.current, path);
    dragFrom.current = null;
  };

  return (
    <div className={`wms-tabs is-category${editing ? " is-editing" : ""}`}>
      <span className={`wms-cattabs-head${onFavorites ? " is-fav" : ""}`}>
        {onFavorites ? (
          <>
            <Icon name="star" size={14} />
            즐겨찾기
            <small>
              {favorites.length}/{FAVORITES_LIMIT}
            </small>
          </>
        ) : (
          section?.label ?? ""
        )}
      </span>

      <div
        ref={scrollRef}
        className={`wms-cattabs-scroll${edges.left ? " has-left" : ""}${edges.right ? " has-right" : ""}`}
        role="tablist"
        aria-label={onFavorites ? "즐겨찾기" : `${section?.label ?? ""} 화면`}
        onScroll={measureEdges}
      >
        {items.map((item, index) => {
          const active = item.path === activePath;
          const favorite = favorites.includes(item.path);
          const inSplit = item.path === splitPath;
          return (
            <div
              key={item.path}
              role="tab"
              aria-selected={active}
              className={`wms-tab${active ? " active" : ""}${inSplit ? " is-split" : ""}${menu?.item.path === item.path ? " is-menu" : ""}${
                onFavorites && !editing ? " is-plain" : ""
              }`}
              onClick={() => {
                if (!editing) navigate(item.path);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setRecentOpen(false);
                setMenu({ x: event.clientX, y: event.clientY, item });
              }}
              draggable={onFavorites && !editing}
              onDragStart={onFavorites ? onDragStart(item.path) : undefined}
              onDragOver={onFavorites ? (event) => dragFrom.current !== null && event.preventDefault() : undefined}
              onDrop={onFavorites ? onDrop(item.path) : undefined}
              onDragEnd={() => {
                dragFrom.current = null;
              }}
              title={`${onFavorites ? `${item.sectionLabel} › ` : ""}${item.label}${inSplit ? " · 오른쪽 패널" : ""} · 우클릭: 탭 메뉴`}
            >
              {inSplit ? <Icon name="split" size={13} className="wms-tab-splitmark" /> : null}
              <span className="wms-tab-label">{item.label}</span>
              {editing ? (
                <span className="wms-cattab-edit">
                  <button
                    type="button"
                    aria-label={`${item.label} 앞으로`}
                    disabled={index === 0}
                    onClick={stop(() => reorderFavorite(item.path, items[index - 1].path))}
                  >
                    <Icon name="chevL" size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`${item.label} 뒤로`}
                    disabled={index === items.length - 1}
                    onClick={stop(() => reorderFavorite(item.path, items[index + 1].path))}
                  >
                    <Icon name="chevR" size={12} />
                  </button>
                  <button type="button" className="is-remove" aria-label={`${item.label} 즐겨찾기에서 빼기`} onClick={stop(() => toggleFavorite(item.path))}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ) : onFavorites ? null : (
                // ★ 에서는 전부 즐겨찾기라 별을 달지 않는다 — 12개가 한 줄에 들도록 폭을 아낀다(빼기는 편집 · 우클릭)
                <button
                  type="button"
                  className={`wms-tab-star${favorite ? " is-on" : ""}`}
                  aria-pressed={favorite}
                  aria-label={favorite ? `${item.label} 즐겨찾기에서 빼기` : `${item.label} 즐겨찾기에 추가`}
                  title={favorite ? "즐겨찾기에서 빼기" : full ? `즐겨찾기는 ${FAVORITES_LIMIT}개까지` : "즐겨찾기에 추가"}
                  disabled={!favorite && full}
                  onClick={stop(() => toggleFavorite(item.path))}
                >
                  <Icon name="star" size={13} />
                </button>
              )}
            </div>
          );
        })}

        {onFavorites && items.length === 0 ? (
          <div className="wms-cattabs-empty">
            <span>
              아직 즐겨찾기가 없습니다 — 아무 화면 탭의 <Icon name="star" size={12} /> 를 누르거나 우클릭 → "즐겨찾기에 추가"
            </span>
            {recommended.length ? (
              <button
                type="button"
                className="wms-tabs-btn is-primary"
                onClick={() => {
                  fillFavorites(recommended);
                  navigate(recommended[0]);
                }}
              >
                추천으로 채우기
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="wms-tabs-actions">
        {onFavorites && items.length > 0 ? (
          <button
            type="button"
            className={`wms-tabs-btn${editing ? " is-on" : ""}`}
            onClick={() => setEditing((on) => !on)}
            aria-label={editing ? "편집 끝내기" : "즐겨찾기 편집"}
            title={editing ? "편집 끝내기" : "순서 바꾸기 · 빼기"}
          >
            <Icon name={editing ? "check" : "edit"} size={14} />
            <span className="wms-tabs-btn-label">{editing ? "완료" : "편집"}</span>
          </button>
        ) : null}
        <button
          ref={setRecentButton}
          type="button"
          className={`wms-tabs-btn${recentOpen ? " is-on" : ""}`}
          onClick={() => {
            setMenu(null);
            setRecentOpen((open) => !open);
          }}
          disabled={!recentItems.length}
          aria-haspopup="menu"
          aria-expanded={recentOpen}
          aria-label="최근 본 화면"
          title="최근 본 화면 — 카테고리를 오가며 일할 때"
        >
          <Icon name="clock" size={14} />
          <span className="wms-tabs-btn-label">최근</span>
          <Icon name="chevD" size={12} />
        </button>
        {canSplit ? (
          <button
            type="button"
            className={`wms-tabs-split${splitPath ? " is-on" : ""}`}
            onClick={() => (splitPath ? closeSplit() : splitPartner && openSplit(splitPartner.path))}
            disabled={!splitPath && !splitPartner}
            aria-label={splitPath ? "분할 해제" : "나란히 보기"}
            title={splitPath ? "오른쪽 패널을 닫고 한 화면으로" : splitPartner ? `‘${splitPartner.label}’ 을(를) 오른쪽에 나란히` : "나란히 볼 화면이 없습니다"}
          >
            <Icon name={splitPath ? "splitOff" : "split"} size={14} />
            <span className="wms-tabs-btn-label">{splitPath ? "분할 해제" : "나란히 보기"}</span>
          </button>
        ) : null}
      </div>

      {menu ? (
        <CategoryTabMenu
          x={menu.x}
          y={menu.y}
          item={menu.item}
          favorite={favorites.includes(menu.item.path)}
          full={full}
          activePath={activePath}
          splitPath={splitPath}
          canSplit={canSplit}
          onToggleFavorite={() => {
            toggleFavorite(menu.item.path);
            setMenu(null);
          }}
          onSplit={() => {
            openSplit(menu.item.path);
            setMenu(null);
          }}
          onUnsplit={() => {
            closeSplit();
            setMenu(null);
          }}
          onDismiss={() => setMenu(null)}
        />
      ) : null}

      {recentOpen && recentButton && recentItems.length ? (
        <RecentMenu
          anchor={recentButton}
          items={recentItems}
          onPick={(path) => {
            setRecentOpen(false);
            navigate(path);
          }}
          onDismiss={() => setRecentOpen(false)}
        />
      ) : null}
    </div>
  );
};

/* ---------------- 탭 우클릭 메뉴 (탭형) ---------------- */

type TabMenuProps = {
  x: number;
  y: number;
  item: Item;
  favorite: boolean;
  full: boolean;
  activePath: string;
  splitPath: string | null;
  canSplit: boolean;
  onToggleFavorite: () => void;
  onSplit: () => void;
  onUnsplit: () => void;
  onDismiss: () => void;
};

const CategoryTabMenu = ({ x, y, item, favorite, full, activePath, splitPath, canSplit, onToggleFavorite, onSplit, onUnsplit, onDismiss }: TabMenuProps) => {
  const { menuRef, pos, handleKeyDown } = usePopupMenu({ x, y, onDismiss, focusKey: item.path });
  const isSplit = item.path === splitPath;
  const splitLabel = isSplit
    ? "분할 해제"
    : !canSplit
      ? "나란히 열기 — 1280px 이상에서"
      : item.path === activePath
        ? "나란히 열기 — 다른 탭에서"
        : "오른쪽에 나란히 열기";

  return createPortal(
    <div
      ref={menuRef}
      className="wms-ctxmenu"
      role="menu"
      aria-label={`${item.label} 탭 메뉴`}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="wms-ctxmenu-head" title={item.label}>
        {item.label}
      </div>
      <button type="button" role="menuitem" className="wms-ctxmenu-item" disabled={!favorite && full} onClick={onToggleFavorite}>
        <Icon name="star" size={15} className={favorite ? "is-fav" : undefined} />
        <span>{favorite ? "즐겨찾기에서 빼기" : full ? `즐겨찾기 — 최대 ${FAVORITES_LIMIT}개` : "즐겨찾기에 추가"}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="wms-ctxmenu-item"
        disabled={!isSplit && (!canSplit || item.path === activePath)}
        onClick={isSplit ? onUnsplit : onSplit}
      >
        <Icon name={isSplit ? "splitOff" : "split"} size={15} />
        <span>{splitLabel}</span>
      </button>
    </div>,
    document.body
  );
};

/* ---------------- 최근 본 화면 ---------------- */

const RecentMenu = ({ anchor, items, onPick, onDismiss }: { anchor: HTMLElement; items: Item[]; onPick: (path: string) => void; onDismiss: () => void }) => {
  const rect = anchor.getBoundingClientRect();
  const { menuRef, pos, handleKeyDown } = usePopupMenu({ x: rect.right, y: rect.bottom + 4, align: "end", onDismiss, anchor });

  return createPortal(
    <div
      ref={menuRef}
      className="wms-ctxmenu wms-recent"
      role="menu"
      aria-label="최근 본 화면"
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="wms-ctxmenu-head">최근 본 화면</div>
      {items.map((item) => (
        <button key={item.path} type="button" role="menuitem" className="wms-ctxmenu-item" onClick={() => onPick(item.path)} title={item.label}>
          <Icon name="clock" size={15} />
          <span>
            <small className="wms-recent-sec">{item.sectionLabel} ›</small> {item.label}
          </span>
        </button>
      ))}
    </div>,
    document.body
  );
};

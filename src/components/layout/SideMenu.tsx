import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { MenuFeature, MenuSection } from "../../app/menuConfig";
import { matchText, type MatchRange } from "../../app/menuSearch";
import { Icon } from "../ui/Icon";

type Props = {
  sections: MenuSection[];
  /** 현재 경로의 섹션 slug */
  activeSection?: string;
  collapsed: boolean;
  isMobile: () => boolean;
  /** 접힌 사이드바/모바일 드로어를 펼쳐 달라는 요청 (검색 진입 시) */
  onRequestOpen: () => void;
};

type FeatureRow = { feature: MenuFeature; range: MatchRange | null };
type SectionRow = { section: MenuSection; range: MatchRange | null; features: FeatureRow[] };
type DescHit = { section: MenuSection; feature: MenuFeature; range: MatchRange };

const Highlight = ({ text, range }: { text: string; range: MatchRange | null }) => {
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="wms-hl">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
};

/** 설명 일치 시 맞은 부분 주변만 잘라 보여준다 */
const DescSnippet = ({ text, range }: { text: string; range: MatchRange }) => {
  const from = Math.max(0, range[0] - 8);
  const to = Math.min(text.length, range[1] + 18);
  return (
    <span className="wms-sublink-desc">
      {from > 0 ? "…" : ""}
      <Highlight text={text.slice(from, to)} range={[range[0] - from, range[1] - from]} />
      {to < text.length ? "…" : ""}
    </span>
  );
};

const pathOf = (section: MenuSection, feature: MenuFeature) => `/${section.slug}/${feature.slug}`;

/**
 * 좌측 메뉴 트리 + 클라이언트 사이드 메뉴 검색.
 *
 * 결과는 두 단계로 보여준다.
 *  1) 이름 일치  — 메뉴 트리 모양 그대로 (섹션명이 맞으면 하위 화면 전체)
 *  2) 설명 일치  — 이름엔 없지만 화면 설명에 키워드가 있는 화면 (QR, ERP, BOM …)
 * 키보드 커서는 1) 부터 시작하므로 Enter 는 항상 이름이 맞는 화면을 먼저 연다.
 */
export const SideMenu = ({ sections, activeSection, collapsed, isMobile, onRequestOpen }: Props) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [expanded, setExpanded] = useState<string>(activeSection ?? "dashboard");
  /** 검색창 포커스 요청 — 접힌 사이드바가 펼쳐져 입력창이 실제로 보인 뒤에 처리한다 */
  const pendingFocus = useRef(false);

  // 경로가 바뀌면 해당 섹션을 펼친다
  useEffect(() => {
    if (activeSection) setExpanded(activeSection);
  }, [activeSection]);

  // 사이드바를 접으면 검색을 끝낸 것으로 본다 (아이콘만 남는 폭에 결과 목록을 둘 수 없다)
  useEffect(() => {
    if (collapsed && !isMobile()) setQuery("");
  }, [collapsed, isMobile]);

  // 매 커밋 뒤: 포커스 요청이 있고 입력창이 보이면(display:none 이 풀렸으면) 포커스
  useEffect(() => {
    const input = inputRef.current;
    if (!pendingFocus.current || !input || input.offsetParent === null) return;
    pendingFocus.current = false;
    input.focus({ preventScroll: true });
    input.select();
  });

  const requestFocus = () => {
    pendingFocus.current = true;
    onRequestOpen();
    // 이미 펼쳐져 있으면 리렌더가 없으므로 바로 처리
    const input = inputRef.current;
    if (input && input.offsetParent !== null) {
      pendingFocus.current = false;
      input.focus({ preventScroll: true });
      input.select();
    }
  };

  const searching = query.trim().length > 0;

  const { nameRows, descHits } = useMemo(() => {
    if (!searching) return { nameRows: [] as SectionRow[], descHits: [] as DescHit[] };

    const nameRows: SectionRow[] = [];
    const descHits: DescHit[] = [];
    // 설명 검색은 기능 키워드용이다. 한 글자나 초성이 섞인 검색어는 긴 설명문 곳곳에 걸려
    // 결과가 과하게 넓어지므로 메뉴 이름에만 적용한다.
    const compact = query.replace(/\s+/g, "");
    const useDesc = compact.length >= 2 && !/[ㄱ-ㅎ]/.test(compact);

    for (const section of sections) {
      const sectionRange = matchText(section.label, query);
      const features: FeatureRow[] = [];
      for (const feature of section.features) {
        const range = matchText(feature.label, query);
        if (sectionRange || range) {
          features.push({ feature, range });
          continue;
        }
        const descRange = useDesc ? matchText(feature.description, query) : null;
        if (descRange) descHits.push({ section, feature, range: descRange });
      }
      if (features.length) nameRows.push({ section, range: sectionRange, features });
    }
    return { nameRows, descHits };
  }, [sections, query, searching]);

  // 키보드 이동 순서 = 화면에 보이는 순서 (이름 일치 → 설명 일치)
  const flatHits = useMemo(
    () => [
      ...nameRows.flatMap((row) => row.features.map((f) => pathOf(row.section, f.feature))),
      ...descHits.map((hit) => pathOf(hit.section, hit.feature))
    ],
    [nameRows, descHits]
  );
  const hitIndex = useMemo(() => new Map(flatHits.map((path, index) => [path, index])), [flatHits]);

  useEffect(() => setCursor(0), [query]);

  // 키보드 커서가 가리키는 항목이 보이도록 스크롤
  useEffect(() => {
    const path = flatHits[cursor];
    if (path) itemRefs.current.get(path)?.scrollIntoView({ block: "nearest" });
  }, [cursor, flatHits]);

  // Ctrl(⌘)+K — 어디서든 메뉴 검색으로
  const requestFocusRef = useRef(requestFocus);
  requestFocusRef.current = requestFocus;
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        requestFocusRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((value) => Math.min(value + 1, Math.max(flatHits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      const path = flatHits[cursor];
      if (path) {
        event.preventDefault();
        navigate(path);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (query) setQuery("");
      else inputRef.current?.blur();
    }
  };

  const handleSectionClick = (slug: string, firstFeature?: string) => {
    if (searching) return; // 검색 중에는 결과 섹션이 항상 펼쳐져 있다
    // 접힌 사이드바에서는 첫 화면으로 바로 이동, 그 외에는 하위 화면 목록을 펼친다.
    if (collapsed && !isMobile()) {
      if (firstFeature) navigate(`/${slug}/${firstFeature}`);
      return;
    }
    setExpanded((prev) => (prev === slug ? "" : slug));
  };

  const bindItem = (path: string) => (el: HTMLAnchorElement | null) => {
    if (el) itemRefs.current.set(path, el);
    else itemRefs.current.delete(path);
  };

  const itemClass = (path: string) => ({ isActive }: { isActive: boolean }) =>
    `wms-sublink${isActive ? " active" : ""}${searching && hitIndex.get(path) === cursor ? " is-cursor" : ""}`;

  const hoverItem = (path: string) =>
    searching ? () => setCursor(hitIndex.get(path) ?? 0) : undefined;

  const treeRows: SectionRow[] = searching
    ? nameRows
    : sections.map((section) => ({
        section,
        range: null,
        features: section.features.map((feature) => ({ feature, range: null }))
      }));

  return (
    <>
      <div className="wms-menusearch">
        <label className="wms-menusearch-box">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메뉴 검색 (초성 가능)"
            aria-label="메뉴 검색"
            aria-controls="wms-side-nav"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              className="wms-menusearch-clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="검색어 지우기"
            >
              <Icon name="x" size={13} />
            </button>
          ) : (
            <kbd className="wms-menusearch-kbd">Ctrl K</kbd>
          )}
        </label>
        <button
          type="button"
          className="wms-menusearch-mini"
          onClick={requestFocus}
          title="메뉴 검색 (Ctrl+K)"
          aria-label="메뉴 검색"
        >
          <Icon name="search" size={18} />
        </button>
        {searching ? (
          <div className="wms-menusearch-meta" aria-live="polite">
            {flatHits.length ? (
              <>
                <b>{flatHits.length}</b>개 화면 · ↑↓ 이동 · Enter 열기
              </>
            ) : (
              "일치하는 메뉴가 없습니다"
            )}
          </div>
        ) : null}
      </div>

      <nav className={`wms-nav${searching ? " is-searching" : ""}`} id="wms-side-nav">
        {treeRows.map(({ section, range, features }) => {
          const isActiveSection = activeSection === section.slug;
          const open = searching || expanded === section.slug || isActiveSection;
          return (
            <div key={section.slug} className={`wms-navgroup${open ? " open" : ""}`}>
              <button
                type="button"
                className={`wms-navitem${isActiveSection ? " active" : ""}`}
                onClick={() => handleSectionClick(section.slug, section.features[0]?.slug)}
                title={section.label}
              >
                <span className="wms-ni-ico">
                  <Icon path={section.iconPath} filled size={20} />
                </span>
                <span className="wms-ni-label">
                  <Highlight text={section.label} range={range} />
                </span>
                <span className="wms-ni-caret">
                  <Icon name="chevR" size={15} />
                </span>
              </button>
              {open ? (
                <div className="wms-subtree">
                  {features.map(({ feature, range: featureRange }) => {
                    const path = pathOf(section, feature);
                    return (
                      <NavLink
                        key={feature.slug}
                        to={path}
                        ref={bindItem(path)}
                        className={itemClass(path)}
                        onMouseEnter={hoverItem(path)}
                        title={feature.description}
                      >
                        <span className="wms-sublink-label">
                          <Highlight text={feature.label} range={featureRange} />
                        </span>
                      </NavLink>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        {descHits.length ? (
          <div className="wms-deschits">
            <div className="wms-navsec">설명 일치</div>
            {descHits.map(({ section, feature, range }) => {
              const path = pathOf(section, feature);
              return (
                <NavLink
                  key={path}
                  to={path}
                  ref={bindItem(path)}
                  className={itemClass(path)}
                  onMouseEnter={hoverItem(path)}
                  title={feature.description}
                >
                  <span className="wms-sublink-label">
                    <span className="wms-sublink-sec">{section.label} ›</span> {feature.label}
                  </span>
                  <DescSnippet text={feature.description} range={range} />
                </NavLink>
              );
            })}
          </div>
        ) : null}

        {searching && !flatHits.length ? (
          <div className="wms-nav-empty">
            <Icon name="search" size={22} />
            <span>
              ‘{query.trim()}’ 와(과) 일치하는 메뉴가 없습니다.
              <br />
              초성(예: ㅇㄱㅎㅈ)으로도 찾을 수 있습니다.
            </span>
          </div>
        ) : null}
      </nav>
    </>
  );
};

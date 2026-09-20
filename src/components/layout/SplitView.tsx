import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { resolveScreenPath } from "../../app/menuConfig";
import {
  SPLIT_DEFAULT_RATIO,
  SPLIT_MAX_RATIO,
  SPLIT_MIN_RATIO,
  useTabsStore
} from "../../app/store/tabsStore";
import { useUiStore } from "../../app/store/uiStore";
import { WorkbenchPage } from "../../pages/workbench/WorkbenchPage";
import { Icon } from "../ui/Icon";

type Props = {
  /** 왼쪽 패널 — 라우터가 그리는 지금 화면 */
  children: ReactNode;
  /** 왼쪽 패널 화면명 */
  mainLabel: string;
  /** 오른쪽 패널에 그릴 경로 */
  splitPath: string;
};

/** ←→ 한 번에 움직이는 비율 */
const STEP = 0.02;

/**
 * 절반으로 보기 — 탭 하나를 오른쪽에 나란히 띄운다.
 *
 * 왼쪽은 라우터가 그리는 지금 화면(탭 바에서 고르는 쪽), 오른쪽은 경로로 직접 그린다.
 * 라우트가 `/:섹션/:화면` 하나뿐이고 화면은 WorkbenchPage 가 slug 로 고르므로
 * 라우터를 복제하지 않고 같은 컴포넌트를 한 번 더 그리면 된다.
 * 주의: 화면 안에서 주소 파라미터(`?outboundNo=` 등)를 읽는 곳은 왼쪽 패널 기준이다 —
 * 링크로 넘기는 이동은 왼쪽에서만 쓴다.
 */
export const SplitView = ({ children, mainLabel, splitPath }: Props) => {
  const navigate = useNavigate();
  const role = useUiStore((state) => state.currentRole);
  const ratio = useTabsStore((state) => state.splitRatio);
  const setSplitRatio = useTabsStore((state) => state.setSplitRatio);
  const closeSplit = useTabsStore((state) => state.closeSplit);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const target = resolveScreenPath(splitPath, role);
  const label = target.status === "ok" ? target.label : "나란히 보기";

  const dragTo = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSplitRatio((clientX - rect.left) / rect.width);
  };

  const stopDrag = () => setDragging(false);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") setSplitRatio(ratio - STEP);
    else if (event.key === "ArrowRight") setSplitRatio(ratio + STEP);
    else if (event.key === "Home" || event.key === "Enter") setSplitRatio(SPLIT_DEFAULT_RATIO);
    else if (event.key === "Escape") closeSplit();
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={wrapRef}
      className={`wms-split${dragging ? " is-drag" : ""}`}
      style={{ "--split-left": `${(ratio * 100).toFixed(2)}%` } as CSSProperties}
    >
      <section className="wms-pane wms-pane-main" aria-label={`왼쪽 화면 · ${mainLabel}`}>
        <header className="wms-pane-head">
          <span className="wms-pane-name">{mainLabel}</span>
          <small>탭에서 고르는 쪽</small>
        </header>
        <div className="wms-pane-body">{children}</div>
      </section>

      <div
        className="wms-split-bar"
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 비율"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(SPLIT_MIN_RATIO * 100)}
        aria-valuemax={Math.round(SPLIT_MAX_RATIO * 100)}
        tabIndex={0}
        title="끌어서 비율 조절 · 두 번 누르면 반반 · ←→ 로도 조절"
        onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (dragging) dragTo(event.clientX);
        }}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={stopDrag}
        onDoubleClick={() => setSplitRatio(SPLIT_DEFAULT_RATIO)}
        onKeyDown={handleKeyDown}
      />

      <section className="wms-pane wms-pane-side" aria-label={`오른쪽 화면 · ${label}`}>
        <header className="wms-pane-head">
          <span className="wms-pane-name">{label}</span>
          <div className="wms-pane-acts">
            <button
              type="button"
              className="wms-pane-btn"
              title="좌우 바꾸기"
              aria-label="좌우 바꾸기"
              onClick={() => navigate(splitPath)}
            >
              <Icon name="swap" size={15} />
            </button>
            <button
              type="button"
              className="wms-pane-btn"
              title="이 화면만 크게 보기"
              aria-label="이 화면만 크게 보기"
              onClick={() => {
                closeSplit();
                navigate(splitPath);
              }}
            >
              <Icon name="maximize" size={15} />
            </button>
            <button
              type="button"
              className="wms-pane-btn is-close"
              title="분할 닫기"
              aria-label="분할 닫기"
              onClick={closeSplit}
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        </header>
        <div className="wms-pane-body">
          {target.status === "ok" ? (
            <WorkbenchPage sectionSlug={target.sectionSlug} featureSlug={target.featureSlug} title={target.label} />
          ) : (
            <p className="wms-pane-empty">
              {target.status === "denied" ? "이 역할에는 권한이 없는 화면입니다." : "메뉴에 없는 화면입니다."}
            </p>
          )}
        </div>
      </section>

      {/* 끄는 동안 글자가 선택되지 않게 덮는다 (포인터는 손잡이가 잡고 있다) */}
      {dragging ? <div className="wms-split-shield" /> : null}
    </div>
  );
};

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { QrBox } from "../../components/ui/QrBox";
import { LOCATION_TYPE_LABEL, type LocationType } from "../../components/warehouse3d/types";
import "./locationLabels.css";

/* ============================================================
   로케이션 QR 라벨 출력
   · QR 에는 로케이션 코드만 넣는다 — 격납·보충 화면의 "로케이션 QR 확인" 칸이 코드와 그대로 비교한다
   · 용지: 라벨 프린터(100×50mm, 한 장에 1개) / A4 라벨지(3열×8행, 70×37mm)
   · 인쇄는 브라우저 인쇄 창 — 라벨만 남기고 화면은 숨기며 @page 크기를 용지에 맞춘다
   ============================================================ */

export type LabelTarget = {
  locationId: number;
  code: string;
  warehouseName: string;
  zoneName: string;
  floor: string | null;
  rackCode: string | null;
  bay: number | null;
  level: number | null;
  locationType: string;
};

type PaperKey = "thermal" | "a4";
type ArrowKey = "none" | "up" | "down";
type LabelOptions = { paper: PaperKey; arrow: ArrowKey };

const PAPERS: Record<PaperKey, { label: string; size: string; page: string; perPage: number; preview: number }> = {
  thermal: { label: "라벨 프린터", size: "100 × 50 mm · 한 장에 1개", page: "100mm 50mm", perPage: 1, preview: 4 },
  a4: { label: "A4 라벨지", size: "3열 × 8행 · 칸 70 × 37 mm", page: "A4", perPage: 24, preview: 24 }
};

const ARROWS: Array<{ key: ArrowKey; label: string }> = [
  { key: "none", label: "없음" },
  { key: "up", label: "▲ 위 칸" },
  { key: "down", label: "▼ 아래 칸" }
];

const OPTIONS_KEY = "wms.labels.options";

const readOptions = (): LabelOptions => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(OPTIONS_KEY) ?? "null");
    return {
      paper: saved?.paper === "a4" ? "a4" : "thermal",
      arrow: saved?.arrow === "up" || saved?.arrow === "down" ? saved.arrow : "none"
    };
  } catch {
    return { paper: "thermal", arrow: "none" };
  }
};

const chunk = <T,>(list: T[], size: number) => {
  const pages: T[][] = [];
  for (let i = 0; i < list.length; i += size) pages.push(list.slice(i, i + size));
  return pages;
};

/** 코드가 길면 글자를 줄인다 — 라벨 폭을 넘지 않게 */
const codeClass = (code: string) => (code.length > 13 ? "lbl-code is-xlong" : code.length > 8 ? "lbl-code is-long" : "lbl-code");

const Arrow = ({ dir }: { dir: "up" | "down" }) => (
  <svg className="lbl-arrow" viewBox="0 0 24 24" aria-hidden="true">
    <path d={dir === "up" ? "M12 2 23 22H1z" : "M12 22 1 2h22z"} />
  </svg>
);

const LocationLabel = ({ target, arrow }: { target: LabelTarget; arrow: ArrowKey }) => (
  <div className="lbl">
    <div className="lbl-qr">
      <QrBox value={target.code} size="100%" />
    </div>
    <div className="lbl-text">
      <span className="lbl-where">{[target.warehouseName, target.floor, target.zoneName].filter(Boolean).join(" · ")}</span>
      <b className={codeClass(target.code)}>{target.code}</b>
      <span className="lbl-place">{target.rackCode ? `${target.rackCode} · ${target.bay}연 ${target.level}단` : "미배치"}</span>
      <span className="lbl-foot">
        <em>{LOCATION_TYPE_LABEL[target.locationType as LocationType] ?? target.locationType}</em>
        {arrow !== "none" ? <Arrow dir={arrow} /> : null}
      </span>
    </div>
  </div>
);

const LabelSheet = ({ targets, options }: { targets: LabelTarget[]; options: LabelOptions }) => (
  <div className={`lbl-sheet is-${options.paper}`}>
    {chunk(targets, PAPERS[options.paper].perPage).map((page, index) => (
      <div key={index} className="lbl-page">
        {page.map((target) => (
          <LocationLabel key={target.locationId} target={target} arrow={options.arrow} />
        ))}
      </div>
    ))}
  </div>
);

type Props = {
  /** null 이면 닫힘 */
  targets: LabelTarget[] | null;
  /** 창 부제 — 예: "A 구역 · A-R01" */
  title?: string;
  onClose: () => void;
};

export const LocationLabelDialog = ({ targets, title, onClose }: Props) => {
  const [options, setOptions] = useState<LabelOptions>(readOptions);
  const [printing, setPrinting] = useState(false);
  const sorted = useMemo(
    () => [...(targets ?? [])].sort((a, b) => a.code.localeCompare(b.code, "ko", { numeric: true })),
    [targets]
  );
  const paper = PAPERS[options.paper];
  const pageCount = Math.ceil(sorted.length / paper.perPage);

  const update = (patch: Partial<LabelOptions>) =>
    setOptions((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
      } catch {
        /* 저장 실패는 무시 — 이번 화면에서만 유지 */
      }
      return next;
    });

  // 인쇄 — 라벨 포털이 DOM 에 들어간 뒤 @page 크기를 맞추고 인쇄 창을 연다
  // (rAF 는 화면에 안 보이는 탭에서 멈추므로 타이머로 넘긴다)
  useEffect(() => {
    if (!printing) return;
    const style = document.createElement("style");
    style.textContent = `@page { size: ${paper.page}; margin: 0; }`;
    document.head.appendChild(style);
    const root = document.documentElement;
    root.classList.add("is-printing-labels");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      style.remove();
      root.classList.remove("is-printing-labels");
      window.removeEventListener("afterprint", finish);
      setPrinting(false);
    };
    window.addEventListener("afterprint", finish);
    const timer = window.setTimeout(() => window.print(), 30);
    return () => {
      window.clearTimeout(timer);
      finish();
    };
  }, [printing, paper.page]);

  const previewTargets = sorted.slice(0, paper.preview);

  return (
    <>
      <Modal
        open={targets !== null}
        className="lbl-modal"
        title="로케이션 QR 라벨"
        desc={title ? `${title} · ${sorted.length}개` : `${sorted.length}개 로케이션`}
        icon="printer"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary-ink)"
        onClose={onClose}
        footer={
          <>
            <span className="lbl-foot-msg">
              {sorted.length}장 · {paper.label} {pageCount}쪽
            </span>
            <button type="button" className="btn-secondary" onClick={onClose}>
              닫기
            </button>
            <button type="button" className="btn-primary lbl-print-btn" disabled={!sorted.length || printing} onClick={() => setPrinting(true)}>
              <Icon name="printer" size={15} />
              인쇄
            </button>
          </>
        }
      >
        <div className="lbl-options">
          <div className="lbl-opt">
            <span>용지</span>
            <div className="lbl-seg">
              {(Object.keys(PAPERS) as PaperKey[]).map((key) => (
                <button key={key} type="button" className={options.paper === key ? "is-on" : ""} onClick={() => update({ paper: key })}>
                  <b>{PAPERS[key].label}</b>
                  <small>{PAPERS[key].size}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="lbl-opt">
            <span>
              화살표 <small>빔에 붙였을 때 가리킬 칸</small>
            </span>
            <div className="lbl-seg is-small">
              {ARROWS.map((item) => (
                <button key={item.key} type="button" className={options.arrow === item.key ? "is-on" : ""} onClick={() => update({ arrow: item.key })}>
                  <b>{item.label}</b>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`lbl-preview is-${options.paper}`}>
          {previewTargets.length ? <LabelSheet targets={previewTargets} options={options} /> : <p className="lbl-more">출력할 로케이션이 없습니다</p>}
        </div>
        {sorted.length > previewTargets.length ? (
          <p className="lbl-more">
            미리보기는 앞 {previewTargets.length}장 — 인쇄하면 {sorted.length}장이 모두 나갑니다
          </p>
        ) : null}

        <p className="lbl-note">
          <Icon name="alert" size={13} />
          <span>
            QR 에는 로케이션 코드만 들어갑니다 — 격납·보충 화면의 “로케이션 QR 확인” 칸에 찍으면 바로 확인됩니다. 인쇄 창에서 배율은 기본(100%)으로 두세요.
          </span>
        </p>
      </Modal>

      {printing
        ? createPortal(
            <div className="lbl-print-root">
              <LabelSheet targets={sorted} options={options} />
            </div>,
            document.body
          )
        : null}
    </>
  );
};

import type { CSSProperties, ReactNode } from "react";
import {
  UTIL_BUCKETS,
  bucketOf,
  formatKg,
  isMixed,
  isOverweight,
  slotFillPct,
  type LayoutRack,
  type LayoutSlot
} from "./types";
import "./rackFace.css";

/* ============================================================
   랙 정면 격자 — 연(가로) × 단(세로, 위가 높은 단)
   칸마다 채움 %(파레트 자리 기준)와 적치율 색 — 빈 칸을 눈으로 찾는 용도.
   · compact : 3D 옆 패널 (코드 + % + 채움 막대)
   · full    : 로케이션 관리 › CAPA › 랙 정면 (연·단 머리글, 랙 요약, 무게 경고)
   색 구간은 3D·범례와 같은 bucketOf() 를 쓴다.
   ============================================================ */

type RackShape = Pick<LayoutRack, "code" | "bays" | "levels"> & Partial<Pick<LayoutRack, "palletSpec" | "maxLoadKg">>;

export type RackFaceSummary = {
  cells: number;
  slots: number;
  empty: number;
  positions: number;
  used: number;
  util: number;
  overweight: number;
};

export const summarizeRack = (rack: Pick<LayoutRack, "bays" | "levels">, slots: LayoutSlot[]): RackFaceSummary => {
  const positions = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const used = slots.reduce((sum, slot) => sum + slot.used, 0);
  return {
    cells: rack.bays * rack.levels,
    slots: slots.length,
    empty: slots.filter((slot) => slot.active && slot.pallets <= 0).length,
    positions,
    used,
    util: positions ? Math.round((used / positions) * 100) : 0,
    overweight: slots.filter(isOverweight).length
  };
};

type Props = {
  rack: RackShape;
  slots: LayoutSlot[];
  variant?: "compact" | "full";
  selectedId?: number | null;
  highlightIds?: ReadonlySet<number> | null;
  onSelect?: (locationId: number) => void;
  /** 머리 오른쪽 버튼 (라벨 출력 등) */
  actions?: ReactNode;
};

export const RackFaceGrid = ({ rack, slots, variant = "full", selectedId, highlightIds, onSelect, actions }: Props) => {
  const full = variant === "full";
  const byCell = new Map(slots.map((slot) => [`${slot.bay}:${slot.level}`, slot]));
  const summary = summarizeRack(rack, slots);
  const levels = Array.from({ length: rack.levels }, (_, row) => rack.levels - row);
  const bays = Array.from({ length: rack.bays }, (_, col) => col + 1);

  return (
    <div className={`rf rf-${variant}`}>
      {full ? (
        <header className="rf-head">
          <div className="rf-title">
            <b>{rack.code}</b>
            <small>
              {rack.bays}연 × {rack.levels}단
              {rack.palletSpec ? ` · 파레트 ${rack.palletSpec}` : ""}
              {rack.maxLoadKg !== undefined ? ` · 칸당 ${rack.maxLoadKg != null ? `${rack.maxLoadKg.toLocaleString()}kg` : "하중 제한 없음"}` : ""}
            </small>
          </div>
          <div className="rf-stats">
            <span>
              점유 <b>{summary.used}</b>/{summary.positions} 파레트 자리 · <b>{summary.util}%</b>
            </span>
            <span>
              공실 <b>{summary.empty}</b>/{summary.slots}칸
            </span>
            {summary.cells > summary.slots ? <span>로케이션 없는 칸 {summary.cells - summary.slots}</span> : null}
            {summary.overweight ? (
              <span className="is-danger">
                무게 초과 <b>{summary.overweight}</b>칸
              </span>
            ) : null}
          </div>
          {actions ? <div className="rf-actions">{actions}</div> : null}
        </header>
      ) : (
        <div className="rf-mini-head">
          <span>{rack.code} 정면</span>
          <small>
            {rack.bays}연 × {rack.levels}단 · 공실 {summary.empty}
          </small>
        </div>
      )}

      <div
        className="rf-grid"
        style={{ gridTemplateColumns: full ? `40px repeat(${rack.bays}, minmax(0, 1fr))` : `repeat(${rack.bays}, minmax(0, 1fr))` }}
      >
        {full ? (
          <>
            <span className="rf-corner" />
            {bays.map((bay) => (
              <span key={`h${bay}`} className="rf-colhead">
                {bay}연
              </span>
            ))}
          </>
        ) : null}
        {levels.map((level) => (
          <RowCells
            key={level}
            level={level}
            levels={rack.levels}
            bays={bays}
            byCell={byCell}
            full={full}
            selectedId={selectedId}
            highlightIds={highlightIds}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};

const RowCells = ({
  level,
  levels,
  bays,
  byCell,
  full,
  selectedId,
  highlightIds,
  onSelect
}: {
  level: number;
  levels: number;
  bays: number[];
  byCell: Map<string, LayoutSlot>;
  full: boolean;
  selectedId?: number | null;
  highlightIds?: ReadonlySet<number> | null;
  onSelect?: (locationId: number) => void;
}) => (
  <>
    {full ? (
      <span className="rf-rowhead">
        {level}단{level === levels && levels > 1 ? <small>상단</small> : level === 1 ? <small>바닥</small> : null}
      </span>
    ) : null}
    {bays.map((bay) => {
      const slot = byCell.get(`${bay}:${level}`);
      if (!slot) return <span key={bay} className="rf-cell is-void" title={`${bay}연 ${level}단 · 로케이션 없음`} />;
      const pct = slotFillPct(slot);
      const empty = slot.pallets <= 0;
      const over = isOverweight(slot);
      const mixed = isMixed(slot);
      const bucket = bucketOf(pct);
      const classes = [
        "rf-cell",
        empty ? "is-empty" : "is-filled",
        slot.active ? "" : "is-off",
        over ? "is-over" : "",
        mixed ? "is-mixed" : "",
        slot.locationId === selectedId ? "is-sel" : "",
        highlightIds?.has(slot.locationId) ? "is-hit" : ""
      ]
        .filter(Boolean)
        .join(" ");
      const title = [
        `${slot.code} · ${bay}연 ${level}단`,
        empty ? "공실" : `채움 ${pct}% (${slot.pallets}/${slot.capacity} 파레트) · ${mixed ? `혼적 ${slot.skuCount}종` : `품목 ${slot.skuCount}종`}`,
        `무게 ${formatKg(slot.loadKg)}${slot.maxLoadKg != null ? ` / ${formatKg(slot.maxLoadKg)}` : ""}kg${over ? " — 허용 하중 초과" : ""}`,
        slot.active ? "" : "사용중지"
      ]
        .filter(Boolean)
        .join("\n");
      return (
        <button
          key={bay}
          type="button"
          className={classes}
          style={{ "--rf-tone": bucket.token } as CSSProperties}
          onClick={onSelect ? () => onSelect(slot.locationId) : undefined}
          title={title}
          aria-pressed={slot.locationId === selectedId}
        >
          {!full && !empty ? <i className="rf-fill" style={{ height: `${Math.min(pct, 100)}%` }} /> : null}
          <span className="rf-code">{slot.code}</span>
          <b className="rf-pct">{!slot.active ? "중지" : empty ? "공실" : `${pct}%`}</b>
          {full && !empty ? (
            <span className="rf-sub">
              {slot.pallets}/{slot.capacity} PLT · {formatKg(slot.loadKg)}kg
            </span>
          ) : null}
          {over ? (
            <em className="rf-warn" aria-label="허용 하중 초과">
              !
            </em>
          ) : null}
          {/* 혼적 — 품목 수. 무게 초과(!)는 오른쪽 위, 이건 왼쪽 위 */}
          {mixed ? (
            <em className="rf-mix" aria-label={`혼적 ${slot.skuCount}종`}>
              {slot.skuCount}
            </em>
          ) : null}
        </button>
      );
    })}
  </>
);

/** 범례 — 격자 여러 개 위에 한 번만 */
export const RackFaceLegend = () => (
  <div className="rf-legend">
    <span>
      <i className="rf-swatch is-empty" />
      공실
    </span>
    {UTIL_BUCKETS.map((bucket, index) => (
      <span key={bucket.key}>
        <i className="rf-swatch" style={{ "--rf-tone": bucket.token } as CSSProperties} />
        {bucket.label}
        <small>{["~40%", "~70%", "~85%", "85%~"][index]}</small>
      </span>
    ))}
    <span>
      <i className="rf-swatch is-over" />
      무게 초과
    </span>
    <span>
      <i className="rf-swatch is-mixed">2</i>
      혼적 (품목 수)
    </span>
    <span>
      <i className="rf-swatch is-void" />
      로케이션 없음
    </span>
  </div>
);

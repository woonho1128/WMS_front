import { useEffect, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { purposeMeta } from "../../../components/warehouse3d/types";
import { ZONE_ROTATE_STEP, type ZoneEditSession } from "./useZoneEditSession";
import "./zoneEdit.css";

/* ============================================================
   3D 구역 배치 편집 — 맵 위 작업 바 + 옆 패널
   ============================================================ */

type BarProps = {
  session: ZoneEditSession;
  onSave: () => void;
  onCancel: () => void;
};

export const ZoneEditBar = ({ session, onSave, onCancel }: BarProps) => {
  const count = session.changedZoneIds.size;
  const noZone = session.selectedZoneId == null;
  return (
    <div className="zep-bar" role="toolbar" aria-label="배치 편집">
      <span className={`zep-bar-count${count ? " is-dirty" : ""}`}>{count ? `구역 ${count}곳 변경` : "변경 없음"}</span>
      <button
        type="button"
        className="zep-bar-icon"
        onClick={() => session.rotateBy(-1)}
        disabled={noZone}
        title={noZone ? "돌릴 구역을 먼저 고르세요" : `반시계 방향 ${ZONE_ROTATE_STEP}° (Q)`}
        aria-label={`반시계 방향 ${ZONE_ROTATE_STEP}° 회전`}
      >
        <Icon name="rotateCcw" size={14} />
      </button>
      <button
        type="button"
        className="zep-bar-icon"
        onClick={() => session.rotateBy(1)}
        disabled={noZone}
        title={noZone ? "돌릴 구역을 먼저 고르세요" : `시계 방향 ${ZONE_ROTATE_STEP}° (E)`}
        aria-label={`시계 방향 ${ZONE_ROTATE_STEP}° 회전`}
      >
        <Icon name="rotateCw" size={14} />
      </button>
      <span className="zep-bar-sep" />
      <button type="button" onClick={session.undo} disabled={!session.canUndo} title="되돌리기 (Ctrl+Z)">
        <Icon name="chevL" size={13} />
        되돌리기
      </button>
      <button type="button" onClick={onCancel}>
        취소
      </button>
      <button type="button" className="is-primary" onClick={onSave} disabled={!count || session.saving}>
        <Icon name="check" size={13} />
        저장
      </button>
    </div>
  );
};

const NumberInput = ({
  label,
  value,
  unit,
  step,
  onCommit
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  onCommit: (value: number) => void;
}) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    if (parsed !== value) onCommit(Math.round(parsed * 10) / 10);
  };
  return (
    <label className="zep-coord">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") setText(String(value));
        }}
      />
      <small>{unit}</small>
    </label>
  );
};

type PanelProps = {
  session: ZoneEditSession;
  floor: string;
  onSave: () => void;
  onCancel: () => void;
};

export const ZoneEditPanel = ({ session, floor, onSave, onCancel }: PanelProps) => {
  const { draft, base, selectedZoneId } = session;
  const zones = (draft?.zones ?? []).filter((zone) => zone.floor === floor);
  const selected = zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const original = selected ? base?.zones.find((zone) => zone.id === selected.id) ?? null : null;
  const changed = selected ? session.changedZoneIds.has(selected.id) : false;
  const rackCount = selected ? (draft?.racks ?? []).filter((rack) => rack.zoneId === selected.id).length : 0;
  const rotation = selected?.rotation ?? 0;

  const commitCoord = (x: number, z: number) => {
    if (!selected) return;
    session.moveZone(selected.id, x, z);
  };

  return (
    <aside className="card zep">
      <div className="zep-body">
        <div className="zep-head">
          <span className="nx-eyebrow">LAYOUT EDIT</span>
          <h3>구역 배치 편집</h3>
          <p>구역을 끌면 옮겨지고, Ctrl 을 누른 채 끌면 구역 중심을 축으로 돌아갑니다. 안의 랙·로케이션·재고가 함께 움직이고 재고 수량은 바뀌지 않습니다.</p>
        </div>

        {session.otherDraftExists ? (
          <div className="ds-callout warning zep-note">
            <Icon name="alert" size={15} />
            <span>로케이션 관리 › 배치 탭에 게시하지 않은 초안이 있습니다. 여기서 저장하면 그 초안은 다시 불러와야 게시할 수 있습니다.</span>
          </div>
        ) : null}

        <section className="zep-sec">
          <header>
            <span>{floor} 구역</span>
            <small>클릭해서 선택 · 방향키 0.5m · Q/E 45°</small>
          </header>
          <div className="zep-zones">
            {zones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                className={`zep-zone${zone.id === selectedZoneId ? " is-sel" : ""}`}
                onClick={() => session.setSelectedZoneId(zone.id)}
              >
                <b>{zone.name}</b>
                <span className="zep-mono">
                  {zone.x}, {zone.z}
                  {zone.rotation ? ` · ${zone.rotation}°` : ""}
                </span>
                {session.changedZoneIds.has(zone.id) ? <em>{session.rotatedZoneIds.has(zone.id) ? "회전됨" : "이동됨"}</em> : null}
              </button>
            ))}
            {!zones.length ? <p className="zep-empty">이 층에는 구역이 없습니다.</p> : null}
          </div>
        </section>

        {selected ? (
          <section className="zep-sec">
            <header>
              <span>{selected.name} 위치 · 방향</span>
              <small>
                {selected.shape ? `자유형 · 외곽 ${selected.width} × ${selected.depth} m` : `${selected.width} × ${selected.depth} m`}
                {purposeMeta(selected.purpose).racks ? ` · 랙 ${rackCount}` : ` · ${purposeMeta(selected.purpose).label}`}
              </small>
            </header>
            <div className="zep-coords">
              <NumberInput label="중심 X" unit="m" step={0.5} value={selected.x} onCommit={(x) => commitCoord(x, selected.z)} />
              <NumberInput label="중심 Z" unit="m" step={0.5} value={selected.z} onCommit={(z) => commitCoord(selected.x, z)} />
            </div>
            <div className="zep-pad" aria-label="0.5m 씩 옮기기">
              <span />
              <button type="button" onClick={() => session.nudge(0, -0.5)} aria-label="위로 0.5m">
                <Icon name="arrowUp" size={14} />
              </button>
              <span />
              <button type="button" onClick={() => session.nudge(-0.5, 0)} aria-label="왼쪽으로 0.5m">
                <Icon name="chevL" size={14} />
              </button>
              <small>0.5m</small>
              <button type="button" onClick={() => session.nudge(0.5, 0)} aria-label="오른쪽으로 0.5m">
                <Icon name="chevR" size={14} />
              </button>
              <span />
              <button type="button" onClick={() => session.nudge(0, 0.5)} aria-label="아래로 0.5m">
                <Icon name="arrowDown" size={14} />
              </button>
              <span />
            </div>

            <div className="zep-rotate" aria-label="회전">
              <button type="button" onClick={() => session.rotateBy(-1)} title={`반시계 방향 ${ZONE_ROTATE_STEP}° (Q)`}>
                <Icon name="rotateCcw" size={14} />
                {ZONE_ROTATE_STEP}°
              </button>
              <NumberInput label="회전" unit="°" step={5} value={rotation} onCommit={(value) => session.rotateZone(selected.id, value)} />
              <button type="button" onClick={() => session.rotateBy(1)} title={`시계 방향 ${ZONE_ROTATE_STEP}° (E)`}>
                {ZONE_ROTATE_STEP}°
                <Icon name="rotateCw" size={14} />
              </button>
            </div>
            <p className="zep-hint">
              <span className="zep-dial" style={{ transform: `rotate(${rotation}deg)` }} aria-hidden="true" />
              위에서 봐서 시계 방향 {rotation}° · 맵에서 Ctrl 누른 채 끌면 5°씩
            </p>

            {changed && original ? (
              <button type="button" className="zep-reset" onClick={() => session.resetZone(selected.id)}>
                원래대로 ({original.x}, {original.z}
                {original.rotation ? ` · ${original.rotation}°` : " · 0°"})
              </button>
            ) : null}
          </section>
        ) : (
          <p className="zep-empty">맵이나 목록에서 구역을 고르세요.</p>
        )}

        {session.changes.length ? (
          <section className="zep-sec">
            <header>
              <span>저장하면 반영될 내용</span>
            </header>
            <ul className="zep-changes">
              {session.changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="zep-foot">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            편집 취소
          </button>
          <button type="button" className="btn-primary" onClick={onSave} disabled={!session.changedZoneIds.size || session.saving}>
            {session.saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </aside>
  );
};

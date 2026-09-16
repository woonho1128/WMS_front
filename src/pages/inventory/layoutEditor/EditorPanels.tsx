import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { PALLET_SPECS, normalizeDeg, rackFootprint, stepRotation } from "../../../components/warehouse3d/geometry";
import type { DraftRack, LayoutDraft, RuleIssue } from "../../../components/warehouse3d/layoutRules";
import { LOCATION_TYPE_LABEL, type LocationType, type RackRotation } from "../../../components/warehouse3d/types";
import {
  OBJECT_DEFAULTS,
  PURPOSE_OPTIONS,
  addRack,
  bindLocation,
  cellOccupant,
  deleteSelection,
  floorIsEmpty,
  generateLocations,
  patchObject,
  patchRack,
  patchZone,
  placeZone,
  removeFloor,
  resizeRack,
  setFloorSize,
  type EditorLocation,
  type EditorSelection
} from "./draftOps";

/* ============================================================
   배치 편집기 패널 — 오른쪽 속성 / 왼쪽 미배치 트레이 · 검증
   ============================================================ */

export type Notify = (tone: "success" | "danger" | "info", text: string) => void;

const DND_TYPE = "text/wms-location";

/* ---------- 숫자 입력 — 입력 중에는 자유롭게, 벗어날 때 확정 ---------- */
const NumberField = ({
  label,
  value,
  onCommit,
  step = 0.5,
  min,
  disabled,
  suffix = "m"
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
  suffix?: string;
}) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || (min != null && parsed < min)) {
      setText(String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <label className="le-num">
      <span>{label}</span>
      <div>
        <input
          type="number"
          step={step}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            if (event.key === "Escape") setText(String(value));
          }}
        />
        <small>{suffix}</small>
      </div>
    </label>
  );
};

const TextField = ({
  label,
  value,
  onCommit,
  disabled,
  mono
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  mono?: boolean;
}) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="le-text">
      <span>{label}</span>
      <input
        className={mono ? "is-mono" : ""}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => text.trim() && text !== value && onCommit(text.trim())}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") setText(value);
        }}
      />
    </label>
  );
};

const Section = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => (
  <section className="le-sec">
    <header>
      <span>{title}</span>
      {aside}
    </header>
    {children}
  </section>
);

/* ============================================================
   오른쪽 — 속성
   ============================================================ */

type InspectorProps = {
  draft: LayoutDraft;
  floor: string;
  selection: EditorSelection;
  readOnly: boolean;
  locations: EditorLocation[];
  onChange: (next: LayoutDraft) => void;
  onSelect: (selection: EditorSelection) => void;
  onFloorRemoved: () => void;
  notify: Notify;
};

export const Inspector = (props: InspectorProps) => {
  const { draft, selection } = props;
  if (selection?.kind === "zone") {
    const zone = draft.zones.find((item) => item.id === selection.id);
    if (zone) return <ZoneInspector {...props} zoneId={zone.id} />;
  }
  if (selection?.kind === "rack") {
    const rack = draft.racks.find((item) => item.id === selection.id);
    if (rack) return <RackInspector {...props} rack={rack} />;
  }
  if (selection?.kind === "object") {
    const object = draft.objects.find((item) => item.id === selection.id);
    if (object) return <ObjectInspector {...props} objectId={object.id} />;
  }
  return <FloorInspector {...props} />;
};

const FloorInspector = ({ draft, floor, readOnly, onChange, onSelect, onFloorRemoved, notify }: InspectorProps) => {
  const info = draft.floors.find((item) => item.code === floor);
  const floorZones = draft.zones.filter((zone) => zone.floor === floor);
  const unplacedZones = draft.zones.filter((zone) => !zone.floor);
  const floorRacks = draft.racks.filter((rack) => floorZones.some((zone) => zone.id === rack.zoneId));
  const cells = floorRacks.reduce((sum, rack) => sum + rack.bays * rack.levels, 0);
  const bound = Object.values(draft.bindings).filter((placement) => placement && floorRacks.some((rack) => rack.id === placement.rackId)).length;

  if (!info) return <div className="le-empty">층을 선택하세요.</div>;

  return (
    <div className="le-inspector">
      <div className="le-ins-head">
        <span className="nx-eyebrow">FLOOR</span>
        <h4>{floor} 층</h4>
        <p>캔버스에서 구역·랙·시설물을 누르면 속성이 여기에 나옵니다.</p>
      </div>

      <Section title="층 외곽">
        <div className="le-grid2">
          <NumberField label="가로" value={info.width} step={1} min={4} disabled={readOnly} onCommit={(value) => onChange(setFloorSize(draft, floor, value, info.depth))} />
          <NumberField label="세로" value={info.depth} step={1} min={4} disabled={readOnly} onCommit={(value) => onChange(setFloorSize(draft, floor, info.width, value))} />
        </div>
        <p className="le-note">
          <Icon name="flag" size={12} />
          도면을 받으면 배경으로 깔고 축척을 맞출 수 있게 자리를 비워 두었습니다.
        </p>
      </Section>

      <Section title="이 층 요약">
        <dl className="le-stats">
          <div><dt>구역</dt><dd>{floorZones.length}</dd></div>
          <div><dt>랙</dt><dd>{floorRacks.length}</dd></div>
          <div><dt>랙 칸</dt><dd>{cells}</dd></div>
          <div><dt>배정된 칸</dt><dd>{bound}</dd></div>
        </dl>
        <div className="le-list">
          {floorZones.map((zone) => (
            <button key={zone.id} type="button" onClick={() => onSelect({ kind: "zone", id: zone.id })}>
              <b>{zone.name}</b>
              <small>{zone.code} · {draft.racks.filter((rack) => rack.zoneId === zone.id).length} 랙</small>
            </button>
          ))}
        </div>
      </Section>

      {unplacedZones.length ? (
        <Section title={`배치 안 된 구역 ${unplacedZones.length}`}>
          <p className="le-note">마스터에는 있지만 평면에 놓이지 않은 구역입니다.</p>
          <div className="le-list">
            {unplacedZones.map((zone) => (
              <div key={zone.id} className="le-list-row">
                <span>
                  <b>{zone.name}</b>
                  <small>{zone.code}</small>
                </span>
                <button
                  type="button"
                  className="le-mini"
                  disabled={readOnly}
                  onClick={() => {
                    onChange(placeZone(draft, zone.id, floor));
                    onSelect({ kind: "zone", id: zone.id });
                    notify("info", `${zone.name} 을(를) ${floor} 가운데에 놓았습니다. 끌어서 자리를 잡으세요.`);
                  }}
                >
                  {floor}에 배치
                </button>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {!readOnly && draft.floors.length > 1 ? (
        <button
          type="button"
          className="le-danger"
          disabled={!floorIsEmpty(draft, floor)}
          title={floorIsEmpty(draft, floor) ? "" : "구역과 시설물을 먼저 비워야 층을 지울 수 있습니다"}
          onClick={() => {
            onChange(removeFloor(draft, floor));
            onFloorRemoved();
          }}
        >
          <Icon name="x" size={14} />
          {floor} 층 삭제
        </button>
      ) : null}
    </div>
  );
};

const ZoneInspector = ({ draft, readOnly, onChange, onSelect, notify, zoneId }: InspectorProps & { zoneId: number }) => {
  const zone = draft.zones.find((item) => item.id === zoneId)!;
  const zoneRacks = draft.racks.filter((rack) => rack.zoneId === zone.id);
  const isNew = zone.id < 0;
  return (
    <div className="le-inspector">
      <div className="le-ins-head">
        <span className="nx-eyebrow">ZONE{isNew ? " · 새 구역" : ""}</span>
        <h4>{zone.name}</h4>
        <p>구역을 옮기거나 돌리면 안의 랙도 함께 움직입니다. 모서리 핸들로 크기를 바꿉니다.</p>
      </div>

      <Section title="기본 정보">
        <div className="le-grid2">
          <TextField label="코드" mono value={zone.code} disabled={readOnly} onCommit={(value) => onChange(patchZone(draft, zone.id, { code: value }))} />
          <TextField label="이름" value={zone.name} disabled={readOnly} onCommit={(value) => onChange(patchZone(draft, zone.id, { name: value }))} />
        </div>
        <label className="le-text">
          <span>용도</span>
          <select
            value={zone.purpose}
            disabled={readOnly}
            onChange={(event) => onChange(patchZone(draft, zone.id, { purpose: event.target.value as typeof zone.purpose }))}
          >
            {PURPOSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <TextField label="담당자" value={zone.manager} disabled={readOnly} onCommit={(value) => onChange(patchZone(draft, zone.id, { manager: value }))} />
      </Section>

      <Section title="위치 · 크기">
        <div className="le-grid2">
          <NumberField label="중심 X" value={zone.x} disabled={readOnly} onCommit={(value) => onChange(patchZone(draft, zone.id, { x: value }))} />
          <NumberField label="중심 Z" value={zone.z} disabled={readOnly} onCommit={(value) => onChange(patchZone(draft, zone.id, { z: value }))} />
          <NumberField label="가로" value={zone.width} min={4} disabled={readOnly} onCommit={(value) => onChange(patchZone(draft, zone.id, { width: value }))} />
          <NumberField label="세로" value={zone.depth} min={4} disabled={readOnly} onCommit={(value) => onChange(patchZone(draft, zone.id, { depth: value }))} />
          <NumberField
            label="회전 (시계 방향)"
            value={zone.rotation ?? 0}
            step={5}
            suffix="°"
            disabled={readOnly}
            onCommit={(value) => onChange(patchZone(draft, zone.id, { rotation: normalizeDeg(value) }))}
          />
          <label className="le-text">
            <span>45° 돌리기 (Q · E)</span>
            <div className="le-seg">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onChange(patchZone(draft, zone.id, { rotation: stepRotation(zone.rotation ?? 0, -1) }))}
                title="반시계 방향 45° (Q)"
              >
                ⟲ 45°
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onChange(patchZone(draft, zone.id, { rotation: stepRotation(zone.rotation ?? 0, 1) }))}
                title="시계 방향 45° (E)"
              >
                45° ⟳
              </button>
            </div>
          </label>
        </div>
      </Section>

      <Section
        title={`랙 ${zoneRacks.length}`}
        aside={
          !readOnly ? (
            <button
              type="button"
              className="le-mini"
              onClick={() => {
                const result = addRack(draft, zone.id);
                onChange(result.draft);
                if (result.id != null) onSelect({ kind: "rack", id: result.id });
              }}
            >
              <Icon name="plus" size={12} />
              랙 추가
            </button>
          ) : null
        }
      >
        <div className="le-list">
          {zoneRacks.map((rack) => {
            const bound = Object.values(draft.bindings).filter((placement) => placement?.rackId === rack.id).length;
            return (
              <button key={rack.id} type="button" onClick={() => onSelect({ kind: "rack", id: rack.id })}>
                <b>{rack.code}</b>
                <small>
                  {rack.bays}연 × {rack.levels}단 · 배정 {bound}/{rack.bays * rack.levels}
                </small>
              </button>
            );
          })}
          {!zoneRacks.length ? <p className="le-note">랙이 없습니다. [랙 추가] 또는 랙 도구로 구역 안을 클릭하세요.</p> : null}
        </div>
      </Section>

      {!readOnly ? (
        <button
          type="button"
          className="le-danger"
          onClick={() => {
            const bound = Object.values(draft.bindings).filter((placement) => placement && zoneRacks.some((rack) => rack.id === placement.rackId)).length;
            onChange(deleteSelection(draft, { kind: "zone", id: zone.id }));
            onSelect(null);
            notify("info", `${zone.name} ${isNew ? "을(를) 지웠습니다" : "을(를) 배치에서 뺐습니다 (구역 마스터는 유지)"}${bound ? ` · 로케이션 ${bound}개는 미배치 트레이로` : ""}`);
          }}
        >
          <Icon name="x" size={14} />
          {isNew ? "구역 삭제" : "배치에서 빼기"}
        </button>
      ) : null}
    </div>
  );
};

const ROTATIONS: RackRotation[] = [0, 90, 180, 270];
/** 랙 방향은 구역 기준으로 고른다 — 돌린 구역 안에서도 구역 변과 나란하게 */
const RACK_TURNS = [0, 90, 180, 270];

const RackInspector = ({ draft, readOnly, locations, onChange, onSelect, notify, rack }: InspectorProps & { rack: DraftRack }) => {
  const zone = draft.zones.find((item) => item.id === rack.zoneId);
  const locationById = useMemo(() => new Map(locations.map((loc) => [loc.id, loc])), [locations]);
  const newById = useMemo(() => new Map(draft.newLocations.map((loc) => [loc.id, loc])), [draft.newLocations]);
  const [cell, setCell] = useState<{ bay: number; level: number } | null>(null);
  const defaultType = PURPOSE_OPTIONS.find((option) => option.value === zone?.purpose)?.locationType ?? "RESERVE";
  const [pattern, setPattern] = useState("{zone}-{seq}");
  const [genType, setGenType] = useState<LocationType>(defaultType);
  const [dropCell, setDropCell] = useState<string | null>(null);

  useEffect(() => {
    setCell(null);
    setGenType(defaultType);
  }, [rack.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const codeOf = (id: number) => locationById.get(id)?.code ?? newById.get(id)?.code ?? `#${id}`;
  const empties = rack.bays * rack.levels - Object.values(draft.bindings).filter((placement) => placement?.rackId === rack.id && placement.bay <= rack.bays && placement.level <= rack.levels).length;

  const unplaced = useMemo(() => {
    const list = [
      ...locations.filter((loc) => !draft.bindings[String(loc.id)]).map((loc) => ({ id: loc.id, code: loc.code, zoneId: loc.zoneId, hasStock: loc.hasStock })),
      ...draft.newLocations.filter((loc) => !draft.bindings[String(loc.id)]).map((loc) => ({ id: loc.id, code: loc.code, zoneId: loc.zoneId, hasStock: false }))
    ];
    // 같은 구역 로케이션을 위로
    return list.sort((a, b) => Number(b.zoneId === rack.zoneId) - Number(a.zoneId === rack.zoneId) || a.code.localeCompare(b.code, "ko", { numeric: true }));
  }, [locations, draft.bindings, draft.newLocations, rack.zoneId]);

  const assign = (locationId: number, bay: number, level: number) => {
    onChange(bindLocation(draft, locationId, { rackId: rack.id, bay, level }));
    const moved = codeOf(locationId);
    const previous = cellOccupant(draft, rack.id, bay, level);
    notify("success", `${moved} → ${rack.code} ${bay}연 ${level}단${previous != null && previous !== locationId ? ` (${codeOf(previous)} 은 미배치로)` : ""}`);
  };

  const onResize = (bays: number, levels: number) => {
    const result = resizeRack(draft, rack.id, bays, levels, locationById);
    if (result.blocked) {
      notify("danger", result.blocked);
      return;
    }
    onChange(result.draft);
    if (result.released.length) notify("info", `잘린 칸의 로케이션 ${result.released.length}개를 미배치로 돌렸습니다: ${result.released.slice(0, 5).join(", ")}`);
  };

  const occupantAtCell = cell ? cellOccupant(draft, rack.id, cell.bay, cell.level) : null;
  const size = rackFootprint(rack);

  return (
    <div className="le-inspector">
      <div className="le-ins-head">
        <span className="nx-eyebrow">RACK · {zone?.name ?? "구역 없음"}</span>
        <h4>{rack.code}</h4>
        <p>
          위에서 본 크기 {Math.round(size.width * 100) / 100} × {Math.round(size.depth * 100) / 100} m · 파란 점이 1연입니다.
        </p>
      </div>

      <Section title="배치">
        <div className="le-grid2">
          <TextField label="코드" mono value={rack.code} disabled={readOnly} onCommit={(value) => onChange(patchRack(draft, rack.id, { code: value }))} />
          <label className="le-text">
            <span>{zone?.rotation ? `회전 (구역 ${zone.rotation}° 기준)` : "회전"}</span>
            <div className="le-seg">
              {RACK_TURNS.map((turn) => {
                const target = normalizeDeg((zone?.rotation ?? 0) + turn);
                return (
                  <button
                    key={turn}
                    type="button"
                    className={normalizeDeg(rack.rotation ?? 0) === target ? "is-on" : ""}
                    disabled={readOnly}
                    onClick={() => onChange(patchRack(draft, rack.id, { rotation: target }))}
                  >
                    {turn}°
                  </button>
                );
              })}
            </div>
          </label>
          <NumberField label="중심 X" value={rack.x} disabled={readOnly} onCommit={(value) => onChange(patchRack(draft, rack.id, { x: value }))} />
          <NumberField label="중심 Z" value={rack.z} disabled={readOnly} onCommit={(value) => onChange(patchRack(draft, rack.id, { z: value }))} />
        </div>
      </Section>

      <Section title="규격">
        <div className="le-grid2">
          <NumberField label="연 (가로 칸)" value={rack.bays} step={1} min={1} suffix="연" disabled={readOnly} onCommit={(value) => onResize(Math.round(value), rack.levels)} />
          <NumberField label="단 (층)" value={rack.levels} step={1} min={1} suffix="단" disabled={readOnly} onCommit={(value) => onResize(rack.bays, Math.round(value))} />
          <NumberField label="연 폭" value={rack.bayWidth} step={0.1} min={0.8} disabled={readOnly} onCommit={(value) => onChange(patchRack(draft, rack.id, { bayWidth: value }))} />
          <NumberField label="단 높이" value={rack.levelHeight} step={0.1} min={0.6} disabled={readOnly} onCommit={(value) => onChange(patchRack(draft, rack.id, { levelHeight: value }))} />
          <NumberField label="깊이" value={rack.depth} step={0.1} min={0.6} disabled={readOnly} onCommit={(value) => onChange(patchRack(draft, rack.id, { depth: value }))} />
          <NumberField label="칸당 파레트" value={rack.palletsPerSlot} step={1} min={1} suffix="PLT" disabled={readOnly} onCommit={(value) => onChange(patchRack(draft, rack.id, { palletsPerSlot: Math.max(1, Math.round(value)) }))} />
          <label className="le-text">
            <span>파레트 규격</span>
            <select value={rack.palletSpec} disabled={readOnly} onChange={(event) => onChange(patchRack(draft, rack.id, { palletSpec: event.target.value }))}>
              {(PALLET_SPECS as readonly string[]).includes(rack.palletSpec) ? null : <option value={rack.palletSpec}>{rack.palletSpec}</option>}
              {PALLET_SPECS.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="칸당 허용 하중 (0 = 제한 없음)"
            value={rack.maxLoadKg ?? 0}
            step={50}
            min={0}
            suffix="kg"
            disabled={readOnly}
            onCommit={(value) => onChange(patchRack(draft, rack.id, { maxLoadKg: value > 0 ? Math.round(value) : null }))}
          />
        </div>
        <p className="le-note">허용 하중은 이 랙의 모든 칸에 적용됩니다. 맨 윗단처럼 따로 낮출 칸은 로케이션 수정에서 최대 무게를 정하세요.</p>
      </Section>

      <Section title="정면도 · 로케이션 배정" aside={<small className="le-aside">빈 칸 {empties}</small>}>
        <p className="le-note">왼쪽 트레이에서 로케이션을 끌어 칸에 놓거나, 칸을 눌러 고릅니다.</p>
        <div className="le-cells" style={{ gridTemplateColumns: `repeat(${rack.bays}, minmax(0, 1fr))` }}>
          {Array.from({ length: rack.levels }, (_, row) => rack.levels - row).map((level) =>
            Array.from({ length: rack.bays }, (_, col) => col + 1).map((bay) => {
              const occupant = cellOccupant(draft, rack.id, bay, level);
              const key = `${bay}:${level}`;
              const stocked = occupant != null && locationById.get(occupant)?.hasStock;
              const isNew = occupant != null && occupant < 0;
              return (
                <button
                  key={key}
                  type="button"
                  className={`le-cell${occupant != null ? " is-bound" : ""}${isNew ? " is-new" : ""}${cell?.bay === bay && cell?.level === level ? " is-sel" : ""}${dropCell === key ? " is-drop" : ""}`}
                  title={`${bay}연 ${level}단${occupant != null ? ` · ${codeOf(occupant)}` : " · 비어 있음"}`}
                  onClick={() => setCell({ bay, level })}
                  onDragOver={(event) => {
                    if (readOnly) return;
                    event.preventDefault();
                    setDropCell(key);
                  }}
                  onDragLeave={() => setDropCell((prev) => (prev === key ? null : prev))}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropCell(null);
                    const id = Number(event.dataTransfer.getData(DND_TYPE));
                    if (Number.isFinite(id) && id !== 0) assign(id, bay, level);
                  }}
                >
                  {occupant != null ? codeOf(occupant) : `${bay}·${level}`}
                  {stocked ? <i className="le-cell-dot" aria-label="재고 있음" /> : null}
                </button>
              );
            })
          )}
        </div>

        {cell ? (
          <div className="le-cell-panel">
            <b>
              {cell.bay}연 {cell.level}단
            </b>
            {occupantAtCell != null ? (
              <>
                <span>
                  {codeOf(occupantAtCell)}
                  {locationById.get(occupantAtCell)?.hasStock ? " · 재고 있음 (배치만 바뀌고 재고는 따라갑니다)" : ""}
                </span>
                {!readOnly ? (
                  <button
                    type="button"
                    className="le-mini"
                    onClick={() => {
                      onChange(bindLocation(draft, occupantAtCell, null));
                      notify("info", `${codeOf(occupantAtCell)} 을(를) 미배치로 돌렸습니다`);
                    }}
                  >
                    미배치로 빼기
                  </button>
                ) : null}
              </>
            ) : !readOnly ? (
              <select
                value=""
                onChange={(event) => {
                  const id = Number(event.target.value);
                  if (id) assign(id, cell.bay, cell.level);
                }}
              >
                <option value="">미배치 로케이션 선택 ({unplaced.length})</option>
                {unplaced.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code}
                    {loc.zoneId !== rack.zoneId ? " (다른 구역)" : ""}
                    {loc.hasStock ? " · 재고" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span>비어 있음</span>
            )}
          </div>
        ) : null}
      </Section>

      {!readOnly ? (
        <Section title="빈 칸에 로케이션 만들기">
          <div className="le-grid2">
            <label className="le-text">
              <span>코드 규칙</span>
              <input className="is-mono" value={pattern} onChange={(event) => setPattern(event.target.value)} />
            </label>
            <label className="le-text">
              <span>유형</span>
              <select value={genType} onChange={(event) => setGenType(event.target.value as LocationType)}>
                {(Object.keys(LOCATION_TYPE_LABEL) as LocationType[]).map((type) => (
                  <option key={type} value={type}>
                    {LOCATION_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="le-note">
            토큰 <code>{"{zone}"}</code> <code>{"{rack}"}</code> <code>{"{bay}"}</code> <code>{"{level}"}</code> <code>{"{seq}"}</code> — 코드에 위치를 넣으면 랙을 옮길 때 코드가 틀어지므로 <code>{"{seq}"}</code> 를 권장합니다.
          </p>
          <button
            type="button"
            className="le-primary"
            disabled={empties <= 0}
            onClick={() => {
              const result = generateLocations(draft, rack.id, pattern, genType, new Set(locations.map((loc) => loc.code)));
              if (result.error) {
                notify("danger", result.error);
                return;
              }
              onChange(result.draft);
              notify("success", `새 로케이션 ${result.created.length}개 — ${result.created[0]} ~ ${result.created[result.created.length - 1]} (게시할 때 마스터에 생성)`);
            }}
          >
            <Icon name="plus" size={14} />
            빈 칸 {Math.max(empties, 0)}개에 만들기
          </button>
        </Section>
      ) : null}

      {!readOnly ? (
        <button
          type="button"
          className="le-danger"
          onClick={() => {
            const bound = Object.values(draft.bindings).filter((placement) => placement?.rackId === rack.id).length;
            onChange(deleteSelection(draft, { kind: "rack", id: rack.id }));
            onSelect(zone ? { kind: "zone", id: zone.id } : null);
            notify("info", `${rack.code} 을(를) 지웠습니다${bound ? ` · 로케이션 ${bound}개는 미배치 트레이로 (재고는 그대로)` : ""}`);
          }}
        >
          <Icon name="x" size={14} />
          랙 삭제
        </button>
      ) : null}
    </div>
  );
};

const ObjectInspector = ({ draft, readOnly, onChange, onSelect, objectId }: InspectorProps & { objectId: number }) => {
  const object = draft.objects.find((item) => item.id === objectId)!;
  return (
    <div className="le-inspector">
      <div className="le-ins-head">
        <span className="nx-eyebrow">FACILITY</span>
        <h4>{OBJECT_DEFAULTS[object.kind].name}</h4>
        <p>모서리 핸들로 크기를, 회전 버튼으로 방향을 바꿉니다.</p>
      </div>
      <Section title="속성">
        <TextField label="표시 이름" value={object.label || " "} disabled={readOnly} onCommit={(value) => onChange(patchObject(draft, object.id, { label: value }))} />
        <div className="le-grid2">
          <NumberField label="중심 X" value={object.x} disabled={readOnly} onCommit={(value) => onChange(patchObject(draft, object.id, { x: value }))} />
          <NumberField label="중심 Z" value={object.z} disabled={readOnly} onCommit={(value) => onChange(patchObject(draft, object.id, { z: value }))} />
          <NumberField label="길이" value={object.width} step={0.1} min={0.2} disabled={readOnly} onCommit={(value) => onChange(patchObject(draft, object.id, { width: value }))} />
          <NumberField label="폭" value={object.depth} step={0.1} min={0.2} disabled={readOnly} onCommit={(value) => onChange(patchObject(draft, object.id, { depth: value }))} />
        </div>
        <label className="le-text">
          <span>회전</span>
          <div className="le-seg">
            {ROTATIONS.map((rotation) => (
              <button
                key={rotation}
                type="button"
                className={object.rotation === rotation ? "is-on" : ""}
                disabled={readOnly}
                onClick={() => onChange(patchObject(draft, object.id, { rotation }))}
              >
                {rotation}°
              </button>
            ))}
          </div>
        </label>
      </Section>
      {!readOnly ? (
        <button
          type="button"
          className="le-danger"
          onClick={() => {
            onChange(deleteSelection(draft, { kind: "object", id: object.id }));
            onSelect(null);
          }}
        >
          <Icon name="x" size={14} />
          시설물 삭제
        </button>
      ) : null}
    </div>
  );
};

/* ============================================================
   왼쪽 — 미배치 트레이 · 검증 결과
   ============================================================ */

type TrayProps = {
  draft: LayoutDraft;
  locations: EditorLocation[];
  selection: EditorSelection;
  readOnly: boolean;
  onChange: (next: LayoutDraft) => void;
  notify: Notify;
  issues: RuleIssue[];
  onIssueClick: (issue: RuleIssue) => void;
};

export const TrayPanel = ({ draft, locations, selection, readOnly, onChange, notify, issues, onIssueClick }: TrayProps) => {
  const [query, setQuery] = useState("");
  const zoneName = (id: number) => draft.zones.find((zone) => zone.id === id)?.name ?? "-";

  const items = useMemo(() => {
    const text = query.trim().toLowerCase();
    return [
      ...locations
        .filter((loc) => !draft.bindings[String(loc.id)])
        .map((loc) => ({ id: loc.id, code: loc.code, zoneId: loc.zoneId, type: loc.locationType, stock: loc.stockCount, isNew: false })),
      ...draft.newLocations
        .filter((loc) => !draft.bindings[String(loc.id)])
        .map((loc) => ({ id: loc.id, code: loc.code, zoneId: loc.zoneId, type: loc.locationType, stock: 0, isNew: true }))
    ]
      .filter((item) => !text || item.code.toLowerCase().includes(text))
      .sort((a, b) => a.code.localeCompare(b.code, "ko", { numeric: true }));
  }, [locations, draft.bindings, draft.newLocations, query]);

  const selectedRack = selection?.kind === "rack" ? draft.racks.find((rack) => rack.id === selection.id) : undefined;

  /** 클릭 — 선택한 랙의 첫 빈 칸(아래 단부터)에 넣는다 */
  const quickPlace = (id: number, code: string) => {
    if (readOnly) return;
    if (!selectedRack) {
      notify("info", "랙을 먼저 선택하면 클릭 한 번으로 빈 칸에 넣을 수 있습니다. (또는 정면도 칸으로 끌어 놓기)");
      return;
    }
    for (let level = 1; level <= selectedRack.levels; level += 1) {
      for (let bay = 1; bay <= selectedRack.bays; bay += 1) {
        if (cellOccupant(draft, selectedRack.id, bay, level) == null) {
          onChange(bindLocation(draft, id, { rackId: selectedRack.id, bay, level }));
          notify("success", `${code} → ${selectedRack.code} ${bay}연 ${level}단`);
          return;
        }
      }
    }
    notify("danger", `${selectedRack.code} 에 빈 칸이 없습니다`);
  };

  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");

  return (
    <div className="le-tray">
      <div className="le-tray-head">
        <b>미배치 로케이션</b>
        <span className="le-count">{items.length}</span>
      </div>
      <label className="le-tray-search">
        <Icon name="search" size={13} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="코드 검색" />
      </label>
      <div className="le-tray-list">
        {items.length === 0 ? <p className="le-note">모든 로케이션이 배치되어 있습니다.</p> : null}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`le-chip${item.isNew ? " is-new" : ""}`}
            draggable={!readOnly}
            onDragStart={(event) => {
              event.dataTransfer.setData(DND_TYPE, String(item.id));
              event.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => quickPlace(item.id, item.code)}
            title={selectedRack ? `클릭: ${selectedRack.code} 빈 칸에 넣기` : "정면도 칸으로 끌어 놓기"}
          >
            <b>{item.code}</b>
            <small>
              {zoneName(item.zoneId)} · {LOCATION_TYPE_LABEL[item.type]}
            </small>
            {item.stock ? <span className="le-chip-stock">재고 {item.stock}</span> : null}
            {item.isNew ? <span className="le-chip-new">새로</span> : null}
          </button>
        ))}
      </div>

      <div className="le-issues">
        <div className="le-tray-head">
          <b>검증</b>
          <span className={`le-count${errors.length ? " is-bad" : warnings.length ? " is-warn" : " is-ok"}`}>
            {errors.length ? `오류 ${errors.length}` : warnings.length ? `주의 ${warnings.length}` : "통과"}
          </span>
        </div>
        <div className="le-issue-list">
          {issues.length === 0 ? (
            <p className="le-note is-ok">
              <Icon name="checkCircle" size={13} />
              겹침·경계·코드 중복 없음 — 게시할 수 있습니다.
            </p>
          ) : null}
          {[...errors, ...warnings].map((issue, idx) => (
            <button key={idx} type="button" className={`le-issue is-${issue.level}`} onClick={() => onIssueClick(issue)}>
              <Icon name={issue.level === "error" ? "xCircle" : "alert"} size={13} />
              <span>{issue.message}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

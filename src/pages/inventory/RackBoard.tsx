import { useEffect, useMemo, useRef } from "react";
import { Icon } from "../../components/ui/Icon";
import { MapSearch } from "../../components/warehouse3d/MapSearch";
import { RackFaceGrid, RackFaceLegend } from "../../components/warehouse3d/RackFaceGrid";
import {
  bucketOf,
  isOverweight,
  zoneHoldsRacks,
  type LayoutSlot,
  type MapSearchItem,
  type MapSearchLocation
} from "../../components/warehouse3d/types";
import type { WarehouseMapState } from "../../components/warehouse3d/useWarehouseMap";
import type { LabelTarget } from "./LocationLabels";

/* ============================================================
   로케이션 관리 › CAPA › 랙 정면
   구역의 랙을 정면 격자로 펼쳐 칸마다 채움 %를 본다 — 빈 칸 찾기, 라벨 출력(랙·구역 단위).
   칸을 누르면 옆 패널에 로케이션 상세가 열린다 (3D 와 같은 선택 상태를 쓴다).
   ============================================================ */

const byCode = (a: string, b: string) => a.localeCompare(b, "ko", { numeric: true });

type Props = {
  map: WarehouseMapState;
  onPrint: (targets: LabelTarget[], title: string) => void;
};

export const RackBoard = ({ map, onPrint }: Props) => {
  const { layout, selection, selectedZone: zone } = map;
  const boardRef = useRef<HTMLDivElement>(null);
  const highlight = useMemo(() => (map.highlight ? new Set(map.highlight.ids) : null), [map.highlight]);

  const zoneGroups = useMemo(
    () =>
      (layout?.floors ?? []).map((floor) => ({
        floor: floor.code,
        // 랙 정면은 보관 구역만 — 입고장 · 출고장 · 사무실에는 랙이 없다
        zones: (layout?.zones ?? []).filter((item) => item.floor === floor.code && zoneHoldsRacks(item)).sort((a, b) => byCode(a.code, b.code))
      })),
    [layout]
  );

  const racks = useMemo(() => {
    if (!layout || !zone) return [];
    return layout.racks
      .filter((rack) => rack.zoneId === zone.id)
      .sort((a, b) => byCode(a.code, b.code))
      .map((rack) => ({ rack, slots: layout.slots.filter((slot) => slot.rackId === rack.id) }));
  }, [layout, zone]);

  const zoneSlots = racks.flatMap((entry) => entry.slots);
  const emptyCount = zoneSlots.filter((slot) => slot.active && slot.pallets <= 0).length;
  const overweightCount = zoneSlots.filter(isOverweight).length;

  // 검색·옆 패널에서 고른 칸이 화면 밖이면 보이게
  useEffect(() => {
    boardRef.current?.querySelector(".rf-cell.is-sel")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selection.locationId]);

  const toTargets = (slots: LayoutSlot[]): LabelTarget[] => {
    const rackCode = new Map(racks.map((entry) => [entry.rack.id, entry.rack.code]));
    return slots.map((slot) => ({
      locationId: slot.locationId,
      code: slot.code,
      warehouseName: layout?.warehouse.name ?? "",
      zoneName: zone?.name ?? "",
      floor: zone?.floor ?? null,
      rackCode: rackCode.get(slot.rackId) ?? null,
      bay: slot.bay,
      level: slot.level,
      locationType: slot.locationType
    }));
  };

  const pickLocation = (location: MapSearchLocation) => {
    map.setHighlight(null);
    map.selectLocation(location.locationId, { focus: false });
  };
  const pickItem = (item: MapSearchItem) => {
    const placed = item.locations.filter((location) => location.placed);
    map.setHighlight({ label: `${item.itemName} · ${placed.length}곳`, ids: placed.map((location) => location.locationId) });
    if (placed[0]) map.selectZone(placed[0].zoneId, { focus: false });
  };

  return (
    <div className="rb" ref={boardRef}>
      <div className="rb-tools">
        <label className="rb-zone">
          <span>구역</span>
          <select value={zone?.id ?? ""} onChange={(event) => map.selectZone(Number(event.target.value), { focus: false })}>
            {!zone ? <option value="">구역 선택</option> : null}
            {zoneGroups.map((group) => (
              <optgroup key={group.floor} label={group.floor}>
                {group.zones.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.purposeName} · {item.util}%
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <MapSearch
          warehouseId={map.warehouseId}
          onPickLocation={pickLocation}
          onPickItem={pickItem}
          highlightLabel={map.highlight?.label ?? null}
          onClearHighlight={() => map.setHighlight(null)}
        />
        <button
          type="button"
          className="btn-secondary lp-btn rb-print"
          disabled={!zone || !zoneSlots.length}
          onClick={() => zone && onPrint(toTargets(zoneSlots), `${zone.name} 전체`)}
        >
          <Icon name="printer" size={14} />
          구역 라벨 출력
        </button>
      </div>

      {zone ? (
        <div className="rb-summary">
          <b>{zone.name}</b>
          <span>
            {zone.floor} · {zone.purposeName}
          </span>
          <span>랙 {racks.length}개</span>
          <span>
            점유 <b>{zone.usedPositions}</b>/{zone.positions} 파레트 자리 · <b style={{ color: bucketOf(zone.util).token }}>{zone.util}%</b>
          </span>
          <span>
            공실 <b>{emptyCount}</b>칸
          </span>
          {overweightCount ? (
            <span className="is-danger">
              무게 초과 <b>{overweightCount}</b>칸
            </span>
          ) : null}
        </div>
      ) : null}

      <RackFaceLegend />

      {!zone ? (
        <div className="nx-empty">구역을 고르면 그 구역의 랙이 정면 격자로 펼쳐집니다.</div>
      ) : racks.length === 0 ? (
        <div className="nx-empty">이 구역에는 랙이 없습니다 — [배치 편집]에서 랙을 추가하세요.</div>
      ) : (
        racks.map(({ rack, slots }) => (
          <section key={rack.id} className="rb-rack">
            <RackFaceGrid
              rack={rack}
              slots={slots}
              selectedId={selection.locationId}
              highlightIds={highlight}
              onSelect={(id) => map.selectLocation(id, { focus: false })}
              actions={
                <button type="button" className="rb-mini" disabled={!slots.length} onClick={() => onPrint(toTargets(slots), `${zone.name} · ${rack.code}`)}>
                  <Icon name="printer" size={13} />
                  라벨
                </button>
              }
            />
          </section>
        ))
      )}
    </div>
  );
};

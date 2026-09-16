import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../../services/http";
import { Icon } from "../ui/Icon";
import { LOCATION_TYPE_LABEL, type MapSearchItem, type MapSearchLocation, type MapSearchResult } from "./types";

/* ============================================================
   맵 검색 — 로케이션 코드는 그 슬롯으로 날아가고,
   품목은 그 품목이 있는 슬롯을 전부 강조한다.
   ============================================================ */

type Props = {
  warehouseId: number;
  onPickLocation: (location: MapSearchLocation) => void;
  onPickItem: (item: MapSearchItem) => void;
  highlightLabel?: string | null;
  onClearHighlight?: () => void;
};

type Row = { kind: "location"; location: MapSearchLocation } | { kind: "item"; item: MapSearchItem };

export const MapSearch = ({ warehouseId, onPickLocation, onPickItem, highlightLabel, onClearHighlight }: Props) => {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MapSearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    seq.current += 1;
    const mine = seq.current;
    const timer = window.setTimeout(() => {
      apiGet<MapSearchResult>(`/warehouse/search?warehouseId=${warehouseId}&q=${encodeURIComponent(text)}`)
        .then((data) => {
          if (mine !== seq.current) return;
          setResult(data);
          setActive(0);
        })
        .catch(() => mine === seq.current && setResult({ locations: [], items: [] }))
        .finally(() => mine === seq.current && setLoading(false));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [query, warehouseId]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const rows: Row[] = useMemo(
    () => [
      ...(result?.locations ?? []).map((location) => ({ kind: "location" as const, location })),
      ...(result?.items ?? []).map((item) => ({ kind: "item" as const, item }))
    ],
    [result]
  );

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "location") onPickLocation(row.location);
    else onPickItem(row.item);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((idx) => Math.min(idx + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((idx) => Math.max(idx - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(rows[active]);
    } else if (event.key === "Escape") {
      if (open) setOpen(false);
      else {
        setQuery("");
        onClearHighlight?.();
      }
    }
  };

  const locationCount = result?.locations.length ?? 0;

  return (
    <div className="wms-search" ref={boxRef}>
      <label className="wms-search-box">
        <Icon name="search" size={15} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="로케이션 코드 · 품목 검색"
          aria-label="맵 검색"
          aria-expanded={open && rows.length > 0}
        />
        {loading ? <span className="wms-search-spin" aria-hidden="true" /> : null}
      </label>

      {highlightLabel ? (
        <span className="wms-search-chip">
          <Icon name="flag" size={12} />
          {highlightLabel}
          <button type="button" onClick={onClearHighlight} aria-label="강조 해제">
            <Icon name="x" size={12} />
          </button>
        </span>
      ) : null}

      {open && query.trim() && !loading ? (
        <div className="wms-search-pop" role="listbox">
          {rows.length === 0 ? <div className="wms-search-empty">"{query.trim()}" 결과가 없습니다</div> : null}
          {rows.map((row, idx) => {
            const isActive = idx === active;
            if (row.kind === "location") {
              const { location } = row;
              return (
                <button
                  key={`l-${location.locationId}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`wms-search-row${isActive ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(row)}
                >
                  {idx === 0 ? <span className="wms-search-group">로케이션</span> : null}
                  <span className="wms-search-main">
                    <b>{location.code}</b>
                    <small>
                      {location.zoneName}
                      {location.floor ? ` · ${location.floor}` : ""} · {LOCATION_TYPE_LABEL[location.locationType]}
                    </small>
                  </span>
                  {!location.placed ? <span className="wms-search-tag">미배치</span> : null}
                </button>
              );
            }
            const { item } = row;
            return (
              <button
                key={`i-${item.itemCode}`}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`wms-search-row${isActive ? " is-active" : ""}`}
                onMouseEnter={() => setActive(idx)}
                onClick={() => choose(row)}
              >
                {idx === locationCount ? <span className="wms-search-group">품목</span> : null}
                <span className="wms-search-main">
                  <b>{item.itemName}</b>
                  <small>
                    {item.itemCode} · {item.onHand.toLocaleString()} {item.unit}
                  </small>
                </span>
                <span className="wms-search-tag">{item.locations.length}곳</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

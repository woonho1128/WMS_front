import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { apiGet } from "../../services/http";
import { downloadCsv } from "../../shared/csv";
import { appToday } from "../../shared/appDate";
import "./StockPage.css";

/* ============================================================
   실시간 재고 조회 — 로케이션 맵 + LOT 스택(선입선출) / 목록
   기준: DOCS/front 운영화면 재설계 HTML
   ============================================================ */

type StockRow = {
  itemCode: string;
  itemName: string;
  warehouseName: string;
  warehouseType: string;
  zoneName: string;
  locationCode: string;
  locationType: string;
  lotNo: string;
  stockStatus: string;
  receivedDate: string | null;
  onHand: number;
  allocated: number;
  available: number;
};

type LocationRow = {
  id: number;
  code: string;
  locationType: string;
  status: string;
  maxQty: number | null;
  zoneName: string;
  warehouseName: string;
};

type Lot = {
  lot: string;
  sku: string;
  name: string;
  date: string;
  age: number;
  qty: number;
  alloc: number;
  status: string;
};

type LocAgg = {
  code: string;
  maxQty: number;
  zoneName: string;
  warehouseName: string;
  locationType: string;
  lots: Lot[];
  qty: number;
  alloc: number;
  putaway: number;
  defect: number;
  avail: number;
  util: number;
};

const LOC_TYPE: Record<string, { label: string; tone: string }> = {
  PICKING: { label: "피킹", tone: "info" },
  RESERVE: { label: "보관", tone: "teal" },
  CROSS_DOCK: { label: "직출", tone: "violet" },
  RETURN: { label: "반품", tone: "danger" },
  DEFECT: { label: "불량", tone: "danger" }
};
const STOCK_STATUS: Record<string, { label: string; tone: string }> = {
  AVAILABLE: { label: "가용", tone: "success" },
  PUTAWAY_WAIT: { label: "격납대기", tone: "warning" },
  DEFECT: { label: "불량", tone: "danger" },
  RESERVED: { label: "예약", tone: "warning" },
  MOVING: { label: "이동중", tone: "violet" }
};

/** 적재율 구간 — 맵 셀 색 */
const BUCKETS = [
  { key: "empty", label: "공석", max: 0 },
  { key: "free", label: "여유", max: 50 },
  { key: "normal", label: "보통", max: 75 },
  { key: "busy", label: "혼잡", max: 90 },
  { key: "full", label: "가득참", max: 101 }
];
const bucketOf = (util: number) =>
  util === 0 ? "empty" : util >= 90 ? "full" : util >= 75 ? "busy" : util >= 50 ? "normal" : "free";

/** 경과일 톤 — 30일/60일 기준 */
const ageTone = (age: number) => (age >= 60 ? "danger" : age >= 30 ? "warning" : "gray");

const num = (n: number) => n.toLocaleString("ko-KR");
const daysBetween = (from: string | null) => {
  if (!from) return 0;
  const ms = appToday().getTime() - new Date(`${from}T00:00:00`).getTime();
  return Math.max(0, Math.round(ms / 86400000));
};

export const StockPage = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [warehouse, setWarehouse] = useState<string>("");
  const [view, setView] = useState<"map" | "list">("map");
  const [group, setGroup] = useState<"item" | "loc">("item");
  const [selCode, setSelCode] = useState<string>("");
  const [keyword, setKeyword] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([apiGet<StockRow[]>("/stocks"), apiGet<LocationRow[]>("/locations")])
      .then(([s, l]) => {
        setStocks(s);
        setLocations(l);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const warehouses = useMemo(() => {
    const names = Array.from(new Set(locations.map((l) => l.warehouseName))).filter(Boolean);
    return names;
  }, [locations]);

  useEffect(() => {
    if (!warehouse && warehouses.length) setWarehouse(warehouses[0]);
  }, [warehouses, warehouse]);

  /** 로케이션 1개 = 재고 집계 한 덩어리. 맵·상세·목록이 모두 이 결과만 본다. */
  const locAggs = useMemo<LocAgg[]>(() => {
    const byLoc = new Map<string, StockRow[]>();
    stocks.forEach((s) => {
      const list = byLoc.get(s.locationCode) ?? [];
      list.push(s);
      byLoc.set(s.locationCode, list);
    });

    return locations
      .filter((l) => !warehouse || l.warehouseName === warehouse)
      .map((l) => {
        const rows = byLoc.get(l.code) ?? [];
        const lots: Lot[] = rows
          .map((r) => ({
            lot: r.lotNo,
            sku: r.itemCode,
            name: r.itemName,
            date: r.receivedDate ?? "-",
            age: daysBetween(r.receivedDate),
            qty: r.onHand,
            alloc: r.allocated,
            status: r.stockStatus
          }))
          .sort((a, b) => b.age - a.age); // 오래된 LOT = 선입선출 1순위

        const qty = lots.reduce((a, x) => a + x.qty, 0);
        const defect = lots.filter((x) => x.status === "DEFECT").reduce((a, x) => a + x.qty, 0);
        const putaway = lots.filter((x) => x.status === "PUTAWAY_WAIT").reduce((a, x) => a + x.qty, 0);
        const alloc = lots.filter((x) => x.status === "AVAILABLE").reduce((a, x) => a + x.alloc, 0);
        const maxQty = l.maxQty ?? 0;
        return {
          code: l.code,
          maxQty,
          zoneName: l.zoneName,
          warehouseName: l.warehouseName,
          locationType: l.locationType,
          lots,
          qty,
          alloc,
          putaway,
          defect,
          avail: qty - defect - putaway - alloc,
          util: maxQty > 0 ? Math.round((qty / maxQty) * 100) : 0
        };
      });
  }, [stocks, locations, warehouse]);

  useEffect(() => {
    if (!locAggs.length) {
      setSelCode("");
      return;
    }
    setSelCode((prev) => {
      if (prev && locAggs.some((l) => l.code === prev)) return prev;
      return (locAggs.find((l) => l.qty > 0) ?? locAggs[0]).code;
    });
  }, [locAggs]);

  const selected = locAggs.find((l) => l.code === selCode) ?? null;

  const zones = useMemo(() => {
    const byZone = new Map<string, LocAgg[]>();
    locAggs.forEach((l) => {
      const list = byZone.get(l.zoneName) ?? [];
      list.push(l);
      byZone.set(l.zoneName, list);
    });
    return Array.from(byZone.entries()).map(([name, cells]) => ({
      name,
      range: `${cells[0].code} ~ ${cells[cells.length - 1].code}`,
      typeLabel: LOC_TYPE[cells[0].locationType]?.label ?? cells[0].locationType,
      avg: Math.round(cells.reduce((a, c) => a + c.util, 0) / cells.length),
      cells
    }));
  }, [locAggs]);

  const kpis = useMemo(() => {
    const total = locAggs.reduce((a, l) => a + l.qty, 0);
    const avail = locAggs.reduce((a, l) => a + l.avail, 0);
    const putaway = locAggs.reduce((a, l) => a + l.putaway, 0);
    const defect = locAggs.reduce((a, l) => a + l.defect, 0);
    const longTerm = locAggs.reduce(
      (a, l) => a + l.lots.filter((x) => x.age >= 60).reduce((b, x) => b + x.qty, 0),
      0
    );
    return [
      { label: "총 재고", value: total, tone: "ink", big: true },
      { label: "가용", value: avail, tone: "success", big: false },
      { label: "장기 60일+", value: longTerm, tone: "warning", big: false },
      { label: "격납대기", value: putaway, tone: "info", big: false },
      { label: "불량", value: defect, tone: "danger", big: false }
    ];
  }, [locAggs]);

  const meta = useMemo(() => {
    const skus = new Set(locAggs.flatMap((l) => l.lots.map((x) => x.sku)));
    const lots = locAggs.reduce((a, l) => a + l.lots.length, 0);
    return `${locAggs.length} 로케이션 · ${skus.size} SKU · ${lots} LOT`;
  }, [locAggs]);

  /* ---------- 목록 뷰 그룹 ---------- */
  const groups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const match = (l: LocAgg, x: Lot) =>
      !kw || `${l.code} ${x.sku} ${x.name} ${x.lot}`.toLowerCase().includes(kw);

    if (group === "item") {
      const by = new Map<string, { title: string; sub: string; places: Set<string>; qty: number; avail: number; alloc: number; putaway: number; defect: number; rows: Array<{ c1: string; c2: string; badge: string; tone: string; lot: string; date: string; age: number; qty: number; avail: number }> }>();
      locAggs.forEach((l) =>
        l.lots.forEach((x) => {
          if (!match(l, x)) return;
          const g = by.get(x.sku) ?? {
            title: x.sku, sub: x.name, places: new Set<string>(),
            qty: 0, avail: 0, alloc: 0, putaway: 0, defect: 0, rows: []
          };
          g.qty += x.qty;
          g.places.add(l.code);
          if (x.status === "AVAILABLE") {
            g.avail += x.qty - x.alloc;
            g.alloc += x.alloc;
          } else if (x.status === "PUTAWAY_WAIT") g.putaway += x.qty;
          else g.defect += x.qty;
          g.rows.push({
            c1: l.code,
            c2: `${l.zoneName} · 적재율 ${l.util}%`,
            badge: LOC_TYPE[l.locationType]?.label ?? l.locationType,
            tone: LOC_TYPE[l.locationType]?.tone ?? "gray",
            lot: x.lot, date: x.date, age: x.age,
            qty: x.qty,
            avail: x.status === "AVAILABLE" ? x.qty - x.alloc : 0
          });
          by.set(x.sku, g);
        })
      );
      return Array.from(by.values())
        .sort((a, b) => b.qty - a.qty)
        .map((g) => ({ ...g, meta: `${g.places.size} 로케이션 · ${g.rows.length} LOT` }));
    }

    return locAggs
      .filter((l) => l.lots.some((x) => match(l, x)))
      .map((l) => ({
        title: l.code,
        sub: l.zoneName,
        meta: `적재율 ${l.util}% · ${l.lots.length} LOT`,
        qty: l.qty, avail: l.avail, alloc: l.alloc, putaway: l.putaway, defect: l.defect,
        rows: l.lots.filter((x) => match(l, x)).map((x) => ({
          c1: x.sku,
          c2: x.name,
          badge: STOCK_STATUS[x.status]?.label ?? x.status,
          tone: STOCK_STATUS[x.status]?.tone ?? "gray",
          lot: x.lot, date: x.date, age: x.age,
          qty: x.qty,
          avail: x.status === "AVAILABLE" ? x.qty - x.alloc : 0
        }))
      }));
  }, [locAggs, group, keyword]);

  const exportCsv = () =>
    downloadCsv(
      `실시간재고_${warehouse}`,
      ["로케이션", "유형", "SKU", "품목명", "LOT", "입고일", "경과일", "수량", "가용"],
      locAggs.flatMap((l) =>
        l.lots.map((x) => [
          l.code, LOC_TYPE[l.locationType]?.label ?? l.locationType, x.sku, x.name,
          x.lot, x.date, x.age, x.qty, x.status === "AVAILABLE" ? x.qty - x.alloc : 0
        ])
      )
    );

  const seg = (o: { qty: number; avail: number; alloc: number; putaway: number; defect: number }) => {
    const t = o.qty || 1;
    return [
      { tone: "success", w: (o.avail / t) * 100 },
      { tone: "info", w: (o.alloc / t) * 100 },
      { tone: "warning", w: (o.putaway / t) * 100 },
      { tone: "danger", w: (o.defect / t) * 100 }
    ];
  };

  return (
    <section className="stk-page">
      {/* ---------- 창고 탭 + KPI ---------- */}
      <header className="stk-top card">
        <div className="stk-whs">
          {warehouses.map((w) => (
            <button
              key={w}
              type="button"
              className={`stk-wh${warehouse === w ? " is-on" : ""}`}
              onClick={() => setWarehouse(w)}
            >
              {w}
            </button>
          ))}
          <span className="stk-meta">{loading ? "불러오는 중…" : meta}</span>
        </div>
        <div className="stk-kpis">
          {kpis.map((k) => (
            <div key={k.label} className={`stk-kpi${k.big ? " is-big" : ""}`}>
              <span className="stk-kpi-label">{k.label}</span>
              <span className={`stk-kpi-value tone-${k.tone}`}>
                {num(k.value)}
                <small>EA</small>
              </span>
            </div>
          ))}
        </div>
      </header>

      {error ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>불러오기 실패: {error} — 백엔드(8080) 확인</span>
        </div>
      ) : null}

      {/* ---------- 뷰 전환 ---------- */}
      <div className="stk-toolbar card">
        <div className="stk-views">
          <button type="button" className={`stk-view${view === "map" ? " is-on" : ""}`} onClick={() => setView("map")}>
            <Icon name="grid" size={15} />
            로케이션 맵
          </button>
          <button type="button" className={`stk-view${view === "list" ? " is-on" : ""}`} onClick={() => setView("list")}>
            <Icon name="menu" size={15} />
            목록
          </button>
          <span className="stk-view-note">
            {view === "map"
              ? "칸을 누르면 그 로케이션의 LOT 스택이 오른쪽에 열립니다."
              : "LOT 단위 전체 목록입니다. 엑셀로 내보낼 수 있습니다."}
          </span>
        </div>
        <div className="stk-tools">
          {view === "list" ? (
            <div className="stk-group">
              {(["item", "loc"] as const).map((g) => (
                <button key={g} type="button" className={`stk-view${group === g ? " is-on" : ""}`} onClick={() => setGroup(g)}>
                  {g === "item" ? "품목별" : "로케이션별"}
                </button>
              ))}
            </div>
          ) : null}
          <div className="stk-search">
            <Icon name="search" size={15} />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="로케이션 · SKU · LOT"
              aria-label="재고 검색"
            />
          </div>
          <button type="button" className="stk-btn" onClick={exportCsv}>
            <Icon name="download" size={14} />
            엑셀
          </button>
          <button type="button" className="nx-iconbtn" onClick={load} title="새로고침" aria-label="새로고침">
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </div>

      {/* ---------- 맵 뷰 ---------- */}
      {view === "map" ? (
        <div className="stk-main">
          <section className="card stk-map">
            <div className="stk-card-head">
              <span className="nx-sect-title">로케이션 맵</span>
              <div className="stk-legend">
                {BUCKETS.map((b) => (
                  <span key={b.key}>
                    <i className={`stk-swatch is-${b.key}`} />
                    {b.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="stk-zones">
              {zones.map((z) => (
                <div key={z.name} className="stk-zone">
                  <div className="stk-zone-head">
                    <span className="stk-zone-name">
                      <i className={`stk-zone-rail tone-${LOC_TYPE[z.cells[0].locationType]?.tone ?? "gray"}`} />
                      {z.name} · {z.typeLabel}
                    </span>
                    <span className="stk-zone-range">{z.range}</span>
                    <span className="stk-zone-avg">평균 {z.avg}%</span>
                  </div>
                  <div className="stk-cells">
                    {z.cells.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className={`stk-cell is-${bucketOf(c.util)}${selCode === c.code ? " is-sel" : ""}`}
                        onClick={() => setSelCode(c.code)}
                        title={`${c.code} · ${num(c.qty)} / ${num(c.maxQty)} (${c.util}%)`}
                      >
                        <span className="stk-cell-code">{c.code.replace(/^[A-Z]{2}-/, "")}</span>
                        <span className="stk-cell-qty">{c.qty ? num(c.qty) : "공석"}</span>
                        <span className="stk-cell-bar">
                          <i style={{ width: `${Math.min(c.util, 100)}%` }} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!zones.length && !loading ? <div className="nx-empty">해당 창고의 로케이션이 없습니다.</div> : null}
            </div>
          </section>

          {/* ---------- 선택 로케이션 상세 ---------- */}
          <aside className="card stk-detail">
            {!selected ? (
              <div className="nx-empty">로케이션을 선택하세요.</div>
            ) : (
              <>
                <div className="stk-detail-head">
                  <div>
                    <div className="stk-detail-code">
                      {selected.code}
                      <span className={`ds-badge ${LOC_TYPE[selected.locationType]?.tone ?? "gray"}`}>
                        {LOC_TYPE[selected.locationType]?.label ?? selected.locationType}
                      </span>
                    </div>
                    <div className="stk-sub">{selected.zoneName} · {selected.warehouseName}</div>
                  </div>
                  <div className={`stk-util tone-${bucketOf(selected.util)}`}>{selected.util}%</div>
                </div>

                <div className="stk-break">
                  <div className="stk-break-head">
                    <span>재고 구성</span>
                    <b>
                      {num(selected.qty)} EA · {selected.lots.length} LOT
                    </b>
                  </div>
                  <div className="stk-stack">
                    {seg(selected).map((s) => (
                      <i key={s.tone} className={`tone-${s.tone}`} style={{ width: `${s.w}%` }} />
                    ))}
                  </div>
                  <ul className="stk-break-legend">
                    <li><i className="tone-success" />가용<b>{num(selected.avail)}</b></li>
                    <li><i className="tone-info" />할당<b>{num(selected.alloc)}</b></li>
                    <li><i className="tone-warning" />격납대기<b>{num(selected.putaway)}</b></li>
                    <li><i className="tone-danger" />불량<b>{num(selected.defect)}</b></li>
                  </ul>
                </div>

                <div className="stk-lots-head">
                  <span>LOT 스택 · 선입선출</span>
                  <small>입고일 오래된 순</small>
                </div>
                <div className="stk-lots">
                  {selected.lots.map((l, i) => {
                    const maxQ = Math.max(...selected.lots.map((x) => x.qty), 1);
                    return (
                      <article key={l.lot + l.sku} className={`stk-lot${i === 0 ? " is-first" : ""}`}>
                        <div className="stk-lot-top">
                          <span className="stk-lot-order">{i + 1}</span>
                          <span className="stk-lot-no">{l.lot}</span>
                          {i === 0 ? <span className="ds-badge info">선입선출</span> : null}
                          <span className={`ds-badge ${ageTone(l.age)}`}>{l.age}일</span>
                        </div>
                        <div className="stk-lot-item">
                          <span className="stk-lot-sku">{l.sku}</span>
                          <span className="stk-lot-name">{l.name}</span>
                        </div>
                        <div className="stk-lot-foot">
                          <span className={`ds-badge ${STOCK_STATUS[l.status]?.tone ?? "gray"}`}>
                            {STOCK_STATUS[l.status]?.label ?? l.status}
                          </span>
                          <span className="stk-lot-date">입고 {l.date}</span>
                          <b>{num(l.qty)}</b>
                        </div>
                        <div className="nx-bar stk-lot-bar">
                          <i style={{ width: `${Math.round((l.qty / maxQ) * 100)}%` }} />
                        </div>
                      </article>
                    );
                  })}
                  {!selected.lots.length ? <div className="nx-empty">공석 로케이션입니다.</div> : null}
                </div>

                <div className="stk-detail-actions">
                  <button type="button" className="stk-btn" onClick={() => navigate("/stock/transfer")}>
                    <Icon name="swap" size={14} />
                    재고 이동
                  </button>
                  <button type="button" className="stk-btn" onClick={() => navigate("/stock/stocktaking")}>
                    <Icon name="clipboard" size={14} />
                    실사 등록
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {/* ---------- 목록 뷰 ---------- */}
      {view === "list" ? (
        <div className="stk-groups">
          {groups.map((g) => (
            <section key={g.title} className="card stk-group-card">
              <div className="stk-group-head">
                <div className="stk-group-title">
                  <b>{g.title}</b>
                  <span>{g.sub}</span>
                </div>
                <div className="stk-group-figures">
                  <span className="stk-group-meta">{g.meta}</span>
                  <span className="stk-group-qty">
                    {num(g.qty)} <small>EA</small>
                  </span>
                  <span className="stk-group-avail">가용 {num(g.avail)}</span>
                </div>
              </div>
              <div className="stk-stack stk-group-stack">
                {seg(g).map((s) => (
                  <i key={s.tone} className={`tone-${s.tone}`} style={{ width: `${s.w}%` }} />
                ))}
              </div>
              <div className="stk-table-wrap">
                <table className="data-table stk-table">
                  <thead>
                    <tr>
                      <th>{group === "item" ? "로케이션" : "SKU · 품목명"}</th>
                      <th>{group === "item" ? "유형" : "재고상태"}</th>
                      <th>LOT</th>
                      <th>입고일</th>
                      <th>경과</th>
                      <th className="num">수량</th>
                      <th className="num">가용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.lot + r.c1}>
                        <td>
                          <div className="stk-cell-strong">{r.c1}</div>
                          <div className="stk-sub">{r.c2}</div>
                        </td>
                        <td>
                          <span className={`ds-badge ${r.tone}`}>{r.badge}</span>
                        </td>
                        <td className="stk-mono">{r.lot}</td>
                        <td className="stk-mono">{r.date}</td>
                        <td>
                          <span className={`ds-badge ${ageTone(r.age)}`}>{r.age}일</span>
                        </td>
                        <td className="num">{num(r.qty)}</td>
                        <td className={`num${r.avail === 0 ? " is-zero" : ""}`}>{num(r.avail)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!groups.length && !loading ? <div className="nx-empty">검색 결과가 없습니다.</div> : null}
        </div>
      ) : null}
    </section>
  );
};

import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable";
import { useCan } from "../../app/access";
import { useAuthStore } from "../../app/store/authStore";
import { apiGet } from "../../services/http";
import { ItemImportModal } from "./ItemImportModal";
import { ItemLogisticsModal } from "./ItemLogisticsModal";
import { downloadItemTemplate } from "./itemImport";
import { ITEM_WORK, leadText, validPicks, type ItemRow } from "./itemLogistics";
import "./InventoryItemPage.css";

/** 중량 표기 — 1kg 미만은 g 로 (0.004 kg 보다 4 g 가 읽기 쉽다) */
const weightText = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000).toLocaleString()} g` : `${kg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`);

const Unregistered = () => <span className="item-spec-missing">미등록</span>;

/** 발주 담당자 거르기 — 모두 · 나 · 없음 · 사람 아이디 */
const ALL = "";
const MINE = "@mine";
const NONE = "@none";

export const InventoryItemPage = () => {
  // 가져오기 = 품목 마스터 · 엑셀 가져오기 (처음 값: 관리자만), 물류 정보 = 품목 마스터 · 처리 (처음 값: 물류 · 소싱) — 서버도 같은 기능으로 막는다
  const canImport = useCan("master/item-master:import");
  const canEdit = useCan(ITEM_WORK);
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [noErpOnly, setNoErpOnly] = useState(false);
  const [noTiHiOnly, setNoTiHiOnly] = useState(false);
  const [noPickOnly, setNoPickOnly] = useState(false);
  const [manager, setManager] = useState(ALL);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemRow | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<ItemRow[]>("/items")
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  /** 중량 미등록 — 배차 · 출고 요청서 총중량을 '모름'으로 만드는 품목 */
  const missingCount = useMemo(() => items.filter((it) => it.unitWeightKg == null).length, [items]);
  /** ERP 단품코드 없음 (사용 중) — 주문 시스템의 출고요청에 이 품목이 오면 "모르는 품목"으로 거절된다 */
  const noErpCount = useMemo(() => items.filter((it) => it.active && !it.erpItemCode).length, [items]);
  const noTiHiCount = useMemo(() => items.filter((it) => it.active && it.ti == null).length, [items]);
  /** 피킹 로케이션 없음 — 쓰는 피킹 칸이 하나도 없다 (정해 둔 칸이 이제 피킹 칸이 아닌 '확인 필요'도 포함) */
  const noPickCount = useMemo(() => items.filter((it) => it.active && validPicks(it).length === 0).length, [items]);
  /** 거르기에 보일 담당자 — 목록에 나온 사람만 */
  const managers = useMemo(() => {
    const seen = new Map<string, string>();
    items.forEach((it) => {
      if (it.purchaseManagerId) seen.set(it.purchaseManagerId, it.purchaseManagerName ?? it.purchaseManagerId);
    });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], "ko"));
  }, [items]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((it) => {
      if (missingOnly && it.unitWeightKg != null) return false;
      if (noErpOnly && (!it.active || it.erpItemCode)) return false;
      if (noTiHiOnly && (!it.active || it.ti != null)) return false;
      if (noPickOnly && (!it.active || validPicks(it).length > 0)) return false;
      if (manager === MINE && it.purchaseManagerId !== myId) return false;
      if (manager === NONE && it.purchaseManagerId) return false;
      if (manager !== ALL && manager !== MINE && manager !== NONE && it.purchaseManagerId !== manager) return false;
      return (
        !kw ||
        it.code.toLowerCase().includes(kw) ||
        it.name.toLowerCase().includes(kw) ||
        (it.erpItemCode ?? "").toLowerCase().includes(kw)
      );
    });
  }, [items, keyword, missingOnly, noErpOnly, noTiHiOnly, noPickOnly, manager, myId]);

  const openEdit = (it: ItemRow) => {
    setEditTarget(it);
  };

  const afterSaved = (message: string, warn: string[]) => {
    setNotice(editTarget ? `${editTarget.code} — ${message}` : message);
    setWarnings(warn);
    setEditTarget(null);
    load();
  };

  return (
    <section className="item-page">
      <DashboardCard
        className="item-head-card"
        title="품목 관리"
        action={
          <div className="item-head-actions">
            {canImport ? (
              <>
                <button type="button" className="ghost" onClick={downloadItemTemplate}>
                  양식 내려받기
                </button>
                <button type="button" className="ghost is-primary" onClick={() => setImportOpen(true)}>
                  엑셀 가져오기
                </button>
              </>
            ) : null}
            <button type="button" className="ghost" onClick={load}>
              새로고침
            </button>
          </div>
        }
      >
        <p>
          등록된 품목을 조회하고 <b>물류 정보</b>(제원 · TI × HI · 안전재고 · 리드타임 · 발주 담당자 · 피킹 로케이션 · 비고)를 고칩니다. 제원은 배차의
          총중량 · 차량 추천 · 파레트 수에 쓰이고, 미등록 품목이 섞인 주문은 총중량이 <b>모름</b>으로 나옵니다. 피킹 로케이션은 입고 지정 · 격납 창에
          단추로 나옵니다. <b>ERP 단품코드</b>가 없는 품목은 주문 시스템의 출고요청으로 받을 수 없습니다
          {canImport ? " — 엑셀 가져오기로 한꺼번에 넣을 수 있습니다." : "."}
        </p>
      </DashboardCard>

      <DashboardCard className="item-filter-card">
        <div className="item-filters">
          <label>
            <span>품목 코드/명</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="품목 코드 · 품목명 · ERP 단품코드"
            />
          </label>
          <label className="item-missing-toggle">
            <span>제원</span>
            <span className="item-check">
              <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
              중량 미등록만 <b className={missingCount ? "is-warn" : ""}>{missingCount}</b>
            </span>
          </label>
          <label className="item-missing-toggle">
            <span>주문 연동</span>
            <span className="item-check">
              <input type="checkbox" checked={noErpOnly} onChange={(e) => setNoErpOnly(e.target.checked)} />
              ERP 단품코드 없음만 <b className={noErpCount ? "is-warn" : ""}>{noErpCount}</b>
            </span>
          </label>
          <label>
            <span>발주 담당자</span>
            <select value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value={ALL}>모두</option>
              <option value={MINE}>내 품목</option>
              <option value={NONE}>담당자 없음</option>
              {managers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="item-missing-toggle">
            <span>파레트</span>
            <span className="item-check">
              <input type="checkbox" checked={noTiHiOnly} onChange={(e) => setNoTiHiOnly(e.target.checked)} />
              TI · HI 미등록만 <b className={noTiHiCount ? "is-warn" : ""}>{noTiHiCount}</b>
            </span>
          </label>
          <label className="item-missing-toggle">
            <span>위치</span>
            <span className="item-check">
              <input type="checkbox" checked={noPickOnly} onChange={(e) => setNoPickOnly(e.target.checked)} />
              피킹 로케이션 없음만 <b className={noPickCount ? "is-warn" : ""}>{noPickCount}</b>
            </span>
          </label>
        </div>
      </DashboardCard>

      <DashboardCard className="item-table-card" title={`품목 목록 (총 ${filtered.length}건)`}>
        {notice ? (
          <div className="ds-callout success" style={{ margin: "4px 0 12px" }}>
            <span>{notice}</span>
          </div>
        ) : null}
        {warnings.map((w) => (
          <div key={w} className="ds-callout warning" style={{ margin: "-4px 0 12px" }}>
            <span>{w}</span>
          </div>
        ))}
        {error ? (
          <div className="ds-callout danger" style={{ margin: "4px 0 12px" }}>
            <span>불러오기 실패: {error} — 백엔드(8080)가 실행 중인지 확인하세요.</span>
          </div>
        ) : null}

        <ResponsiveTable className="item-table-wrap" cardsBelow="fit">
          <table className="item-table">
            <thead>
              <tr>
                <th className="rt-title">품목 코드</th>
                <th>품목명</th>
                <th>ERP 단품코드</th>
                <th>품목 그룹</th>
                <th>단위</th>
                <th>구분</th>
                <th className="num">안전재고</th>
                <th className="num">단위 중량</th>
                <th className="num">단위 부피</th>
                <th className="num">파레트 입수</th>
                <th className="num">리드타임</th>
                <th>발주 담당자</th>
                <th>피킹 로케이션</th>
                <th>비고</th>
                <th>사용 여부</th>
                <th className="rt-actions">물류 정보</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={16} style={{ textAlign: "center", padding: "28px", color: "var(--ink-faint)" }}>
                    불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={16} style={{ textAlign: "center", padding: "28px", color: "var(--ink-faint)" }}>
                    {noErpOnly ? "ERP 단품코드가 없는 사용 중 품목이 없습니다." : missingOnly ? "중량 미등록 품목이 없습니다." : "조건에 맞는 품목이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((it) => (
                  <tr key={it.id}>
                    <td>
                      {canEdit ? (
                        <button type="button" className="item-code-link" onClick={() => openEdit(it)} title="물류 정보 고치기">
                          {it.code}
                        </button>
                      ) : (
                        it.code
                      )}
                    </td>
                    <td>{it.name}</td>
                    <td className="item-mono">{it.erpItemCode ? it.erpItemCode : <span className="item-spec-missing">없음</span>}</td>
                    <td>{it.category ?? "-"}</td>
                    <td>{it.unit}</td>
                    <td>
                      <StatusBadge tone={it.consign ? "consign" : "gray"}>
                        {it.consign ? "외주" : "일반"}
                      </StatusBadge>
                    </td>
                    <td className="num">{it.safetyStock.toLocaleString()}</td>
                    <td className="num">{it.unitWeightKg != null ? weightText(it.unitWeightKg) : <Unregistered />}</td>
                    <td className="num">{it.unitVolumeCm3 != null ? `${it.unitVolumeCm3.toLocaleString()} cm³` : <Unregistered />}</td>
                    <td className="num">
                      {it.unitsPerPallet != null ? (
                        <>
                          {it.unitsPerPallet.toLocaleString()} {it.unit}
                          {it.ti != null && it.hi != null ? (
                            <span className="item-tihi">
                              ({it.ti}×{it.hi})
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <Unregistered />
                      )}
                    </td>
                    <td className="num">{leadText(it.leadTimeDays)}</td>
                    <td>
                      {it.purchaseManagerId ? (
                        <>
                          {it.purchaseManagerName ?? it.purchaseManagerId}
                          {it.purchaseManagerLocked ? <span className="item-tag is-warn">잠김</span> : null}
                        </>
                      ) : (
                        <span className="item-faint">-</span>
                      )}
                    </td>
                    <td>
                      {it.pickLocations.length === 0 ? (
                        <span className="item-faint">-</span>
                      ) : (
                        <>
                          <span className="item-mono">{it.pickLocations[0].locationCode}</span>
                          <span className="item-faint"> {it.pickLocations[0].warehouseName}</span>
                          {it.pickLocations.length > 1 ? <span className="item-faint"> 외 {it.pickLocations.length - 1}</span> : null}
                          {it.pickLocations.some((p) => !p.valid) ? <span className="item-tag is-warn">확인 필요</span> : null}
                        </>
                      )}
                    </td>
                    <td className="item-remark" title={it.remark ?? undefined}>
                      {it.remark ? it.remark : <span className="item-faint">-</span>}
                    </td>
                    <td>
                      <StatusBadge tone={it.active ? "success" : "gray"}>
                        {it.active ? "사용" : "미사용"}
                      </StatusBadge>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="item-spec-btn"
                        onClick={() => openEdit(it)}
                        disabled={!canEdit}
                        title={canEdit ? undefined : "품목 마스터 · 처리 권한이 없습니다"}
                      >
                        물류 정보
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      </DashboardCard>

      <ItemLogisticsModal item={editTarget} onClose={() => setEditTarget(null)} onSaved={afterSaved} />

      <ItemImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApplied={(message) => {
          setImportOpen(false);
          setNotice(message);
          load();
        }}
      />
    </section>
  );
};

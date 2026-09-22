import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable";
import { apiGet, apiPut } from "../../services/http";
import "./InventoryItemPage.css";

type Item = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  safetyStock: number;
  consign: boolean;
  active: boolean;
  /**
   * 물류 제원 — null = 미등록. 배차 총중량 · 차량 추천 · 파레트 수가 이 값을 쓴다.
   * 미등록 품목이 섞인 주문은 합계가 '모름'으로 나온다 (0 으로 치지 않는다 — 2026-09-22 현업 회의 3번)
   */
  unitWeightKg: number | null;
  unitVolumeCm3: number | null;
  unitsPerPallet: number | null;
};

type SpecForm = { weight: string; volume: string; upp: string };

/** 중량 표기 — 1kg 미만은 g 로 (0.004 kg 보다 4 g 가 읽기 쉽다) */
const weightText = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000).toLocaleString()} g` : `${kg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`);

const Unregistered = () => <span className="item-spec-missing">미등록</span>;

export const InventoryItemPage = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<Item | null>(null);
  const [form, setForm] = useState<SpecForm>({ weight: "", volume: "", upp: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<Item[]>("/items")
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  /** 중량 미등록 — 배차 · 출고 요청서 총중량을 '모름'으로 만드는 품목 */
  const missingCount = useMemo(() => items.filter((it) => it.unitWeightKg == null).length, [items]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((it) => {
      if (missingOnly && it.unitWeightKg != null) return false;
      return !kw || it.code.toLowerCase().includes(kw) || it.name.toLowerCase().includes(kw);
    });
  }, [items, keyword, missingOnly]);

  const openEdit = (it: Item) => {
    setEditTarget(it);
    setFormError(null);
    setForm({
      weight: it.unitWeightKg != null ? String(it.unitWeightKg) : "",
      volume: it.unitVolumeCm3 != null ? String(it.unitVolumeCm3) : "",
      upp: it.unitsPerPallet != null ? String(it.unitsPerPallet) : ""
    });
  };

  const saveSpecs = async () => {
    if (!editTarget) return;
    const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));
    setSaving(true);
    setFormError(null);
    try {
      await apiPut(`/items/${editTarget.id}/specs`, {
        unitWeightKg: toNumber(form.weight),
        unitVolumeCm3: toNumber(form.volume),
        unitsPerPallet: toNumber(form.upp)
      });
      setNotice(`${editTarget.code} 물류 제원을 저장했습니다 — 배차 · 출고 요청서의 총중량에 바로 반영됩니다.`);
      setEditTarget(null);
      load();
    } catch (e) {
      // 검증 오류(0 이하 · 1g 미만 등)는 창 안에 보여 주고 창은 닫지 않는다
      setFormError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="item-page">
      <DashboardCard
        className="item-head-card"
        title="품목 관리"
        action={
          <button type="button" className="ghost" onClick={load}>
            새로고침
          </button>
        }
      >
        <p>
          등록된 품목을 조회하고 <b>물류 제원(단위 중량 · 부피 · 파레트 입수)</b>을 입력합니다. 제원은 배차의 총중량 · 차량 추천 · 파레트 수에 쓰이고,
          미등록 품목이 섞인 주문은 총중량이 <b>모름</b>으로 나옵니다.
        </p>
      </DashboardCard>

      <DashboardCard className="item-filter-card">
        <div className="item-filters">
          <label>
            <span>품목 코드/명</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="품목 코드 또는 품목명을 입력하세요"
            />
          </label>
          <label className="item-missing-toggle">
            <span>제원</span>
            <span className="item-check">
              <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
              중량 미등록만 <b className={missingCount ? "is-warn" : ""}>{missingCount}</b>
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
                <th>품목 그룹</th>
                <th>단위</th>
                <th>구분</th>
                <th className="num">안전재고</th>
                <th className="num">단위 중량</th>
                <th className="num">단위 부피</th>
                <th className="num">파레트 입수</th>
                <th>사용 여부</th>
                <th className="rt-actions">제원</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: "28px", color: "var(--ink-faint)" }}>
                    불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: "28px", color: "var(--ink-faint)" }}>
                    {missingOnly ? "중량 미등록 품목이 없습니다." : "데이터가 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <button type="button" className="item-code-link" onClick={() => openEdit(it)} title="물류 제원 입력">
                        {it.code}
                      </button>
                    </td>
                    <td>{it.name}</td>
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
                    <td className="num">{it.unitsPerPallet != null ? `${it.unitsPerPallet.toLocaleString()} ${it.unit}` : <Unregistered />}</td>
                    <td>
                      <StatusBadge tone={it.active ? "success" : "gray"}>
                        {it.active ? "사용" : "미사용"}
                      </StatusBadge>
                    </td>
                    <td>
                      <button type="button" className="item-spec-btn" onClick={() => openEdit(it)}>
                        제원 입력
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      </DashboardCard>

      <Modal
        open={editTarget !== null}
        title="물류 제원"
        desc={editTarget ? `${editTarget.code} · ${editTarget.name}` : ""}
        icon="boxes"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info)"
        onClose={() => setEditTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>취소</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={saveSpecs}>저장</button>
          </>
        }
      >
        <div className="item-spec-grid">
          <label className="ds-field">
            <span>단위 중량 (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.001"
              value={form.weight}
              onChange={(e) => setForm((prev) => ({ ...prev, weight: e.target.value }))}
              placeholder="예: 0.25 (250g)"
            />
          </label>
          <label className="ds-field">
            <span>단위 부피 (cm³)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={form.volume}
              onChange={(e) => setForm((prev) => ({ ...prev, volume: e.target.value }))}
              placeholder="예: 1500"
            />
          </label>
          <label className="ds-field">
            <span>파레트 입수 ({editTarget?.unit ?? "EA"})</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={form.upp}
              onChange={(e) => setForm((prev) => ({ ...prev, upp: e.target.value }))}
              placeholder="예: 60"
            />
          </label>
        </div>
        <p className="item-spec-hint">
          모르면 <b>비워 두세요</b> — 미등록으로 남고, 이 품목이 든 주문은 총중량이 '모름'으로 나옵니다. 0 이나 짐작한 값은 넣지 마세요
          (가벼운 값이면 작은 차가 추천됩니다).
        </p>
        {formError ? (
          <div className="ds-callout danger" style={{ margin: "10px 0 0" }}>
            <span>{formError}</span>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};

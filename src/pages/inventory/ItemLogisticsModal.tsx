import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { apiGet, apiSend } from "../../services/http";
import {
  MAX_HI,
  MAX_LEAD_DAYS,
  MAX_REMARK,
  MAX_TI,
  MIN_LEAD_DAYS,
  leadText,
  type ItemRow,
  type LogisticsOptions,
  type LogisticsSaved
} from "./itemLogistics";

type Props = {
  /** 고칠 품목 — null 이면 닫힘 */
  item: ItemRow | null;
  onClose: () => void;
  onSaved: (message: string, warnings: string[]) => void;
};

type Form = {
  weight: string;
  volume: string;
  ti: string;
  hi: string;
  upp: string;
  safety: string;
  lead: string;
  manager: string;
  remark: string;
  /** 창고 id → 로케이션 id ("" = 없음) */
  picks: Record<string, string>;
};

const formOf = (it: ItemRow): Form => ({
  weight: it.unitWeightKg != null ? String(it.unitWeightKg) : "",
  volume: it.unitVolumeCm3 != null ? String(it.unitVolumeCm3) : "",
  ti: it.ti != null ? String(it.ti) : "",
  hi: it.hi != null ? String(it.hi) : "",
  upp: it.unitsPerPallet != null ? String(it.unitsPerPallet) : "",
  safety: String(it.safetyStock),
  lead: String(it.leadTimeDays),
  manager: it.purchaseManagerId ?? "",
  remark: it.remark ?? "",
  picks: Object.fromEntries(it.pickLocations.map((p) => [String(p.warehouseId), String(p.locationId)]))
});

const blank = (v: string) => v.trim() === "";
const wholeText = (v: string) => /^\d+$/.test(v.trim());
const wholeOrNull = (v: string) => (blank(v) ? null : Number(v.trim()));

/** 서버보다 먼저 보는 첫 문제 — 서버도 같은 규칙으로 다시 본다 */
const problemOf = (f: Form): string | null => {
  if (!blank(f.weight) && !(Number(f.weight) > 0)) return "단위 중량은 0 보다 큰 수로 넣어 주세요. 모르면 비워 두세요.";
  if (!blank(f.volume) && (!wholeText(f.volume) || Number(f.volume) < 1)) return "단위 부피는 1 이상 정수로 넣어 주세요. 모르면 비워 두세요.";
  if ((!blank(f.ti) && !wholeText(f.ti)) || (!blank(f.hi) && !wholeText(f.hi))) return "TI · HI 는 정수로 넣어 주세요.";
  if (blank(f.ti) !== blank(f.hi)) return "TI 와 HI 를 같이 넣어 주세요 (한 단에 몇 개 × 몇 단).";
  if (!blank(f.ti) && (Number(f.ti) < 1 || Number(f.ti) > MAX_TI)) return `TI(한 단에 몇 개)는 1 ~ ${MAX_TI} 입니다.`;
  if (!blank(f.hi) && (Number(f.hi) < 1 || Number(f.hi) > MAX_HI)) return `HI(몇 단)는 1 ~ ${MAX_HI} 입니다.`;
  if (blank(f.ti) && !blank(f.upp) && (!wholeText(f.upp) || Number(f.upp) < 1)) return "파레트 입수는 1 이상 정수로 넣어 주세요. 모르면 비워 두세요.";
  if (!wholeText(f.safety)) return "안전재고는 0 이상 정수로 넣어 주세요.";
  if (!wholeText(f.lead) || Number(f.lead) < MIN_LEAD_DAYS || Number(f.lead) > MAX_LEAD_DAYS)
    return `리드타임은 ${MIN_LEAD_DAYS} ~ ${MAX_LEAD_DAYS}일입니다.`;
  if (f.remark.trim().length > MAX_REMARK) return `비고는 ${MAX_REMARK}자까지입니다.`;
  return null;
};

/**
 * '물류 정보' 창 — 제원(중량 · 부피 · TI · HI · 파레트 입수) · 재고 기준(안전재고 · 리드타임) · 담당 · 위치(발주 담당자 ·
 * 창고별 피킹 로케이션 · 비고)를 한 번에 고친다. TI · HI 를 넣으면 파레트 입수는 곱으로 저절로.
 */
export const ItemLogisticsModal = ({ item, onClose, onSaved }: Props) => {
  const [form, setForm] = useState<Form | null>(null);
  const [options, setOptions] = useState<LogisticsOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setForm(formOf(item));
    setError(null);
    setLoadError(null);
    setOptions(null);
    let alive = true;
    apiGet<LogisticsOptions>("/items/logistics-options")
      .then((o) => {
        if (alive) setOptions(o);
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : "고를 것을 불러오지 못했습니다");
      });
    return () => {
      alive = false;
    };
  }, [item]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  /** 창고 줄 — 피킹 칸이 있는 창고 + 지금 정해 둔 칸의 창고(이제 피킹 칸이 아니어도) */
  const warehouseRows = useMemo(() => {
    if (!item) return [];
    const rows = (options?.warehouses ?? []).map((w) => ({ id: w.id, name: w.name, locations: w.locations }));
    for (const p of item.pickLocations) {
      if (!rows.some((w) => w.id === p.warehouseId)) rows.push({ id: p.warehouseId, name: p.warehouseName, locations: [] });
    }
    return rows;
  }, [item, options]);

  if (!item) return null;
  const unit = item.unit || "EA";
  const tiHiBoth = form != null && !blank(form.ti) && !blank(form.hi) && wholeText(form.ti) && wholeText(form.hi);
  const product = tiHiBoth && form ? Number(form.ti) * Number(form.hi) : null;
  const leadDays = form && wholeText(form.lead) ? Number(form.lead) : null;

  const save = async () => {
    if (!form) return;
    const problem = problemOf(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        unitWeightKg: blank(form.weight) ? null : Number(form.weight),
        unitVolumeCm3: wholeOrNull(form.volume),
        ti: wholeOrNull(form.ti),
        hi: wholeOrNull(form.hi),
        // TI · HI 가 있으면 서버가 곱으로 정한다
        unitsPerPallet: blank(form.ti) ? wholeOrNull(form.upp) : null,
        safetyStock: Number(form.safety),
        leadTimeDays: Number(form.lead),
        purchaseManagerId: form.manager || null,
        remark: form.remark.trim() || null,
        pickLocations: Object.entries(form.picks)
          .filter(([, loc]) => loc)
          .map(([warehouseId, locationId]) => ({ warehouseId: Number(warehouseId), locationId: Number(locationId) }))
      };
      const { data, message } = await apiSend<LogisticsSaved>("PUT", `/items/${item.id}/logistics`, body);
      onSaved(message ?? "물류 정보를 저장했습니다.", data?.warnings ?? []);
    } catch (e) {
      // 검사 오류는 창 안에 보여 주고 창은 닫지 않는다
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const users = options?.users ?? [];
  const managerListed = !form?.manager || users.some((u) => u.id === form.manager);

  return (
    <Modal
      open
      title="물류 정보"
      desc={`${item.code} · ${item.name} · 단위 ${unit}`}
      icon="boxes"
      iconBg="var(--c-info-bg)"
      iconColor="var(--c-info)"
      className="item-logi-modal"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn-primary" disabled={saving || !form} onClick={save}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </>
      }
    >
      {form ? (
        <div className="item-logi">
          <section className="item-logi-group">
            <h4>
              제원 <span>중량 · 부피 · 파레트</span>
            </h4>
            <div className="item-logi-grid">
              <label className="ds-field">
                <span>단위 중량 (kg)</span>
                <input type="number" inputMode="decimal" min={0} step="0.001" value={form.weight}
                  onChange={(e) => set("weight", e.target.value)} placeholder="예: 0.25 (250g)" />
              </label>
              <label className="ds-field">
                <span>단위 부피 (cm³)</span>
                <input type="number" inputMode="numeric" min={0} step="1" value={form.volume}
                  onChange={(e) => set("volume", e.target.value)} placeholder="예: 1500" />
              </label>
              <label className="ds-field">
                <span>TI · 한 단에 몇 개</span>
                <input type="number" inputMode="numeric" min={1} max={MAX_TI} step="1" value={form.ti}
                  onChange={(e) => set("ti", e.target.value)} placeholder="예: 6" />
              </label>
              <label className="ds-field">
                <span>HI · 몇 단</span>
                <input type="number" inputMode="numeric" min={1} max={MAX_HI} step="1" value={form.hi}
                  onChange={(e) => set("hi", e.target.value)} placeholder="예: 4" />
              </label>
              <label className="ds-field item-logi-wide">
                <span>파레트 입수 ({unit})</span>
                {product != null ? (
                  <span className="item-logi-calc" aria-live="polite">
                    <b>{product.toLocaleString()}</b> {unit}
                    <em>
                      {form.ti} × {form.hi}
                    </em>
                  </span>
                ) : (
                  <input type="number" inputMode="numeric" min={0} step="1" value={form.upp}
                    onChange={(e) => set("upp", e.target.value)} placeholder="TI · HI 를 모르면 직접 (예: 60)" />
                )}
              </label>
            </div>
          </section>

          <section className="item-logi-group">
            <h4>
              재고 기준 <span>쇼트 관리의 발주시점 계산에 씁니다</span>
            </h4>
            <div className="item-logi-grid">
              <label className="ds-field">
                <span>안전재고 ({unit})</span>
                <input type="number" inputMode="numeric" min={0} step="1" value={form.safety}
                  onChange={(e) => set("safety", e.target.value)} />
              </label>
              <label className="ds-field">
                <span>리드타임 (일)</span>
                <input type="number" inputMode="numeric" min={MIN_LEAD_DAYS} max={MAX_LEAD_DAYS} step="1" value={form.lead}
                  onChange={(e) => set("lead", e.target.value)} />
                <small className="item-logi-sub">{leadDays != null && leadDays >= 14 ? leadText(leadDays).replace(/^\d+일 /, "") : "발주부터 입고까지"}</small>
              </label>
            </div>
          </section>

          <section className="item-logi-group">
            <h4>
              담당 · 위치 <span>입고 지정 · 격납 창, 쇼트 관리에 보입니다</span>
            </h4>
            <div className="item-logi-grid">
              <label className="ds-field item-logi-wide">
                <span>발주 담당자</span>
                <select value={form.manager} onChange={(e) => set("manager", e.target.value)}>
                  <option value="">(없음)</option>
                  {!managerListed ? (
                    <option value={form.manager}>
                      {item.purchaseManagerName ?? form.manager} · {form.manager}
                    </option>
                  ) : null}
                  {users.map((u) => (
                    <option key={u.id} value={u.id} disabled={u.locked && u.id !== item.purchaseManagerId}>
                      {u.name} · {u.id}
                      {u.roles ? ` · ${u.roles}` : ""}
                      {u.locked ? " (잠김)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="item-logi-picks">
              <span className="item-logi-label">피킹 로케이션 · 창고마다 하나</span>
              {loadError ? (
                <p className="item-logi-note is-warn">고를 것을 불러오지 못했습니다 — {loadError}</p>
              ) : !options ? (
                <p className="item-logi-note">피킹 칸을 불러오는 중…</p>
              ) : warehouseRows.length === 0 ? (
                <p className="item-logi-note">피킹 칸이 있는 창고가 없습니다 — 로케이션 관리에서 피킹 칸을 먼저 정하세요.</p>
              ) : (
                warehouseRows.map((w) => {
                  const current = item.pickLocations.find((p) => p.warehouseId === w.id);
                  const outdated = current && !current.valid ? current : null;
                  return (
                    <label key={w.id} className="item-logi-pick">
                      <span>{w.name}</span>
                      <select
                        value={form.picks[String(w.id)] ?? ""}
                        onChange={(e) => set("picks", { ...form.picks, [String(w.id)]: e.target.value })}
                      >
                        <option value="">(없음)</option>
                        {outdated ? <option value={String(outdated.locationId)}>{outdated.locationCode} (확인 필요 — 피킹 칸 아님)</option> : null}
                        {w.locations.map((l) => (
                          <option key={l.id} value={String(l.id)}>
                            {l.code}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })
              )}
            </div>
            <label className="ds-field">
              <span>
                비고 <em className="item-logi-count">{form.remark.trim().length}/{MAX_REMARK}</em>
              </span>
              <textarea rows={3} maxLength={MAX_REMARK} value={form.remark} onChange={(e) => set("remark", e.target.value)}
                placeholder="물류팀에 알릴 것 — 예: 파손 주의, 2단 이상 쌓지 않기" />
            </label>
          </section>

          <p className="item-spec-hint">
            모르면 <b>비워 두세요</b> — 제원이 미등록이면 그 품목이 든 주문은 총중량이 '모름'으로 나옵니다. 0 이나 짐작한 값은 넣지 마세요.
          </p>
          {error ? (
            <div className="ds-callout danger" style={{ margin: "10px 0 0" }}>
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
};

/* ============================================================
   목(mock) — 품목 가져오기 (엑셀 · CSV)
   서버 ItemImportService 와 같은 규칙:
   · 품목코드로 찾는다(대소문자 구분 없이) — 없으면 새 품목, 있으면 값이 있는 칸만 바꾼다 (빈 칸 = 그대로)
   · ERP 단품코드는 사용 중 품목끼리 겹치면 오류 — 반영한 뒤의 모습으로 본다 (맞바꾸기는 된다)
   · 오류가 한 줄이라도 있으면 반영하지 않는다 · 관리자만
   ⚠ 목이라 메모리에만 있다 — 새로고침하면 처음 품목으로 돌아간다.
   ============================================================ */

type AnyRecord = Record<string, any>;
type Action = "NEW" | "UPDATE" | "SAME" | "ERROR";

export type ItemImportMockCtx = {
  /** 목 품목 배열 (itemCode · itemName · erpItemCode … — mockApi 의 items) — 새 품목은 여기에 더한다 */
  items: () => AnyRecord[];
  role: () => string | undefined;
};

const MAX_ROWS = 10_000;
const MAX_WEIGHT_KG = 10_000;
const MAX_VOLUME_CM3 = 10_000_000;
const MAX_UNITS_PER_PALLET = 100_000;
const MAX_SAFETY_STOCK = 100_000_000;
/** 엑셀이 긴 숫자 코드를 CSV 로 저장하며 지수로 바꾼 값 (123456789012 → 1.23457E+11) */
const EXPONENT = /^[+-]?\d+(\.\d+)?e[+-]?\d+$/i;
const exponentError = (label: string, value: string) =>
  `${label}가 지수 표기(${value})입니다 — 엑셀이 긴 숫자를 바꾼 것입니다. 그 칸을 텍스트 서식으로 바꾸거나 .xlsx 로 올리세요`;
const YES = new Set(["y", "yes", "예", "o", "1", "true", "t", "사용", "외주"]);
const NO = new Set(["n", "no", "아니오", "아니요", "x", "0", "false", "f", "미사용", "일반"]);

const SHOWN: Array<[string, (it: AnyRecord) => string | null]> = [
  ["품목명", (it) => it.itemName ?? null],
  ["ERP 단품코드", (it) => it.erpItemCode ?? null],
  ["규격", (it) => it.spec ?? null],
  ["단위", (it) => it.unit ?? null],
  ["품목그룹", (it) => it.category ?? null],
  ["바코드", (it) => it.barcode ?? null],
  ["외주", (it) => (it.consign ? "외주" : "일반")],
  ["안전재고", (it) => String(it.safetyStock ?? 0)],
  ["단위 중량", (it) => (Number(it.unitWeightKg) > 0 ? `${Number(Number(it.unitWeightKg).toFixed(3))} kg` : null)],
  ["단위 부피", (it) => (Number(it.unitVolumeCm3) > 0 ? `${it.unitVolumeCm3} cm³` : null)],
  ["파레트 입수", (it) => (Number(it.unitsPerPallet) > 0 ? String(it.unitsPerPallet) : null)],
  ["사용", (it) => (it.active ? "사용" : "미사용")]
];

const clean = (value: unknown): string | null => {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s || null;
};
const key = (code: string) => code.trim().toLowerCase();
const number = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

type Entry = { rowNo: number; code: string | null; name: string | null; before: AnyRecord | null; after: AnyRecord | null; changes: string[]; errors: string[] };

const actionOf = (e: Entry): Action => (e.errors.length ? "ERROR" : !e.before ? "NEW" : e.changes.length ? "UPDATE" : "SAME");

export function createItemImportMock(ctx: ItemImportMockCtx) {
  const plan = (rows: AnyRecord[]): Entry[] => {
    if (!rows.length) throw new Error("가져올 줄이 없습니다.");
    if (rows.length > MAX_ROWS) throw new Error(`한 번에 ${MAX_ROWS}줄까지 가져올 수 있습니다 (${rows.length}줄) — 파일을 나눠 올리세요.`);
    const existing = new Map(ctx.items().map((it) => [key(String(it.itemCode)), it]));
    const seen = new Map<string, number>();
    const entries = rows.map((row, i): Entry => {
      const e: Entry = { rowNo: Number(row?.rowNo) > 0 ? Number(row.rowNo) : i + 1, code: null, name: clean(row?.name), before: null, after: null, changes: [], errors: [] };
      const code = clean(row?.code);
      if (!code) {
        e.errors.push("품목코드가 비어 있습니다");
        return e;
      }
      e.code = code;
      if (code.length > 40) {
        e.errors.push(`품목코드는 40자까지입니다 (${code.length}자)`);
        return e;
      }
      if (EXPONENT.test(code)) {
        e.errors.push(exponentError("품목코드", code));
        return e;
      }
      const first = seen.get(key(code));
      if (first !== undefined) {
        e.errors.push(`${first}번째 줄과 같은 품목코드입니다`);
        return e;
      }
      seen.set(key(code), e.rowNo);
      e.before = existing.get(key(code)) ?? null;
      const after: AnyRecord = e.before
        ? { ...e.before }
        : { itemCode: code, itemName: null, unit: "EA", safetyStock: 0, consign: false, active: true, unitWeightKg: null, unitVolumeCm3: null, unitsPerPallet: null, erpItemCode: null, spec: null, category: null, barcode: null };
      e.after = after;

      const text = (label: string, raw: unknown, max: number, set: (v: string) => void) => {
        const v = clean(raw);
        if (!v) return;
        if (v.length > max) e.errors.push(`${label}은(는) ${max}자까지입니다 (${v.length}자)`);
        else set(v);
      };
      const flag = (label: string, raw: unknown, set: (v: boolean) => void) => {
        const v = clean(raw);
        if (!v) return;
        const k = v.toLowerCase();
        if (YES.has(k)) set(true);
        else if (NO.has(k)) set(false);
        else e.errors.push(`${label} 칸은 Y 또는 N 으로 적어 주세요 (${v})`);
      };
      const whole = (label: string, raw: unknown, min: number, max: number, set: (v: number) => void) => {
        const v = clean(raw);
        if (!v) return;
        const n = number(v);
        if (n == null || !Number.isInteger(n)) e.errors.push(`${label} 칸은 정수로 적어 주세요 (${v})`);
        else if (n < min || n > max) e.errors.push(`${label}은(는) ${min} 이상 ${max} 이하여야 합니다 (${v})`);
        else set(n);
      };

      text("품목명", row.name, 200, (v) => (after.itemName = v));
      if (!after.itemName) e.errors.push("새 품목은 품목명이 있어야 합니다");
      const erp = clean(row.erpItemCode);
      if (erp && EXPONENT.test(erp)) e.errors.push(exponentError("ERP 단품코드", erp));
      else text("ERP 단품코드", row.erpItemCode, 50, (v) => (after.erpItemCode = v));
      text("규격", row.spec, 100, (v) => (after.spec = v));
      text("단위", row.unit, 10, (v) => (after.unit = v));
      text("품목그룹", row.category, 50, (v) => (after.category = v));
      text("바코드", row.barcode, 50, (v) => (after.barcode = v));
      flag("외주", row.consign, (v) => (after.consign = v));
      flag("사용", row.active, (v) => (after.active = v));
      whole("안전재고", row.safetyStock, 0, MAX_SAFETY_STOCK, (v) => (after.safetyStock = v));
      const w = clean(row.unitWeightKg);
      if (w) {
        const kg = number(w);
        if (kg == null) e.errors.push(`단위 중량(kg) 칸은 숫자로 적어 주세요 (${w})`);
        else if (kg <= 0 || kg > MAX_WEIGHT_KG) e.errors.push(`단위 중량은 0 보다 크고 ${MAX_WEIGHT_KG} kg 이하여야 합니다 (${w})`);
        else if (Math.round(kg * 1000) < 1) e.errors.push(`단위 중량은 0.001 kg(1g) 이상이어야 합니다 (${w})`);
        else after.unitWeightKg = Math.round(kg * 1000) / 1000;
      }
      whole("단위 부피(cm³)", row.unitVolumeCm3, 1, MAX_VOLUME_CM3, (v) => (after.unitVolumeCm3 = v));
      whole("파레트 입수", row.unitsPerPallet, 1, MAX_UNITS_PER_PALLET, (v) => (after.unitsPerPallet = v));
      e.name = after.itemName ?? null;

      if (e.before) {
        for (const [label, show] of SHOWN) {
          const was = show(e.before);
          const now = show(after);
          if (was !== now) e.changes.push(`${label}: ${was ?? "(없음)"} → ${now ?? "(없음)"}`);
        }
      }
      return e;
    });

    // ERP 단품코드 겹침 — 반영한 뒤의 모습에서 사용 중 품목끼리
    const finalState = new Map(existing);
    const fromFile = new Map<string, Entry>();
    for (const e of entries) {
      if (e.after && e.code) {
        finalState.set(key(e.code), e.after);
        fromFile.set(key(e.code), e);
      }
    }
    const byErp = new Map<string, AnyRecord[]>();
    finalState.forEach((it) => {
      const erp = clean(it.erpItemCode);
      if (it.active && erp) byErp.set(erp.toLowerCase(), [...(byErp.get(erp.toLowerCase()) ?? []), it]);
    });
    byErp.forEach((same) => {
      if (same.length < 2) return;
      same.forEach((it) => {
        const e = fromFile.get(key(String(it.itemCode)));
        if (!e) return;
        const others = same.filter((o) => o !== it).map((o) => o.itemCode).sort().join(", ");
        e.errors.push(`ERP 단품코드 ${it.erpItemCode} 가 다른 사용 중 품목(${others})과 겹칩니다 — 겹치면 OMS 출고요청의 품목을 찾지 못합니다`);
      });
    });
    return entries;
  };

  const result = (entries: Entry[], applied: boolean, message: string | null) => {
    const count = (a: Action) => entries.filter((e) => actionOf(e) === a).length;
    return {
      applied,
      total: entries.length,
      newCount: count("NEW"),
      updateCount: count("UPDATE"),
      sameCount: count("SAME"),
      errorCount: count("ERROR"),
      lines: entries.map((e) => {
        const action = actionOf(e);
        return { rowNo: e.rowNo, code: e.code, name: e.name, erpItemCode: e.after?.erpItemCode ?? null, action, changes: action === "UPDATE" ? e.changes : [], errors: e.errors };
      }),
      message
    };
  };

  const requireAdmin = () => {
    if (ctx.role() !== "admin") throw new Error("품목 가져오기는 관리자만 할 수 있습니다.");
  };

  return {
    mutate: (method: string, clean_: string, body: AnyRecord): unknown => {
      if (method !== "POST" || (clean_ !== "/items/import/preview" && clean_ !== "/items/import")) return undefined;
      requireAdmin();
      const rows: AnyRecord[] = Array.isArray(body.rows) ? body.rows : [];
      const entries = plan(rows);
      if (clean_ === "/items/import/preview") return result(entries, false, null);

      const errors = entries.filter((e) => e.errors.length).length;
      if (errors) throw new Error(`오류가 있는 줄이 ${errors}개라 반영하지 않았습니다 — 파일을 고쳐 다시 올리세요.`);
      const items = ctx.items();
      let inserted = 0;
      let updated = 0;
      entries.forEach((e) => {
        const action = actionOf(e);
        if (action === "NEW" && e.after) {
          items.push({ ...e.after, id: Math.max(0, ...items.map((it) => Number(it.id) || 0)) + 1 });
          inserted++;
        } else if (action === "UPDATE" && e.before && e.after) {
          Object.assign(e.before, e.after);
          updated++;
        }
      });
      const summary = `신규 ${inserted} · 변경 ${updated} · 그대로 ${entries.length - inserted - updated} (총 ${entries.length}줄)`;
      return result(entries, true, inserted + updated ? `품목 가져오기 — ${summary}` : `바뀔 것이 없습니다 — ${summary}`);
    }
  };
}

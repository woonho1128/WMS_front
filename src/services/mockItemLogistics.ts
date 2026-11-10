/* ============================================================
   목(mock) — 품목 마스터 '물류 정보' (제원 · TI · HI · 안전재고 · 리드타임 · 발주 담당자 · 창고별 피킹 로케이션 · 비고)
   서버 ItemService · ItemLogistics 와 같은 규칙 · 같은 문구:
   · TI · HI 는 같이 — 둘 다 있으면 파레트 입수 = TI × HI (보낸 입수가 다르면 오류)
   · 빈 값이 될 수 있는 칸은 null = 비움, 안전재고 · 리드타임 · 피킹 로케이션은 null = 그대로 ([] = 모두 지움)
   · 피킹 로케이션은 창고마다 하나, 그 창고의 쓰는 피킹 칸만 — 지금 그대로인 칸은 이제 피킹 칸이 아니어도 둔다
   · 같은 칸을 다른 품목도 쓰면 저장하고 경고만 · 바뀐 것이 없으면 아무것도 쓰지 않는다
   ⚠ 목이라 메모리에만 있다 — 새로고침하면 처음 값으로 돌아간다.
   ============================================================ */

type AnyRecord = Record<string, any>;

export type PickRef = { warehouseId: number; locationId: number };

export type ItemLogisticsMockCtx = {
  /** 목 품목 (itemCode · itemName · unit · safetyStock · unitWeightKg · ti · hi · leadTimeDays · purchaseManagerId · remark · picks) */
  items: () => AnyRecord[];
  /** 창고 { id, code, name } */
  warehouses: AnyRecord[];
  /** 로케이션 { id, code, locationType, active, warehouseName } */
  locations: () => AnyRecord[];
  /** 발주 담당자로 고를 사람 */
  users: () => Array<{ id: string; name: string; locked?: boolean; roles?: string | null }>;
  can: (feature: string) => boolean;
  operator: () => string;
  log: (entry: AnyRecord) => void;
  nowText: () => string;
};

const WORK = "master/item-master:work";
const NO_RIGHT = "품목 마스터 · 처리 권한이 없습니다.";
const MAX_WEIGHT_KG = 10_000;
const MAX_VOLUME_CM3 = 10_000_000;
const MAX_UNITS_PER_PALLET = 100_000;
export const MAX_TI = 999;
export const MAX_HI = 99;
export const MIN_LEAD_DAYS = 1;
export const MAX_LEAD_DAYS = 365;
export const MAX_SAFETY_STOCK = 100_000_000;
export const MAX_REMARK = 500;

export const clean = (value: unknown): string | null => {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s || null;
};

/** TI · HI 짝 — 하나만 있으면 문장 */
export const pairProblem = (ti: number | null, hi: number | null) =>
  (ti == null) !== (hi == null) ? "TI 와 HI 를 같이 넣어 주세요 (한 단에 몇 개 × 몇 단)" : null;

/** TI · HI 가 둘 다 있는데 입수가 곱과 다르면 문장 */
export const mismatch = (ti: number | null, hi: number | null, upp: number | null) => {
  if (ti == null || hi == null || upp == null) return null;
  const product = ti * hi;
  return upp === product ? null : `파레트 입수(${upp})가 TI × HI(${ti}×${hi}=${product})와 다릅니다 — 하나로 맞춰 주세요`;
};

export function createItemLogisticsMock(ctx: ItemLogisticsMockCtx) {
  const warehouseOf = (loc: AnyRecord) => ctx.warehouses.find((w) => w.name === loc.warehouseName);
  /** 쓰는 피킹 칸 — 창고 정보와 함께 */
  const spots = () =>
    ctx
      .locations()
      .filter((l) => l.active !== false && l.locationType === "PICKING" && warehouseOf(l))
      .map((l) => {
        const w = warehouseOf(l)!;
        return { warehouseId: Number(w.id), warehouseCode: String(w.code), warehouseName: String(w.name), locationId: Number(l.id), locationCode: String(l.code) };
      });

  const userOf = (id: string | null | undefined) => (id ? ctx.users().find((u) => u.id === id) : undefined);

  /** 품목의 창고별 피킹 로케이션 — valid = 지금도 그 창고의 쓰는 피킹 칸 */
  const picksOf = (it: AnyRecord) =>
    ((it.picks ?? []) as PickRef[])
      .map((p) => {
        const loc = ctx.locations().find((l) => Number(l.id) === Number(p.locationId));
        const w = ctx.warehouses.find((x) => Number(x.id) === Number(p.warehouseId));
        if (!loc || !w) return null;
        const valid = loc.active !== false && loc.locationType === "PICKING" && warehouseOf(loc)?.id === w.id;
        return { warehouseId: Number(w.id), warehouseCode: String(w.code), warehouseName: String(w.name), locationId: Number(loc.id), locationCode: String(loc.code), valid };
      })
      .filter((p): p is NonNullable<typeof p> => p != null)
      .sort((a, b) => a.warehouseId - b.warehouseId);

  /** 목록 행에 붙일 칸 (서버 ItemResponse 의 새 칸) */
  const view = (it: AnyRecord) => {
    const manager = userOf(it.purchaseManagerId);
    return {
      ti: it.ti ?? null,
      hi: it.hi ?? null,
      leadTimeDays: Number(it.leadTimeDays ?? 7),
      purchaseManagerId: it.purchaseManagerId ?? null,
      purchaseManagerName: manager?.name ?? null,
      purchaseManagerLocked: Boolean(manager?.locked),
      remark: it.remark ?? null,
      pickLocations: picksOf(it)
    };
  };

  const byCode = (code: string) => ctx.items().find((it) => it.itemCode === code);

  /* ----- 바뀐 칸 — 서버 ItemLogistics.FIELDS 와 같은 이름 · 글자 ----- */
  const managerText = (it: AnyRecord) => {
    if (!it.purchaseManagerId) return null;
    const u = userOf(it.purchaseManagerId);
    return u ? `${u.name}(${it.purchaseManagerId})` : String(it.purchaseManagerId);
  };
  const picksText = (it: AnyRecord) => {
    const ps = picksOf(it);
    return ps.length ? ps.map((p) => `${p.warehouseName} ${p.locationCode}${p.valid ? "" : "(확인 필요)"}`).join(", ") : null;
  };
  const FIELDS: Array<[string, (it: AnyRecord) => string | null]> = [
    ["단위 중량", (it) => (Number(it.unitWeightKg) > 0 ? `${Number(Number(it.unitWeightKg).toFixed(3))} kg` : null)],
    ["단위 부피", (it) => (Number(it.unitVolumeCm3) > 0 ? `${it.unitVolumeCm3} cm³` : null)],
    ["TI · HI", (it) => (it.ti != null && it.hi != null ? `${it.ti}×${it.hi}` : null)],
    ["파레트 입수", (it) => (Number(it.unitsPerPallet) > 0 ? String(it.unitsPerPallet) : null)],
    ["안전재고", (it) => String(it.safetyStock ?? 0)],
    ["리드타임", (it) => `${it.leadTimeDays ?? 7}일`],
    ["발주 담당자", managerText],
    ["비고", (it) => it.remark ?? null],
    ["피킹 로케이션", picksText]
  ];
  const diff = (before: AnyRecord, after: AnyRecord) => {
    const out: string[] = [];
    for (const [label, show] of FIELDS) {
      const was = show(before);
      const now = show(after);
      if (was !== now) out.push(`${label}: ${was ?? "(없음)"} → ${now ?? "(없음)"}`);
    }
    return out;
  };

  const within = (value: unknown, min: number, max: number, label: string): number | null => {
    if (value == null || value === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label}은(는) ${min} 이상 ${max} 이하여야 합니다.`);
    return n;
  };
  const positiveOrNull = (value: unknown, max: number, label: string): number | null => {
    if (value == null || value === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0 || n > max) throw new Error(`${label}은(는) 1 이상 ${max} 이하여야 합니다. 모르면 비워 두세요.`);
    return n;
  };

  const save = (id: number, body: AnyRecord): [unknown, string] => {
    if (!ctx.can(WORK)) throw new Error(NO_RIGHT);
    const item = ctx.items().find((it) => Number(it.id) === id);
    if (!item) throw new Error("품목을 찾을 수 없습니다.");
    const before: AnyRecord = { ...item, picks: [...(item.picks ?? [])] };
    const after: AnyRecord = { ...before };

    const kg = body.unitWeightKg == null || body.unitWeightKg === "" ? null : Number(body.unitWeightKg);
    if (kg != null && (!(kg > 0) || kg > MAX_WEIGHT_KG)) throw new Error(`단위 중량은 0 보다 크고 ${MAX_WEIGHT_KG} kg 이하여야 합니다. 모르면 비워 두세요.`);
    if (kg != null && Math.round(kg * 1000) < 1) throw new Error("단위 중량은 0.001 kg(1g) 이상이어야 합니다.");
    after.unitWeightKg = kg == null ? null : Math.round(kg * 1000) / 1000;
    after.unitVolumeCm3 = positiveOrNull(body.unitVolumeCm3, MAX_VOLUME_CM3, "단위 부피(cm³)");
    const ti = within(body.ti, 1, MAX_TI, "TI(한 단에 몇 개)");
    const hi = within(body.hi, 1, MAX_HI, "HI(몇 단)");
    const pair = pairProblem(ti, hi);
    if (pair) throw new Error(`${pair}.`);
    const upp = body.unitsPerPallet == null || body.unitsPerPallet === "" ? null : Number(body.unitsPerPallet);
    const mm = mismatch(ti, hi, upp);
    if (mm) throw new Error(`${mm}.`);
    after.ti = ti;
    after.hi = hi;
    after.unitsPerPallet = ti != null && hi != null ? ti * hi : positiveOrNull(body.unitsPerPallet, MAX_UNITS_PER_PALLET, "파레트 입수");

    if (body.safetyStock != null) after.safetyStock = within(body.safetyStock, 0, MAX_SAFETY_STOCK, "안전재고");
    if (body.leadTimeDays != null) after.leadTimeDays = within(body.leadTimeDays, MIN_LEAD_DAYS, MAX_LEAD_DAYS, "리드타임(일)");

    const manager = clean(body.purchaseManagerId);
    if (!manager) after.purchaseManagerId = null;
    else if (manager !== before.purchaseManagerId) {
      const user = userOf(manager);
      if (!user) throw new Error(`발주 담당자(${manager})를 찾을 수 없습니다 — 목록에서 골라 주세요.`);
      if (user.locked) throw new Error(`잠긴 사용자는 발주 담당자로 고를 수 없습니다 — ${user.name}`);
      after.purchaseManagerId = user.id;
    }

    const remark = clean(body.remark);
    if (remark && remark.length > MAX_REMARK) throw new Error(`비고는 ${MAX_REMARK}자까지입니다 (${remark.length}자).`);
    after.remark = remark;

    if (Array.isArray(body.pickLocations)) {
      const all = spots();
      const out = new Map<number, PickRef>();
      for (const p of body.pickLocations as AnyRecord[]) {
        if (!p || p.locationId == null) continue;
        const warehouseId = p.warehouseId == null ? null : Number(p.warehouseId);
        const same = (before.picks as PickRef[]).find((x) => warehouseId != null && x.warehouseId === warehouseId);
        let ref: PickRef;
        let name: string;
        if (same && same.locationId === Number(p.locationId)) {
          ref = same;
          name = ctx.warehouses.find((w) => w.id === same.warehouseId)?.name ?? "";
        } else {
          const spot = all.find((s) => s.locationId === Number(p.locationId));
          if (!spot) throw new Error("피킹 로케이션으로 고를 수 없는 칸입니다 — 쓰는 피킹(PICKING) 칸만 됩니다.");
          if (warehouseId != null && warehouseId !== spot.warehouseId)
            throw new Error(`로케이션 ${spot.locationCode} 은(는) ${spot.warehouseName} 칸입니다 — 그 창고 줄에서 골라 주세요.`);
          ref = { warehouseId: spot.warehouseId, locationId: spot.locationId };
          name = spot.warehouseName;
        }
        if (out.has(ref.warehouseId)) throw new Error(`피킹 로케이션은 창고마다 하나입니다 — ${name}`);
        out.set(ref.warehouseId, ref);
      }
      after.picks = [...out.values()];
    }

    const changes = diff(before, after);
    if (!changes.length) return [{ item: before, changes: [], warnings: [] }, "바뀐 것이 없습니다."];
    Object.assign(item, after);
    const log = changes.map((c) => (c.startsWith("비고:") ? "비고 바꿈" : c)).join(" · ").slice(0, 300);
    ctx.log({ refType: "ITEM", refNo: item.itemCode, action: "품목 물류 정보 수정", detail: log, operator: ctx.operator(), createdAt: ctx.nowText() });
    // 같은 칸을 다른 품목도 쓰면 경고만
    const warnings: string[] = [];
    for (const ref of item.picks as PickRef[]) {
      const others = ctx.items().filter((o) => o !== item && ((o.picks ?? []) as PickRef[]).some((x) => x.locationId === ref.locationId));
      if (others.length) {
        const code = ctx.locations().find((l) => Number(l.id) === ref.locationId)?.code ?? "";
        warnings.push(`${code} 는 ${others.map((o) => `${o.itemCode} ${o.itemName}`).join(", ")} 의 피킹 로케이션이기도 합니다 — 저장은 됐습니다.`);
      }
    }
    const labels = changes.map((c) => c.slice(0, c.indexOf(":"))).join(" · ");
    return [{ item, changes, warnings }, `물류 정보를 저장했습니다 — ${labels}`];
  };

  return {
    /** 목록 행에 붙일 새 칸 */
    view,
    /** 입고 줄 — 품목의 창고별 피킹 로케이션 (쓰는 피킹 칸만) · 비고 */
    lineExtras: (itemCode: string) => {
      const it = byCode(itemCode);
      return { itemRemark: it?.remark ?? null, pickLocations: it ? picksOf(it).filter((p) => p.valid) : [] };
    },
    /** 격납 목록 — 이 창고에서 품목의 피킹 로케이션 · 비고 */
    putawayExtras: (itemCode: string, warehouseId: number) => {
      const it = byCode(itemCode);
      const pick = it ? picksOf(it).find((p) => p.valid && p.warehouseId === Number(warehouseId)) : undefined;
      return { itemRemark: it?.remark ?? null, pickLocationId: pick?.locationId ?? null, pickLocationCode: pick?.locationCode ?? null };
    },
    /** 쇼트 목록 — 발주 담당자 */
    managerOf: (itemCode: string) => {
      const it = byCode(itemCode);
      return { purchaseManagerId: it?.purchaseManagerId ?? null, purchaseManagerName: userOf(it?.purchaseManagerId)?.name ?? null };
    },
    /** 엑셀 가져오기가 쓰는 찾기 — 사용자(아이디 · 이름), 피킹 칸(코드) */
    lookup: () => ({ users: ctx.users(), spots: spots() }),
    /** 바뀐 칸 비교 (가져오기 미리보기) — 피킹 로케이션 글자는 창고 순 */
    fields: FIELDS,
    get: (cleanPath: string): unknown => {
      if (cleanPath !== "/items/logistics-options") return undefined;
      if (!ctx.can(WORK)) throw new Error(NO_RIGHT);
      const grouped = new Map<number, AnyRecord>();
      for (const s of spots()) {
        if (!grouped.has(s.warehouseId)) grouped.set(s.warehouseId, { id: s.warehouseId, code: s.warehouseCode, name: s.warehouseName, locations: [] });
        grouped.get(s.warehouseId)!.locations.push({ id: s.locationId, code: s.locationCode });
      }
      grouped.forEach((w) => w.locations.sort((a: AnyRecord, b: AnyRecord) => String(a.code).localeCompare(String(b.code))));
      const users = [...ctx.users()].sort((a, b) => Number(Boolean(a.locked)) - Number(Boolean(b.locked)) || a.name.localeCompare(b.name, "ko"));
      return { users: users.map((u) => ({ id: u.id, name: u.name, roles: u.roles ?? null, locked: Boolean(u.locked) })), warehouses: [...grouped.values()].sort((a, b) => a.id - b.id) };
    },
    /** PUT /items/{id}/logistics → [저장 결과(목 품목 그대로 — 부르는 쪽이 목록 행으로 바꾼다), 문구] */
    mutate: (method: string, cleanPath: string, body: AnyRecord): [unknown, string] | undefined => {
      const m = cleanPath.match(/^\/items\/(\d+)\/logistics$/);
      if (method !== "PUT" || !m) return undefined;
      return save(Number(m[1]), body ?? {});
    }
  };
}

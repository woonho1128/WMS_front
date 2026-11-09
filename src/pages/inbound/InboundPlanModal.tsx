import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { apiGet, apiSend } from "../../services/http";
import { todayStr, weekdayKo } from "../../shared/appDate";
import {
  NUMBER_LABEL,
  PLAN_TYPES,
  SUPPLIER_KIND,
  SUPPLIER_LABEL,
  VEHICLES,
  isAfternoon,
  searchKey,
  type PlanEdit,
  type PlanItem,
  type PlanOptions,
  type PlanSaved,
  type PlanType,
  type SupplierOption,
  type SupplierSaved
} from "./inboundPlan";
import "./InboundPlan.css";

/* ============================================================
   입고예정 등록 · 고치기 창
   위 = 머리 칸(구분 · 공급사 · 번호 · 받을 창고 / 도착일 · 시간 · 차량 · 파레트 / 기사 연락처 · 메모),
   가운데 = 품목 줄(찾아서 더하기), 아래 = 합계 + 저장. 검사는 서버가 하고 문구를 그대로 보여 준다.
   고치기: 받기 전에는 전부, 나눠 입고 중에는 도착일 · 시간 · 차량 · 파레트 · 연락처 · 메모 · 수량(받음 + 닫음 이상) · 새 줄만.
   ============================================================ */

type DayRow = { id: number; expectedAt: string | null; status: string; palletQty?: number | null };

type Line = {
  key: string;
  /** 있는 줄의 id — 새 줄은 null */
  id: number | null;
  itemId: number;
  itemCode: string;
  itemName: string;
  spec: string | null;
  unit: string;
  qty: string;
  minQty: number;
  receivedQty: number;
  closedQty: number;
  removable: boolean;
};

type Form = {
  type: PlanType;
  supplierId: number | null;
  number: string;
  warehouseId: number | null;
  expectedDate: string;
  arrivalTime: string;
  vehicle: string;
  palletQty: string;
  driverPhone: string;
  remark: string;
};

type Props = {
  open: boolean;
  /** 고칠 입고 id — null 이면 새로 만들기 */
  editId: number | null;
  /** 지금 목록 — 고른 도착일에 이미 잡힌 입고를 알려 준다 */
  rows: DayRow[];
  onClose: () => void;
  onSaved: (saved: PlanSaved, message: string) => void;
};

const PICK_SUPPLIER: Record<PlanType, string> = {
  일반: "공급사를 골라 주세요.",
  외주: "외주업체를 골라 주세요.",
  이동: "출발 공장을 골라 주세요."
};
const SHOW_MATCHES = 8;
const num = (n: number) => n.toLocaleString("ko-KR");
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const blankForm = (): Form => ({
  type: "일반",
  supplierId: null,
  number: "",
  warehouseId: null,
  expectedDate: todayStr(),
  arrivalTime: "",
  vehicle: "",
  palletQty: "",
  driverPhone: "",
  remark: ""
});

const formOf = (e: PlanEdit): Form => ({
  type: e.type,
  supplierId: e.supplierId,
  number: (e.type === "이동" ? e.moveRef : e.poNo) ?? "",
  warehouseId: e.warehouseId,
  expectedDate: e.expectedDate ?? todayStr(),
  arrivalTime: e.arrivalTime ?? "",
  vehicle: e.vehicle ?? "",
  palletQty: e.palletQty == null ? "" : String(e.palletQty),
  driverPhone: e.driverPhone ?? "",
  remark: e.remark ?? ""
});

let lineSeq = 0;
const newKey = () => `l${++lineSeq}`;

export const InboundPlanModal = ({ open, editId, rows, onClose, onSaved }: Props) => {
  const [options, setOptions] = useState<PlanOptions | null>(null);
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [edit, setEdit] = useState<PlanEdit | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Form>(blankForm);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 공급사 찾기 · 추가
  const [supplierText, setSupplierText] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [adding, setAdding] = useState<{ name: string; erpCode: string } | null>(null);

  // 품목 찾기
  const [itemText, setItemText] = useState("");
  const [itemOpen, setItemOpen] = useState(false);
  const [itemCursor, setItemCursor] = useState(0);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusKey = useRef<string | null>(null);

  /* ---------- 열 때 — 선택지 · 품목 · (고치기면) 지금 값 ---------- */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    setEdit(null);
    setAdding(null);
    setItemText("");
    setSupplierOpen(false);
    setItemOpen(false);
    Promise.all([
      apiGet<PlanOptions>("/inbounds/plan-options"),
      apiGet<PlanItem[]>("/inbounds/plan-items"),
      editId != null ? apiGet<PlanEdit>(`/inbounds/${editId}/plan`) : Promise.resolve(null)
    ])
      .then(([opt, its, ed]) => {
        if (!alive) return;
        setOptions(opt);
        setItems(its);
        setEdit(ed);
        if (ed) {
          setForm(formOf(ed));
          setSupplierText(ed.supplierName ?? "");
          setLines(
            ed.lines.map((l) => ({
              key: newKey(),
              id: l.id,
              itemId: l.itemId,
              itemCode: l.itemCode,
              itemName: l.itemName,
              spec: l.spec,
              unit: l.unit,
              qty: String(l.qty),
              minQty: l.minQty,
              receivedQty: l.receivedQty,
              closedQty: l.closedQty,
              removable: l.removable
            }))
          );
        } else {
          setForm({ ...blankForm(), warehouseId: opt.defaultWarehouseId ?? opt.warehouses[0]?.id ?? null });
          setSupplierText("");
          setLines([]);
        }
      })
      .catch((e) => alive && setError(message(e, "불러오기 실패")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, editId]);

  // 새 줄을 더하면 그 줄의 수량 칸으로
  useEffect(() => {
    const key = focusKey.current;
    if (!key) return;
    focusKey.current = null;
    qtyRefs.current[key]?.focus();
  }, [lines]);

  const mode = edit?.mode ?? "ALL";
  const locked = mode === "NONE";
  const fixed = mode !== "ALL";   // 나눠 입고 중 · 못 고침 — 구분 · 공급사 · 번호 · 창고는 그대로
  const kind = SUPPLIER_KIND[form.type];

  /* ---------- 공급사 ---------- */
  const suppliers = useMemo(() => (options?.suppliers ?? []).filter((s) => s.type === kind), [options, kind]);
  const selectedSupplier: Pick<SupplierOption, "id" | "code" | "name"> | null = useMemo(() => {
    const found = options?.suppliers.find((s) => s.id === form.supplierId);
    if (found) return found;
    if (edit && edit.supplierId != null && edit.supplierId === form.supplierId) {
      return { id: edit.supplierId, code: edit.supplierCode ?? "", name: edit.supplierName ?? "" };
    }
    return null;
  }, [options, form.supplierId, edit]);

  const supplierMatches = useMemo(() => {
    const k = searchKey(supplierText);
    const showAll = selectedSupplier && supplierText === selectedSupplier.name;
    return suppliers
      .filter((s) => showAll || !k || [s.name, s.code, s.erpCode].some((v) => searchKey(v).includes(k)))
      .slice(0, SHOW_MATCHES);
  }, [suppliers, supplierText, selectedSupplier]);
  const exactSupplier = suppliers.some((s) => searchKey(s.name) === searchKey(supplierText));

  const pickSupplier = (s: SupplierOption) => {
    setForm((f) => ({ ...f, supplierId: s.id }));
    setSupplierText(s.name);
    setSupplierOpen(false);
    setAdding(null);
  };

  const changeType = (type: PlanType) => {
    if (type === form.type) return;
    const keep = options?.suppliers.find((s) => s.id === form.supplierId && s.type === SUPPLIER_KIND[type]);
    setForm((f) => ({ ...f, type, supplierId: keep ? f.supplierId : null }));
    if (!keep) setSupplierText("");
    setAdding(null);
  };

  const addSupplier = async () => {
    if (!adding) return;
    const name = adding.name.trim();
    if (!name) {
      setError(`새 ${kind} 이름을 넣어 주세요.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, message: msg } = await apiSend<SupplierSaved>("POST", "/inbounds/suppliers", {
        name,
        type: kind,
        erpCode: adding.erpCode.trim() || null
      });
      setOptions((o) => (o && !o.suppliers.some((s) => s.id === data.supplier.id) ? { ...o, suppliers: [...o.suppliers, data.supplier] } : o));
      pickSupplier(data.supplier);
      setNotice(msg ?? (data.existing ? "같은 이름의 공급사가 있어 그것을 골랐습니다." : "공급사를 추가했습니다."));
    } catch (e) {
      setError(message(e, "공급사 추가 실패"));
    } finally {
      setBusy(false);
    }
  };

  /* ---------- 품목 줄 ---------- */
  const itemMatches = useMemo(() => {
    const k = searchKey(itemText);
    if (!k || !items) return [];
    const taken = new Set(lines.map((l) => l.itemId));
    return items
      .filter((it) => !taken.has(it.id) && [it.code, it.erpItemCode, it.name, it.spec].some((v) => searchKey(v).includes(k)))
      .slice(0, SHOW_MATCHES);
  }, [itemText, items, lines]);

  const addItem = (it: PlanItem) => {
    const key = newKey();
    focusKey.current = key;
    setLines((prev) => [
      ...prev,
      { key, id: null, itemId: it.id, itemCode: it.code, itemName: it.name, spec: it.spec, unit: it.unit, qty: "", minQty: 1, receivedQty: 0, closedQty: 0, removable: true }
    ]);
    setItemText("");
    setItemOpen(false);
    setItemCursor(0);
  };

  const onItemKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setItemOpen(true);
      setItemCursor((c) => Math.min(c + 1, Math.max(itemMatches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setItemCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = itemMatches[itemCursor] ?? itemMatches[0];
      if (hit) addItem(hit);
    } else if (e.key === "Escape" && itemOpen) {
      e.stopPropagation();   // 창은 닫지 않고 목록만
      setItemOpen(false);
    }
  };

  const onSupplierKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (supplierMatches[0]) pickSupplier(supplierMatches[0]);
    } else if (e.key === "Escape" && supplierOpen) {
      e.stopPropagation();
      setSupplierOpen(false);
    }
  };

  const setQty = (key: string, qty: string) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: qty.replace(/[^0-9]/g, "") } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  /* ---------- 안내 ---------- */
  const totalQty = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const past = Boolean(form.expectedDate) && form.expectedDate < todayStr();
  const sameDay = useMemo(() => {
    if (!form.expectedDate) return null;
    const same = rows.filter((r) => r.expectedAt === form.expectedDate && r.status !== "closed" && r.id !== editId);
    return {
      count: same.length,
      pallets: same.reduce((a, r) => a + (r.palletQty ?? 0), 0),
      unknown: same.filter((r) => r.palletQty == null).length
    };
  }, [rows, form.expectedDate, editId]);

  const warehouses = useMemo(() => {
    const list = options?.warehouses ?? [];
    // 고치기 — 지금 창고가 목록에 없으면(쓰지 않게 된 창고) 그대로 보이게
    if (edit && edit.warehouseId != null && !list.some((w) => w.id === edit.warehouseId)) {
      return [...list, { id: edit.warehouseId, code: "", name: edit.warehouseName ?? `창고 ${edit.warehouseId}`, type: "" }];
    }
    return list;
  }, [options, edit]);

  /* ---------- 저장 ---------- */
  const firstProblem = (): string | null => {
    if (!form.supplierId) return PICK_SUPPLIER[form.type];
    if (form.type === "일반" && !form.number.trim()) return "일반 입고는 PO 번호(ERP 발주번호)를 넣어 주세요.";
    if (!form.warehouseId) return "받을 창고를 골라 주세요.";
    if (!form.expectedDate) return "도착일을 넣어 주세요.";
    if (form.palletQty.trim() && !(Number.isInteger(Number(form.palletQty)) && Number(form.palletQty) >= 0 && Number(form.palletQty) <= 999)) {
      return "파레트 수는 0 ~ 999 사이 정수로 넣어 주세요.";
    }
    if (!lines.length) return "품목을 하나 이상 넣어 주세요 — 위 찾기 칸에서 품목코드나 이름으로 찾습니다.";
    const bad = lines.find((l) => !l.qty || Number(l.qty) < l.minQty);
    if (bad) return `${bad.itemCode} 수량을 확인해 주세요 (${num(bad.minQty)} 이상).`;
    return null;
  };

  const save = async () => {
    const problem = firstProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const number = form.number.trim() || null;
    const body = {
      type: form.type,
      supplierId: form.supplierId,
      poNo: form.type === "이동" ? null : number,
      moveRef: form.type === "이동" ? number : null,
      warehouseId: form.warehouseId,
      expectedDate: form.expectedDate,
      arrivalTime: form.arrivalTime || null,
      vehicle: form.vehicle.trim() || null,
      palletQty: form.palletQty.trim() === "" ? null : Number(form.palletQty),
      driverPhone: form.driverPhone.trim() || null,
      remark: form.remark.trim() || null,
      lines: lines.map((l) => ({ id: l.id, itemId: l.itemId, qty: Number(l.qty) })),
      version: edit?.version ?? null
    };
    try {
      const { data, message: msg } =
        editId == null ? await apiSend<PlanSaved>("POST", "/inbounds", body) : await apiSend<PlanSaved>("PUT", `/inbounds/${editId}`, body);
      onSaved(data, msg ?? `${data.inboundNo} 저장했습니다.`);
    } catch (e) {
      setError(message(e, "저장 실패"));
    } finally {
      setBusy(false);
    }
  };

  const dirty = editId == null && (lines.length > 0 || form.supplierId != null);
  const close = () => {
    if (busy) return;
    if (dirty && !window.confirm("넣은 내용을 버리고 닫을까요?")) return;
    onClose();
  };

  const title = editId == null ? "입고예정 등록" : `입고예정 고치기${edit ? ` — ${edit.inboundNo}` : ""}`;
  const desc =
    editId == null
      ? "저장하면 입고 예정 목록에 생기고, 물류팀이 도착부터 처리합니다."
      : mode === "PARTIAL"
        ? "나눠 입고 중 — 남은 수량의 도착일 · 시간 · 수량과 새 품목만 고칠 수 있습니다."
        : "받기 전에는 모두 고칠 수 있습니다. 물류팀이 도착 처리를 시작하면 고칠 수 없습니다.";

  return (
    <Modal
      open={open}
      title={title}
      desc={desc}
      icon={editId == null ? "plus" : "edit"}
      iconBg="var(--primary-bg)"
      iconColor="var(--primary-ink)"
      onClose={close}
      className="inp-modal"
      footer={
        <>
          <span className="inp-total">
            품목 <b>{num(lines.length)}</b> · 수량 <b>{num(totalQty)}</b> EA
          </span>
          <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
            취소
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy || loading || locked || !options}>
            {busy ? "저장 중..." : editId == null ? "저장" : "고친 내용 저장"}
          </button>
        </>
      }
    >
      {loading ? <p className="inp-loading">불러오는 중...</p> : null}

      {locked && edit?.lockReason ? (
        <div className="ds-callout warning inp-callout">
          <Icon name="lock" size={16} />
          <span>{edit.lockReason}</span>
        </div>
      ) : null}
      {mode === "PARTIAL" ? (
        <div className="ds-callout info inp-callout">
          <Icon name="clock" size={16} />
          <span>나눠 입고 중입니다 — 구분 · 공급사 · 번호 · 받을 창고는 그대로 두고, 받은(닫은) 수량 아래로는 줄일 수 없습니다.</span>
        </div>
      ) : null}

      {!loading && options ? (
        <>
          <div className="inp-grid">
            <div className="inp-field">
              <span className="inp-label">
                구분<i>*</i>
              </span>
              <div className="inp-seg" role="radiogroup" aria-label="구분">
                {PLAN_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={form.type === t}
                    className={form.type === t ? "is-on" : undefined}
                    disabled={fixed}
                    onClick={() => changeType(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="inp-field inp-combo">
              <span className="inp-label">
                {SUPPLIER_LABEL[form.type]}
                <i>*</i>
              </span>
              <div className={`inp-input-wrap${selectedSupplier ? " has-code" : ""}`}>
                <input
                  value={supplierText}
                  disabled={fixed}
                  placeholder={`${kind} 이름 · 코드로 찾기`}
                  onFocus={() => setSupplierOpen(true)}
                  onBlur={() => window.setTimeout(() => setSupplierOpen(false), 150)}
                  onChange={(e) => {
                    setSupplierText(e.target.value);
                    setSupplierOpen(true);
                    if (form.supplierId != null) setForm((f) => ({ ...f, supplierId: null }));
                  }}
                  onKeyDown={onSupplierKey}
                  aria-label={SUPPLIER_LABEL[form.type]}
                />
                {selectedSupplier ? <small className="inp-code">{selectedSupplier.code}</small> : null}
              </div>
              {supplierOpen && !fixed ? (
                <ul className="inp-menu" role="listbox">
                  {supplierMatches.map((s) => (
                    <li key={s.id}>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickSupplier(s)}>
                        <b>{s.name}</b>
                        <small>
                          {s.code}
                          {s.erpCode ? ` · ERP ${s.erpCode}` : ""}
                        </small>
                      </button>
                    </li>
                  ))}
                  {!supplierMatches.length ? <li className="inp-menu-empty">맞는 {kind}가 없습니다.</li> : null}
                  {supplierText.trim() && !exactSupplier ? (
                    <li>
                      <button
                        type="button"
                        className="inp-menu-add"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setAdding({ name: supplierText.trim(), erpCode: "" });
                          setSupplierOpen(false);
                        }}
                      >
                        <Icon name="plus" size={14} />
                        '{supplierText.trim()}' 새 {kind}로 추가
                      </button>
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>

            <label className="inp-field">
              <span className="inp-label">
                {NUMBER_LABEL[form.type]}
                {form.type === "일반" ? <i>*</i> : null}
              </span>
              <input
                value={form.number}
                maxLength={40}
                disabled={fixed}
                placeholder={form.type === "일반" ? "ERP 발주번호" : "있으면 적기"}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              />
            </label>

            <label className="inp-field">
              <span className="inp-label">
                받을 창고<i>*</i>
              </span>
              <select
                value={form.warehouseId ?? ""}
                disabled={fixed}
                onChange={(e) => setForm((f) => ({ ...f, warehouseId: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">창고 고르기</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>

            {adding ? (
              <div className="inp-add">
                <span className="inp-add-title">
                  <Icon name="plus" size={14} />새 {kind}
                </span>
                <input
                  value={adding.name}
                  maxLength={150}
                  placeholder="이름"
                  onChange={(e) => setAdding((a) => (a ? { ...a, name: e.target.value } : a))}
                  aria-label={`새 ${kind} 이름`}
                  autoFocus
                />
                <input
                  value={adding.erpCode}
                  maxLength={50}
                  placeholder="ERP 거래처 코드 (있으면)"
                  onChange={(e) => setAdding((a) => (a ? { ...a, erpCode: e.target.value } : a))}
                  aria-label="ERP 거래처 코드"
                />
                <button type="button" className="inp-mini" onClick={() => setAdding(null)} disabled={busy}>
                  취소
                </button>
                <button type="button" className="inp-mini is-strong" onClick={addSupplier} disabled={busy}>
                  추가
                </button>
              </div>
            ) : null}

            <label className="inp-field">
              <span className="inp-label">
                도착일<i>*</i>
                {form.expectedDate ? <em>{weekdayKo(form.expectedDate)}요일</em> : null}
              </span>
              <input type="date" value={form.expectedDate} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))} />
            </label>

            <label className="inp-field">
              <span className="inp-label">도착 시간</span>
              <input type="time" value={form.arrivalTime} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, arrivalTime: e.target.value }))} />
            </label>

            <label className="inp-field">
              <span className="inp-label">차량</span>
              <input
                value={form.vehicle}
                list="inp-vehicles"
                maxLength={30}
                disabled={locked}
                placeholder="5톤 · 컨테이너 …"
                onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))}
              />
              <datalist id="inp-vehicles">
                {VEHICLES.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>

            <label className="inp-field">
              <span className="inp-label">파레트 수</span>
              <input
                inputMode="numeric"
                value={form.palletQty}
                disabled={locked}
                placeholder="0"
                onChange={(e) => setForm((f) => ({ ...f, palletQty: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) }))}
              />
            </label>

            <label className="inp-field inp-span2">
              <span className="inp-label">
                기사 연락처<em>입고가 끝나고 30일 뒤 지웁니다</em>
              </span>
              <input
                type="tel"
                inputMode="tel"
                value={form.driverPhone}
                maxLength={30}
                disabled={locked}
                placeholder="010-0000-0000"
                onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))}
              />
            </label>

            <label className="inp-field inp-span2">
              <span className="inp-label">메모</span>
              <input value={form.remark} maxLength={200} disabled={locked} placeholder="물류팀에 전할 말" onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} />
            </label>
          </div>

          <div className="inp-notes">
            {isAfternoon(form.arrivalTime) ? (
              <div className="inp-note is-warn">
                <Icon name="alert" size={14} />
                <span>오후 입고는 물류2팀과 먼저 협의해 주세요.</span>
              </div>
            ) : null}
            {past ? (
              <div className="inp-note is-warn">
                <Icon name="clock" size={14} />
                <span>도착일이 지났습니다 — 늦게 넣는 것이면 그대로 저장할 수 있습니다.</span>
              </div>
            ) : null}
            {sameDay && form.expectedDate ? (
              <div className="inp-note">
                <Icon name="truck" size={14} />
                <span>
                  {form.expectedDate.slice(5)} ({weekdayKo(form.expectedDate)})
                  {sameDay.count ? (
                    <>
                      {" "}
                      이미 잡힌 입고 <b>{sameDay.count}건</b> · 파레트 <b>{num(sameDay.pallets)}</b>
                      {sameDay.unknown ? ` (파레트 모름 ${sameDay.unknown}건)` : ""}
                    </>
                  ) : (
                    "에 잡힌 다른 입고가 없습니다."
                  )}
                </span>
              </div>
            ) : null}
          </div>

          <section className="inp-lines" aria-label="품목">
            <div className="inp-lines-head">
              <b>품목 {lines.length}</b>
              <div className="inp-combo inp-item-search">
                <Icon name="search" size={14} />
                <input
                  value={itemText}
                  disabled={locked}
                  placeholder="품목코드 · 이름 · 규격으로 찾아 더하기"
                  onFocus={() => setItemOpen(true)}
                  onBlur={() => window.setTimeout(() => setItemOpen(false), 150)}
                  onChange={(e) => {
                    setItemText(e.target.value);
                    setItemOpen(true);
                    setItemCursor(0);
                  }}
                  onKeyDown={onItemKey}
                  aria-label="품목 찾기"
                />
                {itemOpen && itemText.trim() ? (
                  <ul className="inp-menu" role="listbox">
                    {itemMatches.map((it, idx) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          className={idx === itemCursor ? "is-cursor" : undefined}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setItemCursor(idx)}
                          onClick={() => addItem(it)}
                        >
                          <span className="inp-sku">{it.code}</span>
                          <b>{it.name}</b>
                          <small>
                            {[it.spec, it.erpItemCode && it.erpItemCode !== it.code ? `ERP ${it.erpItemCode}` : null].filter(Boolean).join(" · ")}
                          </small>
                        </button>
                      </li>
                    ))}
                    {!itemMatches.length ? <li className="inp-menu-empty">맞는 품목이 없습니다 — 품목은 품목 마스터에서 먼저 넣습니다.</li> : null}
                  </ul>
                ) : null}
              </div>
            </div>
            {lines.map((l) => (
              <div key={l.key} className="inp-line">
                <div className="inp-line-item">
                  <span className="inp-sku">{l.itemCode}</span>
                  <span className="inp-line-name">
                    {l.itemName}
                    {l.spec ? <small>{l.spec}</small> : null}
                  </span>
                  {l.receivedQty > 0 || l.closedQty > 0 ? (
                    <span className="inp-line-done">
                      받음 {num(l.receivedQty)}
                      {l.closedQty ? ` · 닫음 ${num(l.closedQty)}` : ""}
                    </span>
                  ) : null}
                </div>
                <label className="inp-line-qty">
                  <input
                    ref={(el) => {
                      qtyRefs.current[l.key] = el;
                    }}
                    inputMode="numeric"
                    value={l.qty}
                    disabled={locked}
                    placeholder={l.minQty > 1 ? `${l.minQty} 이상` : "수량"}
                    onChange={(e) => setQty(l.key, e.target.value)}
                    aria-label={`${l.itemCode} 수량`}
                  />
                  <small>{l.unit}</small>
                </label>
                <button
                  type="button"
                  className="inp-line-del"
                  onClick={() => removeLine(l.key)}
                  disabled={locked || !l.removable}
                  title={l.removable ? "이 줄 빼기" : "받은(닫은) 수량이 있어 뺄 수 없습니다"}
                  aria-label={`${l.itemCode} 빼기`}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
            {!lines.length ? <div className="inp-lines-empty">위 찾기 칸에서 품목을 골라 더합니다. 같은 품목은 한 줄로.</div> : null}
          </section>
        </>
      ) : null}

      {notice ? (
        <div className="ds-callout info inp-callout">
          <Icon name="check" size={16} />
          <span>{notice}</span>
        </div>
      ) : null}
      {error ? (
        <div className="ds-callout danger inp-callout" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      ) : null}
    </Modal>
  );
};

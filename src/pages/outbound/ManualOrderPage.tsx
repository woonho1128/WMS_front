import { Fragment, useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Icon } from "../../components/ui/Icon";
import { apiGet, apiPost } from "../../services/http";
import "../dashboard/DashboardOutbound.css"; // 공용 테이블/필터 스타일 재사용

type Component = { itemCode: string; itemName: string; qtyPer: number; unit: string };
type Product = { itemCode: string; itemName: string; unit: string; isBom: boolean; components: Component[] };

type OrderLine = { key: number; product: Product; qty: number };

type ManualOrder = {
  id: number;
  orderNo: string;
  customerName: string;
  createdAt: string;
  lineCount: number;
  lines: { itemCode: string; itemName: string; isBom: boolean; qty: number; unit: string; parentCode: string | null }[];
};

export const ManualOrderPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [customer, setCustomer] = useState("");
  const [selCode, setSelCode] = useState("");
  const [addQty, setAddQty] = useState<number | "">(1);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [seq, setSeq] = useState(1);

  const load = () => {
    setLoading(true);
    Promise.all([apiGet<Product[]>("/order-products"), apiGet<ManualOrder[]>("/manual-orders")])
      .then(([p, o]) => { setProducts(p); setOrders(o); })
      .catch((e) => setNotice(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const selected = useMemo(() => products.find((p) => p.itemCode === selCode) ?? null, [products, selCode]);

  const addLine = () => {
    const qty = Number(addQty) || 0;
    if (!selected || qty <= 0) { setNotice("상품과 수량(1 이상)을 선택하세요."); return; }
    setLines((prev) => [...prev, { key: seq, product: selected, qty }]);
    setSeq((s) => s + 1);
    setSelCode("");
    setAddQty(1);
    setNotice(null);
  };

  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

  // 제출용 평면 라인 — BOM은 부모 + 구성품(수량 = 구성수량 × 세트수량)으로 자동 전개
  const flatLines = useMemo(
    () =>
      lines.flatMap((l) => {
        if (l.product.isBom) {
          return [
            { itemCode: l.product.itemCode, itemName: l.product.itemName, isBom: true, qty: l.qty, unit: l.product.unit, parentCode: null as string | null },
            ...l.product.components.map((c) => ({
              itemCode: c.itemCode, itemName: c.itemName, isBom: false, qty: c.qtyPer * l.qty, unit: c.unit, parentCode: l.product.itemCode as string | null
            }))
          ];
        }
        return [{ itemCode: l.product.itemCode, itemName: l.product.itemName, isBom: false, qty: l.qty, unit: l.product.unit, parentCode: null as string | null }];
      }),
    [lines]
  );

  const submit = async () => {
    if (lines.length === 0) { setNotice("주문 라인을 1개 이상 추가하세요."); return; }
    setBusy(true);
    try {
      await apiPost("/manual-orders", { customerName: customer.trim(), lines: flatLines });
      setNotice(`비운영 주문 생성 완료 — ${flatLines.length}개 라인(구성품 자동 포함)`);
      setLines([]);
      setCustomer("");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "주문 생성 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="outbound-page">
      <div className="ds-callout info" style={{ marginBottom: 16 }}>
        <Icon name="check" size={18} />
        <span>
          상품코드를 <b>수기 입력하지 않고 선택</b>합니다. <b>세트(BOM)</b> 상품을 선택하면 필수 구성품이 자동 전개되어 <b>누락 없이</b> 출고 라인에 포함됩니다.
        </span>
      </div>

      <DashboardCard className="outbound-filter-card" title="비운영 주문 등록">
        <div className="outbound-filter-grid">
          <label className="outbound-keyword">
            <span>고객명 (선택)</span>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="예: 대림 직영몰" />
          </label>
          <label>
            <span>상품 선택</span>
            <select value={selCode} onChange={(e) => setSelCode(e.target.value)}>
              <option value="">상품 선택 (직접 코드 입력 불가)</option>
              {products.map((p) => (
                <option key={p.itemCode} value={p.itemCode}>
                  {p.isBom ? "[세트] " : ""}{p.itemCode} · {p.itemName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>수량</span>
            <input
              type="number"
              min={1}
              value={addQty}
              onChange={(e) => setAddQty(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>
          <div className="outbound-filter-actions">
            <button type="button" className="btn-secondary" onClick={addLine} disabled={!selected}>주문에 추가</button>
          </div>
        </div>

        {/* 선택한 BOM 구성품 미리보기 */}
        {selected?.isBom ? (
          <div className="ds-callout" style={{ marginTop: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <span><StatusBadge tone="teal">세트</StatusBadge> <b>{selected.itemName}</b> 구성품 (수량 {Number(addQty) || 0} 기준 자동 포함)</span>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {selected.components.map((c) => (
                  <li key={c.itemCode}>
                    {c.itemCode} · {c.itemName} — 세트당 {c.qtyPer}{c.unit} → <b>{c.qtyPer * (Number(addQty) || 0)}{c.unit}</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`주문 라인 (${lines.length}건 · 전개 ${flatLines.length}라인)`}>
        <div className="outbound-list-toolbar">
          <p className="outbound-notice">{notice ?? "세트 상품의 구성품은 자동 포함되며 개별 삭제할 수 없습니다. 세트 단위로만 제거됩니다."}</p>
          <div className="outbound-expand-actions">
            <button type="button" className="btn-primary" onClick={submit} disabled={busy || lines.length === 0}>주문 생성</button>
          </div>
        </div>
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>구분</th>
                <th>SKU</th>
                <th>상품명</th>
                <th className="num">수량</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>상품을 선택해 주문 라인을 추가하세요.</td></tr>
              ) : (
                lines.map((l) => (
                  l.product.isBom ? (
                    <Fragment key={l.key}>
                      <tr>
                        <td><StatusBadge tone="teal">세트</StatusBadge></td>
                        <td><b>{l.product.itemCode}</b></td>
                        <td>{l.product.itemName}</td>
                        <td className="num">{l.qty.toLocaleString()} {l.product.unit}</td>
                        <td>
                          <div className="outbound-row-actions">
                            <button type="button" className="btn-secondary" style={{ color: "var(--c-danger)" }} onClick={() => removeLine(l.key)}>세트 제거</button>
                          </div>
                        </td>
                      </tr>
                      {l.product.components.map((c) => (
                        <tr key={`${l.key}-${c.itemCode}`} style={{ color: "var(--ink-faint)" }}>
                          <td style={{ paddingLeft: 24 }}>└ 구성품</td>
                          <td>{c.itemCode}</td>
                          <td>{c.itemName}</td>
                          <td className="num">{(c.qtyPer * l.qty).toLocaleString()} {c.unit}</td>
                          <td><span className="cell-mut">자동</span></td>
                        </tr>
                      ))}
                    </Fragment>
                  ) : (
                    <tr key={l.key}>
                      <td><StatusBadge tone="gray">단품</StatusBadge></td>
                      <td><b>{l.product.itemCode}</b></td>
                      <td>{l.product.itemName}</td>
                      <td className="num">{l.qty.toLocaleString()} {l.product.unit}</td>
                      <td>
                        <div className="outbound-row-actions">
                          <button type="button" className="btn-secondary" style={{ color: "var(--c-danger)" }} onClick={() => removeLine(l.key)}>제거</button>
                        </div>
                      </td>
                    </tr>
                  )
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <DashboardCard className="outbound-table-card" title={`생성된 비운영 주문 (${orders.length}건)`}>
        <div className="pc-only">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>주문번호</th>
                <th>고객명</th>
                <th>등록일</th>
                <th className="num">라인수</th>
                <th>구성</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>불러오는 중...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--ink-faint)" }}>생성된 비운영 주문이 없습니다.</td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id}>
                    <td><b>{o.orderNo}</b></td>
                    <td>{o.customerName}</td>
                    <td>{o.createdAt}</td>
                    <td className="num">{o.lineCount}</td>
                    <td>
                      {o.lines.filter((ln) => ln.isBom).length > 0
                        ? <StatusBadge tone="teal">세트 {o.lines.filter((ln) => ln.isBom).length}</StatusBadge>
                        : <StatusBadge tone="gray">단품</StatusBadge>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </section>
  );
};

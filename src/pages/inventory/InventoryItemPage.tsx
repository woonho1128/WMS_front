import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiGet } from "../../services/http";
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
};

export const InventoryItemPage = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<Item[]>("/items")
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter(
      (it) => it.code.toLowerCase().includes(kw) || it.name.toLowerCase().includes(kw)
    );
  }, [items, keyword]);

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
        <p>등록된 품목 정보를 조회하고 확인할 수 있습니다. (백엔드 DB 연동)</p>
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
        </div>
      </DashboardCard>

      <DashboardCard className="item-table-card" title={`품목 목록 (총 ${filtered.length}건)`}>
        {error ? (
          <div className="ds-callout danger" style={{ margin: "4px 0 12px" }}>
            <span>불러오기 실패: {error} — 백엔드(8080)가 실행 중인지 확인하세요.</span>
          </div>
        ) : null}

        <div className="item-table-wrap">
          <table className="item-table">
            <thead>
              <tr>
                <th>품목 코드</th>
                <th>품목명</th>
                <th>품목 그룹</th>
                <th>단위</th>
                <th>구분</th>
                <th>안전재고</th>
                <th>사용 여부</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "28px", color: "var(--ink-faint)" }}>
                    불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "28px", color: "var(--ink-faint)" }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <button type="button" className="item-code-link">
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
                    <td>
                      <StatusBadge tone={it.active ? "success" : "gray"}>
                        {it.active ? "사용" : "미사용"}
                      </StatusBadge>
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

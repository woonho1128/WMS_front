import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Icon } from "../../components/ui/Icon";
import { INTERFACE_STATUS, type InterfaceState } from "../../domain/wmsProcess";
import { apiGet, apiPost } from "../../services/http";
import "./InterfaceMonitorPage.css";

type IfRow = {
  id: string;
  type: string;
  direction: string; // RECV / SEND
  refNo: string | null;
  state: InterfaceState;
  retry: number;
  message: string | null;
  createdAt: string | null;
};

const isResendable = (s: string) => s === "fail" || s === "reprocess";
const dirKind = (d: string): "recv" | "send" => (d === "SEND" ? "send" : "recv");
const dirLabel = (d: string) => (d === "SEND" ? "WMS→중계서버" : "중계서버→WMS");

export const InterfaceMonitorPage = () => {
  const [rows, setRows] = useState<IfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirFilter, setDirFilter] = useState<"all" | "recv" | "send">("all");
  const [stateFilter, setStateFilter] = useState<"all" | InterfaceState>("all");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("실패 · 재처리대기 건을 선택해 재전송할 수 있습니다. 외주(전송제외)는 대상이 아닙니다.");

  const load = () => {
    setLoading(true);
    return apiGet<IfRow[]>("/interfaces")
      .then(setRows)
      .catch((e) => setNotice(`불러오기 실패: ${e instanceof Error ? e.message : e} (백엔드 8080 확인)`))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      const dirMatch = dirFilter === "all" || dirKind(row.direction) === dirFilter;
      const stateMatch = stateFilter === "all" || row.state === stateFilter;
      const kwMatch =
        !kw ||
        row.id.toLowerCase().includes(kw) ||
        row.type.toLowerCase().includes(kw) ||
        (row.refNo ?? "").toLowerCase().includes(kw);
      return dirMatch && stateMatch && kwMatch;
    });
  }, [rows, dirFilter, stateFilter, keyword]);

  const summary = useMemo(() => {
    const c = (pred: (r: IfRow) => boolean) => rows.filter(pred).length;
    return {
      success: c((r) => r.state === "success"),
      pending: c((r) => r.state === "sending" || r.state === "waiting"),
      reprocess: c((r) => r.state === "reprocess"),
      fail: c((r) => r.state === "fail"),
      excluded: c((r) => r.state === "excluded")
    };
  }, [rows]);

  const resendableSelected = selected.filter((id) => {
    const r = rows.find((x) => x.id === id);
    return r && isResendable(r.state);
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const resend = async (ids: string[]) => {
    const targets = ids.filter((id) => {
      const r = rows.find((x) => x.id === id);
      return r && isResendable(r.state);
    });
    if (targets.length === 0) {
      setNotice("재전송 가능한 건(실패·재처리대기)이 없습니다.");
      return;
    }
    for (const id of targets) {
      try {
        await apiPost(`/interfaces/${id}/resend`, {});
      } catch {
        /* 개별 실패 무시 */
      }
    }
    setSelected((prev) => prev.filter((id) => !targets.includes(id)));
    setNotice(`${targets.length}건 재전송을 완료했습니다.`);
    await load();
  };

  const failCount = summary.fail + summary.reprocess;

  return (
    <section className="ifmon-page">
      {failCount > 0 ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>재전송이 필요한 건이 <b>{failCount}건</b> 있습니다. (실패 {summary.fail} · 재처리대기 {summary.reprocess})</span>
        </div>
      ) : null}

      <section className="ifmon-summary">
        <article className="app-surface ifmon-kpi success"><span>성공</span><strong>{summary.success}</strong></article>
        <article className="app-surface ifmon-kpi gray"><span>전송중 · 대기</span><strong>{summary.pending}</strong></article>
        <article className="app-surface ifmon-kpi warning"><span>재처리대기</span><strong>{summary.reprocess}</strong></article>
        <article className="app-surface ifmon-kpi danger"><span>실패</span><strong>{summary.fail}</strong></article>
        <article className="app-surface ifmon-kpi info"><span>전송제외(외주)</span><strong>{summary.excluded}</strong></article>
      </section>

      <div className="ifmon-toolbar app-surface">
        <div className="ifmon-filters">
          <label>
            <span>방향</span>
            <select value={dirFilter} onChange={(e) => setDirFilter(e.target.value as typeof dirFilter)}>
              <option value="all">전체</option>
              <option value="recv">수신 (→WMS)</option>
              <option value="send">송신 (WMS→)</option>
            </select>
          </label>
          <label>
            <span>상태</span>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}>
              <option value="all">전체</option>
              {(Object.keys(INTERFACE_STATUS) as InterfaceState[]).map((s) => (
                <option key={s} value={s}>{INTERFACE_STATUS[s].label}</option>
              ))}
            </select>
          </label>
          <label className="ifmon-search">
            <span>검색</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="IF번호 / 유형 / 참조번호" />
          </label>
        </div>
        <button type="button" className="btn-primary" disabled={resendableSelected.length === 0} onClick={() => resend(selected)}>
          선택 {resendableSelected.length}건 재전송
        </button>
      </div>

      <p className="ifmon-notice">{notice}</p>

      <div className="table-wrap ifmon-table-wrap">
        <table className="data-table ifmon-table">
          <thead>
            <tr>
              <th className="ifmon-check-col"></th>
              <th>인터페이스 ID</th>
              <th>유형</th>
              <th>방향</th>
              <th>참조번호</th>
              <th>상태</th>
              <th>시각</th>
              <th className="num">재시도</th>
              <th>메시지</th>
              <th className="action-col">처리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="ifmon-empty">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="ifmon-empty">조건에 맞는 인터페이스 내역이 없습니다.</td></tr>
            ) : (
              filtered.map((row) => {
                const meta = INTERFACE_STATUS[row.state] ?? { label: row.state, tone: "gray" as const };
                const resendable = isResendable(row.state);
                return (
                  <tr key={row.id} className={selected.includes(row.id) ? "row-selected" : ""}>
                    <td className="ifmon-check-col">
                      <input type="checkbox" checked={selected.includes(row.id)} disabled={!resendable} onChange={() => toggle(row.id)} aria-label={`${row.id} 선택`} />
                    </td>
                    <td className="mono">{row.id}</td>
                    <td>{row.type}</td>
                    <td><span className={`ifmon-dir ${dirKind(row.direction)}`}>{dirLabel(row.direction)}</span></td>
                    <td className="mono">{row.refNo ?? "-"}</td>
                    <td><StatusBadge tone={meta.tone} variant="dot">{meta.label}</StatusBadge></td>
                    <td className="mono">{row.createdAt ?? "-"}</td>
                    <td className="num">{row.retry}</td>
                    <td className="ifmon-msg">{row.message ?? "-"}</td>
                    <td className="action-col">
                      {resendable ? (
                        <button type="button" className="btn-secondary ifmon-resend" onClick={() => resend([row.id])}>
                          <Icon name="refresh" size={14} />재전송
                        </button>
                      ) : row.state === "excluded" ? (
                        <span className="ifmon-na">대상 아님</span>
                      ) : (
                        <span className="ifmon-na">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

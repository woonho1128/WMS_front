import { useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { apiPost } from "../../services/http";
import { readSheetFile } from "../../shared/sheetFile";
import { PLAN_IMPORT_MAX_ROWS, downloadPlanTemplate, mapPlanSheet, type MappedPlanSheet } from "./inboundPlanImport";
import "./InboundPlan.css";

/* ============================================================
   입고예정 가져오기 창 — 파일 고르기 → 미리보기(만들 것 · 이미 있음 · 오류) → 반영
   파일은 브라우저에서 읽고(엑셀 · CSV), 묶기 · 검사는 서버가 한다. 오류가 한 줄이라도 있으면 반영할 수 없다.
   ============================================================ */

type PlanPreview = {
  action: "NEW" | "SKIP";
  rowNos: number[];
  type: string;
  supplierName: string;
  newSupplier: boolean;
  number: string | null;
  warehouseName: string;
  expectedDate: string;
  arrivalTime: string | null;
  lineCount: number;
  qty: number;
  existingNo: string | null;
  inboundNo: string | null;
  notes: string[];
};
type RowError = { rowNo: number; field: string; message: string };
type ImportResult = {
  applied: boolean;
  totalRows: number;
  planCount: number;
  lineCount: number;
  newSupplierCount: number;
  skipCount: number;
  errorCount: number;
  plans: PlanPreview[];
  errors: RowError[];
  message: string | null;
};

type Tab = "NEW" | "SKIP" | "ERROR";
const SHOW_MAX = 300;
const num = (n: number) => n.toLocaleString("ko-KR");
const rowsText = (rows: number[]) => (rows.length > 3 ? `${rows.slice(0, 3).join(", ")} 외 ${rows.length - 3}` : rows.join(", "));

type Props = {
  open: boolean;
  onClose: () => void;
  /** 반영했다 — 목록을 다시 읽는다 */
  onApplied: (message: string) => void;
};

export const InboundPlanImportModal = ({ open, onClose, onApplied }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapped, setMapped] = useState<MappedPlanSheet | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "checking" | "applying">("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("NEW");

  const reset = () => {
    setFileName(null);
    setMapped(null);
    setResult(null);
    setError(null);
    setTab("NEW");
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    if (busy === "applying") return;
    reset();
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    setBusy("reading");
    let sheet: MappedPlanSheet;
    try {
      sheet = mapPlanSheet(await readSheetFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
      setBusy("");
      return;
    }
    setMapped(sheet);
    if (!sheet.rows.length) {
      setError("가져올 줄이 없습니다 — 머리글 아래에 입고예정 품목을 적어 주세요.");
      setBusy("");
      return;
    }
    if (sheet.rows.length > PLAN_IMPORT_MAX_ROWS) {
      setError(`한 번에 ${num(PLAN_IMPORT_MAX_ROWS)}줄까지 가져올 수 있습니다 (${num(sheet.rows.length)}줄) — 파일을 나눠 올리세요.`);
      setBusy("");
      return;
    }
    setBusy("checking");
    try {
      const preview = await apiPost<ImportResult>("/inbounds/import/preview", { fileName: file.name, rows: sheet.rows });
      setResult(preview);
      setTab(preview.errorCount > 0 ? "ERROR" : preview.planCount > 0 ? "NEW" : "SKIP");
    } catch (e) {
      setError(e instanceof Error ? e.message : "미리보기 실패");
    } finally {
      setBusy("");
    }
  };

  const apply = async () => {
    if (!mapped || !result || !fileName) return;
    setBusy("applying");
    setError(null);
    try {
      const done = await apiPost<ImportResult>("/inbounds/import", { fileName, rows: mapped.rows });
      reset();
      onApplied(done.message ?? "입고예정을 가져왔습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "반영 실패");
    } finally {
      setBusy("");
    }
  };

  const plans = useMemo(() => (result ? result.plans.filter((p) => p.action === tab) : []), [result, tab]);
  const blockReason = !result
    ? null
    : result.errorCount > 0
      ? `오류 ${num(result.errorCount)}줄을 고쳐 다시 올려야 반영할 수 있습니다.`
      : result.planCount === 0
        ? "새로 만들 입고예정이 없습니다 — 모두 이미 있습니다."
        : null;

  return (
    <Modal
      open={open}
      title="입고예정 가져오기 (엑셀 · CSV)"
      desc="한 줄에 품목 하나 — 같은 공급사 · PO · 도착일 · 시간의 줄들이 입고예정 한 건이 됩니다."
      icon="upload"
      iconBg="var(--primary-bg)"
      iconColor="var(--primary-ink)"
      onClose={close}
      className="ipi-modal"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close} disabled={busy === "applying"}>
            닫기
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!result || !!blockReason || busy !== ""}
            onClick={apply}
            title={blockReason ?? undefined}
          >
            {busy === "applying" ? "반영 중..." : `반영${result && result.planCount ? ` (${num(result.planCount)}건)` : ""}`}
          </button>
        </>
      }
    >
      <div className="ipi-pick">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => onFile(e.target.files?.[0])}
          hidden
        />
        <button type="button" className="btn-secondary" disabled={busy !== ""} onClick={() => inputRef.current?.click()}>
          파일 고르기
        </button>
        <span className="ipi-file">{fileName ?? "엑셀(.xlsx) 또는 CSV — 첫 번째 시트만 읽습니다"}</span>
        <button type="button" className="ipi-link" onClick={downloadPlanTemplate}>
          양식 내려받기
        </button>
      </div>
      <p className="ipi-rule">
        <b>꼭 넣을 칸</b> 공급사 · 도착일 · 품목코드 · 수량 (일반 입고는 PO 번호도). 구분이 비면 일반, 받을 창고가 비면 처음 창고.
        공급사가 목록에 없으면 <b>새 공급사</b>로 만들고, <b>이미 있는 입고예정</b>(같은 공급사 · PO · 도착일)은 건너뜁니다 — 같은 파일을
        두 번 올려도 두 번 생기지 않습니다.
      </p>

      {busy === "reading" || busy === "checking" ? <p className="ipi-note">{busy === "reading" ? "파일을 읽는 중..." : "서버에서 검사하는 중..."}</p> : null}
      {error ? (
        <div className="ds-callout danger ipi-callout" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {mapped ? (
        <p className="ipi-note">
          머리글 {mapped.headerRowNo}번째 줄 · 읽은 칸 {mapped.used.map((u) => u.label).join(", ")}
          {mapped.ignored.length ? ` · 모르는 칸(무시) ${mapped.ignored.join(", ")}` : ""}
        </p>
      ) : null}

      {result ? (
        <>
          <div className="ipi-sum">
            <div className="is-ok">
              <b>{num(result.planCount)}</b>
              <span>만들 입고예정</span>
            </div>
            <div>
              <b>{num(result.lineCount)}</b>
              <span>품목 줄</span>
            </div>
            <div>
              <b>{num(result.newSupplierCount)}</b>
              <span>새 공급사</span>
            </div>
            <div>
              <b>{num(result.skipCount)}</b>
              <span>이미 있음 · 건너뜀</span>
            </div>
            <div className={result.errorCount ? "is-bad" : undefined}>
              <b>{num(result.errorCount)}</b>
              <span>오류 줄</span>
            </div>
          </div>

          <div className="ipi-tabs" role="tablist">
            {(
              [
                ["NEW", "만들 것", result.planCount],
                ["SKIP", "건너뜀", result.skipCount],
                ["ERROR", "오류", result.errors.length]
              ] as Array<[Tab, string, number]>
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`ipi-tab${tab === key ? " is-on" : ""}${key === "ERROR" && count > 0 ? " is-bad" : ""}`}
                onClick={() => setTab(key)}
              >
                {label} <b>{num(count)}</b>
              </button>
            ))}
          </div>

          {tab === "ERROR" ? (
            <div className="ipi-table-wrap">
              <table className="ipi-table">
                <thead>
                  <tr>
                    <th className="num">줄</th>
                    <th>칸</th>
                    <th>이유</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.slice(0, SHOW_MAX).map((er, idx) => (
                    <tr key={`${er.rowNo}-${idx}`} className="is-error">
                      <td className="num">{er.rowNo}</td>
                      <td>{er.field}</td>
                      <td className="ipi-why">{er.message}</td>
                    </tr>
                  ))}
                  {!result.errors.length ? (
                    <tr>
                      <td colSpan={3} className="ipi-empty">
                        오류가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ipi-table-wrap">
              <table className="ipi-table">
                <thead>
                  <tr>
                    <th>줄</th>
                    <th>구분</th>
                    <th>공급사</th>
                    <th>번호</th>
                    <th>도착</th>
                    <th>받을 창고</th>
                    <th className="num">품목</th>
                    <th className="num">수량</th>
                    <th>{tab === "SKIP" ? "이미 있는 입고" : "알림"}</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.slice(0, SHOW_MAX).map((p) => (
                    <tr key={p.rowNos.join("-")}>
                      <td className="mono">{rowsText(p.rowNos)}</td>
                      <td>{p.type}</td>
                      <td>
                        {p.supplierName}
                        {p.newSupplier ? <span className="ipi-new">새</span> : null}
                      </td>
                      <td className="mono">{p.number ?? <span className="muted">-</span>}</td>
                      <td className="mono">
                        {p.expectedDate.slice(5)}
                        {p.arrivalTime ? ` ${p.arrivalTime}` : ""}
                      </td>
                      <td>{p.warehouseName}</td>
                      <td className="num">{num(p.lineCount)}</td>
                      <td className="num">{num(p.qty)}</td>
                      <td className="ipi-why">{tab === "SKIP" ? p.existingNo : p.notes.join(" · ") || <span className="muted">-</span>}</td>
                    </tr>
                  ))}
                  {!plans.length ? (
                    <tr>
                      <td colSpan={9} className="ipi-empty">
                        해당하는 입고예정이 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
          {blockReason ? <p className="ipi-note is-warn">{blockReason}</p> : null}
        </>
      ) : null}
    </Modal>
  );
};

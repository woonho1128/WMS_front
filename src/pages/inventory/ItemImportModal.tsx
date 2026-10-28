import { useMemo, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge, type BadgeTone } from "../../components/ui/StatusBadge";
import { apiPost } from "../../services/http";
import { readSheetFile, type SheetTable } from "../../shared/sheetFile";
import { ITEM_IMPORT_MAX_ROWS, downloadItemTemplate, mapItemSheet, type MappedSheet } from "./itemImport";

/* ============================================================
   품목 가져오기 창 — 파일 고르기 → 미리보기(신규 · 변경 · 그대로 · 오류) → 반영
   파일은 브라우저에서 읽고(엑셀 · CSV), 검사는 서버가 한다. 오류가 한 줄이라도 있으면 반영할 수 없다.
   ============================================================ */

type Action = "NEW" | "UPDATE" | "SAME" | "ERROR";
type ImportLine = {
  rowNo: number;
  code: string | null;
  name: string | null;
  erpItemCode: string | null;
  action: Action;
  changes: string[];
  errors: string[];
};
type ImportResult = {
  applied: boolean;
  total: number;
  newCount: number;
  updateCount: number;
  sameCount: number;
  errorCount: number;
  lines: ImportLine[];
  message: string | null;
};

const ACTION_VIEW: Record<Action, { label: string; tone: BadgeTone }> = {
  NEW: { label: "신규", tone: "info" },
  UPDATE: { label: "변경", tone: "warning" },
  SAME: { label: "그대로", tone: "gray" },
  ERROR: { label: "오류", tone: "danger" }
};
/** 한 번에 그리는 줄 수 — 나머지는 "외 n줄" */
const SHOW_MAX = 500;

type Props = {
  open: boolean;
  onClose: () => void;
  /** 반영했다 — 목록을 다시 읽는다 */
  onApplied: (message: string) => void;
};

export const ItemImportModal = ({ open, onClose, onApplied }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<SheetTable | null>(null);
  const [erpFromCode, setErpFromCode] = useState(false);
  const [mapped, setMapped] = useState<MappedSheet | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "checking" | "applying">("");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Action | "ALL">("ALL");

  const reset = () => {
    setFileName(null);
    setTable(null);
    setMapped(null);
    setResult(null);
    setError(null);
    setFilter("ALL");
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    if (busy === "applying") return;
    reset();
    onClose();
  };

  /** 칸을 맞추고 서버에 미리보기를 묻는다 — 파일을 바꾸거나 ERP 코드 선택을 바꿀 때마다 */
  const check = async (source: SheetTable, name: string, fromCode: boolean) => {
    setError(null);
    setResult(null);
    let sheet: MappedSheet;
    try {
      sheet = mapItemSheet(source, fromCode);
    } catch (e) {
      setMapped(null);
      setError(e instanceof Error ? e.message : "칸을 맞추지 못했습니다.");
      return;
    }
    setMapped(sheet);
    if (!sheet.rows.length) {
      setError("가져올 줄이 없습니다 — 머리글 아래에 품목을 적어 주세요.");
      return;
    }
    if (sheet.rows.length > ITEM_IMPORT_MAX_ROWS) {
      setError(`한 번에 ${ITEM_IMPORT_MAX_ROWS.toLocaleString()}줄까지 가져올 수 있습니다 (${sheet.rows.length.toLocaleString()}줄) — 파일을 나눠 올리세요.`);
      return;
    }
    setBusy("checking");
    try {
      setResult(await apiPost<ImportResult>("/items/import/preview", { fileName: name, rows: sheet.rows }));
      setFilter("ALL");
    } catch (e) {
      setError(e instanceof Error ? e.message : "미리보기 실패");
    } finally {
      setBusy("");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    setBusy("reading");
    let source: SheetTable;
    try {
      source = await readSheetFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
      setBusy("");
      return;
    }
    setBusy("");
    setTable(source);
    await check(source, file.name, erpFromCode);
  };

  const toggleErpFromCode = (value: boolean) => {
    setErpFromCode(value);
    if (table && fileName) check(table, fileName, value);
  };

  const apply = async () => {
    if (!mapped || !result || !fileName) return;
    setBusy("applying");
    setError(null);
    try {
      const done = await apiPost<ImportResult>("/items/import", { fileName, rows: mapped.rows });
      reset();
      onApplied(done.message ?? "품목을 가져왔습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "반영 실패");
    } finally {
      setBusy("");
    }
  };

  const shown = useMemo(() => (result ? result.lines.filter((l) => filter === "ALL" || l.action === filter) : []), [result, filter]);
  const changesToApply = result ? result.newCount + result.updateCount : 0;
  const blockReason = !result
    ? null
    : result.errorCount > 0
      ? `오류 ${result.errorCount}줄을 고쳐 다시 올려야 반영할 수 있습니다.`
      : changesToApply === 0
        ? "바뀔 것이 없습니다."
        : null;

  return (
    <Modal
      open={open}
      title="품목 가져오기 (엑셀 · CSV)"
      desc="품목코드로 찾아 없으면 새로 만들고, 있으면 파일에 값이 있는 칸만 바꿉니다. 빈 칸은 지금 값 그대로입니다."
      icon="upload"
      iconBg="var(--c-info-bg)"
      iconColor="var(--c-info)"
      onClose={close}
      className="item-import-modal"
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
            {busy === "applying" ? "반영 중..." : `반영${changesToApply ? ` (${changesToApply.toLocaleString()}건)` : ""}`}
          </button>
        </>
      }
    >
      <div className="imp-pick">
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
        <span className="imp-file">{fileName ?? "엑셀(.xlsx) 또는 CSV — 첫 번째 시트만 읽습니다"}</span>
        <button type="button" className="imp-link" onClick={downloadItemTemplate}>
          양식 내려받기
        </button>
      </div>
      <label className="imp-option">
        <input type="checkbox" checked={erpFromCode} disabled={busy !== ""} onChange={(e) => toggleErpFromCode(e.target.checked)} />
        <span>
          ERP 단품코드 칸이 없거나 비어 있으면 <b>품목코드를 ERP 단품코드로</b> 쓴다 — ERP 에서 내려받은 파일일 때
        </span>
      </label>

      {busy === "reading" || busy === "checking" ? <p className="imp-note">{busy === "reading" ? "파일을 읽는 중..." : "서버에서 검사하는 중..."}</p> : null}
      {error ? (
        <div className="ds-callout danger imp-callout">
          <span>{error}</span>
        </div>
      ) : null}

      {mapped ? (
        <p className="imp-note">
          머리글 {mapped.headerRowNo}번째 줄 · 읽은 칸 {mapped.used.map((u) => u.label).join(", ")}
          {mapped.ignored.length ? ` · 모르는 칸(무시) ${mapped.ignored.join(", ")}` : ""}
        </p>
      ) : null}

      {result ? (
        <>
          <div className="imp-tabs">
            {(
              [
                ["ALL", "전체", result.total],
                ["NEW", "신규", result.newCount],
                ["UPDATE", "변경", result.updateCount],
                ["SAME", "그대로", result.sameCount],
                ["ERROR", "오류", result.errorCount]
              ] as Array<[Action | "ALL", string, number]>
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                className={`imp-tab${filter === key ? " is-on" : ""}${key === "ERROR" && count > 0 ? " is-bad" : ""}`}
                onClick={() => setFilter(key)}
              >
                {label} <b>{count.toLocaleString()}</b>
              </button>
            ))}
          </div>
          <div className="imp-table-wrap">
            <table className="imp-table">
              <thead>
                <tr>
                  <th className="num">줄</th>
                  <th>품목코드</th>
                  <th>품목명</th>
                  <th>ERP 단품코드</th>
                  <th>결과</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, SHOW_MAX).map((line) => (
                  <tr key={line.rowNo} className={line.action === "ERROR" ? "is-error" : undefined}>
                    <td className="num">{line.rowNo}</td>
                    <td className="imp-mono">{line.code ?? "-"}</td>
                    <td>{line.name ?? "-"}</td>
                    <td className="imp-mono">{line.erpItemCode ?? <span className="imp-missing">없음</span>}</td>
                    <td>
                      <StatusBadge tone={ACTION_VIEW[line.action].tone}>{ACTION_VIEW[line.action].label}</StatusBadge>
                    </td>
                    <td className="imp-detail">
                      {[...line.errors, ...line.changes].map((text, idx) => (
                        <div key={idx}>{text}</div>
                      ))}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="imp-empty">
                      해당하는 줄이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {shown.length > SHOW_MAX ? <p className="imp-note">앞의 {SHOW_MAX}줄만 보입니다 — 외 {(shown.length - SHOW_MAX).toLocaleString()}줄.</p> : null}
          {blockReason ? <p className="imp-note is-warn">{blockReason}</p> : null}
        </>
      ) : null}
    </Modal>
  );
};

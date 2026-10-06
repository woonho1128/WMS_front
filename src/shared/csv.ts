import { saveBlob } from "./download";

/** CSV(엑셀 호환) 다운로드 — UTF-8 BOM 포함이라 한글이 엑셀에서 깨지지 않는다. */
export const downloadCsv = (filename: string, headers: string[], rows: (string | number | null | undefined)[][]) => {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" });
  saveBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
};

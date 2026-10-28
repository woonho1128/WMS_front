/* ============================================================
   엑셀(.xlsx) · CSV 파일을 표(글자 2차원 배열)로 읽는다 — 라이브러리 없이 브라우저 기능만 쓴다.
   · CSV: UTF-8(BOM 있어도 됨), 아니면 한글 윈도 엑셀의 기본 저장 형식(CP949)으로 읽는다
   · XLSX: 압축(zip)을 풀어(DecompressionStream) 첫 번째 시트만 읽는다. 셀 값은 엑셀이 저장한 값 그대로(서식 없이)
   ※ 오래된 .xls(엑셀 97-2003)는 못 읽는다 — .xlsx 나 CSV 로 다시 저장해서 올린다
   ============================================================ */

export type SheetTable = string[][];

const MAX_BYTES = 20 * 1024 * 1024;

export async function readSheetFile(file: File): Promise<SheetTable> {
  if (file.size > MAX_BYTES) throw new Error("파일이 너무 큽니다 (20MB 까지) — 나눠서 올리세요.");
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".xls")) throw new Error("예전 엑셀 형식(.xls)은 읽지 못합니다 — 엑셀에서 .xlsx 나 CSV 로 다시 저장해 주세요.");
  // 확장자보다 내용으로 본다 — zip 이면 xlsx
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes);
  return parseCsv(decodeText(bytes));
}

/* ---------- CSV ---------- */

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // 한글 윈도 엑셀의 "CSV (쉼표로 분리)" 는 UTF-8 이 아니다
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

/** RFC 4180 — 따옴표 칸 안의 쉼표 · 줄바꿈 · "" 를 읽는다. 따옴표는 칸의 맨 앞에 있을 때만 감싸기로 본다 */
export function parseCsv(text: string): SheetTable {
  const rows: SheetTable = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/* ---------- XLSX ---------- */

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

async function readXlsx(bytes: Uint8Array): Promise<SheetTable> {
  const files = await unzip(bytes, (path) => path === "xl/workbook.xml" || path === "xl/_rels/workbook.xml.rels"
    || path === "xl/sharedStrings.xml" || path.startsWith("xl/worksheets/"));
  const xml = (path: string) => {
    const data = files.get(path);
    return data ? new DOMParser().parseFromString(new TextDecoder("utf-8").decode(data), "application/xml") : null;
  };
  const workbook = xml("xl/workbook.xml");
  if (!workbook) throw new Error("엑셀 파일을 읽을 수 없습니다 (통합 문서가 없습니다).");

  // 첫 번째 시트 → 그 시트 파일 위치
  const firstSheet = tags(workbook, "sheet")[0];
  const relId = firstSheet?.getAttributeNS(REL_NS, "id") ?? firstSheet?.getAttribute("r:id");
  let sheetPath = "xl/worksheets/sheet1.xml";
  const rels = xml("xl/_rels/workbook.xml.rels");
  const target = rels && relId ? tags(rels, "Relationship").find((r) => r.getAttribute("Id") === relId)?.getAttribute("Target") : null;
  if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const sheet = xml(sheetPath);
  if (!sheet) throw new Error("엑셀 파일을 읽을 수 없습니다 (시트가 없습니다).");

  // 공유 문자열 — 읽는 법 표시(rPh)의 글자는 뺀다
  const shared: string[] = [];
  const sst = xml("xl/sharedStrings.xml");
  if (sst) {
    for (const si of tags(sst, "si")) {
      shared.push(tags(si, "t").filter((t) => !hasAncestor(t, "rPh", si)).map((t) => t.textContent ?? "").join(""));
    }
  }

  const table: SheetTable = [];
  for (const rowEl of tags(sheet, "row")) {
    const rowIndex = Number(rowEl.getAttribute("r") ?? table.length + 1) - 1;
    const cells: string[] = [];
    let next = 0;
    for (const c of Array.from(rowEl.children).filter((el) => el.localName === "c")) {
      const ref = c.getAttribute("r");
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      cells[col] = cellText(c, shared);
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    while (table.length < rowIndex) table.push([]);
    table[rowIndex] = cells;
  }
  return table;
}

function cellText(c: Element, shared: string[]): string {
  const type = c.getAttribute("t");
  const v = tags(c, "v")[0]?.textContent ?? "";
  switch (type) {
    case "s":
      return shared[Number(v)] ?? "";
    case "inlineStr":
      return tags(c, "t").map((t) => t.textContent ?? "").join("");
    case "b":
      return v === "1" ? "TRUE" : "FALSE";
    case "e":
      return "";
    case "str":
    case "d":
      return v;
    default:
      return numberText(v);
  }
}

/** 엑셀이 숫자로 저장한 값 — 12.0 은 12, 지수 표기(1.2E+5)는 풀어 쓴다 */
function numberText(v: string): string {
  if (/^-?\d+\.0+$/.test(v)) return v.replace(/\.0+$/, "");
  if (/e/i.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n) && Math.abs(n) < 1e21) return String(n);
  }
  return v;
}

/** A1 → 0, AB7 → 27 */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const tags = (root: Document | Element, localName: string) => Array.from(root.getElementsByTagNameNS("*", localName));

function hasAncestor(el: Element, localName: string, stop: Element): boolean {
  for (let p = el.parentElement; p && p !== stop; p = p.parentElement) if (p.localName === localName) return true;
  return false;
}

/* ---------- zip (중앙 디렉터리만 읽는다) ---------- */

async function unzip(bytes: Uint8Array, wanted: (path: string) => boolean): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("엑셀(.xlsx) 파일이 아닙니다.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const names = new TextDecoder("utf-8");
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("엑셀 파일이 손상되었습니다.");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const path = names.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(path)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) out.set(path, data);
    else if (method === 8) out.set(path, await inflate(data));
    else throw new Error("엑셀 파일의 압축 방식을 읽지 못합니다 — CSV 로 저장해 올려 주세요.");
  }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("이 브라우저는 엑셀 파일을 읽지 못합니다 — 최신 크롬 · 엣지를 쓰거나 CSV 로 저장해 올려 주세요.");
  }
  // slice() — 파일 버퍼의 일부를 새 버퍼로 복사 (Blob 은 원래 버퍼 전체가 아니라 이 조각만 받아야 한다)
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

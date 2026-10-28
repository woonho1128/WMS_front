import { downloadCsv } from "../../shared/csv";
import type { SheetTable } from "../../shared/sheetFile";

/* ============================================================
   품목 가져오기 — 엑셀 · CSV 의 머리글로 칸을 찾아 서버에 보낼 줄을 만든다.
   검사(필수 · 길이 · 숫자 · 겹침)는 서버가 한다 — 여기서는 칸을 맞추고 빈 줄을 뺄 뿐이다.
   머리글은 양식 이름이 아니어도 된다 (아래 aliases — 띄어쓰기 · 괄호 · 대소문자는 보지 않는다).
   ============================================================ */

export type ItemImportRow = {
  rowNo: number;
  code?: string;
  name?: string;
  erpItemCode?: string;
  spec?: string;
  unit?: string;
  category?: string;
  barcode?: string;
  consign?: string;
  safetyStock?: string;
  unitWeightKg?: string;
  unitVolumeCm3?: string;
  unitsPerPallet?: string;
  active?: string;
};

type Field = Exclude<keyof ItemImportRow, "rowNo">;

type Column = { field: Field; header: string; aliases: string[]; examples: [string, string] };

/** 양식의 칸 순서 = 이 순서. examples 는 양식에 넣는 가짜 예시 두 줄 */
export const ITEM_IMPORT_COLUMNS: Column[] = [
  { field: "code", header: "품목코드", aliases: ["품목코드", "품번", "sku", "itemcode", "code"], examples: ["EX-1001", "EX-1002"] },
  { field: "name", header: "품목명", aliases: ["품목명", "품명", "itemname", "name"], examples: ["예시 양변기 (화이트)", "예시 수전 (크롬)"] },
  { field: "erpItemCode", header: "ERP 단품코드", aliases: ["erp단품코드", "단품코드", "erp품목코드", "erp코드", "erpitemcode"], examples: ["EX-ERP-1001", "EX-ERP-1002"] },
  { field: "spec", header: "규격", aliases: ["규격", "품목규격", "spec"], examples: ["700x400", ""] },
  { field: "unit", header: "단위", aliases: ["단위", "재고단위", "unit"], examples: ["EA", "EA"] },
  { field: "category", header: "품목그룹", aliases: ["품목그룹", "품목군", "분류", "category"], examples: ["욕실", "수전"] },
  { field: "barcode", header: "바코드", aliases: ["바코드", "barcode"], examples: ["", ""] },
  { field: "consign", header: "외주(Y/N)", aliases: ["외주", "외주yn", "외주여부", "consign"], examples: ["N", "N"] },
  { field: "safetyStock", header: "안전재고", aliases: ["안전재고", "safetystock"], examples: ["10", ""] },
  { field: "unitWeightKg", header: "단위중량(kg)", aliases: ["단위중량kg", "단위중량", "중량kg", "중량", "weightkg"], examples: ["25.5", ""] },
  { field: "unitVolumeCm3", header: "단위부피(cm3)", aliases: ["단위부피cm3", "단위부피", "부피cm3", "부피", "volumecm3"], examples: ["180000", ""] },
  { field: "unitsPerPallet", header: "파레트입수", aliases: ["파레트입수", "팔레트입수", "파렛트입수", "unitsperpallet"], examples: ["12", ""] },
  { field: "active", header: "사용(Y/N)", aliases: ["사용", "사용yn", "사용여부", "active"], examples: ["Y", "Y"] }
];

export const ITEM_IMPORT_MAX_ROWS = 10_000;

const norm = (s: string) => s.toLowerCase().replace(/³/g, "3").replace(/[^0-9a-z가-힣]/g, "");

const fieldOf = (header: string): Field | null => {
  const key = norm(header);
  if (!key) return null;
  return ITEM_IMPORT_COLUMNS.find((c) => c.aliases.includes(key))?.field ?? null;
};

export type MappedSheet = {
  /** 머리글이 있는 줄 (1부터) */
  headerRowNo: number;
  /** 읽은 칸 — 파일의 머리글 → 화면 이름 */
  used: Array<{ header: string; label: string }>;
  /** 모르는 머리글 — 무시한다 */
  ignored: string[];
  rows: ItemImportRow[];
};

/**
 * 머리글 줄 찾기(맨 위 10줄 안에서 품목코드 · 품목명 칸이 둘 다 있는 줄) → 칸 맞추기 → 줄 만들기.
 * erpFromCode = ERP 단품코드가 비면 품목코드를 그대로 쓴다 (ERP 에서 내려받은 파일 — 품목코드가 곧 ERP 코드일 때)
 */
export function mapItemSheet(table: SheetTable, erpFromCode: boolean): MappedSheet {
  let headerIndex = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const fields = (table[i] ?? []).map(fieldOf);
    if (fields.includes("code") && fields.includes("name")) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) throw new Error("머리글(품목코드 · 품목명)을 찾지 못했습니다 — 양식의 첫 줄 머리글을 그대로 두세요.");

  const header = table[headerIndex];
  const columns: Array<Field | null> = [];
  const used: MappedSheet["used"] = [];
  const ignored: string[] = [];
  header.forEach((title, col) => {
    const field = fieldOf(title);
    if (field && !columns.includes(field)) {
      columns[col] = field;
      used.push({ header: title.trim(), label: ITEM_IMPORT_COLUMNS.find((c) => c.field === field)!.header });
    } else {
      columns[col] = null;
      if (title.trim()) ignored.push(title.trim());
    }
  });

  const rows: ItemImportRow[] = [];
  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i] ?? [];
    const row: ItemImportRow = { rowNo: i + 1 };
    let any = false;
    columns.forEach((field, col) => {
      const value = (cells[col] ?? "").trim();
      if (field && value) {
        row[field] = value;
        any = true;
      }
    });
    if (!any) continue;   // 빈 줄
    if (erpFromCode && !row.erpItemCode && row.code) row.erpItemCode = row.code;
    rows.push(row);
  }
  return { headerRowNo: headerIndex + 1, used, ignored, rows };
}

/** 양식 내려받기 — CSV(엑셀에서 열림). 예시 두 줄은 가짜 값이다 — 지우고 쓴다 */
export function downloadItemTemplate() {
  downloadCsv(
    "품목_가져오기_양식",
    ITEM_IMPORT_COLUMNS.map((c) => c.header),
    [0, 1].map((n) => ITEM_IMPORT_COLUMNS.map((c) => c.examples[n]))
  );
}

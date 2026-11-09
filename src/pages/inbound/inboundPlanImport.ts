import { downloadCsv } from "../../shared/csv";
import type { SheetTable } from "../../shared/sheetFile";

/* ============================================================
   입고예정 가져오기 — 엑셀 · CSV 의 머리글로 칸을 찾아 서버에 보낼 줄을 만든다.
   한 줄 = 품목 한 줄. 같은 [구분 · 공급사 · 번호 · 받을 창고 · 도착일 · 도착 시간] 줄들이 입고예정 한 건이 된다(서버가 묶는다).
   검사(필수 · 날짜 · 시간 · 숫자 · 겹침)는 서버가 한다 — 여기서는 칸을 맞추고 빈 줄을 뺄 뿐이다.
   머리글은 양식 이름이 아니어도 된다 (아래 aliases — 띄어쓰기 · 괄호 · 대소문자는 보지 않는다).
   ============================================================ */

export type PlanImportRow = {
  rowNo: number;
  type?: string;
  supplier?: string;
  supplierErpCode?: string;
  poNo?: string;
  warehouse?: string;
  expectedDate?: string;
  arrivalTime?: string;
  vehicle?: string;
  palletQty?: string;
  driverPhone?: string;
  remark?: string;
  itemCode?: string;
  qty?: string;
};

type Field = Exclude<keyof PlanImportRow, "rowNo">;
type Column = { field: Field; header: string; aliases: string[]; examples: [string, string] };

/** 양식의 칸 순서 = 이 순서. examples 는 양식에 넣는 가짜 예시 두 줄 (같은 입고예정 한 건의 품목 두 줄) */
export const PLAN_IMPORT_COLUMNS: Column[] = [
  { field: "type", header: "구분", aliases: ["구분", "입고구분", "입고형태", "type"], examples: ["일반", "일반"] },
  { field: "supplier", header: "공급사", aliases: ["공급사", "공급처", "공급사명", "거래처", "거래처명", "업체", "업체명", "supplier"], examples: ["예시상사", "예시상사"] },
  { field: "supplierErpCode", header: "공급사 ERP 코드", aliases: ["공급사erp코드", "erp거래처코드", "거래처코드", "공급사코드"], examples: ["", ""] },
  { field: "poNo", header: "PO 번호", aliases: ["po번호", "po", "pono", "발주번호", "이동번호"], examples: ["PO-0001", "PO-0001"] },
  { field: "warehouse", header: "받을 창고", aliases: ["받을창고", "입고창고", "창고", "warehouse"], examples: ["", ""] },
  { field: "expectedDate", header: "도착일", aliases: ["도착일", "입고예정일", "예정일", "입고일", "도착예정일", "date"], examples: ["2026-11-12", "2026-11-12"] },
  { field: "arrivalTime", header: "도착 시간", aliases: ["도착시간", "입고시간", "도착예정시간", "시간", "time"], examples: ["10:00", "10:00"] },
  { field: "vehicle", header: "차량", aliases: ["차량", "차량톤수", "톤수", "차종"], examples: ["5톤", ""] },
  { field: "palletQty", header: "파레트 수", aliases: ["파레트수", "팔레트수", "파렛트수", "파레트", "pallet"], examples: ["6", ""] },
  { field: "driverPhone", header: "기사 연락처", aliases: ["기사연락처", "기사전화", "기사전화번호", "기사번호"], examples: ["", ""] },
  { field: "remark", header: "메모", aliases: ["메모", "비고", "remark"], examples: ["", ""] },
  { field: "itemCode", header: "품목코드", aliases: ["품목코드", "품번", "sku", "erp단품코드", "단품코드", "itemcode"], examples: ["EX-1001", "EX-1002"] },
  { field: "qty", header: "수량", aliases: ["수량", "입고수량", "예정수량", "qty"], examples: ["120", "60"] }
];

export const PLAN_IMPORT_MAX_ROWS = 2_000;

const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");

const fieldOf = (header: string): Field | null => {
  const key = norm(header);
  if (!key) return null;
  return PLAN_IMPORT_COLUMNS.find((c) => c.aliases.includes(key))?.field ?? null;
};

export type MappedPlanSheet = {
  /** 머리글이 있는 줄 (1부터) */
  headerRowNo: number;
  /** 읽은 칸 — 파일의 머리글 → 화면 이름 */
  used: Array<{ header: string; label: string }>;
  /** 모르는 머리글 — 무시한다 */
  ignored: string[];
  rows: PlanImportRow[];
};

/** 머리글 줄 찾기(맨 위 10줄 안에서 품목코드 · 수량 칸이 둘 다 있는 줄) → 칸 맞추기 → 줄 만들기 (빈 줄은 뺀다) */
export function mapPlanSheet(table: SheetTable): MappedPlanSheet {
  let headerIndex = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const fields = (table[i] ?? []).map(fieldOf);
    if (fields.includes("itemCode") && fields.includes("qty")) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) throw new Error("머리글(품목코드 · 수량)을 찾지 못했습니다 — 양식의 첫 줄 머리글을 그대로 두세요.");

  const header = table[headerIndex];
  const columns: Array<Field | null> = [];
  const used: MappedPlanSheet["used"] = [];
  const ignored: string[] = [];
  header.forEach((title, col) => {
    const field = fieldOf(title);
    if (field && !columns.includes(field)) {
      columns[col] = field;
      used.push({ header: title.trim(), label: PLAN_IMPORT_COLUMNS.find((c) => c.field === field)!.header });
    } else {
      columns[col] = null;
      if (title.trim()) ignored.push(title.trim());
    }
  });

  const rows: PlanImportRow[] = [];
  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i] ?? [];
    const row: PlanImportRow = { rowNo: i + 1 };
    let any = false;
    columns.forEach((field, col) => {
      const value = (cells[col] ?? "").trim();
      if (field && value) {
        row[field] = value;
        any = true;
      }
    });
    if (any) rows.push(row);
  }
  return { headerRowNo: headerIndex + 1, used, ignored, rows };
}

/** 양식 내려받기 — CSV(엑셀에서 열림). 예시 두 줄은 가짜 값이다 — 지우고 쓴다 */
export function downloadPlanTemplate() {
  downloadCsv(
    "입고예정_가져오기_양식",
    PLAN_IMPORT_COLUMNS.map((c) => c.header),
    [0, 1].map((n) => PLAN_IMPORT_COLUMNS.map((c) => c.examples[n]))
  );
}

/* ============================================================
   목(mock) — 출고 사진 (증빙)
   설계: DOCS/WMS_출고사진_설계.md
   · 출고 대상 목록(하루 · 기간 · 번호 검색) + 사진 장수·구분별 장수
   · 사진 업로드는 장별로 성공/실패를 돌려준다 (서버 OutboundPhotoService 와 같은 계약 — JSON 한 장씩, dataUrl)
   · 삭제는 소프트 삭제 — 사유를 남기고 목록에서만 빠진다
   · 출고 확정 다음 날부터는 관리자 · 물류만 사진을 더한다 (서버 규칙과 같다)
   · 증빙 ZIP — 사진 + 사진목록.csv
   ⚠ 목이라 사진은 메모리에만 있다. 새로고침하면 시드 상태로 돌아간다.
     (사내 빌드는 서버가 디스크에 저장하고, 권한 · 위치정보 제거 · 서명 주소 · 보존 기간 정리도 서버가 한다)
   ============================================================ */

import { KIND_LABEL, PHOTO_KINDS, PHOTO_MAX_BYTES, PHOTO_MAX_PER_REQUEST, type PhotoKind } from "../domain/outboundPhoto";
import { addDays } from "../shared/appDate";
import { zipStore, type ZipFile } from "./mockZip";

type AnyRecord = Record<string, any>;

type Photo = {
  id: number;
  outboundId: number;
  outboundNo: string;
  seq: number;
  kind: PhotoKind;
  url: string;
  bytes: number;
  width: number;
  height: number;
  memo: string | null;
  takenBy: string;
  takenAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  deleteReason: string | null;
};

type LogEntry = { refNo: string; action: string; detail: string; operator: string; createdAt: string };

export type OutboundPhotoMockCtx = {
  today: string;
  outbounds: () => AnyRecord[];
  /** 지금 로그인한 역할 · 이름 — 올리기 규칙과 이력에 쓴다 */
  role?: () => string | undefined;
  operator?: () => string;
  /** 이력 한 줄 남기기 (activity_log 재사용) — 출고 이력 화면에 보인다 */
  log?: (entry: LogEntry) => void;
};

const WRITE_ROLES = new Set(["admin", "logistics", "outbound"]);
/** 권한자 — 출고 확정 다음 날 이후에도 사진을 더한다 */
const MANAGER_ROLES = new Set(["admin", "logistics"]);
const RETENTION_DAYS = 730;

/** 목 화면 날짜(MOCK_TODAY) + 실제 시각 — 다른 목 데이터와 날짜가 어긋나지 않게 */
const stampOn = (day: string, time?: string) => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day} ${time ?? `${pad(now.getHours())}:${pad(now.getMinutes())}`}`;
};

/** 시드용 자리 사진 — 회색 판에 출하번호·구분을 적은 SVG (용량이 작아 목에 넣기 좋다) */
const seedImage = (outboundNo: string, kind: PhotoKind, index: number) => {
  const tone = { LOAD: "#3b4a63", PACK: "#455040", LABEL: "#5a4a3a", ETC: "#4a4458" }[kind];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">
    <rect width="480" height="360" fill="${tone}"/>
    <rect x="18" y="18" width="444" height="324" fill="none" stroke="#ffffff33" stroke-width="2"/>
    <text x="240" y="170" fill="#ffffffcc" font-family="sans-serif" font-size="26" text-anchor="middle">${outboundNo}</text>
    <text x="240" y="210" fill="#ffffff88" font-family="sans-serif" font-size="20" text-anchor="middle">${KIND_LABEL[kind]} ${index}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

/**
 * 지난 출고 건 — 기간 조회 · 번호 검색 · "확정 다음 날부터는 권한자만" 을 데모에서 볼 수 있게.
 * 이미 끝난 건이라 출고 목록(공유 배열)에는 넣지 않고 출고 사진에서만 찾는다.
 */
const ARCHIVE_PLAN: Array<{
  daysAgo: number;
  seq: string;
  customerCode: string;
  customerName: string;
  outType: string;
  qty: number;
  carrier: string;
  invoiceNo: string;
  shipAddress: string;
  kinds: PhotoKind[];
  by: string;
  at: string;
}> = [
  { daysAgo: 1, seq: "004", customerCode: "051794", customerName: "대림바스(주)", outType: "A/S 출고(유상)", qty: 8, carrier: "사내차량", invoiceNo: "IC-0616-004", shipAddress: "충북 청주시 흥덕구 가경로 50", kinds: ["LOAD", "LOAD"], by: "한지민", at: "16:20" },
  { daysAgo: 2, seq: "011", customerCode: "771205", customerName: "한울 트레이더스", outType: "도소매출고", qty: 46, carrier: "나루택배", invoiceNo: "NR2606150311", shipAddress: "서울 강남구 테헤란로 152", kinds: [], by: "김현우", at: "14:05" },
  { daysAgo: 5, seq: "003", customerCode: "219475", customerName: "대림 스마트몰", outType: "도소매출고", qty: 28, carrier: "가람택배", invoiceNo: "GR2606120045", shipAddress: "경기 화성시 동탄대로 620", kinds: ["LOAD", "PACK", "LABEL", "LABEL"], by: "김현우", at: "11:30" },
  { daysAgo: 7, seq: "007", customerCode: "132906", customerName: "주식회사 나래유통", outType: "도소매출고", qty: 24, carrier: "한길택배", invoiceNo: "HG2606100412", shipAddress: "경기 부천시 길주로 210", kinds: ["LOAD", "LOAD", "LABEL"], by: "한지민", at: "15:10" }
];

/** data: 주소 → 바이트 + 확장자 (증빙 ZIP) */
const decodeDataUrl = (dataUrl: string) => {
  const [head, body = ""] = dataUrl.split(",");
  const ext = head.includes("svg") ? "svg" : head.includes("png") ? "png" : "jpg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, ext };
};

/** CSV 한 줄 — 서버와 같은 규칙 (감싸기 + 수식으로 읽힐 글자 막기) */
const csvLine = (cells: Array<string | number | null>) =>
  `${cells
    .map((cell) => {
      let text = cell == null ? "" : String(cell);
      if (text && "=+-@".includes(text[0])) text = `'${text}`;
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",")}\r\n`;

export function createOutboundPhotoMock(ctx: OutboundPhotoMockCtx) {
  const photos: Photo[] = [];
  const archive: AnyRecord[] = [];
  let seq = 0;
  let seeded = false;

  const allOutbounds = () => [...ctx.outbounds(), ...archive];
  const outboundOf = (id: number) => allOutbounds().find((row) => Number(row.id) === id);

  const add = (outbound: AnyRecord, kind: PhotoKind, url: string, bytes: number, width: number, height: number, takenBy: string, takenAt: string, memo: string | null = null) => {
    seq += 1;
    const photo: Photo = {
      id: seq,
      outboundId: Number(outbound.id),
      outboundNo: String(outbound.outboundNo),
      // 지운 것까지 세어 순번은 늘기만 한다 (서버와 같다 — 증빙 파일 이름이 겹치지 않게)
      seq: Math.max(0, ...photos.filter((p) => p.outboundId === Number(outbound.id)).map((p) => p.seq)) + 1,
      kind,
      url,
      bytes,
      width,
      height,
      memo,
      takenBy,
      takenAt,
      deletedAt: null,
      deletedBy: null,
      deleteReason: null
    };
    photos.push(photo);
    return photo;
  };

  const kindsText = (kinds: PhotoKind[]) =>
    PHOTO_KINDS.filter((item) => kinds.includes(item.value))
      .map((item) => `${item.label} ${kinds.filter((kind) => kind === item.value).length}`)
      .join(" · ");

  const seedPhotos = (row: AnyRecord, kinds: PhotoKind[], by: string, at: string) => {
    if (!kinds.length) return;
    kinds.forEach((kind, i) => add(row, kind, seedImage(String(row.outboundNo), kind, i + 1), 320 * 1024, 480, 360, by, at));
    ctx.log?.({ refNo: String(row.outboundNo), action: "출고사진", detail: `사진 ${kinds.length}장 업로드 (${kindsText(kinds)})`, operator: by, createdAt: at });
  };

  /** 오늘 출고 건 몇 개와 지난 출고 건에 사진을 미리 넣어 둔다 — 찍은 건/안 찍은 건이 섞여 보이게 */
  const seed = () => {
    if (seeded) return;
    const todayRows = ctx.outbounds().filter((row) => row.scheduledDate === ctx.today && row.status !== "거부");
    if (!todayRows.length) return;
    seeded = true;

    [...ARCHIVE_PLAN].reverse().forEach((plan, index) => {
      const day = addDays(ctx.today, -plan.daysAgo);
      const row = {
        id: 9001 + index,
        outboundNo: `DN${day.replace(/-/g, "")}${plan.seq}`,
        scheduledDate: day,
        confirmedDate: day,
        customerCode: plan.customerCode,
        customerName: plan.customerName,
        outType: plan.outType,
        qty: plan.qty,
        carrier: plan.carrier,
        shipAddress: plan.shipAddress,
        invoiceNo: plan.invoiceNo,
        status: "출고완료",
        rejectReason: null
      };
      archive.push(row);
      seedPhotos(row, plan.kinds, plan.by, stampOn(day, plan.at));
    });

    const plans: Array<{ index: number; kinds: PhotoKind[]; by: string; at: string }> = [
      { index: 0, kinds: ["LOAD", "LOAD", "LOAD", "LABEL"], by: "김현우", at: "09:20" },
      { index: 1, kinds: ["LOAD", "LOAD", "PACK"], by: "한지민", at: "10:05" },
      { index: 2, kinds: ["LOAD", "LABEL"], by: "김현우", at: "11:40" }
    ];
    plans.forEach((plan) => {
      const row = todayRows[plan.index];
      if (row) seedPhotos(row, plan.kinds, plan.by, stampOn(ctx.today, plan.at));
    });
  };

  const livePhotos = (outboundId: number) => photos.filter((p) => p.outboundId === outboundId && !p.deletedAt).sort((a, b) => a.id - b.id);

  const kindCounts = (outboundId: number) => {
    const counts: Record<string, number> = {};
    livePhotos(outboundId).forEach((p) => {
      counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    });
    return counts;
  };

  /** 출고 확정한 날 — 확정 전이면 null. 목에는 확정 시각이 없어 확정 때 찍어 둔 날짜나 출고예정일로 본다 */
  const confirmedDateOf = (row: AnyRecord): string | null => {
    if (row.status !== "출고완료") return null;
    if (row.confirmedDate) return String(row.confirmedDate);
    return String(row.scheduledDate) < ctx.today ? String(row.scheduledDate) : ctx.today;
  };

  /** 이 출고 건에 지금 사진을 올리지 못하는 사유 — 올릴 수 있으면 null (서버 OutboundPhotoService 와 같은 규칙) */
  const uploadBlock = (row: AnyRecord): string | null => {
    const role = ctx.role?.() ?? "admin";
    if (!WRITE_ROLES.has(role)) return "사진은 관리자 · 물류 · 출고 담당자가 올립니다.";
    if (row.status === "거부") return "거부된 출고 건에는 사진을 올리지 않습니다.";
    const confirmed = confirmedDateOf(row);
    if (confirmed && confirmed < ctx.today && !MANAGER_ROLES.has(role)) {
      return `출고 확정(${confirmed}) 다음 날부터는 관리자 · 물류 담당자만 사진을 추가할 수 있습니다.`;
    }
    return null;
  };

  /**
   * 출고 대상 — 조회 범위는 셋 중 하나 (서버와 같다).
   * from·to = 기간 / date = 그날 / 둘 다 없고 검색어만 = 날짜를 가리지 않는 번호 검색. 아무것도 없으면 오늘.
   * 거부된 건은 나가지 않으니 뺀다.
   */
  const targets = (params: URLSearchParams) => {
    seed();
    const keyword = (params.get("q") ?? "").trim().toLowerCase();
    const onlyMissing = params.get("onlyMissing") === "true";
    const from = params.get("from");
    const to = params.get("to");
    const date = params.get("date");

    let scope: "day" | "range" | "all";
    let start: string | null;
    let end: string | null;
    if (from || to) {
      if (!from || !to) throw new Error("기간의 시작일과 종료일을 모두 넣으세요.");
      if (from > to) throw new Error("시작일이 종료일보다 늦습니다.");
      scope = "range";
      start = from;
      end = to;
    } else if (date) {
      scope = "day";
      start = date;
      end = date;
    } else if (keyword) {
      if (keyword.length < 2) throw new Error("검색어를 두 글자 이상 넣으세요.");
      scope = "all";
      start = null;
      end = null;
    } else {
      scope = "day";
      start = ctx.today;
      end = ctx.today;
    }

    const matched = allOutbounds()
      .filter((row) => row.status !== "거부")
      .filter((row) => start == null || end == null || (String(row.scheduledDate) >= start && String(row.scheduledDate) <= end))
      .filter(
        (row) =>
          !keyword ||
          [row.outboundNo, row.invoiceNo, row.carrier, row.customerName].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword))
      )
      .map((row) => {
        const list = livePhotos(Number(row.id));
        const last = list[list.length - 1];
        return {
          id: Number(row.id),
          outboundNo: String(row.outboundNo),
          customerCode: row.customerCode ?? null,
          customerName: row.customerName ?? "-",
          outType: row.outType ?? "-",
          carrier: row.carrier ?? null,
          invoiceNo: row.invoiceNo ?? null,
          qty: Number(row.qty) || 0,
          status: row.status,
          scheduledDate: String(row.scheduledDate),
          photoCount: list.length,
          kinds: kindCounts(Number(row.id)),
          lastTakenAt: last?.takenAt ?? null,
          lastTakenBy: last?.takenBy ?? null
        };
      });

    const byNo = (a: { outboundNo: string }, b: { outboundNo: string }) => a.outboundNo.localeCompare(b.outboundNo);
    const rows = matched
      .filter((row) => !onlyMissing || row.photoCount === 0)
      // 하루 보기는 안 찍은 건이 위로, 기간 · 검색은 최근 날짜부터
      .sort((a, b) => (scope === "day" ? a.photoCount - b.photoCount || byNo(a, b) : b.scheduledDate.localeCompare(a.scheduledDate) || byNo(a, b)));

    return {
      scope,
      date: scope === "day" ? start : null,
      from: scope === "range" ? start : null,
      to: scope === "range" ? end : null,
      total: matched.length,
      missing: matched.filter((row) => row.photoCount === 0).length,
      truncated: false,
      rows
    };
  };

  const detail = (outboundId: number) => {
    seed();
    const row = outboundOf(outboundId);
    if (!row) return { outbound: null, photos: [], canUpload: false, uploadNote: null };
    const blocked = uploadBlock(row);
    return {
      outbound: {
        id: Number(row.id),
        outboundNo: row.outboundNo,
        customerName: row.customerName ?? "-",
        customerCode: row.customerCode ?? null,
        outType: row.outType ?? "-",
        carrier: row.carrier ?? null,
        invoiceNo: row.invoiceNo ?? null,
        qty: Number(row.qty) || 0,
        status: row.status,
        scheduledDate: row.scheduledDate,
        shipAddress: row.shipAddress ?? null,
        confirmedDate: confirmedDateOf(row)
      },
      photos: livePhotos(outboundId),
      canUpload: blocked === null,
      uploadNote: blocked
    };
  };

  /** 업로드 — 장별 성공/실패. 서버와 같은 계약(JSON 한 장씩, dataUrl) */
  const upload = (outboundId: number, body: AnyRecord) => {
    const row = outboundOf(outboundId);
    if (!row) return { saved: [], failed: [{ name: "-", message: "출고 건을 찾을 수 없습니다." }] };
    const blocked = uploadBlock(row);
    if (blocked) throw new Error(blocked);
    const operator = String(body.operator ?? "system");
    const incoming: AnyRecord[] = Array.isArray(body.photos) ? body.photos : [];
    const saved: Photo[] = [];
    const failed: Array<{ name: string; message: string }> = [];

    incoming.slice(0, PHOTO_MAX_PER_REQUEST).forEach((item, index) => {
      const name = String(item.name ?? `사진 ${index + 1}`);
      const bytes = Number(item.bytes) || 0;
      const url = String(item.dataUrl ?? "");
      if (!url.startsWith("data:image/")) {
        failed.push({ name, message: "이미지 파일이 아닙니다." });
        return;
      }
      if (bytes > PHOTO_MAX_BYTES) {
        failed.push({ name, message: `한 장에 ${Math.round(PHOTO_MAX_BYTES / 1024 / 1024)}MB 까지 올릴 수 있습니다.` });
        return;
      }
      if (livePhotos(outboundId).some((p) => p.url === url)) {
        failed.push({ name, message: "같은 사진이 이미 있습니다." });
        return;
      }
      const kind = (PHOTO_KINDS.some((k) => k.value === item.kind) ? item.kind : "LOAD") as PhotoKind;
      saved.push(add(row, kind, url, bytes, Number(item.width) || 0, Number(item.height) || 0, operator, stampOn(ctx.today), item.memo ? String(item.memo) : null));
    });

    if (incoming.length > PHOTO_MAX_PER_REQUEST) {
      incoming.slice(PHOTO_MAX_PER_REQUEST).forEach((item, index) => {
        failed.push({ name: String(item.name ?? `사진 ${PHOTO_MAX_PER_REQUEST + index + 1}`), message: `한 번에 ${PHOTO_MAX_PER_REQUEST}장까지 올릴 수 있습니다.` });
      });
    }

    if (saved.length) {
      ctx.log?.({
        refNo: String(row.outboundNo),
        action: "출고사진",
        detail: `사진 ${saved.length}장 업로드 (${kindsText(saved.map((photo) => photo.kind))})`,
        operator,
        createdAt: stampOn(ctx.today)
      });
    }
    return { saved, failed, photoCount: livePhotos(outboundId).length };
  };

  const patch = (outboundId: number, photoId: number, body: AnyRecord) => {
    const photo = photos.find((p) => p.id === photoId && p.outboundId === outboundId && !p.deletedAt);
    if (!photo) return { ok: false, message: "사진을 찾을 수 없습니다." };
    if (body.kind && PHOTO_KINDS.some((k) => k.value === body.kind)) photo.kind = body.kind as PhotoKind;
    if (body.memo !== undefined) photo.memo = body.memo ? String(body.memo).slice(0, 200) : null;
    return { ok: true, photo };
  };

  /** 소프트 삭제 — 증빙이라 실제로 지우지 않고 사유를 남긴다 */
  const remove = (outboundId: number, photoId: number, reason: string, operator: string) => {
    const photo = photos.find((p) => p.id === photoId && p.outboundId === outboundId && !p.deletedAt);
    if (!photo) return { ok: false, message: "사진을 찾을 수 없습니다." };
    if (!reason.trim()) return { ok: false, message: "삭제 사유를 입력하세요." };
    photo.deletedAt = stampOn(ctx.today);
    photo.deletedBy = operator;
    photo.deleteReason = reason.trim();
    ctx.log?.({ refNo: photo.outboundNo, action: "출고사진 삭제", detail: `${KIND_LABEL[photo.kind]} 사진 1장 · 사유: ${reason.trim()}`, operator, createdAt: stampOn(ctx.today) });
    return { ok: true, photoCount: livePhotos(outboundId).length };
  };

  /** 증빙 ZIP — 살아 있는 사진 전부 + 사진목록.csv. 파일 이름 = 출하번호_구분_순번_촬영시각 */
  const zip = (outboundId: number) => {
    seed();
    const row = outboundOf(outboundId);
    if (!row) throw new Error("출고 건을 찾을 수 없습니다.");
    const list = livePhotos(outboundId);
    if (!list.length) throw new Error("내려받을 사진이 없습니다.");

    const files: ZipFile[] = [];
    let manifest = String.fromCharCode(0xfeff) + csvLine(["파일", "구분", "순번", "서버 수신 시각", "올린 사람", "메모", "크기(KB)"]);
    list.forEach((photo) => {
      const { bytes, ext } = decodeDataUrl(photo.url);
      const stamp = photo.takenAt.replace(/[-:]/g, "").replace(" ", "-");
      const name = `${row.outboundNo}_${KIND_LABEL[photo.kind]}_${photo.seq}_${stamp}.${ext}`;
      files.push({ name, data: bytes });
      manifest += csvLine([name, KIND_LABEL[photo.kind], photo.seq, photo.takenAt, photo.takenBy, photo.memo, Math.max(1, Math.round(photo.bytes / 1024))]);
    });
    files.push({ name: "사진목록.csv", data: new TextEncoder().encode(manifest) });
    ctx.log?.({
      refNo: String(row.outboundNo),
      action: "출고사진 내려받기",
      detail: `증빙 ZIP · 사진 ${list.length}장`,
      operator: ctx.operator?.() ?? "system",
      createdAt: stampOn(ctx.today)
    });
    return zipStore(files);
  };

  /** 저장 현황 — 데모에는 서버 디스크가 없어 남은 용량은 모름(null). 장수 · 용량은 목 사진으로 센다 */
  const storage = () => {
    seed();
    return {
      totalBytes: null,
      freeBytes: null,
      freePercent: null,
      low: false,
      lowPercent: 10,
      photoCount: photos.length,
      photoBytes: photos.reduce((sum, photo) => sum + photo.bytes, 0),
      oldestTakenAt: photos.length ? photos.map((photo) => photo.takenAt.slice(0, 10)).sort()[0] : null,
      retentionDays: RETENTION_DAYS
    };
  };

  const photoPath = (clean: string) => clean.match(/^\/outbounds\/(\d+)\/photos(?:\/(\d+))?$/);

  return {
    /** 시드를 만든다(처음 한 번) — 사진 시드가 남기는 이력까지 필요할 때 먼저 부른다 */
    ready: seed,
    /** 출고 건의 사진 장수 — /outbounds 목록의 photoCount (출고 확정 "사진 없음" 경고) */
    count: (outboundId: number) => {
      seed();
      return livePhotos(outboundId).length;
    },
    /** 출하번호로 사진 장수 — 출고 이력 · 배송 내역서의 "사진 n장" (이력은 출하번호만 안다) */
    countByNo: (outboundNo: string) => {
      seed();
      return photos.filter((p) => p.outboundNo === outboundNo && !p.deletedAt).length;
    },
    /** GET — 처리하지 않는 경로면 undefined */
    get: (clean: string, params: URLSearchParams): unknown => {
      if (clean === "/outbounds/photo-targets") return targets(params);
      if (clean === "/outbounds/photo-storage") return storage();
      const match = photoPath(clean);
      if (match && !match[2]) return detail(Number(match[1]));
      return undefined;
    },
    /** 파일 내려받기 — 처리하지 않는 경로면 undefined */
    download: (clean: string): Blob | undefined => {
      const match = clean.match(/^\/outbounds\/(\d+)\/photos\/zip$/);
      return match ? zip(Number(match[1])) : undefined;
    },
    mutate: (method: string, clean: string, body: AnyRecord, params: URLSearchParams): unknown => {
      const match = photoPath(clean);
      if (!match) return undefined;
      const outboundId = Number(match[1]);
      const photoId = match[2] ? Number(match[2]) : null;
      if (method === "POST" && photoId === null) return upload(outboundId, body);
      if (method === "PUT" && photoId !== null) return patch(outboundId, photoId, body);
      if (method === "DELETE" && photoId !== null) {
        return remove(outboundId, photoId, params.get("reason") ?? "", params.get("operator") ?? "system");
      }
      return undefined;
    }
  };
}

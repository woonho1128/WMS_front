/* ============================================================
   목(mock) — 출고 사진 (증빙)
   설계: DOCS/WMS_출고사진_설계.md
   · 그날 출고 대상(예정일 = 그날) 목록 + 사진 장수·구분별 장수
   · 사진 업로드는 장별로 성공/실패를 돌려준다 (서버 OutboundPhotoService 와 같은 계약 — JSON 한 장씩, dataUrl)
   · 삭제는 소프트 삭제 — 사유를 남기고 목록에서만 빠진다
   ⚠ 목이라 사진은 메모리에만 있다. 새로고침하면 시드 상태로 돌아간다.
     (사내 빌드는 서버가 디스크에 저장하고, 권한 · 위치정보 제거 · 서명 주소도 서버가 한다)
   ============================================================ */

import { KIND_LABEL, PHOTO_KINDS, PHOTO_MAX_BYTES, PHOTO_MAX_PER_REQUEST, type PhotoKind } from "../domain/outboundPhoto";

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

export type OutboundPhotoMockCtx = {
  today: string;
  outbounds: () => AnyRecord[];
  /** 이력 한 줄 남기기 (activity_log 재사용) */
  log?: (entry: { refNo: string; action: string; detail: string; operator: string }) => void;
};

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

export function createOutboundPhotoMock(ctx: OutboundPhotoMockCtx) {
  const photos: Photo[] = [];
  let seq = 0;
  let seeded = false;

  const outboundOf = (id: number) => ctx.outbounds().find((row) => Number(row.id) === id);

  const add = (outbound: AnyRecord, kind: PhotoKind, url: string, bytes: number, width: number, height: number, takenBy: string, takenAt: string, memo: string | null = null) => {
    seq += 1;
    const photo: Photo = {
      id: seq,
      outboundId: Number(outbound.id),
      outboundNo: String(outbound.outboundNo),
      seq: photos.filter((p) => p.outboundId === Number(outbound.id) && !p.deletedAt).length + 1,
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

  /** 오늘 출고 건 몇 개에 사진을 미리 넣어 둔다 — 찍은 건/안 찍은 건이 섞여 보이게 */
  const seed = () => {
    if (seeded) return;
    const todayRows = ctx.outbounds().filter((row) => row.scheduledDate === ctx.today && row.status !== "거부");
    if (!todayRows.length) return;
    seeded = true;
    const plans: Array<{ index: number; kinds: PhotoKind[]; by: string; at: string }> = [
      { index: 0, kinds: ["LOAD", "LOAD", "LOAD", "LABEL"], by: "김현우", at: "09:20" },
      { index: 1, kinds: ["LOAD", "LOAD", "PACK"], by: "한지민", at: "10:05" },
      { index: 2, kinds: ["LOAD", "LABEL"], by: "김현우", at: "11:40" }
    ];
    plans.forEach((plan) => {
      const row = todayRows[plan.index];
      if (!row) return;
      plan.kinds.forEach((kind, i) => {
        const image = seedImage(String(row.outboundNo), kind, i + 1);
        add(row, kind, image, 320 * 1024, 480, 360, plan.by, stampOn(ctx.today, plan.at));
      });
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

  /** 그날 출고 대상 — 그날 출고예정 건. 거부된 건은 나가지 않으니 뺀다 */
  const isTarget = (row: AnyRecord, date: string) => row.scheduledDate === date && row.status !== "거부";

  const targets = (date: string, query: string, onlyMissing: boolean) => {
    seed();
    const keyword = query.trim().toLowerCase();
    const rows = ctx
      .outbounds()
      .filter((row) => isTarget(row, date))
      .map((row) => {
        const list = livePhotos(Number(row.id));
        const last = list[list.length - 1];
        return {
          id: Number(row.id),
          outboundNo: row.outboundNo,
          customerCode: row.customerCode ?? null,
          customerName: row.customerName ?? "-",
          outType: row.outType ?? "-",
          carrier: row.carrier ?? null,
          invoiceNo: row.invoiceNo ?? null,
          qty: Number(row.qty) || 0,
          status: row.status,
          scheduledDate: row.scheduledDate,
          photoCount: list.length,
          kinds: kindCounts(Number(row.id)),
          lastTakenAt: last?.takenAt ?? null,
          lastTakenBy: last?.takenBy ?? null
        };
      })
      .filter((row) => {
        if (onlyMissing && row.photoCount > 0) return false;
        if (!keyword) return true;
        return [row.outboundNo, row.customerName, row.invoiceNo, row.carrier]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      })
      .sort((a, b) => (a.photoCount === b.photoCount ? String(a.outboundNo).localeCompare(String(b.outboundNo)) : a.photoCount - b.photoCount));

    const all = ctx.outbounds().filter((row) => isTarget(row, date));
    return {
      date,
      total: all.length,
      missing: all.filter((row) => livePhotos(Number(row.id)).length === 0).length,
      rows
    };
  };

  const detail = (outboundId: number) => {
    seed();
    const row = outboundOf(outboundId);
    if (!row) return { outbound: null, photos: [] };
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
        shipAddress: row.shipAddress ?? null
      },
      photos: livePhotos(outboundId)
    };
  };

  /** 업로드 — 장별 성공/실패. 실서버는 multipart, 목은 dataUrl 로 받는다 */
  const upload = (outboundId: number, body: AnyRecord) => {
    const row = outboundOf(outboundId);
    if (!row) return { saved: [], failed: [{ name: "-", message: "출고 건을 찾을 수 없습니다." }] };
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
      ctx.log?.({ refNo: String(row.outboundNo), action: "출고사진", detail: `사진 ${saved.length}장 업로드`, operator });
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
    ctx.log?.({ refNo: photo.outboundNo, action: "출고사진 삭제", detail: `${KIND_LABEL[photo.kind]} 사진 1장 · 사유: ${reason.trim()}`, operator });
    return { ok: true, photoCount: livePhotos(outboundId).length };
  };

  const photoPath = (clean: string) => clean.match(/^\/outbounds\/(\d+)\/photos(?:\/(\d+))?$/);

  return {
    /** 출고 건의 사진 장수 — /outbounds 목록의 photoCount (출고 확정 "사진 없음" 경고) */
    count: (outboundId: number) => {
      seed();
      return livePhotos(outboundId).length;
    },
    /** GET — 처리하지 않는 경로면 undefined */
    get: (clean: string, params: URLSearchParams): unknown => {
      if (clean === "/outbounds/photo-targets") {
        return targets(params.get("date") ?? ctx.today, params.get("q") ?? "", params.get("onlyMissing") === "true");
      }
      const match = photoPath(clean);
      if (match && !match[2]) return detail(Number(match[1]));
      return undefined;
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

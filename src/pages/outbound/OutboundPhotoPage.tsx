import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuthStore } from "../../app/store/authStore";
import { useAccess, useCan } from "../../app/access";
import { apiDelete, apiDownload, apiGet, apiPost, apiPut } from "../../services/http";
import { apiUrl } from "../../services/apiMode";
import { addDays, shiftDays, todayStr, weekdayKo } from "../../shared/appDate";
import { saveBlob } from "../../shared/download";
import { KIND_LABEL, PHOTO_KINDS, PHOTO_MAX_PER_REQUEST, type PhotoKind } from "../../domain/outboundPhoto";
import "./OutboundPhotoPage.css";

/* ============================================================
   출고 사진 — 출고 건에 상차·포장·송장 사진을 남긴다 (증빙)
   설계: DOCS/WMS_출고사진_설계.md · 2026-09-22 현업 회의 8번 "출고 검수(사진 → 서버)"
   · 폰 기준: 목록 → 오더 → [사진 찍기] 연속 촬영 / [앨범에서] 여러 장
   · iOS 는 capture 와 multiple 을 같이 주면 한 장만 되므로 입력을 둘로 나눈다
   · 올리기 전 긴 변 1600px · JPEG 0.72 로 줄인다 (장당 200~400KB)
   · 목록은 하루 / 기간, 검색창에서 Enter 를 누르면 날짜를 가리지 않고 번호로 찾는다 (지난 건 증빙 확인)
     다른 화면의 "사진 n장" 은 ?no=출하번호 로 들어와 그 건을 바로 연다
   · 사내 빌드: 서버가 디스크에 저장(위치정보 제거 · 썸네일), 사진은 서명 주소(30분)로 내려온다.
     데모 빌드: 목이라 브라우저 메모리에만 — 새로고침하면 시드 상태로 돌아간다.
   ============================================================ */

const MAX_EDGE = 1600;
const QUALITY = 0.72;
/** 기간 조회 빠른 선택 (오늘 포함 n일) */
const RANGE_PRESETS = [7, 30, 90];

type Scope = "day" | "range";

type TargetRow = {
  id: number;
  outboundNo: string;
  customerCode: string | null;
  customerName: string;
  outType: string;
  carrier: string | null;
  invoiceNo: string | null;
  qty: number;
  status: string;
  scheduledDate: string | null;
  photoCount: number;
  kinds: Record<string, number>;
  lastTakenAt: string | null;
  lastTakenBy: string | null;
};

type TargetList = {
  /** day 하루 · range 기간 · all 번호 검색(날짜를 가리지 않는다) */
  scope: "day" | "range" | "all";
  date: string | null;
  from: string | null;
  to: string | null;
  /** 조건에 맞는 전체 건수 · 그중 미촬영 ("미촬영만" 은 빼고 센다) */
  total: number;
  missing: number;
  /** 한도를 넘어 일부만 내려왔다 */
  truncated: boolean;
  rows: TargetRow[];
};

type Photo = {
  id: number;
  outboundId: number;
  seq: number;
  kind: PhotoKind;
  /** 원본(줄인 사진) — 서버면 API 기준 서명 경로, 목이면 data: 주소. 화면에 쓸 때 apiUrl() */
  url: string;
  /** 목록 그리드용 썸네일 (서버만 — 없으면 url) */
  thumbUrl?: string | null;
  bytes: number;
  width: number;
  height: number;
  memo: string | null;
  takenBy: string;
  takenAt: string;
};

type Detail = {
  outbound: {
    id: number;
    outboundNo: string;
    customerName: string;
    outType: string;
    carrier: string | null;
    invoiceNo: string | null;
    qty: number;
    status: string;
    scheduledDate: string | null;
    shipAddress: string | null;
    /** 출고 확정한 날 — 다음 날부터는 관리자 · 물류만 사진을 더한다 */
    confirmedDate: string | null;
  } | null;
  photos: Photo[];
  /** false 면 uploadNote 에 사유 — 촬영 버튼 대신 보여 준다 (서버가 역할 · 확정일로 판단) */
  canUpload?: boolean;
  uploadNote?: string | null;
};

/** 저장 현황 — 디스크 용량을 읽지 못하면 freePercent 는 null(모름) */
type StorageStatus = {
  freePercent: number | null;
  low: boolean;
  lowPercent: number;
  photoCount: number;
  photoBytes: number;
  retentionDays: number;
};

type QueueItem = {
  key: string;
  name: string;
  file: File;
  kind: PhotoKind;
  status: "wait" | "prepare" | "upload" | "failed";
  preview?: string;
  message?: string;
};

const STATUS_TONE: Record<string, "gray" | "info" | "success" | "warning"> = {
  출고대기: "gray",
  피킹중: "info",
  피킹완료: "warning",
  출고완료: "success"
};

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const kb = (bytes: number) =>
  bytes >= GB ? `${(bytes / GB).toFixed(1)}GB` : bytes >= MB ? `${(bytes / MB).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

const dayText = (ymd: string) => `${ymd} (${weekdayKo(ymd)})`;
const keepText = (days: number) => (days % 365 === 0 ? `${days / 365}년` : `${days}일`);

/** 파일 → 줄인 JPEG dataUrl. EXIF 방향은 브라우저가 맞춰 준다(imageOrientation) */
const shrink = async (file: File) => {
  let width = 0;
  let height = 0;
  let source: CanvasImageSource;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    width = bitmap.width;
    height = bitmap.height;
    source = bitmap;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("사진을 읽을 수 없습니다."));
        el.src = url;
      });
      width = image.naturalWidth;
      height = image.naturalHeight;
      source = image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!width || !height) throw new Error("사진을 읽을 수 없습니다.");
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("사진을 줄일 수 없습니다.");
  ctx.drawImage(source, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  const bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
  return { dataUrl, width: w, height: h, bytes };
};

export const OutboundPhotoPage = () => {
  const operator = useAuthStore((state) => state.user?.name ?? state.user?.id ?? "system");
  // 화면에 무엇을 보일지만 정한다 — 올리기 · 지우기 권한은 서버가 로그인한 계정의 기능으로 판단한다
  // (권한이 바뀌면 access 가 새로 와서 올리기 가능 여부를 다시 받는다)
  const access = useAccess();
  const canManage = useCan("outbound/outbound-photo:manage");
  const [searchParams, setSearchParams] = useSearchParams();
  /** 다른 화면의 "사진 n장" 으로 들어온 출하번호 */
  const linkedNo = searchParams.get("no");

  const [scope, setScope] = useState<Scope>("day");
  const [date, setDate] = useState(todayStr());
  const [from, setFrom] = useState(() => shiftDays(-6));
  const [to, setTo] = useState(() => todayStr());
  const [query, setQuery] = useState(linkedNo ?? "");
  /** 번호 검색 중이면 그 검색어 — 날짜를 가리지 않고 서버에서 찾는다 */
  const [search, setSearch] = useState<string | null>(linkedNo);
  /** 링크로 들어온 출고 건 — 검색 결과가 오면 바로 연다 */
  const [openNo, setOpenNo] = useState<string | null>(linkedNo);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [list, setList] = useState<TargetList | null>(null);
  /** 지금 목록이 어느 조건의 응답인지 — 조건을 바꾼 직후에는 아직 예전 목록이다 */
  const [listKey, setListKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [kind, setKind] = useState<PhotoKind>("LOAD");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [removing, setRemoving] = useState<Photo | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [zipping, setZipping] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  /** 조건을 빠르게 바꿀 때 늦게 온 예전 응답이 목록을 덮지 않게 */
  const listSeq = useRef(0);

  const listQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    else if (scope === "range") {
      qs.set("from", from);
      qs.set("to", to);
    } else qs.set("date", date);
    if (onlyMissing) qs.set("onlyMissing", "true");
    return qs.toString();
  }, [date, from, onlyMissing, scope, search, to]);

  const loadList = useCallback(async () => {
    const seq = (listSeq.current += 1);
    try {
      const res = await apiGet<TargetList>(`/outbounds/photo-targets?${listQuery}`);
      if (seq !== listSeq.current) return;
      setList(res);
      setListKey(listQuery);
      setError(null);
    } catch (e) {
      if (seq !== listSeq.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }, [listQuery]);

  const loadDetail = useCallback(async (id: number) => {
    const res = await apiGet<Detail>(`/outbounds/${id}/photos`);
    setDetail(res);
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selected == null) {
      setDetail(null);
      return;
    }
    void loadDetail(selected);
    // 역할이 바뀌면 올릴 수 있는지도 다시 묻는다 (데모의 역할 선택)
  }, [selected, loadDetail, access]);

  // 저장 현황 — 부가 정보라 못 받아도 화면은 그대로 쓴다 (경고 · 보관 장수만 안 보인다)
  useEffect(() => {
    apiGet<StorageStatus>("/outbounds/photo-storage")
      .then(setStorage)
      .catch(() => setStorage(null));
  }, []);

  // 화면이 떠 있는 채로 다른 "사진 n장" 링크를 또 누른 경우
  useEffect(() => {
    if (!linkedNo) return;
    setQuery(linkedNo);
    setSearch(linkedNo);
    setOpenNo(linkedNo);
    setOnlyMissing(false);
  }, [linkedNo]);

  // 그 번호의 검색 결과가 온 뒤에 연다 (예전 목록에서 찾다가 "없다"고 하지 않게)
  useEffect(() => {
    if (!openNo || !list || search !== openNo || listKey !== listQuery) return;
    const hit = list.rows.find((row) => row.outboundNo === openNo);
    if (hit) setSelected(hit.id);
    else setNotice(`${openNo} — 출고 건을 찾지 못했습니다.`);
    setOpenNo(null);
  }, [list, listKey, listQuery, openNo, search]);

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const all = list?.rows ?? [];
    if (!keyword) return all;
    return all.filter((row) =>
      [row.outboundNo, row.customerName, row.invoiceNo, row.carrier]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    );
  }, [list, query]);

  const groups = useMemo(() => {
    const photos = detail?.photos ?? [];
    return PHOTO_KINDS.map((item) => ({ ...item, photos: photos.filter((photo) => photo.kind === item.value) })).filter((group) => group.photos.length > 0);
  }, [detail]);

  /* ---------- 번호 검색 (날짜를 가리지 않는다) ---------- */
  const clearSearch = useCallback(() => {
    setSearch(null);
    setQuery("");
    setOpenNo(null);
    // 링크로 들어왔으면 주소의 ?no= 도 지운다 — 새로고침하면 다시 검색으로 돌아오지 않게
    if (linkedNo) setSearchParams({}, { replace: true });
  }, [linkedNo, setSearchParams]);

  const submitSearch = () => {
    const text = query.trim();
    if (!text) {
      if (search) clearSearch();
      return;
    }
    if (text.length < 2) {
      setNotice("검색어를 두 글자 이상 넣으세요.");
      return;
    }
    setLoading(true);
    setSearch(text);
  };

  const setRangeDays = (days: number) => {
    setTo(todayStr());
    setFrom(shiftDays(-(days - 1)));
  };

  /* ---------- 업로드 ---------- */
  const send = useCallback(
    async (item: QueueItem) => {
      if (selected == null) return;
      setQueue((prev) => prev.map((x) => (x.key === item.key ? { ...x, status: "prepare", message: undefined } : x)));
      try {
        const image = await shrink(item.file);
        setQueue((prev) => prev.map((x) => (x.key === item.key ? { ...x, status: "upload", preview: image.dataUrl } : x)));
        const res = await apiPost<{ saved: Photo[]; failed: Array<{ name: string; message: string }> }>(`/outbounds/${selected}/photos`, {
          photos: [{ name: item.name, kind: item.kind, ...image }],
          operator
        });
        if (res.failed?.length) throw new Error(res.failed[0].message);
        setQueue((prev) => prev.filter((x) => x.key !== item.key));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setQueue((prev) => prev.map((x) => (x.key === item.key ? { ...x, status: "failed", message } : x)));
      }
    },
    [operator, selected]
  );

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || selected == null) return;
      const picked = [...files];
      const over = picked.length > PHOTO_MAX_PER_REQUEST;
      const items: QueueItem[] = picked.slice(0, PHOTO_MAX_PER_REQUEST).map((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        name: file.name || `사진 ${index + 1}`,
        file,
        kind,
        status: "wait"
      }));
      setQueue((prev) => [...prev, ...items]);
      if (over) setNotice(`한 번에 ${PHOTO_MAX_PER_REQUEST}장까지 올립니다 — 나머지는 다시 골라 주세요.`);
      for (const item of items) {
        await send(item);
      }
      await Promise.all([loadDetail(selected), loadList()]);
    },
    [kind, loadDetail, loadList, selected, send]
  );

  const retry = useCallback(
    async (item: QueueItem) => {
      await send(item);
      if (selected != null) await Promise.all([loadDetail(selected), loadList()]);
    },
    [loadDetail, loadList, selected, send]
  );

  /* ---------- 사진 편집 ---------- */
  const saveViewer = async (next: { kind?: PhotoKind; memo?: string }) => {
    if (!viewer || selected == null) return;
    await apiPut(`/outbounds/${selected}/photos/${viewer.id}`, next);
    await loadDetail(selected);
    await loadList();
    setViewer((prev) => (prev ? { ...prev, ...next } as Photo : prev));
  };

  const confirmRemove = async () => {
    if (!removing || selected == null) return;
    if (!reason.trim()) {
      setNotice("삭제 사유를 입력하세요.");
      return;
    }
    try {
      await apiDelete(`/outbounds/${selected}/photos/${removing.id}?reason=${encodeURIComponent(reason.trim())}&operator=${encodeURIComponent(operator)}`);
      setNotice("사진을 삭제했습니다 — 사유와 함께 이력에 남습니다.");
    } catch (e) {
      // 출고 담당자는 오늘 본인이 올린 것만 지울 수 있다 — 서버가 준 사유를 그대로 보여 준다
      setNotice(e instanceof Error ? e.message : String(e));
    }
    setRemoving(null);
    setViewer(null);
    setReason("");
    await Promise.all([loadDetail(selected), loadList()]);
  };

  /* ---------- 증빙 내려받기 ---------- */
  const downloadZip = async () => {
    const outbound = detail?.outbound;
    if (!outbound || zipping) return;
    setZipping(true);
    try {
      const blob = await apiDownload(`/outbounds/${outbound.id}/photos/zip`);
      saveBlob(blob, `출고사진_${outbound.outboundNo}.zip`);
      setNotice(`${outbound.outboundNo} 증빙을 내려받았습니다 — 내려받은 기록이 이력에 남습니다.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setZipping(false);
    }
  };

  const current = detail?.outbound ?? null;
  const photos = detail?.photos ?? [];
  const lastPhoto = photos[photos.length - 1] ?? null;
  const canUpload = detail?.canUpload !== false;
  const failedCount = queue.filter((item) => item.status === "failed").length;
  const workingCount = queue.filter((item) => item.status !== "failed").length;
  // 저장 현황은 '지난 날 · 남의 사진 고치기' 가 있는 사람(처음 값: 관리자 · 물류팀)에게만
  const isManager = canManage;

  const listTitle = search ? "출고 사진 · 번호 검색" : scope === "range" ? `출고 사진 · ${from} ~ ${to}` : `출고 사진 · ${dayText(date)}`;
  // 날짜를 한 줄씩 끼워 보여 줄지 — 응답이 아직 예전 범위의 것일 수 있어 응답이 말하는 범위를 따른다
  const groupByDay = list ? list.scope !== "day" : false;
  const emptyText = search
    ? `"${search}" — 찾지 못했습니다. 출하번호 · 송장번호 · 거래처 이름을 확인하세요.`
    : query.trim() && (list?.rows.length ?? 0) > 0
      ? "이 목록에는 없습니다 — 돋보기(Enter)를 누르면 전체 기간에서 찾습니다."
      : onlyMissing
        ? "미촬영 건이 없습니다."
        : scope === "range"
          ? "이 기간에 출고 건이 없습니다."
          : "그날 출고 건이 없습니다.";

  return (
    <section className={`op-page${selected != null ? " is-detail" : ""}`}>
      {/* ---------- 목록 ---------- */}
      <DashboardCard className="op-list" title={listTitle}>
        {storage?.low ? (
          <div className="ds-callout warning op-storage-warn">
            <Icon name="alert" size={18} />
            <span>
              <b>사진 저장 공간이 {storage.freePercent}% 남았습니다.</b> 가득 차면 사진이 올라가지 않습니다 — 전산 담당자에게 알려 주세요.
            </span>
          </div>
        ) : null}

        {search ? (
          <div className="op-searchbar" role="status">
            <span>
              전체 기간에서 <b>"{search}"</b> 검색
            </span>
            <button type="button" className="btn-secondary" onClick={clearSearch}>
              <Icon name="x" size={13} />
              닫기
            </button>
          </div>
        ) : (
          <>
            <div className="op-scope" role="group" aria-label="조회 방식">
              <button type="button" className={`op-kind${scope === "day" ? " is-on" : ""}`} onClick={() => setScope("day")} aria-pressed={scope === "day"}>
                하루
              </button>
              <button type="button" className={`op-kind${scope === "range" ? " is-on" : ""}`} onClick={() => setScope("range")} aria-pressed={scope === "range"}>
                기간
              </button>
            </div>

            {scope === "day" ? (
              <div className="op-daynav">
                <button type="button" className="nx-iconbtn" onClick={() => setDate((d) => addDays(d, -1))} title="전날" aria-label="전날">
                  <Icon name="chevL" size={16} />
                </button>
                <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label="조회 일자" />
                <button type="button" className="nx-iconbtn" onClick={() => setDate((d) => addDays(d, 1))} title="다음날" aria-label="다음날">
                  <Icon name="chevR" size={16} />
                </button>
                <button type="button" className="btn-secondary" onClick={() => setDate(todayStr())}>
                  오늘
                </button>
              </div>
            ) : (
              <div className="op-range">
                <div className="op-range-dates">
                  <input type="date" value={from} max={to} onChange={(event) => event.target.value && setFrom(event.target.value)} aria-label="시작일" />
                  <span aria-hidden="true">~</span>
                  <input type="date" value={to} min={from} onChange={(event) => event.target.value && setTo(event.target.value)} aria-label="종료일" />
                </div>
                <div className="op-range-presets">
                  {RANGE_PRESETS.map((days) => (
                    <button key={days} type="button" className="btn-secondary" onClick={() => setRangeDays(days)}>
                      {days}일
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="op-filters">
          <form
            className="op-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                // 검색어를 다 지우면 번호 검색에서 나온다
                if (!event.target.value.trim() && search) clearSearch();
              }}
              placeholder="출하번호 · 거래처 · 송장"
              aria-label="출고 건 검색 (Enter 를 누르면 전체 기간에서 찾습니다)"
              enterKeyHint="search"
            />
            <button type="submit" className="nx-iconbtn" title="전체 기간에서 찾기" aria-label="전체 기간에서 찾기">
              <Icon name="search" size={15} />
            </button>
          </form>
          <label className="op-check">
            <input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} />
            미촬영만
          </label>
        </div>

        {list ? (
          <p className="op-summary">
            출고 <b>{list.total}건</b>
            {list.missing > 0 ? (
              <>
                {" · "}
                <span className="op-missing">미촬영 {list.missing}건</span>
              </>
            ) : list.total > 0 ? (
              <> · 모두 촬영 완료</>
            ) : null}
            {list.truncated ? <span className="op-truncated"> · 최근 {list.rows.length}건만 보입니다 — 기간을 줄이거나 번호로 찾으세요</span> : null}
          </p>
        ) : null}

        {error ? (
          <div className="ds-callout danger">
            <span>불러오기 실패: {error}</span>
          </div>
        ) : null}

        <div className="op-rows">
          {loading ? (
            <p className="op-empty">불러오는 중...</p>
          ) : rows.length === 0 ? (
            <p className="op-empty">{emptyText}</p>
          ) : (
            rows.map((row, index) => (
              <Fragment key={row.id}>
                {groupByDay && row.scheduledDate !== rows[index - 1]?.scheduledDate ? (
                  <div className="op-dayhead">{row.scheduledDate ? dayText(row.scheduledDate) : "출고예정일 없음"}</div>
                ) : null}
                <button
                  type="button"
                  className={`op-row${row.photoCount === 0 ? " is-missing" : ""}${selected === row.id ? " is-on" : ""}`}
                  onClick={() => setSelected(row.id)}
                >
                  <div className="op-row-head">
                    <b>{row.outboundNo}</b>
                    <span className={`op-count${row.photoCount === 0 ? " is-zero" : ""}`}>
                      <Icon name="camera" size={13} />
                      {row.photoCount}장
                    </span>
                  </div>
                  <div className="op-row-sub">
                    {row.customerName} · {row.outType}
                  </div>
                  <div className="op-row-meta">
                    <span>
                      {row.carrier ?? "배송사 미정"}
                      {row.invoiceNo ? ` ${row.invoiceNo}` : ""} · {row.qty.toLocaleString()}EA
                    </span>
                    <StatusBadge tone={STATUS_TONE[row.status] ?? "gray"}>{row.status}</StatusBadge>
                  </div>
                  {row.photoCount > 0 ? (
                    <div className="op-row-kinds">
                      {PHOTO_KINDS.filter((item) => row.kinds[item.value]).map((item) => (
                        <span key={item.value}>
                          {item.label} {row.kinds[item.value]}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              </Fragment>
            ))
          )}
        </div>

        {/* 보관 현황 — 용량을 챙기는 사람(관리자 · 물류)에게만 */}
        {storage && isManager ? (
          <p className="op-storage">
            보관 중 사진 {storage.photoCount.toLocaleString()}장{storage.photoCount > 0 ? ` · ${kb(storage.photoBytes)}` : ""} · {keepText(storage.retentionDays)} 보관 후 정리
            {storage.freePercent != null ? ` · 디스크 여유 ${storage.freePercent}%` : ""}
          </p>
        ) : null}
      </DashboardCard>

      {/* ---------- 촬영 ---------- */}
      <DashboardCard className="op-detail" title={current ? `${current.outboundNo} · 사진 ${photos.length}장` : "출고 건을 고르세요"}>
        {!current ? (
          <p className="op-empty">왼쪽에서 출고 건을 고르면 사진을 찍고 올릴 수 있습니다.</p>
        ) : (
          <>
            <div className="op-detail-head">
              <button type="button" className="btn-secondary op-back" onClick={() => setSelected(null)}>
                <Icon name="chevL" size={14} />
                목록
              </button>
              <div className="op-detail-info">
                <b>{current.customerName}</b>
                <span>
                  {current.outType} · {current.carrier ?? "배송사 미정"}
                  {current.invoiceNo ? ` ${current.invoiceNo}` : ""} · {current.qty.toLocaleString()}EA
                </span>
                <span>
                  출고예정 {current.scheduledDate ?? "-"}
                  {current.confirmedDate ? ` · 출고 확정 ${current.confirmedDate}` : ""}
                </span>
              </div>
              <StatusBadge tone={STATUS_TONE[current.status] ?? "gray"}>{current.status}</StatusBadge>
            </div>

            {canUpload ? (
              <>
                <div className="op-kinds" role="group" aria-label="사진 구분">
                  <span className="op-kinds-label">구분</span>
                  {PHOTO_KINDS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`op-kind${kind === item.value ? " is-on" : ""}`}
                      onClick={() => setKind(item.value)}
                      aria-pressed={kind === item.value}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="op-actions">
                  <button type="button" className="btn-primary op-shoot" onClick={() => cameraRef.current?.click()}>
                    <Icon name="camera" size={16} />
                    사진 찍기
                  </button>
                  <button type="button" className="btn-secondary op-pick" onClick={() => albumRef.current?.click()}>
                    <Icon name="image" size={16} />
                    앨범에서
                  </button>
                </div>
                <p className="op-hint">
                  {KIND_LABEL[kind]}(으)로 찍힙니다 · 찍는 대로 바로 올라갑니다 · 한 번에 {PHOTO_MAX_PER_REQUEST}장까지
                </p>

                {/* 카메라 바로 켜기 (연속 촬영) */}
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="op-file"
                  onChange={(event) => {
                    void addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                {/* 앨범에서 여러 장 */}
                <input
                  ref={albumRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="op-file"
                  onChange={(event) => {
                    void addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </>
            ) : (
              <div className="ds-callout info op-locked">
                <Icon name="lock" size={18} />
                <span>{detail?.uploadNote ?? "이 출고 건에는 사진을 올릴 수 없습니다."}</span>
              </div>
            )}

            {queue.length > 0 ? (
              <div className="op-queue">
                <div className="op-queue-head">
                  <span>
                    {workingCount > 0 ? `올리는 중 ${workingCount}장` : ""}
                    {workingCount > 0 && failedCount > 0 ? " · " : ""}
                    {failedCount > 0 ? `올리지 못한 사진 ${failedCount}장` : ""}
                  </span>
                  {failedCount > 0 ? (
                    <button type="button" className="btn-secondary" onClick={() => setQueue((prev) => prev.filter((item) => item.status !== "failed"))}>
                      실패 지우기
                    </button>
                  ) : null}
                </div>
                {queue.map((item) => (
                  <div key={item.key} className={`op-queue-row${item.status === "failed" ? " is-failed" : ""}`}>
                    <span className="op-queue-name">{item.name}</span>
                    <span className="op-queue-state">
                      {item.status === "failed" ? item.message : item.status === "prepare" ? "사진 줄이는 중…" : item.status === "upload" ? "올리는 중…" : "대기"}
                    </span>
                    {item.status === "failed" ? (
                      <button type="button" className="btn-secondary" onClick={() => void retry(item)}>
                        다시 올리기
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {groups.length === 0 ? (
              <p className="op-empty op-empty-photo">
                {canUpload ? (
                  <>
                    아직 사진이 없습니다. <b>[사진 찍기]</b>로 상차 사진을 남겨 주세요.
                  </>
                ) : (
                  "이 출고 건에는 사진이 없습니다."
                )}
              </p>
            ) : (
              <>
                <div className="op-photobar">
                  <span>
                    사진 {photos.length}장{lastPhoto ? ` · 마지막 ${lastPhoto.takenAt} ${lastPhoto.takenBy}` : ""}
                  </span>
                  <button type="button" className="btn-secondary" onClick={() => void downloadZip()} disabled={zipping} title="사진 전부와 사진 목록(CSV)을 ZIP 으로 받습니다">
                    <Icon name="download" size={14} />
                    {zipping ? "묶는 중…" : "증빙 내려받기"}
                  </button>
                </div>
                {groups.map((group) => (
                  <div key={group.value} className="op-group">
                    <h4>
                      {group.label} <small>{group.photos.length}장</small>
                    </h4>
                    <div className="op-grid">
                      {group.photos.map((photo) => (
                        <button
                          key={photo.id}
                          type="button"
                          className="op-thumb"
                          onClick={() => {
                            setViewer(photo);
                            setMemoDraft(photo.memo ?? "");
                          }}
                          title={`${photo.takenAt} ${photo.takenBy}`}
                        >
                          <img src={apiUrl(photo.thumbUrl ?? photo.url)} alt={`${group.label} 사진 ${photo.seq}`} loading="lazy" />
                          <span className="op-thumb-meta">
                            {photo.takenAt.slice(11)} · {photo.takenBy}
                          </span>
                          {photo.memo ? <span className="op-thumb-memo">{photo.memo}</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </DashboardCard>

      {/* ---------- 크게 보기 ---------- */}
      <Modal
        open={viewer !== null}
        title={viewer ? `${KIND_LABEL[viewer.kind]} 사진` : ""}
        desc={viewer ? `${viewer.takenAt} · ${viewer.takenBy} · ${kb(viewer.bytes)} · ${viewer.width}×${viewer.height}` : ""}
        icon="camera"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary-ink)"
        className="op-modal"
        onClose={() => setViewer(null)}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary op-danger"
              onClick={() => {
                if (!viewer) return;
                // 사유 창만 남긴다 — 크게 보기 위에 창이 겹치면 폰에서 누를 곳을 못 찾는다
                setRemoving(viewer);
                setViewer(null);
              }}
            >
              삭제
            </button>
            <button type="button" className="btn-primary" onClick={() => setViewer(null)}>
              닫기
            </button>
          </>
        }
      >
        {viewer ? (
          <div className="op-viewer">
            <img src={apiUrl(viewer.url)} alt="출고 사진" />
            <div className="op-kinds">
              <span className="op-kinds-label">구분</span>
              {PHOTO_KINDS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`op-kind${viewer.kind === item.value ? " is-on" : ""}`}
                  onClick={() => void saveViewer({ kind: item.value })}
                  aria-pressed={viewer.kind === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="op-memo">
              <span>메모</span>
              <input
                value={memoDraft}
                onChange={(event) => setMemoDraft(event.target.value)}
                onBlur={() => memoDraft !== (viewer.memo ?? "") && void saveViewer({ memo: memoDraft })}
                placeholder="예: 파렛트 2개 중 1번"
                maxLength={200}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      {/* ---------- 삭제 (사유 필수) ---------- */}
      <Modal
        open={removing !== null}
        title="사진 삭제"
        desc="증빙이라 사유가 이력에 남습니다."
        icon="alert"
        iconBg="var(--c-danger-bg)"
        iconColor="var(--c-danger)"
        onClose={() => {
          setRemoving(null);
          setReason("");
        }}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setRemoving(null);
                setReason("");
              }}
            >
              취소
            </button>
            <button type="button" className="btn-primary op-danger-btn" onClick={() => void confirmRemove()}>
              삭제
            </button>
          </>
        }
      >
        <label className="op-memo">
          <span>삭제 사유</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="예: 초점이 안 맞아 다시 찍음" maxLength={200} />
        </label>
      </Modal>

      {notice ? (
        <div className="op-notice" role="status" onClick={() => setNotice(null)}>
          {notice}
        </div>
      ) : null}
    </section>
  );
};

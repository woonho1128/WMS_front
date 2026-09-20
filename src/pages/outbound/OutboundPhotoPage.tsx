import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuthStore } from "../../app/store/authStore";
import { apiDelete, apiGet, apiPost, apiPut } from "../../services/http";
import { addDays, todayStr, weekdayKo } from "../../shared/appDate";
import { KIND_LABEL, PHOTO_KINDS, PHOTO_MAX_PER_REQUEST, type PhotoKind } from "../../services/mockOutboundPhoto";
import "./OutboundPhotoPage.css";

/* ============================================================
   출고 사진 — 그날 출고 건에 상차·포장·송장 사진을 남긴다 (증빙)
   설계: DOCS/WMS_출고사진_설계.md
   · 폰 기준: 목록 → 오더 → [사진 찍기] 연속 촬영 / [앨범에서] 여러 장
   · iOS 는 capture 와 multiple 을 같이 주면 한 장만 되므로 입력을 둘로 나눈다
   · 올리기 전 긴 변 1600px · JPEG 0.72 로 줄인다 (장당 200~400KB)
   ⚠ 1단계(목) — 사진은 브라우저 메모리에만 저장된다. 새로고침하면 시드 상태로 돌아간다.
   ============================================================ */

const MAX_EDGE = 1600;
const QUALITY = 0.72;

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
  photoCount: number;
  kinds: Record<string, number>;
  lastTakenAt: string | null;
  lastTakenBy: string | null;
};

type TargetList = { date: string; total: number; missing: number; rows: TargetRow[] };

type Photo = {
  id: number;
  outboundId: number;
  seq: number;
  kind: PhotoKind;
  url: string;
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
    shipAddress: string | null;
  } | null;
  photos: Photo[];
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

const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);

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
  const [date, setDate] = useState(todayStr());
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [list, setList] = useState<TargetList | null>(null);
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await apiGet<TargetList>(`/outbounds/photo-targets?date=${date}&onlyMissing=${onlyMissing}`);
      setList(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date, onlyMissing]);

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
  }, [selected, loadDetail]);

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
    await apiDelete(`/outbounds/${selected}/photos/${removing.id}?reason=${encodeURIComponent(reason.trim())}&operator=${encodeURIComponent(operator)}`);
    setRemoving(null);
    setViewer(null);
    setReason("");
    setNotice("사진을 삭제했습니다 — 사유와 함께 이력에 남습니다.");
    await Promise.all([loadDetail(selected), loadList()]);
  };

  const dayLabel = `${date} (${weekdayKo(date)})`;
  const current = detail?.outbound ?? null;
  const failedCount = queue.filter((item) => item.status === "failed").length;
  const workingCount = queue.filter((item) => item.status !== "failed").length;

  return (
    <section className={`op-page${selected != null ? " is-detail" : ""}`}>
      {/* ---------- 목록 ---------- */}
      <DashboardCard className="op-list" title={`출고 사진 · ${dayLabel}`}>
        <div className="op-daynav">
          <button type="button" className="nx-iconbtn" onClick={() => setDate((d) => addDays(d, -1))} title="전날" aria-label="전날">
            <Icon name="chevL" size={16} />
          </button>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="조회 일자" />
          <button type="button" className="nx-iconbtn" onClick={() => setDate((d) => addDays(d, 1))} title="다음날" aria-label="다음날">
            <Icon name="chevR" size={16} />
          </button>
          <button type="button" className="btn-secondary" onClick={() => setDate(todayStr())}>
            오늘
          </button>
        </div>

        <div className="op-filters">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="출하번호 · 거래처 · 송장 검색"
            aria-label="출고 건 검색"
          />
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
            ) : (
              <> · 모두 촬영 완료</>
            )}
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
            <p className="op-empty">{onlyMissing ? "미촬영 건이 없습니다." : "그날 출고 건이 없습니다."}</p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
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
            ))
          )}
        </div>
      </DashboardCard>

      {/* ---------- 촬영 ---------- */}
      <DashboardCard
        className="op-detail"
        title={current ? `${current.outboundNo} · 사진 ${detail?.photos.length ?? 0}장` : "출고 건을 고르세요"}
      >
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
              </div>
              <StatusBadge tone={STATUS_TONE[current.status] ?? "gray"}>{current.status}</StatusBadge>
            </div>

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
                아직 사진이 없습니다. <b>[사진 찍기]</b>로 상차 사진을 남겨 주세요.
              </p>
            ) : (
              groups.map((group) => (
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
                        <img src={photo.url} alt={`${group.label} 사진 ${photo.seq}`} loading="lazy" />
                        <span className="op-thumb-meta">
                          {photo.takenAt.slice(11)} · {photo.takenBy}
                        </span>
                        {photo.memo ? <span className="op-thumb-memo">{photo.memo}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))
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
            <img src={viewer.url} alt="출고 사진" />
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

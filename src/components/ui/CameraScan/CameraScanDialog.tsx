import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { canUseLiveCamera, decodeCanvas, decodeImageFile } from "./scanDecode";
import "./cameraScan.css";

/* ============================================================
   휴대폰 카메라로 QR · 바코드 읽기 — 전체 화면
   · 기본: 카메라를 켜고 네모 안을 계속 읽는다 (https 주소에서만 — 브라우저 규칙)
   · 안 되면: 카메라 앱으로 사진을 찍어 읽는다 (http 주소, 권한 거부, 카메라 오류)
   · expect 를 주면 그 값만 받는다 — 다른 코드는 알려 주고 계속 찍는다
   ============================================================ */

type Props = {
  open: boolean;
  title: string;
  /** 맞는 값 (대소문자 무시). 비우면 처음 읽은 값을 그대로 넘긴다 */
  expect?: Array<string | null | undefined>;
  onResult: (value: string) => void;
  onClose: () => void;
};

const SCAN_INTERVAL_MS = 140;

type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

export const CameraScanDialog = ({ open, title, expect, onResult, onClose }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [mode, setMode] = useState<"live" | "photo">("live");
  const [message, setMessage] = useState<string | null>(null);
  const [torch, setTorch] = useState({ supported: false, on: false });

  const wanted = (expect ?? []).filter((value): value is string => !!value?.trim());

  /** 읽은 값 처리 — 받았으면 true */
  const accept = (value: string) => {
    if (wanted.length && !wanted.some((w) => w.trim().toLowerCase() === value.toLowerCase())) {
      setMessage(`다른 코드입니다: ${value}`);
      return false;
    }
    navigator.vibrate?.(60);
    onResult(value);
    return true;
  };
  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  // 열 때 방식을 정한다
  useEffect(() => {
    if (!open) return;
    setTorch({ supported: false, on: false });
    if (canUseLiveCamera()) {
      setMode("live");
      setMessage(null);
    } else {
      setMode("photo");
      setMessage("이 주소에서는 카메라를 바로 켤 수 없어 사진으로 찍습니다. (WMS 를 https 주소로 열면 비추기만 해도 읽습니다)");
    }
  }, [open]);

  // 카메라를 켜고 네모 안을 계속 읽는다
  useEffect(() => {
    if (!open || mode !== "live") return;
    let stopped = false;
    let timer = 0;
    let stream: MediaStream | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && ctx && video.readyState >= 2 && video.videoWidth) {
        // 화면의 네모(가로 90% · 세로 70%)만 잘라 줄여서 읽는다 — 빠르고 옆 라벨을 잘못 읽지 않는다
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const cw = vw * 0.9;
        const ch = vh * 0.7;
        const scale = Math.min(1, 800 / cw);
        canvas.width = Math.round(cw * scale);
        canvas.height = Math.round(ch * scale);
        ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
        const value = await decodeCanvas(canvas, ctx);
        if (stopped) return;
        if (value && acceptRef.current(value)) {
          stopped = true;
          return;
        }
      }
      timer = window.setTimeout(tick, SCAN_INTERVAL_MS);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch({ supported: !!caps.torch, on: false });
        tick();
      } catch (e) {
        if (stopped) return;
        setMode("photo");
        setMessage(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "카메라 권한이 막혀 있어 사진으로 찍습니다. 브라우저 설정에서 카메라를 허용하면 비추기만 해도 읽습니다."
            : "카메라를 켤 수 없어 사진으로 찍습니다."
        );
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
    };
  }, [open, mode]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraint] });
      setTorch({ supported: true, on: next });
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setMessage("읽는 중…");
    const value = await decodeImageFile(file).catch(() => null);
    if (!value) {
      setMessage("코드를 찾지 못했습니다 — 코드가 사진 가운데에 크게 나오게 다시 찍어 주세요.");
      return;
    }
    acceptRef.current(value);
  };

  if (!open) return null;

  return createPortal(
    // 화면 밖(포털)이어도 React 이벤트는 부모로 올라간다 — 목록 줄 클릭 같은 동작이 따라 일어나지 않게 막는다
    <div className="cs-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div className="cs-head">
        <b>{title}</b>
        <button type="button" className="cs-x" onClick={onClose} aria-label="닫기">
          <Icon name="x" size={18} />
        </button>
      </div>

      {mode === "live" ? (
        <div className="cs-stage">
          <video ref={videoRef} className="cs-video" playsInline muted />
          <div className="cs-frame" aria-hidden="true" />
        </div>
      ) : (
        <div className="cs-photo">
          <button type="button" className="btn-primary cs-shot" onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={18} />
            사진 찍어 읽기
          </button>
        </div>
      )}

      <div className="cs-foot">
        <span>
          {wanted.length ? (
            <>
              찍을 것: <b>{wanted.join(" 또는 ")}</b>
            </>
          ) : (
            "QR · 바코드를 네모 안에 비추세요"
          )}
        </span>
        {message ? <p className="cs-msg">{message}</p> : null}
        <div className="cs-actions">
          {mode === "live" && torch.supported ? (
            <button type="button" className="btn-secondary" onClick={toggleTorch}>
              {torch.on ? "불 끄기" : "불 켜기"}
            </button>
          ) : null}
          {mode === "live" ? (
            <button type="button" className="btn-secondary" onClick={() => setMode("photo")}>
              사진으로 찍기
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          readPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>,
    document.body
  );
};

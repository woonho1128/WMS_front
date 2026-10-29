import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCan } from "../../app/access";
import { apiGet } from "../../services/http";

/* ============================================================
   사이드바 SYSTEM STATUS — 주문 시스템 연동의 지금 상태.
   서버가 주고받은 기록(받은 요청 · 회신)과 주문 시스템 서버 연결을 보고 알려 준다 (GET /interfaces/status).
   전체 로그를 볼 수 있는 사람에게만 보이고, 누르면 전체 로그 조회로 간다.
   ============================================================ */

/** 전체 로그 조회 — 상자가 보이는 기능이자 누르면 가는 화면 */
const LOG_FEATURE = "history/system-logs:view";
const LOG_PATH = "/history/system-logs";
/** 다시 묻는 간격 — 창이 보일 때만 */
const POLL_MS = 30_000;

type LinkSystem = {
  systemCode: string;
  /** OFF = 받는 키가 없어 받지 않음 · TRIAL = 시범(회신 안 보냄) · LIVE = 운영 */
  mode: "OFF" | "TRIAL" | "LIVE";
  /** 주문 시스템 서버에 연결되나 — UNKNOWN = 회신 주소가 없어 보지 않음 */
  server: "UP" | "DOWN" | "UNKNOWN";
  /** 마지막으로 받은 때 (최근 7일) */
  lastReceivedAt: string | null;
  /** 받아서 거절한 요청 (최근 24시간) */
  receivedFail: number;
  /** 아직 안 나간 회신 */
  replyWaiting: number;
  /** 그중 못 보내 다시 보낼 예정 */
  replyRetrying: number;
  /** 못 보내 사람이 다시 보내야 하는 회신 */
  replyFail: number;
};

export type LinkStatusData = { checkedAt: string; replySending: boolean; systems: LinkSystem[] };

type Tone = "ok" | "info" | "warn" | "error" | "off";
type Line = { key: string; name: string; tone: Tone; state: string; sub: string; detail: string };

/** "2026-10-29 10:32" → 같은 날이면 "10:32", 아니면 "10-28 10:32" */
const shortTime = (value: string, day: string) => (value.startsWith(day) ? value.slice(11, 16) : value.slice(5, 16));

/** 한 시스템의 상태 — 가장 급한 것 하나를 글자로, 나머지는 툴팁에 */
const judge = (s: LinkSystem, replySending: boolean, day: string): Line => {
  const received = s.lastReceivedAt ? `받음 ${shortTime(s.lastReceivedAt, day)}` : "7일간 받은 것 없음";
  const mode = s.mode === "LIVE" ? "운영" : "시범";
  const server = s.server === "UP" ? "연결됨" : s.server === "DOWN" ? "연결 안 됨" : "보지 않음 (회신 주소 없음)";
  const detail = [
    `${s.systemCode} · ${mode} · 서버 ${server}`,
    s.lastReceivedAt ? `마지막으로 받은 때 ${s.lastReceivedAt}` : "최근 7일 받은 것 없음",
    `받아서 거절 (24시간) ${s.receivedFail}건`,
    `회신 대기 ${s.replyWaiting} · 다시 보낼 예정 ${s.replyRetrying} · 실패 ${s.replyFail}`
  ].join("\n");
  const line = (tone: Tone, state: string, sub: string): Line => ({ key: s.systemCode, name: s.systemCode, tone, state, sub, detail });

  if (s.server === "DOWN") {
    return line("error", "연결 안 됨", s.replyWaiting ? `서버 응답 없음 · 회신 대기 ${s.replyWaiting}건` : "서버가 응답하지 않음");
  }
  if (s.replyFail) return line("error", `회신 실패 ${s.replyFail}건`, "눌러서 다시 보내기");
  if (s.replyRetrying) return line("warn", `재시도 ${s.replyRetrying}건`, "회신을 받지 않아 다시 보내는 중");
  if (s.mode === "LIVE" && s.server === "UNKNOWN") return line("warn", "회신 주소 없음", "회신을 쌓아만 두는 중");
  if (s.mode === "LIVE" && !replySending) return line("warn", "회신 꺼짐", "회신을 쌓아만 두는 중");
  if (s.receivedFail) return line("warn", `거절 ${s.receivedFail}건`, "받은 요청 · 최근 24시간");
  if (s.mode === "TRIAL") return line("info", "시범", `회신 안 보냄 · ${received}`);
  return line("ok", "정상", `운영 · ${received}`);
};

const linesOf = (data: LinkStatusData): Line[] => {
  const on = data.systems.filter((s) => s.mode !== "OFF");
  if (!on.length) {
    return [{ key: "off", name: "연동", tone: "off", state: "꺼짐", sub: "받는 키 설정 없음", detail: "받는 키(설정)가 없어 주문 시스템의 요청을 받지 않습니다." }];
  }
  const day = data.checkedAt.slice(0, 10);
  return on.map((s) => judge(s, data.replySending, day));
};

export const LinkStatus = () => {
  const allowed = useCan(LOG_FEATURE);
  const navigate = useNavigate();
  const [data, setData] = useState<LinkStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    let lastAt = 0;
    const load = () => {
      lastAt = Date.now();
      apiGet<LinkStatusData>("/interfaces/status")
        .then((next) => {
          if (!alive) return;
          setData(next);
          setError(null);
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        });
    };
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    // 다른 창에 있다 돌아오면 바로 한 번
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastAt > 10_000) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [allowed]);

  const lines = useMemo<Line[]>(() => {
    if (error) return [{ key: "error", name: "연동", tone: "off", state: "확인 못 함", sub: "상태를 불러오지 못함", detail: error }];
    if (!data) return [{ key: "loading", name: "연동", tone: "off", state: "확인 중", sub: "잠시만요", detail: "" }];
    return linesOf(data);
  }, [data, error]);

  if (!allowed) return null;

  const checked = data && !error ? data.checkedAt.slice(11, 16) : null;
  const summary = lines.map((line) => `${line.name} ${line.state}`).join(", ");
  const tooltip = [...lines.map((line) => line.detail), checked ? `${checked} 확인 · 30초마다 다시 봄` : "", "눌러서 전체 로그 조회"]
    .filter(Boolean)
    .join("\n\n");

  return (
    <button
      type="button"
      className="wms-sysstat"
      onClick={() => navigate(LOG_PATH)}
      title={tooltip}
      aria-label={`연동 상태 — ${summary}. 눌러서 전체 로그 조회`}
    >
      <span className="wms-sysstat-head">
        <span className="wms-sysstat-title">SYSTEM STATUS</span>
        {checked ? <span className="wms-sysstat-time">{checked}</span> : null}
      </span>
      {lines.map((line) => (
        <span key={line.key} className={`wms-sysstat-row is-${line.tone}`}>
          <span className="wms-sysdot" />
          <span className="wms-sysstat-name">{line.name}</span>
          <span className="wms-sysstat-state">{line.state}</span>
          <span className="wms-sysstat-sub">{line.sub}</span>
        </span>
      ))}
    </button>
  );
};

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import {
  accessApi,
  type HistView,
  type ModuleView,
  type PermissionKind,
  type PermissionView,
  type RoleView
} from "../../services/accessApi";

/* ============================================================
   시스템관리 화면들이 같이 쓰는 것 — 목록 읽기 · 이름 풀기 · 이력 · 알림
   ============================================================ */

export const KIND_LABEL: Record<PermissionKind, string> = { VIEW: "보기", WORK: "처리", SPECIAL: "따로" };
export const KIND_ORDER: PermissionKind[] = ["VIEW", "WORK", "SPECIAL"];

export type Notice = { tone: "success" | "danger" | "info"; text: string } | null;

export const errorText = (e: unknown, fallback = "처리하지 못했습니다.") => (e instanceof Error ? e.message : fallback);

/** 역할 · 권한 · 메뉴 목록 — 필요한 것만 읽는다 (사용자 관리는 역할만) */
export const useAccessLists = (need: { roles?: boolean; permissions?: boolean; menus?: boolean }) => {
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [permissions, setPermissions] = useState<PermissionView[]>([]);
  const [menus, setMenus] = useState<ModuleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const needRef = useRef(need);

  const reload = useCallback(async () => {
    const want = needRef.current;
    setError(null);
    try {
      const [r, p, m] = await Promise.all([
        want.roles ? accessApi.roles() : Promise.resolve(null),
        want.permissions ? accessApi.permissions() : Promise.resolve(null),
        want.menus ? accessApi.menus() : Promise.resolve(null)
      ]);
      if (r) setRoles(r);
      if (p) setPermissions(p);
      if (m) setMenus(m);
    } catch (e) {
      setError(errorText(e, "불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { roles, permissions, menus, loading, error, reload };
};

/** 기능 코드 → "출고 확정 · 처리" 같은 이름 (메뉴 관리에서 바꾼 화면 이름으로) */
export const useFeatureNames = (menus: ModuleView[]) =>
  useMemo(() => {
    const map = new Map<string, { screen: string; label: string; kind: string; system: boolean }>();
    for (const module of menus) {
      for (const screen of module.screens) {
        for (const feature of screen.features) {
          map.set(feature.code, { screen: screen.name, label: feature.label, kind: feature.kind, system: screen.system });
        }
      }
    }
    return map;
  }, [menus]);

export const featureText = (names: Map<string, { screen: string; label: string }>, code: string) => {
  const found = names.get(code);
  return found ? `${found.screen} · ${found.label}` : code;
};

/* ---------- 알림 · 오류 ---------- */

export const NoticeBar = ({ notice, onClose }: { notice: Notice; onClose?: () => void }) =>
  notice ? (
    <div className={`ds-callout ${notice.tone} sys-notice`} role="status">
      <Icon name={notice.tone === "success" ? "check" : notice.tone === "info" ? "bolt" : "alert"} size={18} />
      <span>{notice.text}</span>
      {onClose ? (
        <button type="button" className="sys-notice-x" aria-label="알림 닫기" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  ) : null;

export const ModalError = ({ text }: { text: string }) => (
  <div className="ds-callout danger acc-modal-error">
    <Icon name="alert" size={16} />
    <span>{text}</span>
  </div>
);

/** 저장 결과 알림 — 바뀐 게 없으면 그렇게 */
export const savedNotice = (message: string | null, fallback: string): Notice => ({
  tone: "success",
  text: message ?? fallback
});

/* ---------- 이력 (스냅샷 — 앞 줄과 비교) ---------- */

type HistoryProps = {
  rows: HistView[];
  loading?: boolean;
  /** 넣은 것 · 뺀 것 코드 → 보일 이름 */
  nameOf: (code: string) => string;
  /** 대상 이름을 줄마다 보일지 (모아 보기) */
  showTarget?: boolean;
  empty?: string;
};

const KIND_TAG: Record<string, string> = { permission: "권한", role: "역할", user: "사람의 역할", menu: "메뉴" };

export const HistoryList = ({ rows, loading, nameOf, showTarget, empty = "이력이 없습니다." }: HistoryProps) => {
  const [open, setOpen] = useState<number | null>(null);
  if (loading) return <div className="sys-hist-empty">이력을 불러오는 중…</div>;
  if (!rows.length) return <div className="sys-hist-empty">{empty}</div>;
  return (
    <ol className="sys-hist">
      {rows.map((h) => {
        const key = `${h.kind}-${h.histId}`;
        const expanded = open === h.histId;
        return (
          <li key={key} className={`sys-hist-row${h.first ? " is-first" : ""}`}>
            <div className="sys-hist-head">
              <span className="sys-hist-time">{h.changedAt}</span>
              <span className="sys-hist-who">
                <Icon name="user" size={12} />
                {h.changedBy === "system" ? "처음 값" : h.changedBy}
              </span>
              {showTarget ? (
                <span className="sys-hist-target">
                  <small>{KIND_TAG[h.kind] ?? h.kind}</small>
                  {h.targetName ?? h.targetKey}
                </span>
              ) : null}
              {h.items.length ? (
                <button type="button" className="sys-hist-more" onClick={() => setOpen(expanded ? null : h.histId)}>
                  그때 전체 {h.items.length}개
                  <Icon name={expanded ? "chevD" : "chevR"} size={12} />
                </button>
              ) : null}
            </div>
            <div className="sys-hist-body">
              {h.notes.map((note) => (
                <span key={note} className="sys-hist-note">
                  {note}
                </span>
              ))}
              {h.added.map((code) => (
                <span key={`+${code}`} className="sys-hist-add">
                  + {nameOf(code)}
                </span>
              ))}
              {h.removed.map((code) => (
                <span key={`-${code}`} className="sys-hist-del">
                  − {nameOf(code)}
                </span>
              ))}
              {!h.first && !h.notes.length && !h.added.length && !h.removed.length ? (
                <span className="sys-hist-note">설명만 바꿈</span>
              ) : null}
            </div>
            {expanded ? (
              <div className="sys-hist-all">
                {h.items.map((code) => (
                  <span key={code}>{code === "*" ? "모든 기능" : nameOf(code)}</span>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
};

/* ---------- 작은 것들 ---------- */

export const SectionTitle = ({ icon, title, desc, children }: { icon: string; title: string; desc: string; children?: ReactNode }) => (
  <div className="acc-head-top">
    <div className="acc-title">
      <span className="acc-title-ico">
        <Icon name={icon} size={18} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
    </div>
    {children ? <div className="sys-head-actions">{children}</div> : null}
  </div>
);

/** 켜고 끄기 (사용 · 사용 안 함 · 바깥 사람 · 보임 · 숨김) */
export const Switch = ({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <label className={`sys-switch${disabled ? " is-disabled" : ""}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span className="sys-switch-track" aria-hidden />
    {label}
  </label>
);

/** 체크 칸 하나 — 잠긴 것 · 이유 */
export const Check = ({
  checked,
  disabled,
  onChange,
  label,
  hint,
  tone
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  hint?: string;
  tone?: "view" | "work" | "button";
}) => (
  <label className={`sys-check${checked ? " is-on" : ""}${disabled ? " is-disabled" : ""}${tone ? ` is-${tone}` : ""}`} title={hint}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span className="sys-check-box" aria-hidden>
      <Icon name="check" size={11} />
    </span>
    <span className="sys-check-label">{label}</span>
  </label>
);

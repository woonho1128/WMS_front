import { useEffect, useMemo, useRef, useState } from "react";
import { roleLabels, type UserRole } from "../../app/roles";
import { useAuthStore } from "../../app/store/authStore";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable";
import { apiGet, apiPost, apiPut } from "../../services/http";
import "./AccountAdminPage.css";

/* ============================================================
   계정 관리 (관리자) — 만들기 · 역할 · 잠그기 · 비밀번호 초기화.
   비밀번호는 서버가 임시로 만들어 이 화면에 한 번만 보여 준다 → 받은 사람이 첫 로그인 때 바꾼다.
   지우지 않고 잠근다(이력 · 사진이 아이디를 가리킨다). 잠금 · 역할 변경 · 초기화는 그 사람의 로그인을 바로 끊는다.
   ============================================================ */

type Account = {
  id: string;
  name: string;
  role: string;
  locked: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  lockedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type Issued = { account: Account; temporaryPassword: string };

const ROLES = Object.keys(roleLabels) as UserRole[];

/** 역할을 고를 때 보이는 한 줄 — 무엇을 하는 역할인가 */
const ROLE_HINT: Record<UserRole, string> = {
  admin: "모든 화면 + 계정 관리",
  logistics: "물류 전체 — 입고 · 재고 · 출고 · 배차",
  inbound: "입고 — 도착 · 검수 · 입고확정 · 격납",
  outbound: "출고 — 피킹 · 출고확정 · 배차",
  inventory: "재고 — 격납 · 보충 · 이동 · 실사",
  sourcing: "입고예정 넣기 · 고치기 · 남은 수량 닫기 (도착 · 검수는 물류)",
  partner: "배송사 — 배송 내역 · 지방권 배차 보기"
};

const ROLE_TONE: Record<string, string> = {
  admin: "violet",
  logistics: "info",
  inbound: "teal",
  outbound: "indigo",
  inventory: "gray",
  sourcing: "warning",
  partner: "consign"
};

const roleName = (role: string) => roleLabels[role as UserRole] ?? role;

type StateFilter = "all" | "active" | "locked" | "temporary";
const STATE_FILTERS: Array<{ key: StateFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "active", label: "사용 중" },
  { key: "temporary", label: "임시 비밀번호" },
  { key: "locked", label: "잠김" }
];

type Confirm = { kind: "lock" | "unlock" | "reset"; account: Account } | null;

const emptyForm = { id: "", name: "", role: "inbound" as UserRole };

export const AccountAdminPage = () => {
  const me = useAuthStore((state) => state.user?.id ?? null);

  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [edit, setEdit] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "inbound" as UserRole });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<Account[]>("/accounts")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const isMe = (a: Account) => me != null && a.id.toLowerCase() === me.toLowerCase();

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => !r.locked).length,
      locked: rows.filter((r) => r.locked).length,
      temporary: rows.filter((r) => !r.locked && r.mustChangePassword).length
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (kw && !`${r.id} ${r.name}`.toLowerCase().includes(kw)) return false;
      if (roleFilter && r.role !== roleFilter) return false;
      if (stateFilter === "active" && r.locked) return false;
      if (stateFilter === "locked" && !r.locked) return false;
      if (stateFilter === "temporary" && (r.locked || !r.mustChangePassword)) return false;
      return true;
    });
  }, [rows, keyword, roleFilter, stateFilter]);

  /** 목록에서 한 줄만 바꿔 끼운다 (다시 불러오지 않아도 바로 보이게) */
  const upsert = (account: Account) =>
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === account.id);
      if (index < 0) return [...prev, account];
      const next = [...prev];
      next[index] = account;
      return next;
    });

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setModalError(null);
    try {
      await work();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const result = await apiPost<Issued>("/accounts", form);
      upsert(result.account);
      setCreateOpen(false);
      setIssued(result);
      setNotice({ tone: "success", text: `${result.account.id} 계정을 만들었습니다 — 임시 비밀번호를 전해 주세요.` });
    });

  const openEdit = (a: Account) => {
    setModalError(null);
    setEdit(a);
    setEditForm({ name: a.name, role: (ROLES.includes(a.role as UserRole) ? a.role : "inbound") as UserRole });
  };

  const saveEdit = () =>
    run(async () => {
      if (!edit) return;
      const saved = await apiPut<Account>(`/accounts/${encodeURIComponent(edit.id)}`, editForm);
      upsert(saved);
      const roleChanged = saved.role !== edit.role;
      setEdit(null);
      setNotice({
        tone: "success",
        text: roleChanged
          ? `${saved.name} — 역할을 ${roleName(saved.role)}(으)로 바꿨습니다. 그 사람은 다시 로그인합니다.`
          : `${saved.name} — 저장했습니다.`
      });
    });

  const doConfirm = () =>
    run(async () => {
      if (!confirm) return;
      const id = encodeURIComponent(confirm.account.id);
      if (confirm.kind === "reset") {
        const result = await apiPost<Issued>(`/accounts/${id}/reset-password`, {});
        upsert(result.account);
        setIssued(result);
        setNotice({ tone: "success", text: `${result.account.id} 의 비밀번호를 초기화했습니다 — 임시 비밀번호를 전해 주세요.` });
      } else {
        const saved = await apiPost<Account>(`/accounts/${id}/${confirm.kind}`, {});
        upsert(saved);
        setNotice({
          tone: "success",
          text: confirm.kind === "lock" ? `${saved.id} 계정을 잠갔습니다.` : `${saved.id} 계정의 잠금을 풀었습니다.`
        });
      }
      setConfirm(null);
    });

  const roleOptions = (
    <>
      {ROLES.map((role) => (
        <option key={role} value={role}>
          {roleLabels[role]}
        </option>
      ))}
    </>
  );

  return (
    <section className="acc-page">
      {/* ---------- 요약 ---------- */}
      <header className="card acc-head">
        <div className="acc-head-top">
          <div className="acc-title">
            <span className="acc-title-ico">
              <Icon name="shield" size={18} />
            </span>
            <div>
              <h2>계정 관리</h2>
              <p>계정을 만들고 역할을 정합니다. 비밀번호는 임시로 발급되고, 받은 사람이 첫 로그인 때 바꿉니다.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary acc-create"
            onClick={() => {
              setForm({ ...emptyForm });
              setModalError(null);
              setCreateOpen(true);
            }}
          >
            <Icon name="userPlus" size={16} />
            계정 만들기
          </button>
        </div>
        <div className="acc-kpis">
          {STATE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`acc-kpi${stateFilter === f.key ? " is-on" : ""}${f.key === "locked" && counts.locked ? " is-warn" : ""}`}
              onClick={() => setStateFilter(f.key)}
            >
              <span>{f.label}</span>
              <b>
                {loading ? "—" : counts[f.key]}
                <small>개</small>
              </b>
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>불러오기 실패: {error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className={`ds-callout ${notice.tone}`}>
          <Icon name={notice.tone === "success" ? "check" : "alert"} size={18} />
          <span>{notice.text}</span>
        </div>
      ) : null}

      {/* ---------- 목록 ---------- */}
      <section className="card acc-list">
        <div className="acc-toolbar">
          <div className="acc-search">
            <Icon name="search" size={15} />
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="아이디 · 이름" aria-label="계정 검색" />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="역할">
            <option value="">모든 역할</option>
            {roleOptions}
          </select>
          <span className="acc-count">{filtered.length}개</span>
          <button type="button" className="nx-iconbtn" onClick={load} title="새로고침" aria-label="새로고침">
            <Icon name="refresh" size={15} />
          </button>
        </div>

        <ResponsiveTable className="acc-table-wrap" cardsBelow="fit">
          <table className="data-table acc-table">
            <thead>
              <tr>
                <th className="rt-title">계정</th>
                <th>역할</th>
                <th>상태</th>
                <th>마지막 로그인</th>
                <th>비밀번호 바꾼 때</th>
                <th className="rt-actions">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const mine = isMe(a);
                return (
                  <tr key={a.id} className={a.locked ? "is-locked" : undefined}>
                    <td>
                      <div className="acc-who">
                        <span className="acc-avatar">{a.name.charAt(0)}</span>
                        <div>
                          <b>
                            {a.name}
                            {mine ? <span className="acc-me">나</span> : null}
                          </b>
                          <span className="acc-id">{a.id}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`ds-badge ${ROLE_TONE[a.role] ?? "gray"}`}>{roleName(a.role)}</span>
                    </td>
                    <td>
                      {a.locked ? (
                        <span className="ds-badge danger" title={a.lockedAt ? `잠근 때 ${a.lockedAt}` : undefined}>
                          <Icon name="lock" size={11} />
                          잠김
                        </span>
                      ) : a.mustChangePassword ? (
                        <span className="ds-badge warning" title="첫 로그인 때 비밀번호를 바꿔야 합니다">
                          임시 비밀번호
                        </span>
                      ) : (
                        <span className="ds-badge success">
                          <i className="bdot" />
                          사용 중
                        </span>
                      )}
                    </td>
                    <td className="acc-time">{a.lastLoginAt ?? <span className="acc-dim">아직 없음</span>}</td>
                    <td className="acc-time">{a.passwordChangedAt ?? <span className="acc-dim">—</span>}</td>
                    <td>
                      <div className="acc-actions">
                        <button type="button" className="acc-act" onClick={() => openEdit(a)} title="이름 · 역할 바꾸기">
                          <Icon name="edit" size={14} />
                          <span>수정</span>
                        </button>
                        <button
                          type="button"
                          className="acc-act"
                          disabled={mine}
                          onClick={() => {
                            setModalError(null);
                            setConfirm({ kind: "reset", account: a });
                          }}
                          title={mine ? "내 비밀번호는 왼쪽 아래 열쇠 단추에서 바꿉니다" : "임시 비밀번호 새로 발급"}
                        >
                          <Icon name="key" size={14} />
                          <span>초기화</span>
                        </button>
                        <button
                          type="button"
                          className={`acc-act${a.locked ? "" : " is-danger"}`}
                          disabled={mine}
                          onClick={() => {
                            setModalError(null);
                            setConfirm({ kind: a.locked ? "unlock" : "lock", account: a });
                          }}
                          title={mine ? "내 계정은 잠글 수 없습니다" : a.locked ? "잠금 풀기" : "잠그기"}
                        >
                          <Icon name={a.locked ? "unlock" : "lock"} size={14} />
                          <span>{a.locked ? "풀기" : "잠그기"}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && !loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="nx-empty">조건에 맞는 계정이 없습니다.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ResponsiveTable>
      </section>

      {/* ---------- 계정 만들기 ---------- */}
      <Modal
        open={createOpen}
        title="계정 만들기"
        desc="비밀번호는 임시로 발급됩니다 — 받은 사람이 첫 로그인 때 바꿉니다."
        icon="userPlus"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary-ink)"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
              취소
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={create}>
              만들기
            </button>
          </>
        }
      >
        <div className="acc-form">
          <label className="ds-field">
            <span>아이디</span>
            <input
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              placeholder="예: hong.gildong 또는 사번"
              autoFocus
            />
            <small className="acc-help">영문 소문자 · 숫자로 시작, 3~30자 (. _ - 가능)</small>
          </label>
          <label className="ds-field">
            <span>이름</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 홍길동" />
          </label>
          <label className="ds-field">
            <span>역할</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              {roleOptions}
            </select>
            <small className="acc-help">{ROLE_HINT[form.role]}</small>
          </label>
        </div>
        {modalError ? <ModalError text={modalError} /> : null}
      </Modal>

      {/* ---------- 이름 · 역할 ---------- */}
      <Modal
        open={edit !== null}
        title="계정 수정"
        desc={edit ? `${edit.name} · ${edit.id}` : ""}
        icon="edit"
        iconBg="var(--c-info-bg)"
        iconColor="var(--c-info-ink)"
        onClose={() => setEdit(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>
              취소
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={saveEdit}>
              저장
            </button>
          </>
        }
      >
        {edit ? (
          <div className="acc-form">
            <label className="ds-field">
              <span>이름</span>
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </label>
            <label className="ds-field">
              <span>역할</span>
              <select
                value={editForm.role}
                disabled={isMe(edit)}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
              >
                {roleOptions}
              </select>
              <small className="acc-help">
                {isMe(edit) ? "내 역할은 다른 관리자가 바꿉니다." : ROLE_HINT[editForm.role]}
              </small>
            </label>
            {editForm.role !== edit.role ? (
              <div className="ds-callout warning">
                <Icon name="alert" size={16} />
                <span>역할을 바꾸면 그 사람의 로그인이 끊깁니다 — 다시 로그인하면 새 역할의 메뉴가 보입니다.</span>
              </div>
            ) : null}
          </div>
        ) : null}
        {modalError ? <ModalError text={modalError} /> : null}
      </Modal>

      {/* ---------- 잠그기 · 풀기 · 초기화 확인 ---------- */}
      <Modal
        open={confirm !== null}
        title={confirm?.kind === "lock" ? "계정 잠그기" : confirm?.kind === "unlock" ? "잠금 풀기" : "비밀번호 초기화"}
        desc={confirm ? `${confirm.account.name} · ${confirm.account.id}` : ""}
        icon={confirm?.kind === "lock" ? "lock" : confirm?.kind === "unlock" ? "unlock" : "key"}
        iconBg={confirm?.kind === "lock" ? "var(--c-danger-bg)" : "var(--c-warning-bg)"}
        iconColor={confirm?.kind === "lock" ? "var(--c-danger-ink)" : "var(--c-warning-ink)"}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>
              취소
            </button>
            <button
              type="button"
              className={confirm?.kind === "lock" ? "acc-danger" : "btn-primary"}
              disabled={busy}
              onClick={doConfirm}
            >
              {confirm?.kind === "lock" ? "잠그기" : confirm?.kind === "unlock" ? "잠금 풀기" : "초기화"}
            </button>
          </>
        }
      >
        <div className="ds-callout info">
          <Icon name="alert" size={16} />
          <span>
            {confirm?.kind === "lock"
              ? "잠그면 로그인이 막히고, 지금 열려 있는 화면도 다음 동작부터 막힙니다. 이력은 그대로 남습니다."
              : confirm?.kind === "unlock"
                ? "잠금을 풀면 하던 비밀번호로 다시 로그인할 수 있습니다."
                : "임시 비밀번호를 새로 발급합니다. 지금 쓰는 비밀번호와 열려 있는 화면은 바로 끊기고, 첫 로그인 때 새 비밀번호를 정합니다."}
          </span>
        </div>
        {modalError ? <ModalError text={modalError} /> : null}
      </Modal>

      {/* ---------- 임시 비밀번호 (한 번만 보인다) ---------- */}
      <Modal
        open={issued !== null}
        title="임시 비밀번호"
        desc={issued ? `${issued.account.name} · ${issued.account.id}` : ""}
        icon="key"
        iconBg="var(--c-success-bg)"
        iconColor="var(--c-success-ink)"
        onClose={() => setIssued(null)}
        footer={
          <button type="button" className="btn-primary" onClick={() => setIssued(null)}>
            전했습니다 — 닫기
          </button>
        }
      >
        {issued ? <TemporaryPassword value={issued.temporaryPassword} /> : null}
      </Modal>
    </section>
  );
};

const ModalError = ({ text }: { text: string }) => (
  <div className="ds-callout danger acc-modal-error">
    <Icon name="alert" size={16} />
    <span>{text}</span>
  </div>
);

/** 임시 비밀번호 — 복사 단추. 복사가 막힌 브라우저(사내 http 등)면 글자를 골라 둔다 */
const TemporaryPassword = ({ value }: { value: string }) => {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "selected">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("copied");
    } catch {
      input.current?.select();
      setCopied("selected");
    }
  };

  return (
    <div className="acc-temp">
      <div className="acc-temp-box">
        <input ref={input} value={value} readOnly aria-label="임시 비밀번호" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="acc-act" onClick={copy}>
          <Icon name={copied === "copied" ? "check" : "clipboard"} size={14} />
          <span>{copied === "copied" ? "복사됨" : "복사"}</span>
        </button>
      </div>
      {copied === "selected" ? <p className="acc-help">글자를 골라 두었습니다 — Ctrl+C 로 복사하세요.</p> : null}
      <div className="ds-callout warning">
        <Icon name="alert" size={16} />
        <span>이 창을 닫으면 다시 볼 수 없습니다. 받는 사람에게 직접 전하세요 — 첫 로그인 때 새 비밀번호로 바꿉니다.</span>
      </div>
    </div>
  );
};

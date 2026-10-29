import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../../app/store/authStore";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { ResponsiveTable } from "../../components/ui/ResponsiveTable";
import {
  accessApi,
  type AccountIssued,
  type AccountRow,
  type HistView,
  type UserAccessView
} from "../../services/accessApi";
import { Check, HistoryList, ModalError, NoticeBar, SectionTitle, errorText, useAccessLists, type Notice } from "./systemShared";
import "./system.css";

/* ============================================================
   시스템관리 › 사용자 관리 — 계정 만들기 · 잠그기 · 비밀번호 초기화 + 역할 여러 개 주기 + 가진 권한 보기.
   역할을 바꾸면 그 사람의 다음 동작부터 새 메뉴 · 단추 — 로그인은 끊지 않는다 (잠금 · 비밀번호만 끊는다).
   비밀번호는 서버가 임시로 만들어 이 화면에 한 번만 보여 준다 → 받은 사람이 첫 로그인 때 바꾼다.
   ============================================================ */

type StateFilter = "all" | "active" | "locked" | "temporary";
const STATE_FILTERS: Array<{ key: StateFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "active", label: "사용 중" },
  { key: "temporary", label: "임시 비밀번호" },
  { key: "locked", label: "잠김" }
];

type Confirm = { kind: "lock" | "unlock" | "reset"; account: AccountRow } | null;

const ROLE_TONES = ["info", "teal", "indigo", "violet", "warning", "gray", "consign", "success"];

export const UsersPage = () => {
  const me = useAuthStore((state) => state.user?.id ?? null);
  const lists = useAccessLists({ roles: true });
  const roles = lists.roles;

  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", roles: [] as string[] });
  const [edit, setEdit] = useState<AccountRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", roles: [] as string[] });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [issued, setIssued] = useState<AccountIssued | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const [owned, setOwned] = useState<{ account: AccountRow; view: UserAccessView | null; hist: HistView[]; error: string | null } | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    accessApi
      .accounts()
      .then(setRows)
      .catch((e) => setError(errorText(e, "조회 실패")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const roleByCode = useMemo(() => new Map(roles.map((r) => [r.code, r])), [roles]);
  const toneOf = (code: string) => {
    const role = roleByCode.get(code);
    if (role?.system) return "violet";
    if (role?.outside) return "consign";
    return ROLE_TONES[(role?.id ?? 0) % ROLE_TONES.length];
  };
  const roleName = (code: string) => roleByCode.get(code)?.name ?? code;
  const activeRoles = roles.filter((r) => r.active);

  const isMe = (a: AccountRow) => me != null && a.id.toLowerCase() === me.toLowerCase();

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
      if (roleFilter && !r.roles.includes(roleFilter)) return false;
      if (stateFilter === "active" && r.locked) return false;
      if (stateFilter === "locked" && !r.locked) return false;
      if (stateFilter === "temporary" && (r.locked || !r.mustChangePassword)) return false;
      return true;
    });
  }, [rows, keyword, roleFilter, stateFilter]);

  const upsert = (account: AccountRow) =>
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
      setModalError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const { data, message } = await accessApi.createAccount(form);
      upsert(data.account);
      setCreateOpen(false);
      setIssued(data);
      setNotice({ tone: "success", text: message ?? `${data.account.id} 계정을 만들었습니다 — 임시 비밀번호를 전해 주세요.` });
      void lists.reload();
    });

  const openEdit = (a: AccountRow) => {
    setModalError(null);
    setEdit(a);
    setEditForm({ name: a.name, roles: [...a.roles] });
  };

  const saveEdit = () =>
    run(async () => {
      if (!edit) return;
      const body = isMe(edit) ? { name: editForm.name } : { name: editForm.name, roles: editForm.roles };
      const { data } = await accessApi.updateAccount(edit.id, body);
      upsert(data);
      const roleChanged = data.roles.join() !== edit.roles.join();
      setEdit(null);
      setNotice({
        tone: "success",
        text: roleChanged
          ? `${data.name} — 역할을 ${data.roles.map(roleName).join(" · ")}(으)로 바꿨습니다. 다시 로그인하지 않아도 다음 동작부터 새 메뉴 · 단추가 보입니다.`
          : `${data.name} — 저장했습니다.`
      });
      void lists.reload();
    });

  const doConfirm = () =>
    run(async () => {
      if (!confirm) return;
      const id = confirm.account.id;
      if (confirm.kind === "reset") {
        const { data, message } = await accessApi.resetPassword(id);
        upsert(data.account);
        setIssued(data);
        setNotice({ tone: "success", text: message ?? `${id} 의 비밀번호를 초기화했습니다 — 임시 비밀번호를 전해 주세요.` });
      } else {
        const { data, message } = confirm.kind === "lock" ? await accessApi.lockAccount(id) : await accessApi.unlockAccount(id);
        upsert(data);
        setNotice({ tone: "success", text: message ?? (confirm.kind === "lock" ? `${id} 계정을 잠갔습니다.` : `${id} 계정의 잠금을 풀었습니다.`) });
      }
      setConfirm(null);
    });

  const openOwned = (a: AccountRow) => {
    setOwned({ account: a, view: null, hist: [], error: null });
    Promise.all([accessApi.userAccess(a.id), accessApi.history("user", a.id, 50)])
      .then(([view, hist]) => setOwned({ account: a, view, hist, error: null }))
      .catch((e) => setOwned({ account: a, view: null, hist: [], error: errorText(e, "불러오지 못했습니다.") }));
  };

  const toggleRole = (list: string[], code: string, on: boolean) => (on ? [...new Set([...list, code])] : list.filter((c) => c !== code));

  const rolePicker = (value: string[], onChange: (next: string[]) => void, disabled?: boolean) => (
    <div className="sys-role-pick">
      {activeRoles.map((role) => (
        <Check
          key={role.code}
          checked={value.includes(role.code)}
          disabled={disabled}
          onChange={(on) => onChange(toggleRole(value, role.code, on))}
          label={
            <>
              <span>
                {role.name}
                {role.system ? <small> · 모든 기능</small> : role.outside ? <small> · 바깥 사람</small> : null}
              </span>
              <small>{role.description ?? `${role.permissionCodes.length}개 권한`}</small>
            </>
          }
        />
      ))}
    </div>
  );

  const editingOutside = (codes: string[]) => codes.some((c) => roleByCode.get(c)?.outside);

  return (
    <section className="acc-page">
      <header className="card acc-head">
        <SectionTitle
          icon="user"
          title="사용자 관리"
          desc="계정을 만들고 역할을 줍니다(여러 개). 역할을 바꾸면 다시 로그인 없이 다음 동작부터 바로 적용됩니다."
        >
          <button
            type="button"
            className="btn-primary acc-create"
            onClick={() => {
              setForm({ id: "", name: "", roles: [] });
              setModalError(null);
              setCreateOpen(true);
            }}
          >
            <Icon name="userPlus" size={16} />
            계정 만들기
          </button>
        </SectionTitle>
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

      {error || lists.error ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>불러오기 실패: {error ?? lists.error}</span>
        </div>
      ) : null}
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <section className="card acc-list">
        <div className="acc-toolbar">
          <div className="acc-search">
            <Icon name="search" size={15} />
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="아이디 · 이름" aria-label="계정 검색" />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="역할">
            <option value="">모든 역할</option>
            {roles.map((role) => (
              <option key={role.code} value={role.code}>
                {role.name}
                {role.active ? "" : " (사용 안 함)"}
              </option>
            ))}
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
                      <div className="sys-chips">
                        {a.roles.length ? (
                          a.roles.map((code) => (
                            <span key={code} className={`ds-badge ${toneOf(code)}`}>
                              {roleName(code)}
                            </span>
                          ))
                        ) : (
                          <span className="ds-badge gray">역할 없음</span>
                        )}
                      </div>
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
                        <button type="button" className="acc-act" onClick={() => openOwned(a)} title="이 사람이 가진 권한 · 보이는 메뉴 · 역할 이력">
                          <Icon name="eye" size={14} />
                          <span>가진 권한</span>
                        </button>
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
        className="sys-wide-modal"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
              취소
            </button>
            <button type="button" className="btn-primary" disabled={busy || !form.roles.length} onClick={create}>
              만들기
            </button>
          </>
        }
      >
        <div className="acc-form">
          <div className="sys-fields">
            <label className="ds-field">
              <span>아이디</span>
              <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="예: hong.gildong 또는 사번" autoFocus />
              <small className="acc-help">영문 소문자 · 숫자로 시작, 3~30자 (. _ - 가능)</small>
            </label>
            <label className="ds-field">
              <span>이름</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 홍길동" />
            </label>
          </div>
          <div>
            <div className="sys-block-title">
              역할 <small>하나 이상 · 여러 개면 권한을 합친다</small>
            </div>
            {rolePicker(form.roles, (next) => setForm({ ...form, roles: next }))}
          </div>
          {editingOutside(form.roles) ? <OutsideWarning /> : null}
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
        className="sys-wide-modal"
        onClose={() => setEdit(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>
              취소
            </button>
            <button type="button" className="btn-primary" disabled={busy || (!editForm.roles.length && !(edit && isMe(edit)))} onClick={saveEdit}>
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
            <div>
              <div className="sys-block-title">
                역할 <small>{isMe(edit) ? "내 역할은 다른 관리자가 바꿉니다" : "여러 개면 권한을 합친다"}</small>
              </div>
              {rolePicker(editForm.roles, (next) => setEditForm({ ...editForm, roles: next }), isMe(edit))}
            </div>
            {!isMe(edit) && editForm.roles.join() !== edit.roles.join() ? (
              <div className="ds-callout info">
                <Icon name="bolt" size={16} />
                <span>저장하면 바로 적용됩니다 — 그 사람은 다시 로그인하지 않아도 다음 동작부터 새 메뉴 · 단추를 봅니다.</span>
              </div>
            ) : null}
            {editingOutside(editForm.roles) && !editingOutside(edit.roles) ? <OutsideWarning /> : null}
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
            <button type="button" className={confirm?.kind === "lock" ? "acc-danger" : "btn-primary"} disabled={busy} onClick={doConfirm}>
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

      {/* ---------- 가진 권한 (역할을 합친 것) ---------- */}
      <Modal
        open={owned !== null}
        title="가진 권한"
        desc={owned ? `${owned.account.name} · ${owned.account.id}` : ""}
        icon="shield"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary-ink)"
        className="sys-own-modal"
        onClose={() => setOwned(null)}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setOwned(null)}>
            닫기
          </button>
        }
      >
        {owned?.error ? <ModalError text={owned.error} /> : null}
        {owned && !owned.view && !owned.error ? <div className="sys-hist-empty">불러오는 중…</div> : null}
        {owned?.view ? <OwnedView view={owned.view} hist={owned.hist} roleName={roleName} /> : null}
      </Modal>
    </section>
  );
};

const OutsideWarning = () => (
  <div className="ds-callout warning">
    <Icon name="alert" size={16} />
    <span>바깥 사람(배송사) 역할입니다 — '자기 건만' 보는 범위가 아직 없어, 받은 권한의 화면에서 다른 회사 건도 보입니다.</span>
  </div>
);

const OwnedView = ({ view, hist, roleName }: { view: UserAccessView; hist: HistView[]; roleName: (code: string) => string }) => (
  <div className="sys-own">
    <div>
      <div className="sys-block-title">
        역할 <small>{view.admin ? "관리자 역할 — 모든 기능(새 기능도)" : `권한 ${view.permissions.length}개 · 기능 ${view.features.length}개`}</small>
      </div>
      <div className="sys-chips">
        {view.roles.length ? view.roles.map((r) => <span key={r.code} className="ds-badge info">{r.name}</span>) : <span className="ds-badge gray">역할 없음</span>}
      </div>
    </div>
    <div>
      <div className="sys-block-title">
        보이는 메뉴 <small>{view.menus.reduce((n, m) => n + m.screens.length, 0)}개 화면</small>
      </div>
      <div className="sys-own-menus">
        {view.menus.map((m) => (
          <div key={m.id} className="sys-own-menu">
            <b>{m.name}</b>
            {m.screens.map((s) => (
              <span key={s.id}>{s.name}</span>
            ))}
          </div>
        ))}
        {!view.menus.length ? <div className="sys-hist-empty">보이는 화면이 없습니다.</div> : null}
      </div>
    </div>
    <div>
      <div className="sys-block-title">
        권한 <small>어느 역할에서 왔나</small>
      </div>
      {view.permissions.map((p) => (
        <div key={p.code} className="sys-own-perm">
          <span>
            {p.name} <small className="sys-code">{p.code}</small>
          </span>
          <small>{p.viaRoles.map(roleName).join(" · ")}</small>
        </div>
      ))}
    </div>
    <div>
      <div className="sys-block-title">역할 이력</div>
      <HistoryList rows={hist} nameOf={roleName} empty="역할 이력이 없습니다." />
    </div>
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


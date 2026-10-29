import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import {
  accessApi,
  type HistKind,
  type HistView,
  type ModuleView,
  type PermissionKind,
  type PermissionView,
  type RoleView
} from "../../services/accessApi";
import {
  Check,
  HistoryList,
  KIND_LABEL,
  KIND_ORDER,
  ModalError,
  NoticeBar,
  SectionTitle,
  Switch,
  errorText,
  featureText,
  useAccessLists,
  useFeatureNames,
  type Notice
} from "./systemShared";
import "./system.css";

/* ============================================================
   시스템관리 › 권한 관리 (계정 · 권한 설계 v0.4)
   · 역할 탭 — 역할 = 권한의 묶음. 왼쪽 역할(가진 사람 수) → 오른쪽 구분(보기 · 처리 · 따로)별 권한 체크
   · 권한 탭 — 권한 = 기능의 묶음. 왼쪽 권한(모듈별) → 오른쪽 메뉴 모양으로 화면마다 [보기] [처리] [단추]
   · 이력 탭 — 저장마다 그때 상태 전체 한 줄(수정자 · 시각), 앞 줄과 비교해 넣은 것 · 뺀 것
   저장하면 바로 적용 — 그 역할 · 권한을 가진 사람의 다음 동작부터 (재시작 · 다시 로그인 없이).
   ============================================================ */

type Tab = "roles" | "permissions" | "history";

export const PermissionsPage = () => {
  const lists = useAccessLists({ roles: true, permissions: true, menus: true });
  const names = useFeatureNames(lists.menus);
  const [tab, setTab] = useState<Tab>("roles");
  const [notice, setNotice] = useState<Notice>(null);

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "roles", label: "역할", count: lists.roles.length },
    { key: "permissions", label: "권한", count: lists.permissions.length },
    { key: "history", label: "이력" }
  ];

  return (
    <section className="acc-page">
      <header className="card acc-head">
        <SectionTitle
          icon="shield"
          title="권한 관리"
          desc="역할 = 권한의 묶음, 권한 = 기능(화면 · 단추)의 묶음. 저장하면 재시작 · 다시 로그인 없이 다음 동작부터 바로 적용됩니다."
        >
          <div className="sys-tabs" role="tablist" aria-label="권한 관리">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`sys-tab${tab === t.key ? " is-on" : ""}`} onClick={() => setTab(t.key)}>
                {t.label}
                {t.count != null ? <small>{t.count}</small> : null}
              </button>
            ))}
          </div>
        </SectionTitle>
      </header>

      {lists.error ? (
        <div className="ds-callout danger">
          <Icon name="alert" size={18} />
          <span>불러오기 실패: {lists.error}</span>
        </div>
      ) : null}
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {lists.loading ? (
        <div className="card sys-empty">불러오는 중…</div>
      ) : tab === "roles" ? (
        <RolesTab roles={lists.roles} permissions={lists.permissions} reload={lists.reload} setNotice={setNotice} />
      ) : tab === "permissions" ? (
        <PermissionsTab permissions={lists.permissions} roles={lists.roles} menus={lists.menus} names={names} reload={lists.reload} setNotice={setNotice} />
      ) : (
        <HistoryTab roles={lists.roles} permissions={lists.permissions} names={names} />
      )}
    </section>
  );
};

/* ============================================================
   역할 탭
   ============================================================ */

type RoleDraft = { name: string; description: string; outside: boolean; active: boolean; permissionCodes: string[] };
const roleDraftOf = (r: RoleView): RoleDraft => ({
  name: r.name,
  description: r.description ?? "",
  outside: r.outside,
  active: r.active,
  permissionCodes: [...r.permissionCodes].sort()
});
const sameDraft = (a: RoleDraft, b: RoleDraft) => JSON.stringify(a) === JSON.stringify(b);

type TabProps = { reload: () => Promise<void>; setNotice: (n: Notice) => void };

const RolesTab = ({ roles, permissions, reload, setNotice }: { roles: RoleView[]; permissions: PermissionView[] } & TabProps) => {
  const [selectedId, setSelectedId] = useState<number | null>(() => roles.find((r) => !r.system)?.id ?? roles[0]?.id ?? null);
  const selected = roles.find((r) => r.id === selectedId) ?? null;
  const [draft, setDraft] = useState<RoleDraft | null>(selected ? roleDraftOf(selected) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState<{ copyFrom: number | null } | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", description: "", outside: false });
  const [retire, setRetire] = useState(false);
  const [hist, setHist] = useState<HistView[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // 고른 역할 · 목록이 바뀌면 편집 칸을 그 역할로
  useEffect(() => {
    setDraft(selected ? roleDraftOf(selected) : null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, roles]);

  useEffect(() => {
    if (!selected) return;
    setHistLoading(true);
    accessApi
      .history("role", selected.code, 50)
      .then(setHist)
      .catch(() => setHist([]))
      .finally(() => setHistLoading(false));
  }, [selected?.code, selected?.updatedAt]);

  const permByCode = useMemo(() => new Map(permissions.map((p) => [p.code, p])), [permissions]);
  const dirty = selected && draft ? !sameDraft(draft, roleDraftOf(selected)) : false;
  const added = selected && draft ? draft.permissionCodes.filter((c) => !selected.permissionCodes.includes(c)) : [];

  const save = async () => {
    if (!selected || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const { data, message } = await accessApi.updateRole(selected.id, {
        name: draft.name,
        description: draft.description,
        outside: draft.outside,
        active: draft.active,
        permissionCodes: draft.permissionCodes
      });
      setNotice({ tone: "success", text: message ?? (data.changed ? "저장했습니다." : "바뀐 것이 없습니다.") });
      setRetire(false);
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!createOpen) return;
    setBusy(true);
    setError(null);
    try {
      const { data, message } = await accessApi.createRole({
        name: createForm.name,
        description: createForm.description,
        outside: createForm.outside,
        ...(createOpen.copyFrom != null ? { copyFrom: createOpen.copyFrom } : { permissionCodes: [] })
      });
      setNotice({ tone: "success", text: message ?? "역할을 만들었습니다." });
      setCreateOpen(null);
      await reload();
      const fresh = await accessApi.roles();
      setSelectedId(fresh.find((r) => r.code === data.key)?.id ?? null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const togglePerm = (code: string, on: boolean) =>
    setDraft((d) => (d ? { ...d, permissionCodes: (on ? [...new Set([...d.permissionCodes, code])] : d.permissionCodes.filter((c) => c !== code)).sort() } : d));

  return (
    <div className="sys-split">
      <section className="card sys-pane">
        <div className="sys-pane-head">
          <h3>역할</h3>
          <button
            type="button"
            className="acc-act is-primary"
            onClick={() => {
              setCreateForm({ name: "", description: "", outside: false });
              setError(null);
              setCreateOpen({ copyFrom: null });
            }}
          >
            <Icon name="plus" size={14} />
            <span>역할 만들기</span>
          </button>
        </div>
        <div className="sys-list" role="listbox" aria-label="역할 목록">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={r.id === selectedId}
              className={`sys-item${r.id === selectedId ? " is-on" : ""}${r.active ? "" : " is-off"}`}
              onClick={() => setSelectedId(r.id)}
            >
              <span>
                <b>
                  <span>{r.name}</span>
                  {r.system ? <span className="ds-badge violet">모든 기능</span> : null}
                  {r.outside ? <span className="ds-badge consign">바깥</span> : null}
                  {r.active ? null : <span className="ds-badge gray">사용 안 함</span>}
                </b>
                <small>
                  {r.code} · {r.system ? "잠김" : `권한 ${r.permissionCodes.length}개`}
                </small>
              </span>
              <span className="sys-count" title="가진 사람">
                {r.userCount}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="card sys-editor">
        {!selected || !draft ? (
          <div className="sys-empty">왼쪽에서 역할을 고르세요.</div>
        ) : (
          <>
            <div className="sys-editor-head">
              <div>
                <h3>
                  {selected.name} <span className="sys-code">{selected.code}</span>
                </h3>
                <p>
                  가진 사람 {selected.userCount}명 · 고친 때 {selected.updatedAt ?? selected.createdAt ?? "—"}
                  {selected.updatedBy ? ` · ${selected.updatedBy}` : ""}
                </p>
              </div>
              {!selected.system ? (
                <button
                  type="button"
                  className="acc-act"
                  onClick={() => {
                    setCreateForm({ name: `${selected.name} 복사본`, description: selected.description ?? "", outside: selected.outside });
                    setError(null);
                    setCreateOpen({ copyFrom: selected.id });
                  }}
                >
                  <Icon name="layers" size={14} />
                  <span>복사해서 만들기</span>
                </button>
              ) : null}
            </div>

            <div className="sys-editor-body">
              {selected.system ? (
                <div className="sys-lock">
                  <Icon name="lock" size={18} />
                  <span>
                    <b>시스템 역할 — 모든 기능</b>을 갖습니다(새 기능도). 지우거나 바꿀 수 없고, 사용자 · 메뉴 · 권한 관리는 이 역할만 합니다.
                  </span>
                </div>
              ) : (
                <>
                  <div className="sys-fields">
                    <label className="ds-field">
                      <span>이름</span>
                      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </label>
                    <label className="ds-field">
                      <span>설명</span>
                      <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="무엇을 하는 역할인가" />
                    </label>
                    <div className="is-wide" style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                      <Switch checked={draft.outside} onChange={(v) => setDraft({ ...draft, outside: v })} label="바깥 사람(배송사) 역할" />
                      <Switch checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label={draft.active ? "사용" : "사용 안 함"} />
                    </div>
                  </div>

                  {draft.outside && added.length ? (
                    <div className="ds-callout warning">
                      <Icon name="alert" size={16} />
                      <span>바깥 사람 역할에 권한을 넣습니다 — '자기 건만' 보는 범위가 아직 없어, 그 화면에서 다른 회사 건도 보입니다.</span>
                    </div>
                  ) : null}

                  <div className="sys-kinds">
                    {KIND_ORDER.map((kind) => {
                      const list = permissions.filter((p) => p.kind === kind && (p.active || draft.permissionCodes.includes(p.code)));
                      if (!list.length) return null;
                      const on = list.filter((p) => draft.permissionCodes.includes(p.code)).length;
                      return (
                        <div key={kind} className="sys-kind">
                          <div className="sys-kind-head">
                            {KIND_LABEL[kind as PermissionKind]}
                            <small>
                              {on}/{list.length}
                            </small>
                          </div>
                          <div className="sys-kind-body">
                            {list.map((p) => (
                              <Check
                                key={p.code}
                                tone={kind === "VIEW" ? "view" : kind === "WORK" ? "work" : "button"}
                                checked={draft.permissionCodes.includes(p.code)}
                                disabled={p.system || (!p.active && !draft.permissionCodes.includes(p.code))}
                                hint={p.system ? "계정 · 권한 관리는 관리자 역할에만 넣을 수 있습니다" : `${p.featureCodes.length}개 기능`}
                                onChange={(next) => togglePerm(p.code, next)}
                                label={
                                  <>
                                    {p.name}
                                    <small>{p.system ? "잠김" : p.active ? p.module : "사용 안 함"}</small>
                                  </>
                                }
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {error ? <ModalError text={error} /> : null}

              <div>
                <div className="sys-block-title">
                  이력 <small>저장마다 그때 권한 전체 · 수정자 · 시각</small>
                </div>
                <HistoryList rows={hist} loading={histLoading} nameOf={(c) => (c === "*" ? "모든 기능" : permByCode.get(c)?.name ?? c)} />
              </div>
            </div>

            {!selected.system ? (
              <div className="sys-savebar">
                {dirty ? (
                  <span className="sys-dirty">
                    <Icon name="edit" size={13} />
                    저장하지 않은 변경
                  </span>
                ) : (
                  <span className="sys-clean">저장하면 이 역할을 가진 {selected.userCount}명에게 바로 적용됩니다.</span>
                )}
                <button type="button" className="btn-secondary" disabled={!dirty || busy} onClick={() => setDraft(roleDraftOf(selected))}>
                  되돌리기
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!dirty || busy || !draft.name.trim()}
                  onClick={() => (selected.active && !draft.active ? setRetire(true) : void save())}
                >
                  저장
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <Modal
        open={createOpen !== null}
        title={createOpen?.copyFrom != null ? "복사해서 역할 만들기" : "역할 만들기"}
        desc={createOpen?.copyFrom != null ? "고른 역할의 권한으로 시작합니다 — 만든 뒤 체크를 고치세요." : "빈 역할로 만든 뒤 권한을 체크합니다."}
        icon="plus"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary-ink)"
        onClose={() => setCreateOpen(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(null)}>
              취소
            </button>
            <button type="button" className="btn-primary" disabled={busy || !createForm.name.trim()} onClick={() => void create()}>
              만들기
            </button>
          </>
        }
      >
        <div className="acc-form">
          <label className="ds-field">
            <span>이름</span>
            <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="예: 야간 출고" autoFocus />
          </label>
          <label className="ds-field">
            <span>설명</span>
            <input value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="무엇을 하는 역할인가" />
          </label>
          <Switch checked={createForm.outside} onChange={(v) => setCreateForm({ ...createForm, outside: v })} label="바깥 사람(배송사) 역할" />
          <small className="acc-help">코드는 자동으로 정해집니다 (예 role_011).</small>
        </div>
        {error ? <ModalError text={error} /> : null}
      </Modal>

      <Modal
        open={retire}
        title="역할 사용 안 함"
        desc={selected ? `${selected.name} · ${selected.code}` : ""}
        icon="ban"
        iconBg="var(--c-danger-bg)"
        iconColor="var(--c-danger-ink)"
        onClose={() => setRetire(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setRetire(false)}>
              취소
            </button>
            <button type="button" className="acc-danger" disabled={busy} onClick={() => void save()}>
              사용 안 함으로 저장
            </button>
          </>
        }
      >
        <div className="ds-callout warning">
          <Icon name="alert" size={16} />
          <span>
            이 역할을 가진 {selected?.userCount ?? 0}명에게서 바로 빠집니다 — 다음 동작부터 그 메뉴 · 단추가 사라집니다. 이력은 남습니다.
          </span>
        </div>
      </Modal>
    </div>
  );
};

/* ============================================================
   권한 탭
   ============================================================ */

type PermDraft = { name: string; description: string; module: string; kind: PermissionKind; active: boolean; featureCodes: string[] };
const permDraftOf = (p: PermissionView): PermDraft => ({
  name: p.name,
  description: p.description ?? "",
  module: p.module,
  kind: p.kind,
  active: p.active,
  featureCodes: [...p.featureCodes].sort()
});
const NEW = "__new__";

const PermissionsTab = ({
  permissions,
  roles,
  menus,
  names,
  reload,
  setNotice
}: { permissions: PermissionView[]; roles: RoleView[]; menus: ModuleView[]; names: Map<string, { screen: string; label: string }> } & TabProps) => {
  const [selectedCode, setSelectedCode] = useState<string | null>(() => permissions[0]?.code ?? null);
  const selected = selectedCode === NEW ? null : permissions.find((p) => p.code === selectedCode) ?? null;
  const [draft, setDraft] = useState<PermDraft | null>(selected ? permDraftOf(selected) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retire, setRetire] = useState(false);
  const [hist, setHist] = useState<HistView[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    if (selectedCode === NEW) return;
    setDraft(selected ? permDraftOf(selected) : null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCode, permissions]);

  useEffect(() => {
    if (!selected) {
      setHist([]);
      return;
    }
    setHistLoading(true);
    accessApi
      .history("permission", selected.code, 50)
      .then(setHist)
      .catch(() => setHist([]))
      .finally(() => setHistLoading(false));
  }, [selected?.code, selected?.updatedAt]);

  const roleName = useMemo(() => new Map(roles.map((r) => [r.code, r.name])), [roles]);
  const groups = useMemo(() => {
    const map = new Map<string, PermissionView[]>();
    permissions.forEach((p) => map.set(p.module, [...(map.get(p.module) ?? []), p]));
    return [...map.entries()];
  }, [permissions]);

  const locked = Boolean(selected?.system);
  const dirty = selectedCode === NEW ? true : selected && draft ? JSON.stringify(draft) !== JSON.stringify(permDraftOf(selected)) : false;

  /** 체크 — 처리 · 단추를 넣으면 그 화면의 보기도, 보기를 빼면 그 화면의 처리 · 단추도 (서버와 같은 규칙) */
  const toggleFeature = (screenCode: string, featureCode: string, on: boolean) =>
    setDraft((d) => {
      if (!d) return d;
      const view = `${screenCode}:view`;
      let next = new Set(d.featureCodes);
      if (on) {
        next.add(featureCode);
        next.add(view);
      } else if (featureCode === view) {
        next = new Set([...next].filter((c) => !c.startsWith(`${screenCode}:`)));
      } else {
        next.delete(featureCode);
      }
      return { ...d, featureCodes: [...next].sort() };
    });

  const startNew = (copy?: PermissionView) => {
    setSelectedCode(NEW);
    setError(null);
    setDraft(
      copy
        ? { name: `${copy.name} 복사본`, description: copy.description ?? "", module: copy.module, kind: copy.kind, active: true, featureCodes: [...copy.featureCodes] }
        : { name: "", description: "", module: "", kind: "VIEW", active: true, featureCodes: [] }
    );
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      if (selectedCode === NEW) {
        const { data, message } = await accessApi.createPermission({
          name: draft.name,
          description: draft.description,
          module: draft.module || undefined,
          kind: draft.kind,
          featureCodes: draft.featureCodes
        });
        setNotice({ tone: "success", text: message ?? "권한을 만들었습니다." });
        await reload();
        setSelectedCode(data.key);
      } else if (selected) {
        const { data, message } = await accessApi.updatePermission(selected.code, {
          name: draft.name,
          description: draft.description,
          module: draft.module,
          kind: draft.kind,
          active: draft.active,
          featureCodes: draft.featureCodes
        });
        setNotice({ tone: "success", text: message ?? (data.changed ? "저장했습니다." : "바뀐 것이 없습니다.") });
        setRetire(false);
        await reload();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const featureCount = (module: ModuleView) =>
    module.screens.reduce((n, s) => n + s.features.filter((f) => draft?.featureCodes.includes(f.code)).length, 0);

  return (
    <div className="sys-split">
      <section className="card sys-pane">
        <div className="sys-pane-head">
          <h3>권한</h3>
          <button type="button" className="acc-act is-primary" onClick={() => startNew()}>
            <Icon name="plus" size={14} />
            <span>권한 만들기</span>
          </button>
        </div>
        <div className="sys-list" role="listbox" aria-label="권한 목록">
          {selectedCode === NEW ? (
            <button type="button" className="sys-item is-on">
              <span>
                <b>
                  <span>{draft?.name || "새 권한"}</span>
                  <span className="ds-badge info">만드는 중</span>
                </b>
                <small>저장하면 코드가 정해집니다</small>
              </span>
            </button>
          ) : null}
          {groups.map(([module, list]) => (
            <div key={module} style={{ display: "contents" }}>
              <div className="sys-group-title">{module}</div>
              {list.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  role="option"
                  aria-selected={p.code === selectedCode}
                  className={`sys-item${p.code === selectedCode ? " is-on" : ""}${p.active ? "" : " is-off"}`}
                  onClick={() => setSelectedCode(p.code)}
                >
                  <span>
                    <b>
                      <span>{p.name}</span>
                      {p.system ? <span className="ds-badge violet">잠김</span> : null}
                      {p.active ? null : <span className="ds-badge gray">사용 안 함</span>}
                    </b>
                    <small>
                      {KIND_LABEL[p.kind]} · 기능 {p.featureCodes.length}개 · {p.code}
                    </small>
                  </span>
                  <span className="sys-count" title="쓰는 역할">
                    {p.roleCodes.length}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="card sys-editor">
        {!draft ? (
          <div className="sys-empty">왼쪽에서 권한을 고르세요.</div>
        ) : (
          <>
            <div className="sys-editor-head">
              <div>
                <h3>
                  {selectedCode === NEW ? "새 권한" : selected?.name}
                  {selected ? <span className="sys-code">{selected.code}</span> : null}
                </h3>
                <p>
                  {selected
                    ? `쓰는 역할 ${selected.roleCodes.length}개 · 사람 ${selected.userCount}명${selected.roleCodes.length ? ` — ${selected.roleCodes.map((c) => roleName.get(c) ?? c).join(" · ")}` : ""}`
                    : "이름을 넣고 화면마다 [보기] [처리] [단추] 를 체크합니다. 역할 탭에서 역할에 넣으면 바로 적용됩니다."}
                </p>
              </div>
              {selected && !locked ? (
                <button type="button" className="acc-act" onClick={() => startNew(selected)}>
                  <Icon name="layers" size={14} />
                  <span>복사해서 만들기</span>
                </button>
              ) : null}
            </div>

            <div className="sys-editor-body">
              {locked ? (
                <div className="sys-lock">
                  <Icon name="lock" size={18} />
                  <span>
                    <b>시스템 권한</b> — 사용자 · 메뉴 · 권한 관리 기능만 담고, 관리자 역할만 갖습니다. 바꾸거나 다른 역할에 넣을 수 없습니다.
                  </span>
                </div>
              ) : (
                <div className="sys-fields">
                  <label className="ds-field">
                    <span>이름</span>
                    <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="예: 배송 내역 보기" autoFocus={selectedCode === NEW} />
                  </label>
                  <label className="ds-field">
                    <span>설명</span>
                    <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="무엇을 여는 권한인가" />
                  </label>
                  <label className="ds-field">
                    <span>묶어 보일 모듈</span>
                    <input value={draft.module} onChange={(e) => setDraft({ ...draft, module: e.target.value })} placeholder="비우면 첫 기능의 모듈" />
                  </label>
                  <label className="ds-field">
                    <span>구분 (역할 탭의 칸)</span>
                    <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as PermissionKind })}>
                      {KIND_ORDER.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selected ? (
                    <div className="is-wide">
                      <Switch checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label={draft.active ? "사용" : "사용 안 함"} />
                    </div>
                  ) : null}
                </div>
              )}

              <div>
                <div className="sys-block-title">
                  기능 <small>{draft.featureCodes.length}개 — 처리 · 단추를 넣으면 보기도 함께, 보기를 빼면 그 화면의 처리 · 단추도 빠집니다</small>
                </div>
                <div className="sys-matrix">
                  {menus.map((module) => {
                    const screens = module.screens.filter((s) => !s.loginOnly);
                    if (!screens.length) return null;
                    const systemModule = module.system;
                    if (systemModule && !locked) return null;
                    return (
                      <div key={module.id} className="sys-mod">
                        <div className="sys-mod-head">
                          {module.name}
                          <small>{featureCount(module)}개</small>
                        </div>
                        {screens.map((screen) => (
                          <div key={screen.id} className={`sys-screen${locked ? " is-locked" : ""}`}>
                            <div className="sys-screen-name">
                              {screen.name}
                              {!screen.active ? <small>메뉴에서 숨김</small> : null}
                            </div>
                            <div className="sys-screen-checks">
                              {screen.features.map((f) => (
                                <Check
                                  key={f.code}
                                  tone={f.kind === "VIEW" ? "view" : f.kind === "WORK" ? "work" : "button"}
                                  checked={draft.featureCodes.includes(f.code)}
                                  disabled={locked}
                                  hint={f.name}
                                  onChange={(on) => toggleFeature(screen.code, f.code, on)}
                                  label={f.kind === "VIEW" ? "보기" : f.label}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {error ? <ModalError text={error} /> : null}

              {selected ? (
                <div>
                  <div className="sys-block-title">
                    이력 <small>저장마다 그때 기능 전체 · 수정자 · 시각</small>
                  </div>
                  <HistoryList rows={hist} loading={histLoading} nameOf={(c) => featureText(names, c)} />
                </div>
              ) : null}
            </div>

            {!locked ? (
              <div className="sys-savebar">
                {dirty ? (
                  <span className="sys-dirty">
                    <Icon name="edit" size={13} />
                    {selectedCode === NEW ? "새 권한 — 아직 저장 전" : "저장하지 않은 변경"}
                  </span>
                ) : (
                  <span className="sys-clean">저장하면 이 권한을 쓰는 역할에 바로 적용됩니다.</span>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy || (!dirty && selectedCode !== NEW)}
                  onClick={() => (selectedCode === NEW ? setSelectedCode(permissions[0]?.code ?? null) : selected && setDraft(permDraftOf(selected)))}
                >
                  {selectedCode === NEW ? "취소" : "되돌리기"}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!dirty || busy || !draft.name.trim() || (draft.active && !draft.featureCodes.length)}
                  onClick={() => (selected && selected.active && !draft.active ? setRetire(true) : void save())}
                >
                  {selectedCode === NEW ? "권한 만들기" : "저장"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <Modal
        open={retire}
        title="권한 사용 안 함"
        desc={selected ? `${selected.name} · ${selected.code}` : ""}
        icon="ban"
        iconBg="var(--c-danger-bg)"
        iconColor="var(--c-danger-ink)"
        onClose={() => setRetire(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setRetire(false)}>
              취소
            </button>
            <button type="button" className="acc-danger" disabled={busy} onClick={() => void save()}>
              사용 안 함으로 저장
            </button>
          </>
        }
      >
        <div className="ds-callout warning">
          <Icon name="alert" size={16} />
          <span>
            쓰던 역할 {selected?.roleCodes.length ?? 0}개(사람 {selected?.userCount ?? 0}명)에서 바로 빠집니다 — 다음 동작부터 그 화면 · 단추가 닫힙니다.
            이력은 남고, 다시 '사용' 으로 돌릴 수 있습니다(역할에는 다시 넣어야 합니다).
          </span>
        </div>
      </Modal>
    </div>
  );
};

/* ============================================================
   이력 탭 — 종류별 최근 이력 (메뉴 이력은 메뉴 관리에서)
   ============================================================ */

const HistoryTab = ({ roles, permissions, names }: { roles: RoleView[]; permissions: PermissionView[]; names: Map<string, { screen: string; label: string }> }) => {
  const [kind, setKind] = useState<HistKind>("permission");
  const [rows, setRows] = useState<HistView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    accessApi
      .history(kind, undefined, 200)
      .then(setRows)
      .catch((e) => setError(errorText(e, "불러오지 못했습니다.")))
      .finally(() => setLoading(false));
  }, [kind]);

  const permName = useMemo(() => new Map(permissions.map((p) => [p.code, p.name])), [permissions]);
  const roleName = useMemo(() => new Map(roles.map((r) => [r.code, r.name])), [roles]);
  const nameOf = (code: string) =>
    kind === "permission" ? featureText(names, code) : kind === "role" ? (code === "*" ? "모든 기능" : permName.get(code) ?? code) : roleName.get(code) ?? code;

  const kinds: Array<{ key: HistKind; label: string }> = [
    { key: "permission", label: "권한의 기능" },
    { key: "role", label: "역할의 권한" },
    { key: "user", label: "사람의 역할" }
  ];

  return (
    <section className="card sys-editor">
      <div className="sys-editor-head">
        <div>
          <h3>최근 이력</h3>
          <p>저장마다 대상 하나의 그때 상태 전체를 한 줄로 — 수정자 · 시각. 앞 줄과 비교해 넣은 것(+) · 뺀 것(−)을 보입니다.</p>
        </div>
        <div className="sys-tabs" role="tablist" aria-label="이력 종류">
          {kinds.map((k) => (
            <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} className={`sys-tab${kind === k.key ? " is-on" : ""}`} onClick={() => setKind(k.key)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="sys-editor-body">
        {error ? <ModalError text={error} /> : <HistoryList rows={rows} loading={loading} nameOf={nameOf} showTarget />}
      </div>
    </section>
  );
};


import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { accessApi, type HistView, type ModuleView, type ScreenView } from "../../services/accessApi";
import {
  Check,
  HistoryList,
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
   시스템관리 › 메뉴 관리 (설계 8장)
   · 모듈 · 화면의 이름 · 순서 · 보임/숨김 · 모듈 옮기기 — 저장하면 모두의 메뉴가 바로 바뀐다
   · 이 화면을 여는 권한 — 그 화면의 '보기' 를 담은 권한들. 붙이면 그 권한에 보기가 들어가고,
     떼면 그 화면의 보기 · 처리 · 단추가 빠진다 (권한 이력에 남는다)
   · 화면 자체(주소 · 기능)는 코드가 정한다 — 새 화면은 개발로. 메뉴에서 숨겨도 기능은 그대로다(권한이 아니다)
   ============================================================ */

type Selected = { kind: "module"; id: number } | { kind: "screen"; id: number } | null;

export const MenusPage = () => {
  const lists = useAccessLists({ permissions: true, menus: true });
  const names = useFeatureNames(lists.menus);
  const [selected, setSelected] = useState<Selected>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [moduleName, setModuleName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modules = lists.menus;
  const screens = useMemo(() => modules.flatMap((m) => m.screens), [modules]);
  const module = selected?.kind === "module" ? modules.find((m) => m.id === selected.id) ?? null : null;
  const screen = selected?.kind === "screen" ? screens.find((s) => s.id === selected.id) ?? null : null;

  useEffect(() => {
    if (!selected && modules.length) {
      const first = modules.find((m) => !m.system)?.screens[0];
      if (first) setSelected({ kind: "screen", id: first.id });
    }
  }, [modules, selected]);

  const createModule = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, message } = await accessApi.createModule({ name: moduleName });
      setNotice({ tone: "success", text: message ?? "모듈을 만들었습니다." });
      setCreateOpen(false);
      await lists.reload();
      setSelected({ kind: "module", id: Number(data.key) });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="acc-page">
      <header className="card acc-head">
        <SectionTitle
          icon="listMode"
          title="메뉴 관리"
          desc="메뉴 이름 · 순서 · 보임/숨김 · 모듈과, 화면을 여는 권한을 바꿉니다. 저장하면 모두의 메뉴가 다시 로그인 없이 바로 바뀝니다."
        >
          <button
            type="button"
            className="acc-act is-primary"
            onClick={() => {
              setModuleName("");
              setError(null);
              setCreateOpen(true);
            }}
          >
            <Icon name="plus" size={14} />
            <span>모듈 만들기</span>
          </button>
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
      ) : (
        <div className="sys-split">
          <section className="card sys-pane">
            <div className="sys-pane-head">
              <h3>메뉴</h3>
              <small>
                모듈 {modules.length} · 화면 {screens.length}
              </small>
            </div>
            <div className="sys-tree">
              {modules.map((m) => (
                <div key={m.id} className="sys-tree-mod">
                  <button
                    type="button"
                    className={`sys-tree-row is-module${selected?.kind === "module" && selected.id === m.id ? " is-on" : ""}${m.active ? "" : " is-hidden"}`}
                    onClick={() => setSelected({ kind: "module", id: m.id })}
                  >
                    <span className="sys-tree-ico">
                      <Icon name="layers" size={14} />
                    </span>
                    <b>{m.name}</b>
                    <span className="sys-tree-tags">
                      {m.system ? <span className="ds-badge violet">잠김</span> : null}
                      {m.custom ? <span className="ds-badge info">만든 묶음</span> : null}
                      {m.active ? null : <span className="ds-badge gray">숨김</span>}
                    </span>
                  </button>
                  {m.screens.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`sys-tree-row sys-tree-screen${selected?.kind === "screen" && selected.id === s.id ? " is-on" : ""}${s.active && m.active ? "" : " is-hidden"}`}
                      onClick={() => setSelected({ kind: "screen", id: s.id })}
                    >
                      <span className="sys-tree-ico">
                        <Icon name="chevR" size={12} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <b>{s.name}</b>
                        <span className="sys-tree-sub">/{s.code}</span>
                      </span>
                      <span className="sys-tree-tags">
                        {s.loginOnly ? <span className="ds-badge teal">로그인만</span> : <span className="ds-badge gray" title="여는 권한">{s.openers.length}</span>}
                        {s.active ? null : <span className="ds-badge gray">숨김</span>}
                      </span>
                    </button>
                  ))}
                  {!m.screens.length ? <div className="sys-hist-empty" style={{ paddingLeft: 36 }}>화면이 없습니다 — 화면을 고르고 이 모듈로 옮겨 담으세요.</div> : null}
                </div>
              ))}
            </div>
          </section>

          {module ? (
            <MenuEditor key={`m-${module.id}-${module.updatedAt}`} target={module} modules={modules} reload={lists.reload} setNotice={setNotice} names={names} />
          ) : screen ? (
            <MenuEditor
              key={`s-${screen.id}-${screen.updatedAt}-${screen.openers.join()}`}
              target={screen}
              modules={modules}
              permissions={lists.permissions}
              reload={lists.reload}
              setNotice={setNotice}
              names={names}
            />
          ) : (
            <section className="card sys-editor">
              <div className="sys-empty">왼쪽에서 모듈이나 화면을 고르세요.</div>
            </section>
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        title="모듈 만들기"
        desc="화면을 옮겨 담을 메뉴 묶음입니다. 화면 자체(주소 · 기능)는 코드가 정합니다."
        icon="plus"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary-ink)"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
              취소
            </button>
            <button type="button" className="btn-primary" disabled={busy || !moduleName.trim()} onClick={() => void createModule()}>
              만들기
            </button>
          </>
        }
      >
        <label className="ds-field">
          <span>모듈 이름</span>
          <input value={moduleName} onChange={(e) => setModuleName(e.target.value)} placeholder="예: 현장 작업" autoFocus />
        </label>
        {error ? <ModalError text={error} /> : null}
      </Modal>
    </section>
  );
};

/* ---------------- 오른쪽 편집 ---------------- */

type EditorProps = {
  target: ModuleView | ScreenView;
  modules: ModuleView[];
  permissions?: { code: string; name: string; module: string; system: boolean; active: boolean; featureCodes: string[] }[];
  reload: () => Promise<void>;
  setNotice: (n: Notice) => void;
  names: Map<string, { screen: string; label: string }>;
};

const isScreen = (t: ModuleView | ScreenView): t is ScreenView => "features" in t;

const MenuEditor = ({ target, modules, permissions = [], reload, setNotice, names }: EditorProps) => {
  const screen = isScreen(target) ? target : null;
  const [name, setName] = useState(target.name);
  const [order, setOrder] = useState(String(target.order));
  const [active, setActive] = useState(target.active);
  const [parentId, setParentId] = useState<number | null>(screen ? screen.parentId : null);
  const [openers, setOpeners] = useState<string[]>(screen ? [...screen.openers] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hist, setHist] = useState<HistView[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    setHistLoading(true);
    accessApi
      .menuHistory(target.id)
      .then(setHist)
      .catch(() => setHist([]))
      .finally(() => setHistLoading(false));
  }, [target.id]);

  const menuDirty = name !== target.name || order !== String(target.order) || active !== target.active || (screen != null && parentId !== screen.parentId);
  const openersDirty = screen != null && [...openers].sort().join() !== [...screen.openers].sort().join();
  const lockedOpeners = !screen || screen.loginOnly || screen.system;

  const saveMenu = async () => {
    setBusy(true);
    setError(null);
    try {
      const { message } = await accessApi.updateMenu(target.id, {
        name,
        sortOrder: Number(order),
        active,
        ...(screen && parentId != null && parentId !== screen.parentId ? { parentId } : {})
      });
      setNotice({ tone: "success", text: message ?? "저장했습니다 — 메뉴가 바로 바뀝니다." });
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const saveOpeners = async () => {
    if (!screen) return;
    setBusy(true);
    setError(null);
    try {
      const { message } = await accessApi.setOpeners(screen.id, openers);
      setNotice({ tone: "success", text: message ?? "저장했습니다 — 이 화면을 여는 권한이 바뀌었습니다." });
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const removed = screen ? screen.openers.filter((c) => !openers.includes(c)) : [];
  const parentModule = screen ? modules.find((m) => m.id === screen.parentId) : null;
  const permName = new Map(permissions.map((p) => [p.code, p.name]));

  return (
    <section className="card sys-editor">
      <div className="sys-editor-head">
        <div>
          <h3>
            {target.name} <span className="sys-code">{target.code}</span>
          </h3>
          <p>
            {screen ? `화면 · ${parentModule?.name ?? ""}` : "모듈"}
            {target.defaultName && target.defaultName !== target.name ? ` · 원래 이름 ${target.defaultName}` : ""}
            {target.updatedBy ? ` · 고친 사람 ${target.updatedBy} (${target.updatedAt ?? ""})` : ""}
          </p>
        </div>
      </div>

      <div className="sys-editor-body">
        <div className="sys-fields">
          <label className="ds-field">
            <span>메뉴 이름</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="ds-field">
            <span>순서 (작을수록 위)</span>
            <input type="number" min={0} max={99999} value={order} onChange={(e) => setOrder(e.target.value)} />
          </label>
          {screen ? (
            <label className="ds-field">
              <span>모듈</span>
              <select value={parentId ?? ""} disabled={screen.system} onChange={(e) => setParentId(Number(e.target.value))}>
                {modules
                  .filter((m) => !m.system || m.id === screen.parentId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.active ? "" : " (숨김)"}
                    </option>
                  ))}
              </select>
              <small className="acc-help">옮겨도 화면 주소 · 기능은 그대로입니다 (즐겨찾기도 그대로).</small>
            </label>
          ) : null}
          <div className={screen ? "" : "is-wide"} style={{ alignSelf: "end" }}>
            <Switch
              checked={active}
              disabled={target.system}
              onChange={setActive}
              label={active ? "메뉴에 보임" : "메뉴에서 숨김"}
            />
            <small className="acc-help">
              {target.system ? "시스템관리는 숨기지 않습니다 — 관리 화면에 다시 들어올 길이 없어집니다." : "숨겨도 권한은 그대로 — 주소로는 열립니다."}
            </small>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={!menuDirty || busy}
            onClick={() => {
              setName(target.name);
              setOrder(String(target.order));
              setActive(target.active);
              setParentId(screen ? screen.parentId : null);
            }}
          >
            되돌리기
          </button>
          <button type="button" className="btn-primary" disabled={!menuDirty || busy || !name.trim()} onClick={() => void saveMenu()}>
            메뉴 저장
          </button>
        </div>

        {screen ? (
          <div>
            <div className="sys-block-title">
              이 화면을 여는 권한 <small>{lockedOpeners ? "잠김" : `${openers.length}개 — 그 화면의 보기를 담은 권한`}</small>
            </div>
            {screen.loginOnly ? (
              <div className="sys-lock">
                <Icon name="user" size={18} />
                <span>
                  <b>로그인만 보는 화면</b> — 로그인한 사람은 모두 봅니다. 기능 · 여는 권한이 없습니다.
                </span>
              </div>
            ) : screen.system ? (
              <div className="sys-lock">
                <Icon name="lock" size={18} />
                <span>
                  <b>시스템관리 화면</b> — '계정 · 권한 관리' 권한(관리자 역할)만 엽니다. 바꿀 수 없습니다.
                </span>
              </div>
            ) : (
              <>
                <div className="sys-kind-body" style={{ padding: 0 }}>
                  {permissions
                    .filter((p) => !p.system && (p.active || openers.includes(p.code)))
                    .map((p) => (
                      <Check
                        key={p.code}
                        checked={openers.includes(p.code)}
                        disabled={!p.active}
                        hint={p.active ? `${p.module} · ${p.code}` : "사용 안 하는 권한"}
                        onChange={(on) => setOpeners((list) => (on ? [...new Set([...list, p.code])] : list.filter((c) => c !== p.code)))}
                        label={
                          <>
                            {p.name}
                            <small>{p.active ? p.module : "사용 안 함"}</small>
                          </>
                        }
                      />
                    ))}
                </div>
                {removed.length ? (
                  <div className="ds-callout warning" style={{ marginTop: 10 }}>
                    <Icon name="alert" size={16} />
                    <span>
                      떼는 권한({removed.map((c) => permName.get(c) ?? c).join(" · ")})에서 이 화면의 보기 · 처리 · 단추가 모두 빠집니다 — 그 권한을 쓰는
                      역할은 다음 동작부터 이 화면을 못 봅니다.
                    </span>
                  </div>
                ) : null}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn-secondary" disabled={!openersDirty || busy} onClick={() => setOpeners([...screen.openers])}>
                    되돌리기
                  </button>
                  <button type="button" className="btn-primary" disabled={!openersDirty || busy} onClick={() => void saveOpeners()}>
                    여는 권한 저장
                  </button>
                </div>
              </>
            )}
            <div className="sys-chips" style={{ marginTop: 10 }}>
              {screen.features.map((f) => (
                <span key={f.code} className={`ds-badge ${f.kind === "VIEW" ? "gray" : f.kind === "WORK" ? "info" : "warning"}`} title={f.code}>
                  {f.kind === "VIEW" ? "보기" : f.label}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <ModalError text={error} /> : null}

        <div>
          <div className="sys-block-title">
            이력 <small>{screen ? "메뉴 + 이 화면의 기능이 바뀐 권한" : "메뉴"}</small>
          </div>
          <HistoryList rows={hist} loading={histLoading} nameOf={(c) => featureText(names, c)} showTarget={Boolean(screen)} />
        </div>
      </div>
    </section>
  );
};

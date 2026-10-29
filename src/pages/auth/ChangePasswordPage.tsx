import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { roleNames } from "../../app/access";
import { useAuthStore } from "../../app/store/authStore";
import { Icon } from "../../components/ui/Icon";
import { PASSWORD_RULE, type LoginResult } from "../../services/authService";
import { apiPut } from "../../services/http";
import "./LoginPage.css";

/** 서버와 같은 규칙을 미리 본다 — 진짜 검사는 서버 */
const ruleProblem = (password: string) => {
  if (password.length < 8) return "8자 이상이어야 합니다.";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "영문과 숫자를 섞어 주세요.";
  return null;
};

/**
 * 비밀번호 바꾸기 — 임시 비밀번호로 들어온 사람은 여기부터(다른 화면으로 못 간다),
 * 아니면 왼쪽 아래 사용자 칸의 열쇠 단추로 온다. 바꾸면 다른 곳의 내 로그인은 끊기고 이 화면은 새 토큰으로 이어 간다.
 */
export const ChangePasswordPage = () => {
  const user = useAuthStore((state) => state.user);
  const replaceSession = useAuthStore((state) => state.replaceSession);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forced = Boolean(user?.mustChangePassword);
  const problem = next ? ruleProblem(next) : null;
  const mismatch = again.length > 0 && again !== next;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!current) return setError(forced ? "받은 임시 비밀번호를 넣으세요." : "지금 비밀번호를 넣으세요.");
    if (problem) return setError(`새 비밀번호는 ${problem}`);
    if (next !== again) return setError("새 비밀번호 두 칸이 다릅니다.");
    if (next === current) return setError("지금과 다른 비밀번호를 넣어 주세요.");
    setBusy(true);
    try {
      const result = await apiPut<LoginResult>("/me/password", { currentPassword: current, newPassword: next });
      replaceSession(result);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "비밀번호를 바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (forced) {
      await logout();
      navigate("/login", { replace: true });
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="login-stage">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <div className="login-logo">
            <Icon name="key" size={22} />
          </div>
          <div>
            <div className="login-title">DAELIM WMS</div>
            <div className="login-sub">비밀번호 바꾸기</div>
          </div>
        </div>

        <h1 className="login-heading">{forced ? "새 비밀번호를 정하세요" : "비밀번호 바꾸기"}</h1>
        <p className="login-desc">
          {forced
            ? "관리자가 준 임시 비밀번호로 들어왔습니다. 새 비밀번호를 정해야 WMS 를 쓸 수 있습니다."
            : "바꾸면 다른 PC · 휴대폰에서 열려 있던 내 로그인은 끊깁니다."}
        </p>

        {user ? (
          <div className="pw-who">
            <span className="pw-who-avatar">{user.name.charAt(0)}</span>
            <div>
              <b>{user.name}</b>
              <span>
                {user.id} · {roleNames(user.roles)}
              </span>
            </div>
          </div>
        ) : null}

        <label className="login-field">
          <span>{forced ? "임시 비밀번호" : "지금 비밀번호"}</span>
          <div className="login-input">
            <Icon name="lock" size={17} />
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </div>
        </label>

        <label className="login-field">
          <span>새 비밀번호</span>
          <div className="login-input">
            <Icon name="key" size={17} />
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </div>
        </label>
        <div className={`pw-rule${next ? (problem ? " is-bad" : " is-ok") : ""}`}>
          <Icon name={next && !problem ? "check" : "alert"} size={13} />
          <span>{next && problem ? problem : PASSWORD_RULE}</span>
        </div>

        <label className="login-field">
          <span>새 비밀번호 한 번 더</span>
          <div className="login-input">
            <Icon name="key" size={17} />
            <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          </div>
        </label>
        {mismatch ? (
          <div className="pw-rule is-bad">
            <Icon name="alert" size={13} />
            <span>위 칸과 다릅니다.</span>
          </div>
        ) : null}

        {error ? (
          <div className="ds-callout danger login-error">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? "바꾸는 중..." : "비밀번호 바꾸기"}
        </button>
        <button type="button" className="pw-back" onClick={leave} disabled={busy}>
          {forced ? "나중에 — 로그아웃" : "돌아가기"}
        </button>
      </form>

      <div className="login-footer">© 2026 DAELIM WMS</div>
    </div>
  );
};

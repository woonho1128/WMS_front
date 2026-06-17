import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../app/store/authStore";
import { useUiStore } from "../../app/store/uiStore";
import { Icon } from "../../components/ui/Icon";
import "./LoginPage.css";

export const LoginPage = () => {
  const [id, setId] = useState("admin");
  const [password, setPassword] = useState("1234");

  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const setCurrentRole = useUiStore((state) => state.setCurrentRole);
  const navigate = useNavigate();

  const loading = status === "loading";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await login(id, password);
    if (ok) {
      const user = useAuthStore.getState().user;
      if (user) setCurrentRole(user.role);
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="login-stage">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <div className="login-logo">W</div>
          <div>
            <div className="login-title">DAELIM WMS</div>
            <div className="login-sub">창고관리시스템</div>
          </div>
        </div>

        <h1 className="login-heading">로그인</h1>
        <p className="login-desc">계정 정보를 입력해 주세요.</p>

        <label className="login-field">
          <span>아이디</span>
          <div className="login-input">
            <Icon name="user" size={17} />
            <input
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                if (error) clearError();
              }}
              placeholder="아이디"
              autoComplete="username"
            />
          </div>
        </label>

        <label className="login-field">
          <span>비밀번호</span>
          <div className="login-input">
            <Icon name="lock" size={17} />
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
              }}
              placeholder="비밀번호"
              autoComplete="current-password"
            />
          </div>
        </label>

        {error ? (
          <div className="ds-callout danger login-error">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <button type="submit" className="login-submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>

        <div className="login-hint">
          데모 계정 · 비밀번호 <b>1234</b>
          <br />
          <code>admin</code> / <code>logistics</code> / <code>inbound</code> / <code>outbound</code> /{" "}
          <code>inventory</code> / <code>partner</code>
        </div>
      </form>

      <div className="login-footer">© 2026 DAELIM WMS · 프론트엔드 데모</div>
    </div>
  );
};

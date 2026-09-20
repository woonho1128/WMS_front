import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../app/store/authStore";
import { useUiStore } from "../../app/store/uiStore";
import { Icon } from "../../components/ui/Icon";
import { USE_MOCK_API } from "../../services/apiMode";
import "./LoginPage.css";

export const LoginPage = () => {
  // 데모 계정 · 자동 입력은 목 데이터 빌드에서만 (실서비스에서는 비워 둔다)
  const [id, setId] = useState(USE_MOCK_API ? "admin" : "");
  const [password, setPassword] = useState(USE_MOCK_API ? "1234" : "");

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
          <div className="login-logo">
            <Icon name="cube3d" size={24} />
          </div>
          <div>
            <div className="login-title">DAELIM WMS</div>
            <div className="login-sub">SMART FULFILLMENT · 창고관리시스템</div>
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

        {USE_MOCK_API ? (
          <div className="login-hint">
            <b>샘플 데이터 데모</b> — 실제 재고·주문이 아닙니다
            <br />
            데모 계정 · 비밀번호 <b>1234</b>
            <br />
            <code>admin</code> / <code>logistics</code> / <code>inbound</code> / <code>outbound</code> /{" "}
            <code>inventory</code> / <code>partner</code>
          </div>
        ) : null}
      </form>

      <div className="login-footer">© 2026 DAELIM WMS{USE_MOCK_API ? " · 샘플 데이터 데모" : ""}</div>
    </div>
  );
};

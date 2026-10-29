import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "../../layouts/MainLayout";
import { NotFoundPage } from "../../pages/not-found/NotFoundPage";
import { SectionPage } from "../../pages/menu/SectionPage";
import { FeaturePage } from "../../pages/menu/FeaturePage";
import { LoginPage } from "../../pages/auth/LoginPage";
import { ChangePasswordPage } from "../../pages/auth/ChangePasswordPage";
import { useAuthStore } from "../store/authStore";
import { HomeRedirect } from "./HomeRedirect";

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace />;
  // 임시 비밀번호 — 바꾸기 전에는 어느 화면도 열지 않는다 (서버도 막는다)
  if (user.mustChangePassword) return <Navigate to="/password" replace />;
  return <>{children}</>;
};

export const AppRouter = () => {
  const user = useAuthStore((state) => state.user);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/password" element={user ? <ChangePasswordPage /> : <Navigate to="/login" replace />} />
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="/:sectionSlug" element={<SectionPage />} />
        <Route path="/:sectionSlug/:featureSlug" element={<FeaturePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "../../layouts/MainLayout";
import { NotFoundPage } from "../../pages/not-found/NotFoundPage";
import { SectionPage } from "../../pages/menu/SectionPage";
import { FeaturePage } from "../../pages/menu/FeaturePage";
import { LoginPage } from "../../pages/auth/LoginPage";
import { useAuthStore } from "../store/authStore";

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export const AppRouter = () => {
  const user = useAuthStore((state) => state.user);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard/logistics-status" replace />} />
        <Route path="/:sectionSlug" element={<SectionPage />} />
        <Route path="/:sectionSlug/:featureSlug" element={<FeaturePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

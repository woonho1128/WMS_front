import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export const DashboardLayout = ({ children }: Props) => {
  return <section className="dashboard-layout">{children}</section>;
};


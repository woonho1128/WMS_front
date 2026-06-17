import type { ReactNode } from "react";

type DashboardFilterBarProps = {
  className?: string;
  children: ReactNode;
};

export const DashboardFilterBar = ({ className = "", children }: DashboardFilterBarProps) => {
  return <div className={className}>{children}</div>;
};

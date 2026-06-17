import type { PropsWithChildren, ReactNode } from "react";

type DashboardCardProps = PropsWithChildren<{
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}>;

export const DashboardCard = ({ className = "", title, action, children }: DashboardCardProps) => {
  return (
    <section className={`app-surface ${className}`.trim()}>
      {(title || action) && (
        <div className="card-head">
          {title ? <strong>{title}</strong> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
};

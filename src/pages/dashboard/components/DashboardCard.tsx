import type { PropsWithChildren, ReactNode } from "react";

type DashboardCardProps = PropsWithChildren<{
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}>;

/**
 * 화면용 카드 껍데기 (`.app-surface`).
 *
 * ⚠ **안쪽 여백이 없다.** 화면마다 표·지도처럼 테두리까지 채우는 내용이 있어 일부러 비워 뒀다.
 * 글자·입력칸이 들어가는 카드는 화면 CSS 에서 `className` 으로 padding 을 꼭 준다
 * (보통 `16px 18px`, 폰 `12px 14px`). 빠뜨리면 내용이 테두리에 붙는다 — 출고 사진 · AI 챗봇이 그랬다(2026-09-21).
 */
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

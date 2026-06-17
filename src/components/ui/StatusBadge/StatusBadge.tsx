export type BadgeTone =
  | "success"
  | "danger"
  | "warning"
  | "yellow"
  | "info"
  | "gray"
  | "violet"
  | "indigo"
  | "teal"
  | "consign";

type Props = {
  tone?: BadgeTone;
  /** soft(기본) | dot(앞에 점) */
  variant?: "soft" | "dot";
  children: React.ReactNode;
};

/** 디자인 시스템 상태 배지. 출고/입고/연동 상태 등에 사용. */
export const StatusBadge = ({ tone = "gray", variant = "soft", children }: Props) => (
  <span className={`ds-badge ${tone}`}>
    {variant === "dot" ? <span className="bdot" /> : null}
    {children}
  </span>
);

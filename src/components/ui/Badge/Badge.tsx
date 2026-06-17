import styles from "./Badge.module.css";

type Props = {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: string;
};

export const Badge = ({ tone = "neutral", children }: Props) => {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
};

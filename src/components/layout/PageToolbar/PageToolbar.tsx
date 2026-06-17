import type { ReactNode } from "react";
import styles from "./PageToolbar.module.css";

type Props = {
  left?: ReactNode;
  right?: ReactNode;
};

export const PageToolbar = ({ left, right }: Props) => (
  <div className={styles.toolbar}>
    <div className={styles.left}>{left}</div>
    <div className={styles.right}>{right}</div>
  </div>
);

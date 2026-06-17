import styles from "./Panel.module.css";
import type { ReactNode } from "react";

type Props = {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
};

export const Panel = ({ title, right, children }: Props) => (
  <section className={styles.panel}>
    {(title || right) && (
      <header className={styles.header}>
        {title ? <h3>{title}</h3> : <span />}
        {right}
      </header>
    )}
    <div className={styles.body}>{children}</div>
  </section>
);

import type { ReactNode } from "react";
import styles from "./AppShell.module.css";

type Props = {
  sidebar: ReactNode;
  header: ReactNode;
  toolbar?: ReactNode;
  content: ReactNode;
  rightPanel?: ReactNode;
  bottomPanel?: ReactNode;
};

export const AppShell = ({ sidebar, header, toolbar, content, rightPanel, bottomPanel }: Props) => {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <section className={styles.main}>
        <header className={styles.header}>{header}</header>
        {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}
        <div className={styles.contentWrap}>
          <main className={styles.content}>{content}</main>
          {rightPanel ? <aside className={styles.rightPanel}>{rightPanel}</aside> : null}
        </div>
        {bottomPanel ? <section className={styles.bottomPanel}>{bottomPanel}</section> : null}
      </section>
    </div>
  );
};

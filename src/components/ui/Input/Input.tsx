import styles from "./Input.module.css";
import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
};

export const Input = ({ leftIcon, rightSlot, className = "", ...props }: Props) => (
  <label className={`${styles.wrap} ${className}`.trim()}>
    {leftIcon ? <span className={styles.icon}>{leftIcon}</span> : null}
    <input className={styles.input} {...props} />
    {rightSlot ? <span>{rightSlot}</span> : null}
  </label>
);

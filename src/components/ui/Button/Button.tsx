import styles from "./Button.module.css";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export const Button = ({
  variant = "solid",
  size = "md",
  leftIcon,
  rightIcon,
  className = "",
  type = "button",
  children,
  ...props
}: Props) => {
  return (
    <button type={type} className={`${styles.btn} ${styles[variant]} ${styles[size]} ${className}`.trim()} {...props}>
      {leftIcon ? <span className={styles.icon}>{leftIcon}</span> : null}
      <span>{children}</span>
      {rightIcon ? <span className={styles.icon}>{rightIcon}</span> : null}
    </button>
  );
};

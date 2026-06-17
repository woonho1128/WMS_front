import { useEffect, type ReactNode } from "react";
import { Icon } from "../Icon";

type Props = {
  open: boolean;
  title: string;
  desc?: string;
  icon?: string;
  iconBg?: string;
  iconColor?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

/** 디자인 시스템 모달 (확정/거부 확인 등). */
export const Modal = ({ open, title, desc, icon, iconBg, iconColor, children, footer, onClose }: Props) => {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ds-overlay" onClick={onClose}>
      <div className="ds-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ds-modal-head">
          {icon ? (
            <div className="ds-modal-ico" style={{ background: iconBg, color: iconColor }}>
              <Icon name={icon} size={22} />
            </div>
          ) : null}
          <div className="ds-modal-htext">
            <div className="ds-modal-title">{title}</div>
            {desc ? <div className="ds-modal-desc">{desc}</div> : null}
          </div>
          <button type="button" className="ds-modal-x" onClick={onClose} aria-label="닫기">
            <Icon name="x" size={16} />
          </button>
        </div>
        {children ? <div className="ds-modal-body">{children}</div> : null}
        {footer ? <div className="ds-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
};

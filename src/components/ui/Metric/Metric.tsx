import type { ReactNode } from "react";
import { Icon } from "../Icon";

type Props = {
  icon?: string;
  iconBg?: string;
  iconColor?: string;
  label: string;
  value: ReactNode;
  unit?: string;
  foot?: ReactNode;
  delta?: string;
  deltaDir?: "up" | "down";
};

/** 대시보드 지표 카드. */
export const Metric = ({ icon, iconBg, iconColor, label, value, unit, foot, delta, deltaDir = "up" }: Props) => (
  <div className="ds-metric">
    <div className="ds-metric-top">
      {icon ? (
        <div className="ds-metric-ico" style={{ background: iconBg, color: iconColor }}>
          <Icon name={icon} size={21} />
        </div>
      ) : null}
      <div className="ds-metric-label">{label}</div>
    </div>
    <div className="ds-metric-val">
      <div className="ds-metric-num tnum">{value}</div>
      {unit ? <div className="ds-metric-unit">{unit}</div> : null}
    </div>
    <div className="ds-metric-foot">
      {delta != null ? (
        <span className={`ds-delta ${deltaDir}`}>
          <Icon name={deltaDir === "down" ? "arrowDown" : "arrowUp"} size={14} />
          {delta}
        </span>
      ) : null}
      {foot ? <span>{foot}</span> : null}
    </div>
  </div>
);

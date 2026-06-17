import { Fragment } from "react";
import { Icon } from "../Icon";

export type Step = { key: string; label: string };

type Props = {
  steps: Step[];
  /** 현재 진행 단계 인덱스 (0-base) */
  current: number;
};

/** 출고 워크플로우 등 단계 진행 표시기. 확정→피킹→검수→패킹→출고확정 */
export const Stepper = ({ steps, current }: Props) => (
  <div className="ds-stepper">
    {steps.map((s, i) => {
      const state = i < current ? "done" : i === current ? "current" : "";
      return (
        <Fragment key={s.key}>
          <div className={`ds-step ${state}`}>
            <div className="ds-step-node">{i < current ? <Icon name="check" size={17} /> : i + 1}</div>
            <div className="ds-step-label">{s.label}</div>
          </div>
          {i < steps.length - 1 ? <div className={`ds-step-bar${i < current ? " done" : ""}`} /> : null}
        </Fragment>
      );
    })}
  </div>
);

/** 출고 기본 단계 */
export const SHIP_STEPS: Step[] = [
  { key: "confirmed", label: "확정" },
  { key: "picking", label: "피킹" },
  { key: "inspect", label: "검수" },
  { key: "packing", label: "패킹" },
  { key: "shipped", label: "출고확정" }
];

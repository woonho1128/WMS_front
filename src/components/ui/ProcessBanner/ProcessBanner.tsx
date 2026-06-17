import type { ReactNode } from "react";
import { Stepper, type Step } from "../Stepper";

type Props = {
  title?: string;
  steps: Step[];
  /** 현재 화면이 속한 단계 인덱스 (0-base) */
  current: number;
  note?: ReactNode;
};

/** 화면이 WMS 프로세스 어느 단계에 해당하는지 보여주는 상단 배너. */
export const ProcessBanner = ({ title = "WMS 처리 단계", steps, current, note }: Props) => (
  <div className="wms-process-banner">
    <div className="wms-process-banner-head">
      <span className="wms-process-banner-title">{title}</span>
      {note ? <span className="wms-process-banner-note">{note}</span> : null}
    </div>
    <Stepper steps={steps} current={current} />
  </div>
);

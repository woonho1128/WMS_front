import { useState } from "react";
import { Icon } from "../Icon";
import { CameraScanDialog } from "./CameraScanDialog";

type Props = {
  /** 무엇을 찍는지 — 창 제목 · 버튼 설명 (예: "로케이션 QR") */
  title: string;
  /** 맞는 값 — 주면 다른 코드는 넘기지 않고 계속 찍는다 */
  expect?: Array<string | null | undefined>;
  onScan: (value: string) => void;
  /** 버튼 글자 — 비우면 아이콘만 */
  label?: string;
  disabled?: boolean;
};

/** 입력칸 옆에 두는 카메라 버튼 — 휴대폰 카메라로 읽은 값을 onScan 으로 넘긴다 */
export const CameraScanButton = ({ title, expect, onScan, label, disabled }: Props) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-secondary cs-btn"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`${title} — 휴대폰 카메라로 읽기`}
        aria-label={`${title} 카메라로 읽기`}
      >
        <Icon name="camera" size={15} />
        {label ? <span>{label}</span> : null}
      </button>
      <CameraScanDialog
        open={open}
        title={title}
        expect={expect}
        onResult={(value) => {
          setOpen(false);
          onScan(value);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

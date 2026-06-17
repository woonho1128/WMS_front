import { Icon } from "../Icon";

type Props = {
  /** true = ERP 연동 / false = ERP 미연동(외주) */
  on: boolean;
};

/** ERP 연동/미연동 상태 배지. 외주 재고는 미연동(보라)으로 일관 표시. */
export const ErpBadge = ({ on }: Props) =>
  on ? (
    <span className="erp-on">
      <Icon name="plug" size={12} />
      ERP 연동
    </span>
  ) : (
    <span className="erp-off">
      <Icon name="ban" size={12} />
      ERP 미연동
    </span>
  );

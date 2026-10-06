import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../../components/ui/StatusBadge";

/** 출고 사진 화면에서 그 출고 건을 바로 여는 주소 (화면이 ?no= 를 읽어 전체 기간에서 찾는다) */
export const outboundPhotoPath = (outboundNo: string) => `/outbound/outbound-photo?no=${encodeURIComponent(outboundNo)}`;

type Props = {
  outboundNo: string;
  count: number;
  /** 사진이 없을 때 붉은 '없음' 대신 조용히 '-' (이력처럼 같은 출고 건이 여러 줄 나오는 표) */
  quiet?: boolean;
};

/**
 * "사진 n장" — 누르면 출고 사진 화면에서 그 출고 건이 열린다 (설계 DOCS/WMS_출고사진_설계.md §5).
 * 사진이 없으면 붉은 '없음' — 눌러서 바로 찍으러 간다.
 */
export const PhotoCountLink = ({ outboundNo, count, quiet = false }: Props) => {
  const navigate = useNavigate();
  if (count <= 0 && quiet) return <span className="cell-mut">-</span>;
  return (
    <button
      type="button"
      className="outbound-link-btn"
      title={`${outboundNo} 출고 사진 열기`}
      onClick={(event) => {
        event.stopPropagation();
        navigate(outboundPhotoPath(outboundNo));
      }}
    >
      {count > 0 ? `사진 ${count}장` : <StatusBadge tone="danger">없음</StatusBadge>}
    </button>
  );
};

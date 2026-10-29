import { Icon } from "../ui/Icon";
import "./mapPending.css";

/** 실서버에서 3D 창고 지도 자리 — 서버 쪽이 생길 때까지 (mapReady.ts) */
export const MapPending = () => (
  <span className="wh3d-pending" role="status">
    <span className="wh3d-pending-icon">
      <Icon name="cube3d" size={22} />
    </span>
    <b>3D 창고 지도 준비 중</b>
    <span>실제 창고 배치를 서버에 올리는 작업이 끝나면 여기에 보입니다.</span>
  </span>
);

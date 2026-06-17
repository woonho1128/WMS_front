import { Link } from "react-router-dom";

export const NotFoundPage = () => {
  return (
    <section className="not-found">
      <h2>페이지를 찾을 수 없습니다.</h2>
      <Link className="back-link" to="/dashboard">
        대시보드로 이동
      </Link>
    </section>
  );
};

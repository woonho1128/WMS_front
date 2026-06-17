type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

export const SidebarToggle = ({ collapsed, onToggle }: Props) => {
  return (
    <button
      type="button"
      className="collapse-inside-btn"
      onClick={onToggle}
      aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {collapsed ? <path d="M9 5l7 7-7 7V5z" /> : <path d="M15 5l-7 7 7 7V5z" />}
      </svg>
    </button>
  );
};

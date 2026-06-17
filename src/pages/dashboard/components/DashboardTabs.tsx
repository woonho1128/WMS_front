import { useState } from "react";

type DashboardTabsProps = {
  tabs: string[];
  activeIndex?: number;
  defaultActiveIndex?: number;
  className?: string;
  onChange?: (index: number, tab: string) => void;
};

export const DashboardTabs = ({
  tabs,
  activeIndex,
  defaultActiveIndex = 0,
  className = "",
  onChange
}: DashboardTabsProps) => {
  const [internalIndex, setInternalIndex] = useState(defaultActiveIndex);
  const isControlled = typeof activeIndex === "number";
  const currentIndex = isControlled ? activeIndex : internalIndex;

  const handleClick = (index: number, tab: string) => {
    if (!isControlled) {
      setInternalIndex(index);
    }
    onChange?.(index, tab);
  };

  return (
    <div className={className}>
      {tabs.map((tab, index) => (
        <button key={tab} type="button" className={index === currentIndex ? "active" : ""} onClick={() => handleClick(index, tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
};

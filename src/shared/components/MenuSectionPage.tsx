type MenuSectionPageProps = {
  title: string;
  description: string;
  items: string[];
};

export const MenuSectionPage = ({ title, description, items }: MenuSectionPageProps) => {
  return (
    <section>
      <header className="page-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="table-wrap">
        <ul className="feature-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};

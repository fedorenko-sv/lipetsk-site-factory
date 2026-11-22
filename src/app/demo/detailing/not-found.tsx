import Link from "next/link";
export default function MissingDetailingPage() {
  return (
    <main className="site-page">
      <section className="dt-shell site-section">
        <h1>
          Такой страницы
          <br />
          <em>нет в ателье.</em>
        </h1>
        <p className="site-muted" style={{ marginBlock: "30px" }}>
          Возможно, ссылка устарела. Все действующие программы собраны в каталоге.
        </p>
        <Link className="dt-button" href="/demo/detailing/services">
          Вернуться к программам ↗
        </Link>
      </section>
    </main>
  );
}

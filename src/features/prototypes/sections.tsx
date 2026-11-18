import Link from "next/link";

export function PrototypeHeader({ brand, cta = "Оставить заявку", target = "#booking" }: { brand: string; cta?: string; target?: string }) {
  return <header className="prototype-header">
    <Link className="prototype-brand" href="/" aria-label={brand + " — к витрине направлений"}>{brand}<span className="prototype-brand-mark" aria-hidden="true">↗</span></Link>
    <nav aria-label="Основная навигация">
      <a href="#services">Предложение</a><a href="#approach">Как это работает</a>
      <a className="prototype-nav-cta" href={target}>{cta}<span aria-hidden="true">↗</span></a>
    </nav>
  </header>;
}

export function PrototypeFooter({ brand, id }: { brand: string; id: string }) {
  return <footer className="prototype-footer">
    <div><Link href="/">{brand}<span aria-hidden="true"> ↗</span></Link><p>Демонстрационный концепт для локального бизнеса.</p></div>
    <div><Link href="/">Все шесть направлений</Link><Link href={"/demo/" + id + "/privacy"}>Данные и условия демо</Link></div>
    <p>Изображения созданы для концепта. Условные цены; настоящие данные и платежи не принимаются.</p>
  </footer>;
}

export function PrototypeFAQ({ items }: { items: [string, string][] }) {
  return <section className="prototype-faq prototype-section" aria-labelledby="faq-title" data-reveal>
    <div><p className="prototype-kicker">До первого шага</p><h2 id="faq-title">Важные детали.</h2></div>
    <div>{items.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
  </section>;
}

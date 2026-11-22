import Link from "next/link";
import type { BrandConfig } from "@/brands/types";

export { PrototypeHeader } from "./PrototypeHeader";

export function PrototypeFooter({ brand, id }: { brand: BrandConfig; id: string }) {
  return <footer className="prototype-footer">
    <div><Link href={"/demo/"+id}>{brand.name.short}<span aria-hidden="true"> ↗</span></Link><p>{brand.name.full}. Демонстрационный концепт для локального бизнеса.</p></div>
    <div><Link href={"/demo/"+id}>Главная</Link><Link href={"/demo/" + id + "/privacy"}>Данные и условия демо</Link></div>
    <p>Изображения созданы для концепта. Условные цены; настоящие данные и платежи не принимаются.</p>
  </footer>;
}

export function PrototypeFAQ({ items }: { items: [string, string][] }) {
  return <section className="prototype-faq prototype-section" aria-labelledby="faq-title" data-reveal>
    <div><p className="prototype-kicker">До первого шага</p><h2 id="faq-title">Важные детали.</h2></div>
    <div>{items.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
  </section>;
}

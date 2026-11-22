
import Link from "next/link";
import { EditorialFigure } from "@/features/prototypes/EditorialSections";
import { getEditorialPhoto } from "@/features/prototypes/editorial-photos";
import { basePath, type ProgramCopy } from "../content";

const examples: Record<string, readonly [string, string]> = {
  "ppf-front": ["Защита после нескольких поездок по трассе", "Водитель часто ездит между городами. На осмотре мастер бы проверил капот, бампер и зеркала и согласовал, какие элементы стоит закрыть плёнкой."],
  "ppf-full": ["Единая карта нового кузова", "Владелец хочет защитить и переднюю часть, и двери. При обсуждении отдельно отмечают кромки, пороги и сложные места вокруг ручек."],
  ceramic: ["Лак труднее отмывается после дождя", "Мастер бы осмотрел поверхность, предложил подготовку и объяснил, как ухаживать за выбранным составом после выдачи."],
  polish: ["Под светом видна сетка мелких рисок", "Работу удобно начать с небольшого пробного участка. По отражению клиент и мастер согласовали бы степень коррекции и дальнейший уход."],
  "wheel-care": ["Следы тормозной пыли на дисках", "На осмотре проверяют тип отделки и состояние покрытия. После этого подбирают способ очистки и обсуждают защиту."],
  "interior-care": ["Нужен уход за светлым салоном", "До работы полезно показать загрязнённые места и рассказать, какими средствами их уже обрабатывали. Подход к коже и текстилю различается."],
};

export function ProgramExample({ program }: { program: ProgramCopy }) {
  const [title, description] = examples[program.id];
  return (
    <section className="site-section dt-shell site-split detailing-editorial">
      <div><h2>{title}</h2><p>{description}</p><p className="site-concept-note">Пример подбора программы.</p></div>
      <EditorialFigure photo={getEditorialPhoto("detailing",program.id)}/>
    </section>
  );
}

export function DetailingScenarios({ section = "visit" }: { section?: "visit" | "materials" | "prices" }) {
  const group = {
    visit: { title: "С какой задачей приехать", keys: ["ppf-front", "polish", "interior-care"] },
    materials: { title: "Как выглядит работа с материалом", keys: ["ppf-full", "ceramic", "wheel-care"] },
    prices: { title: "Что меняет объём работ", keys: ["ppf-front", "ppf-full", "ceramic"] },
  }[section];
  return (
    <section className="site-section dt-shell detailing-editorial" aria-labelledby="detail-scenarios">
      <h2 id="detail-scenarios">{group.title}</h2>
      <div className="detailing-scenes">
        {group.keys.map(key => {
          const [title,description] = examples[key];
          return <article key={key}>
            <EditorialFigure photo={getEditorialPhoto("detailing",key)}/>
            <h3>{title}</h3>
            <p>{description}</p>
            <Link className="site-text-link" href={basePath + "/services/" + key}>Посмотреть программу</Link>
          </article>;
        })}
      </div>
    </section>
  );
}

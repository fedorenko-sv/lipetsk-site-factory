
import Image from "next/image";
import Link from "next/link";
import { guides } from "./editorial";
import { getEditorialPhoto } from "./editorial-photos";
import { catalogPage, demoPageHref } from "./pages";
import type { PrototypeId } from "./catalog";
import type { OfferPhoto } from "./media";
import "./editorial.css";

export function EditorialFigure({ photo, sizes = "(max-width: 700px) 88vw, 540px" }: {
  photo: OfferPhoto;
  sizes?: string;
}) {
  return (
    <figure className="editorial-figure">
      <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} sizes={sizes}/>
      <figcaption>{photo.caption}</figcaption>
    </figure>
  );
}

const guideImages = {
  auto: "wheels", beauty: "nail-tools", medical: "waiting",
  sports: "adult-trial", stay: "table", estimate: "graphite",
} satisfies Record<PrototypeId, string>;

export function ChoiceGuide({ id, photo = false, link = false }: {
  id: PrototypeId;
  photo?: boolean;
  link?: boolean;
}) {
  const guide = guides[id];
  return (
    <section className="prototype-section editorial-guide" aria-labelledby="choice-guide">
      <div className="editorial-guide-intro">
        <h2 id="choice-guide">{guide.title}</h2>
        {link && <Link href={demoPageHref(id, catalogPage(id).slug)}>Перейти к каталогу</Link>}
      </div>
      <div className={photo ? "editorial-guide-with-photo" : undefined}>
        {photo && <EditorialFigure photo={getEditorialPhoto(id, guideImages[id])}/>}
        <div className="editorial-examples">
          {guide.examples.map(([title, scene, choice]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{scene}</p>
              <p className="editorial-choice">{choice}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RequestGuide({ id }: { id: PrototypeId }) {
  const { prepare, next } = guides[id];
  return (
    <details className="editorial-request">
      <summary>Перед отправкой заявки</summary><div className="editorial-request-copy">
      <div><h2>Что подготовить</h2><p>{prepare}</p></div>
      <div><h2>Что произойдёт дальше</h2><p>{next} Для теста используйте +70000000000.</p></div>
      </div>
    </details>
  );
}

"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import type { OfferMedia } from "./media";
import "./gallery.css";

export function OfferGallery({ media }: { media: OfferMedia }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const photo = media.photos[active];
  if (!photo) return null;

  function restoreFocus() {
    setOpen(false);
    opener.current?.focus({ preventScroll: true });
  }
  function close() {
    dialog.current?.close();
    restoreFocus();
  }
  function move(delta: number) {
    setActive(index => (index + delta + media.photos.length) % media.photos.length);
  }

  return <section className="prototype-section offer-gallery" aria-labelledby={id + "-heading"}>
    <div className="offer-gallery-heading">
      <div><h2 id={id + "-heading"}>Фотогалерея</h2><p>{media.intro ?? media.title}</p></div>
      <p className="offer-gallery-concept">Изображения созданы для демонстрации. Оснащение, состав услуг и условия уточняются отдельно.</p>
    </div>
    <div className="offer-gallery-grid">
      {media.photos.map((item, index) => <button key={item.src} type="button" className="offer-gallery-frame"
        aria-label={"Открыть фото " + (index + 1) + ": " + item.caption}
        onClick={event => { opener.current = event.currentTarget; setActive(index); setOpen(true); dialog.current?.showModal(); }}>
        <span className="offer-gallery-image"><Image src={item.src} alt={item.alt} width={item.width} height={item.height}
          sizes="(max-width: 700px) 90vw, (max-width: 1600px) 44vw, 650px" /></span>
        <span className="offer-gallery-caption">{item.caption}<span aria-hidden="true">Смотреть ↗</span></span>
      </button>)}
    </div>
    <dialog ref={dialog} className="offer-gallery-dialog" aria-label={"Фотогалерея: " + media.title}
      onClose={restoreFocus} onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1);
        }
      }}>
      <div className="offer-gallery-toolbar"><span>{media.title} · концепт</span><button type="button" onClick={close} aria-label="Закрыть галерею">Закрыть <span aria-hidden="true">×</span></button></div>
      <figure className="offer-gallery-full">
        {open && (failed[photo.src] ? <div className="offer-gallery-unavailable">Изображение не загрузилось. Выберите другой кадр или закройте галерею.</div> :
          <Image key={photo.src} src={photo.src} alt={photo.alt} width={photo.width} height={photo.height}
            loading="eager" sizes="(max-width: 1200px) 94vw, 1160px"
            onError={() => setFailed(current => ({...current, [photo.src]:true}))} />)}
        <figcaption role="status" aria-live="polite">{active + 1} / {media.photos.length} · {photo.caption}</figcaption>
      </figure>
      <div className="offer-gallery-controls">
        <button type="button" onClick={() => move(-1)} aria-label="Предыдущее фото">←<span>Предыдущее</span></button>
        <span>Визуальная концепция</span>
        <button type="button" onClick={() => move(1)} aria-label="Следующее фото"><span>Следующее</span>→</button>
      </div>
    </dialog>
  </section>;
}

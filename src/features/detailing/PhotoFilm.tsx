"use client";

/* eslint-disable @next/next/no-img-element -- All plates and local thumbnails are art-directed. */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import shots from "./film-shots.json";

const media = "/demo-assets/detailing/";
type Connection = EventTarget & { saveData?: boolean };
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;
const stillsOnly = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches || !!connection()?.saveData;
function subscribe(listener: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const net = connection();
  mq.addEventListener("change", listener);
  net?.addEventListener("change", listener);
  return () => {
    mq.removeEventListener("change", listener);
    net?.removeEventListener("change", listener);
  };
}

export function PhotoFilm() {
  const staticMode = useSyncExternalStore(subscribe, stillsOnly, () => true);
  const [shot, setShot] = useState(0);
  const [paused, setPaused] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef(0);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (staticMode) {
      if (video.hasAttribute("src")) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      return;
    }
    let live = true;
    let visible = false;
    const update = () => {
      if (document.hidden || !visible || paused || blocked) {
        video.pause();
        return;
      }
      if (!video.hasAttribute("src")) {
        pending.current = shotRef.current;
        video.src = media + (window.innerWidth < 720 ? "atelier-720.mp4" : "atelier-1080.mp4");
      }
      void video.play().catch((error: Error) => {
        if (live && error.name !== "AbortError") setBlocked(true);
      });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(video);
    document.addEventListener("visibilitychange", update);
    return () => {
      live = false;
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      video.pause();
    };
  }, [staticMode, paused, blocked]);

  const updateTime = () => {
    const video = videoRef.current;
    if (
      !video ||
      staticMode ||
      blocked ||
      pending.current !== null ||
      video.seeking ||
      !video.readyState
    )
      return;
    const time = video.currentTime;
    const index = time >= shots[2].start ? 2 : time >= shots[1].start ? 1 : 0;
    if (index !== shotRef.current) {
      shotRef.current = index;
      setShot(index);
    }
    const span = (shots[index + 1]?.start ?? 15) - shots[index].start;
    railRef.current?.style.setProperty(
      "--dt-elapsed",
      String(Math.min(1, Math.max(0, (time - shots[index].start) / span))),
    );
  };
  const seekPending = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 1 || pending.current === null) return;
    const index = pending.current;
    pending.current = null;
    if (Math.abs(video.currentTime - shots[index].start) > 0.04)
      video.currentTime = shots[index].start;
  };
  const choose = (index: number) => {
    shotRef.current = index;
    setShot(index);
    railRef.current?.style.setProperty("--dt-elapsed", "0");
    pending.current = index;
    if (!staticMode && !blocked) seekPending();
  };
  const toggle = () => {
    if (blocked) {
      const video = videoRef.current;
      if (!video) return;
      void video
        .play()
        .then(() => {
          setBlocked(false);
          setPaused(false);
          seekPending();
        })
        .catch(() => setBlocked(true));
    } else {
      setPaused(!paused);
    }
  };
  const showStill = staticMode || blocked;
  return (
    <section className="dt-hero" id="top" aria-labelledby="dt-title" data-shot={shot}>
      <div className="dt-hero-film" aria-hidden="true">
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          poster={media + "hero.webp"}
          onLoadedMetadata={seekPending}
          onTimeUpdate={updateTime}
          onSeeked={updateTime}
          onError={() => {
            if (videoRef.current?.hasAttribute("src")) setBlocked(true);
          }}
        />
        {showStill && (
          <img
            className="dt-film-still"
            src={media + shots[shot].image}
            alt=""
            fetchPriority="high"
            width="1920"
            height="1080"
          />
        )}
      </div>
      <div className="dt-hero-copy">
        <h1 id="dt-title">
          <span>Сохраняем</span>
          <br />
          <em>характер.</em>
        </h1>
        <p className="dt-hero-description">
          Детейлинг-ателье в Липецке.
          <br />
          Защита кузова и уход за салоном.
        </p>
        <a className="dt-button" href="#protection">
          Подобрать защиту <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="dt-film-console">
        <div className="dt-film-signature" aria-hidden="true">
          <span>Этюд о свете</span>
          {!staticMode && <small>0:15</small>}
        </div>
        <div className="dt-film-rail" ref={railRef} role="group" aria-label="Планы фильма">
          {shots.map((item, index) => (
            <button
              key={item.image}
              type="button"
              aria-pressed={shot === index}
              aria-label={"Показать кадр: " + item.name}
              onClick={() => choose(index)}
            >
              <span className="dt-film-thumb">
                <img src={media + "thumb-" + index + ".webp"} alt="" width="112" height="64" />
              </span>
              <span className="dt-film-shot-copy">
                <span>{item.name}</span>
              </span>
              <i className="dt-film-track" aria-hidden="true" />
            </button>
          ))}
        </div>
        {staticMode ? (
          <span className="dt-film-static-note">Фотосерия</span>
        ) : (
          <button
            type="button"
            className="dt-film-play"
            onClick={toggle}
            aria-label={paused || blocked ? "Включить видео" : "Остановить видео"}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              {paused || blocked ? <path d="m7 4 9 6-9 6Z" /> : <path d="M7 4v12m6-12v12" />}
            </svg>
            <span>{paused || blocked ? "Смотреть" : "Пауза"}</span>
          </button>
        )}
      </div>
    </section>
  );
}

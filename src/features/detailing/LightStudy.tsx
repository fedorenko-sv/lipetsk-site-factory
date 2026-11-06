"use client";

import { useEffect, useRef } from "react";

const profile =
  "M55 200Q54 183 69 167Q96 146 168 140Q214 130 274 126Q314 105 366 82Q400 67 461 70Q510 71 554 99L612 135Q659 138 690 150L702 166L698 194L683 204L653 208Q654 153 605 153Q557 153 555 210L260 211Q260 154 212 153Q164 153 159 211L87 208Q64 207 55 200Z";
const roof = "M94 159Q174 138 273 133Q330 94 378 81Q448 59 509 83Q547 95 604 135Q653 137 682 149";

function Wheel({ x }: { x: number }) {
  return (
    <g transform={"translate(" + x + " 202)"}>
      <circle r="43" fill="#d8cfc0" strokeWidth="2.2" />
      <circle r="37" strokeWidth="1.2" />
      <circle r="31" fill="#e8e2d7" strokeWidth="2" />
      <circle r="24" strokeWidth=".7" strokeDasharray="1 4" />
      {Array.from({ length: 10 }, (_, i) => (
        <path
          key={i}
          transform={"rotate(" + i * 36 + ")"}
          d="M-2-6 -9-29 -4-30 3-7"
          fill="#90897d"
          strokeWidth=".8"
        />
      ))}
      <circle r="8" fill="#e5ddd0" />
      <circle r="3" />
    </g>
  );
}

function CoupePlate() {
  return (
    <svg
      className="dt-profile"
      viewBox="0 0 760 285"
      role="img"
      aria-label="Чертёж купе в профиль с полосой инспекционного света"
    >
      <defs>
        <clipPath id="dt-body-clip">
          <path d={profile} />
        </clipPath>
        <pattern
          id="dt-engrave"
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(27)"
        >
          <path d="M0 0v4" stroke="#49463d" strokeWidth=".6" />
        </pattern>
        <linearGradient
          id="dt-sheet-metal"
          x1="0"
          y1="0"
          x2=".15"
          y2="1"
          gradientUnits="objectBoundingBox"
        >
          <stop stopColor="#f1ebdf" />
          <stop offset=".48" stopColor="#e7dfd2" />
          <stop offset=".69" stopColor="#c7bca9" />
          <stop offset=".77" stopColor="#e3d9cb" />
          <stop offset="1" stopColor="#c2b7a5" />
        </linearGradient>
        <linearGradient id="dt-study-light">
          <stop stopColor="#fdf8e9" stopOpacity="0" />
          <stop offset=".78" stopColor="#fffced" stopOpacity=".95" />
          <stop offset=".85" stopColor="#b05331" stopOpacity=".7" />
          <stop offset="1" stopColor="#e8ddc9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#7d7568" strokeWidth=".65">
        <path d="M39 246h683M211 247v13m395-13v13M56 260h645" strokeDasharray="6 5" />
        <path d="M57 253v14m645-14v14M47 260h19m626 0h19" />
      </g>
      <g fill="none" stroke="#514d44" strokeLinejoin="round" strokeLinecap="round">
        <path d={profile} fill="url(#dt-sheet-metal)" strokeWidth="2.3" />
        <g clipPath="url(#dt-body-clip)">
          <path
            d="M54 182Q205 164 293 176Q399 183 551 153Q611 141 702 153L710 165Q642 153 604 160Q497 184 329 189Q183 172 61 192Z"
            fill="url(#dt-engrave)"
            stroke="none"
          />
          <path
            d="M261 200Q366 190 552 170Q512 188 482 196L279 206Z"
            fill="url(#dt-engrave)"
            strokeWidth=".7"
          />
          <g data-study-beam="" transform="translate(360 0)">
            <path d="m-60 55 93 0-74 180-93 0Z" fill="url(#dt-study-light)" stroke="none" />
          </g>
        </g>
        <path
          d="M294 126Q343 94 380 83Q429 68 482 81Q521 87 576 125Q492 119 400 125L294 132Z"
          fill="#a59d8e"
          strokeWidth="1.5"
        />
        <path d="M315 124Q373 87 407 83Q444 78 479 83L493 114Q418 115 315 127Z" fill="#ddd5c7" />
        <path d="m486 84 15 30 61 6Q531 97 501 88Z" fill="url(#dt-engrave)" />
        <path d="m311 133-10 13 4 40 9 13q116-9 186-27l16-14 10-28-33-6M468 135l18-1M55 184l74-5m-63 16 68 4M67 168q22-12 58-13l-15 11-39 8ZM630 145l51 7 9 6-52-6Z" />
        <path
          d="M80 151Q170 128 267 128M126 150l111-12M272 212q147 0 280-6M159 197q4-48 53-50 42 0 49 38M552 191q11-46 51-45 37-1 48 31"
          strokeWidth="1.1"
        />
        <path d="m290 133-3-8q1-4 8-4l10 3 1 5-16 5Z" fill="#b6aa98" />
        <Wheel x={210} />
        <Wheel x={605} />
        <path d={roof} stroke="#a3482f" strokeWidth="2.6" pathLength="1" className="dt-ink-trace" />
      </g>
    </svg>
  );
}

export function LightStudy() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let active = true;
    let loaded = false;
    let nearby = false;
    let revert: (() => void) | undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mount = async () => {
      if (loaded || !nearby || mq.matches || !active) return;
      loaded = true;
      try {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
        ]);
        if (!active) return;
        gsap.registerPlugin(ScrollTrigger);
        const mm = gsap.matchMedia();
        mm.add(
          "(prefers-reduced-motion: no-preference)",
          () => {
            const beam = node.querySelector("[data-study-beam]");
            const trace = node.querySelector(".dt-ink-trace");
            const timeline = gsap.timeline({
              scrollTrigger: {
                trigger: node,
                start: "top 93%",
                end: "bottom 16%",
                scrub: true,
                invalidateOnRefresh: true,
              },
            });
            timeline
              .fromTo(
                beam,
                { attr: { transform: "translate(0 0)" } },
                { attr: { transform: "translate(805 0)" }, duration: 1, ease: "none" },
                0,
              )
              .fromTo(
                trace,
                { strokeDasharray: "1", strokeDashoffset: 1 },
                { strokeDashoffset: 0, duration: 0.85, ease: "none" },
                0,
              );
          },
          node,
        );
        revert = () => mm.revert();
      } catch {
        /* The complete print remains readable if enhancement cannot load. */
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        nearby = entry.isIntersecting;
        void mount();
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    mq.addEventListener("change", mount);
    return () => {
      active = false;
      observer.disconnect();
      mq.removeEventListener("change", mount);
      revert?.();
    };
  }, []);
  return (
    <section ref={root} id="light-study" className="dt-study" aria-labelledby="dt-study-title">
      <div className="dt-study-inner dt-shell">
        <div className="dt-study-copy">
          <h2 id="dt-study-title">
            Всё видно
            <br />
            <em>на свету.</em>
          </h2>
          <p>
            Узкая полоса света повторяет изгиб кузова. По её отражению мастер видит риски на лаке и
            решает, где нужна защита.
          </p>
          <a href="#protection">
            Выбрать зону <span aria-hidden="true">↘</span>
          </a>
        </div>
        <figure className="dt-study-figure">
          <CoupePlate />
          <figcaption>
            <span>Профиль купе</span>
            <span>Световой этюд ателье</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

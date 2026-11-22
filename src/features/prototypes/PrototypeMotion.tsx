"use client";

import { useEffect, useRef } from "react";

export function PrototypeMotion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    element.dataset.motion = "ready";
    element.querySelectorAll("[data-reveal]").forEach(node => observer.observe(node));
    return () => { observer.disconnect(); delete element.dataset.motion; };
  }, []);
  return <div ref={root} className="prototype-motion">{children}</div>;
}

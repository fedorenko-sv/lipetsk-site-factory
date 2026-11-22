"use client";
import { useEffect, useRef, type ReactNode } from "react";
// Server content stays visible when JavaScript or animation is unavailable.
export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(element);
        if (!reduced.matches)
          animation = element.animate(
            [
              { opacity: 0.55, transform: "translateY(18px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 440, easing: "cubic-bezier(.23,1,.32,1)" },
          );
      },
      { threshold: 0.12 },
    );
    const cancel = () => {
      if (reduced.matches) animation?.cancel();
    };
    observer.observe(element);
    reduced.addEventListener("change", cancel);
    return () => {
      observer.disconnect();
      animation?.cancel();
      reduced.removeEventListener("change", cancel);
    };
  }, []);
  return (
    <div ref={ref} className="site-program-reveal">
      {children}
    </div>
  );
}

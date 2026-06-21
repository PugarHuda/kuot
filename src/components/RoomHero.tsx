"use client";

import { useEffect, useRef } from "react";

/**
 * Anime "messy study room" hero background — a Venice-generated illustration
 * (public/hero-room-2.webp) with a gentle cursor parallax, floating dust motes
 * in the window light, and readability scrims so the headline (left) stays
 * legible and the bottom blends into the page. Cosmetic, aria-hidden.
 */

type V = Record<string, string | number>;

// Dust motes drifting in the warm light (deterministic positions, biased to the
// bright right side where the window is). Concentrated upper-right.
const DUST: { top: string; left: string; size: number; vars: V }[] = Array.from({ length: 14 }, (_, i) => ({
  top: `${8 + ((i * 23) % 60)}%`,
  left: `${48 + ((i * 31) % 50)}%`,
  size: 3 + (i % 4) * 2,
  vars: {
    "--op": (0.35 + ((i * 7) % 40) / 100).toFixed(2),
    "--dur": `${7 + ((i * 5) % 9)}s`,
    "--delay": `-${(i * 11) % 14}s`,
    "--dx": `${((i % 5) - 2) * 14}px`,
  },
}));

export function RoomHero() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const dx = (e.clientX / window.innerWidth - 0.5) * -22;
        const dy = (e.clientY / window.innerHeight - 0.5) * -14;
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[760px] overflow-hidden sm:h-[680px]">
      {/* the illustration: parallax (outer, cursor) + Ken Burns drift (inner, always moving) */}
      <div ref={ref} className="absolute inset-0 transition-transform duration-300 ease-out [will-change:transform]">
        <div
          className="ken-burns absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero-room-2.webp')" }}
        />
      </div>

      {/* warm desk-lamp glow (breathes) */}
      <div className="lamp-glow absolute right-[14%] top-[44%] h-44 w-44" />

      {/* warm light beam sweeping from the window */}
      <div className="light-ray pointer-events-none absolute -top-24 right-[8%] h-[140%] w-64 origin-top" />

      {/* floating dust in the window light */}
      {DUST.map((d, i) => (
        <span
          key={i}
          className="dust"
          style={{ top: d.top, left: d.left, width: d.size, height: d.size, ...d.vars } as React.CSSProperties}
        />
      ))}

      {/* readability scrims: lighten the left (headline) + fade bottom into the page */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(100deg, var(--paper) 0%, color-mix(in srgb, var(--paper) 78%, transparent) 26%, transparent 52%)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-56"
        style={{ background: "linear-gradient(to bottom, transparent, var(--paper) 92%)" }}
      />
    </div>
  );
}

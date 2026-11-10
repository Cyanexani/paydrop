"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { formatMoney } from "@/lib/money";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades and lifts its children in the first time they scroll into view.
 * Content already on screen at load is left alone, and nothing is hidden until JS has run.
 */
export function Reveal({ children, delay = 0, className, as = "div" }: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.dataset.reveal = "wait";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = "in";
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // The tag is one of four block elements; they share the div's props.
  const Tag = as as "div";
  return (
    <Tag ref={ref as RefObject<HTMLDivElement | null>} className={className} style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}>
      {children}
    </Tag>
  );
}

/**
 * Money that counts to its value: from zero when it first appears, and from the old
 * value whenever it changes (so a release visibly adds up).
 */
export function CountUp({ minor, currency, duration = 1100 }: { minor: number; currency?: string; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    const jump = reducedMotion() || start === minor;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const k = jump ? 1 : Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      // Whole rupees while moving, the exact amount at the end.
      const value = k === 1 ? minor : Math.round((start + (minor - start) * eased) / 100) * 100;
      from.current = value;
      setShown(value);
      if (k < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [minor, duration]);
  return (
    <>
      <span aria-hidden>{formatMoney(shown, currency as Parameters<typeof formatMoney>[1])}</span>
      <span className="sr-only">{formatMoney(minor, currency as Parameters<typeof formatMoney>[1])}</span>
    </>
  );
}

/**
 * A metaball that trails the pointer inside the nearest [data-pointer-zone] and melts into
 * its sibling blobs (the parent carries the goo filter). Mouse only; hidden on touch.
 */
export function PointerBlob() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    const zone = el?.closest<HTMLElement>("[data-pointer-zone]");
    if (!el || !box || !zone || reducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0, on = false;
    function loop() {
      x += (tx - x) * 0.11;
      y += (ty - y) * 0.11;
      el!.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      raf = requestAnimationFrame(loop);
    }
    function move(e: PointerEvent) {
      const r = box!.getBoundingClientRect();
      tx = Math.max(40, Math.min(r.width - 40, e.clientX - r.left));
      ty = Math.max(40, Math.min(r.height - 40, e.clientY - r.top));
      if (on) return;
      on = true;
      x = tx;
      y = ty;
      el!.dataset.on = "true";
      loop();
    }
    function leave() {
      on = false;
      el!.dataset.on = "false";
      cancelAnimationFrame(raf);
    }
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerleave", leave);
    return () => {
      zone.removeEventListener("pointermove", move);
      zone.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <span ref={ref} className="mb-pointer" />;
}

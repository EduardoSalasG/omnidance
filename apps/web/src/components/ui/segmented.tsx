"use client";

import Link from "next/link";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type SegmentedItem = {
  key: string;
  /** Estado en URL — el control navega, no muta estado local. */
  href: string;
  /** Texto de la pill o ícono (aria-hidden). */
  children: ReactNode;
  /** Item solo-ícono: cuadrado 44px — exige ariaLabel. */
  icon?: boolean;
  ariaLabel?: string;
  /** data-tour para el onboarding. */
  tour?: string;
};

export type SegmentedProps = {
  items: SegmentedItem[];
  /** Key del item activo (controlled por la URL). */
  active: string;
  ariaLabel: string;
  /** soft = pills de texto (thumb neon/15 + borde); solid = íconos
      (thumb neon lleno, texto activo oscuro). */
  tone?: "soft" | "solid";
  /** Layout del wrapper interno — "grid w-full grid-cols-N" para
      pills a todo ancho; default flex shrink-wrap. */
  innerClassName?: string;
  className?: string;
  /** data-tour del grupo completo. */
  tour?: string;
};

/**
 * Segmented control con thumb deslizante (patrón iOS): el indicador
 * neon es un span absoluto medido sobre el item activo (offsetLeft/
 * Width + ResizeObserver → sirve también para anchos desiguales) y se
 * desliza con transition. Los items son Links — la selección es
 * navegación de URL; el DOM persiste entre soft-navs, así que el
 * thumb cruza de opción sin remontar. En prefers-reduced-motion el
 * thumb salta sin transición (motion-safe).
 *
 * El activo se comunica con aria-current + color de texto; el thumb
 * es decorativo (aria-hidden). Uso: scopes de /clases y /academias,
 * toggles lista|calendario|mapa y sub-filtros tipo Todas|Reservadas.
 */
export function Segmented({
  items,
  active,
  ariaLabel,
  tone = "soft",
  innerClassName,
  className,
  tour,
}: SegmentedProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(
    null,
  );
  const activeIndex = items.findIndex((i) => i.key === active);
  // items se recrea por render — la dependencia real es la lista de keys.
  const itemsKey = items.map((i) => i.key).join("|");

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = () => {
      const el = inner.querySelectorAll<HTMLElement>("[data-seg-item]")[
        activeIndex
      ];
      setThumb(
        el ? { left: el.offsetLeft, width: el.offsetWidth } : null,
      );
    };
    measure();
    // Re-medir ante cualquier resize (fuente cargando, rotación,
    // cambio de ancho del contenedor o del label activo).
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    inner
      .querySelectorAll("[data-seg-item]")
      .forEach((el) => ro.observe(el));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, itemsKey]);

  const itemCls = (item: SegmentedItem) => {
    const isActive = item.key === active;
    return `relative inline-flex min-h-11 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.97] ${
      item.icon ? "h-11 w-11" : "px-3"
    } ${
      isActive
        ? tone === "solid"
          ? "text-night-950"
          : "text-neon"
        : "text-white/60 hover:text-white"
    }`;
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-tour={tour}
      className={`relative inline-flex rounded-full border border-white/15 p-0.5 ${className ?? ""}`}
    >
      <div
        ref={innerRef}
        className={`relative flex ${innerClassName ?? ""}`}
      >
        {/* Thumb: primero en DOM + items `relative` → pinta detrás
            sin necesidad de z-index. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-0 top-0 rounded-full motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${
            tone === "solid"
              ? "bg-neon"
              : "border border-neon bg-neon/15"
          } ${thumb ? "opacity-100" : "opacity-0"}`}
          style={{ left: thumb?.left ?? 0, width: thumb?.width ?? 0 }}
        />
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            data-seg-item=""
            data-tour={item.tour}
            aria-label={item.ariaLabel}
            aria-current={item.key === active ? "true" : undefined}
            className={itemCls(item)}
          >
            {item.children}
          </Link>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronRightIcon } from "@/components/ui";
// Las claves de la landing viven en este fragmento, que se fusiona con
// messages/es-CL.json bajo los namespaces "landing" y "landingPro"
// (ver src/i18n/parts/). landingPro solo declara overrides: las claves
// compartidas (nav, CTAs de header, footerTagline) vienen de `landing`.
import landingParts from "@/i18n/parts/landing.json";
import { ProLeadForm } from "./ProLeadForm";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { JsonLdEvent } from "./JsonLd";
import type { PublicAcademy } from "@/lib/public-academies";

// Acento de marca via token `neon` (#a78bfa violeta en :root) - icon.svg,
// og-image e íconos PWA comparten el mismo valor. La atmósfera del hero es
// el utility `glow-neon` (globals.css), que ya lee el token: cero JS.

const primaryCtaClass =
  "inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full bg-neon px-8 text-base font-semibold text-on-accent transition-colors hover:bg-neon-soft active:scale-[0.97] sm:w-auto";

const secondaryCtaClass =
  "inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full border border-ink/15 px-8 text-base font-medium text-ink/80 transition-colors hover:border-ink/30 hover:text-ink sm:w-auto";

export type LandingVariant = "dancer" | "academy" | "producer";

// Copy por audiencia: `landing` es la base, `landingPro` aporta los
// defaults pro (CTAs, strip semanal, form) y la variante sobrescribe.
const VARIANT_COPY = {
  dancer: {},
  academy: landingParts.landingAcademy,
  producer: landingParts.landingProducer,
} as const;

// La landing de academias hereda el acento del modo Academy (esmeralda)
// - el mismo que verá el dueño dentro de su consola. Productor queda en
// el violeta de marca (default :root).
const ACADEMY_ACCENT = {
  "--accent": "52 211 153",
  "--accent-soft": "110 231 183",
} as CSSProperties;

/**
 * Landing de marketing por audiencia, mismo layout y estilo:
 * - `dancer` ("/"): bailarines y alumnos - QR, Academy, Nightlife.
 * - `academy` ("/para-academias"): dueños de academia - consola Academy.
 * - `producer` ("/para-productores"): productores - ticketing y puerta.
 * `weeklyEvents` alimenta el strip "esta semana" (0 → copy genérico).
 * En la variante academy el strip muestra `academies` (las academias
 * no producen eventos - su prueba social es quién ya opera acá).
 */
export function Landing({
  variant = "dancer",
  weeklyEvents = 0,
  weekEvents = [],
  academies = [],
}: {
  variant?: LandingVariant;
  weeklyEvents?: number;
  // Eventos reales de la semana para el strip de prueba social - la
  // landing muestra la escena en vez de solo afirmarla.
  weekEvents?: JsonLdEvent[];
  // Academias reales (GET /academies/public) - strip de la landing
  // de academias (spec academies/owner-insights).
  academies?: PublicAcademy[];
}) {
  const isPro = variant !== "dancer";
  const t = {
    ...landingParts.landing,
    ...(isPro ? landingParts.landingPro : {}),
    ...VARIANT_COPY[variant],
  };

  // Enlace cruzado entre landings pro - el visitante multi-rol (academia
  // que también produce, frecuente en la escena) llega a su otra página.
  const cross =
    variant === "academy"
      ? {
          href: "/para-productores",
          label: landingParts.landingAcademy.crossLink,
        }
      : {
          href: "/para-academias",
          label: landingParts.landingProducer.crossLink,
        };

  const features = [
    { index: "01", title: t.featureQrTitle, desc: t.featureQrDesc },
    { index: "02", title: t.featureLearnTitle, desc: t.featureLearnDesc },
    { index: "03", title: t.featureSceneTitle, desc: t.featureSceneDesc },
  ];

  const weekLabel =
    variant === "academy"
      ? academies.length > 0
        ? landingParts.landingAcademy.academyCount.replace(
            "{count}",
            String(academies.length),
          )
        : landingParts.landingAcademy.academyEmpty
      : weeklyEvents > 0
        ? t.weekCount.replace("{count}", String(weeklyEvents))
        : t.weekEmpty;

  // En pro ambos CTAs llevan al formulario (los datos van primero);
  // en dancer van a la app: registro y catálogo público de eventos.
  // ?mode=register: quien pidió "crear cuenta" no aterriza en un login.
  const primaryHref = isPro ? "#contacto" : "/login?mode=register";
  const secondaryHref = isPro ? "#contacto" : "/eventos";

  const eventDayFmt = new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "numeric",
  });

  return (
    <div style={variant === "academy" ? ACADEMY_ACCENT : undefined}>
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-xl focus-visible:bg-neon focus-visible:px-4 focus-visible:py-2 focus-visible:font-semibold focus-visible:text-on-accent"
      >
        {t.skipToContent}
      </a>

      {/* ─── Header sticky mínimo: marca + entrar + crear cuenta ─── */}
      <header className="sticky top-0 z-50 border-b border-ink/5 bg-canvas/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 sm:px-6">
          <Link
            href={
              variant === "academy"
                ? "/para-academias"
                : variant === "producer"
                  ? "/para-productores"
                  : "/"
            }
            className="inline-flex min-h-11 items-center text-sm font-bold tracking-tight"
          >
            Omni<span className="text-neon">dance</span>
            {isPro && (
              <span className="ml-2 rounded-full border border-neon/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neon">
                Pro
              </span>
            )}
          </Link>
          <nav aria-label={t.navPrimary} className="flex items-center gap-1">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-ink/60 transition-colors hover:text-ink sm:px-4"
            >
              {t.ctaLogin}
            </Link>
            {/* En /pro el camino de alta es el lead form (con roles), no el
                registro genérico - el header solo ofrece Entrar. */}
            {!isPro && (
              <Link
                href="/login?mode=register"
                className="inline-flex min-h-11 items-center rounded-full bg-neon px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-neon-soft active:scale-[0.97]"
              >
                {t.ctaSignup}
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main id="contenido" tabIndex={-1}>
        {/* ─── Hero: una promesa + dos CTAs ─── */}
        <section className="relative overflow-hidden px-6 pb-12 pt-16 text-center sm:pb-16 sm:pt-24 lg:pb-24 lg:pt-32">
          <div aria-hidden="true" className="glow-neon absolute inset-0" />
          <div className="relative mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neon">
              {t.eyebrow}
            </p>
            <h1 className="text-display mt-6 text-4xl font-extrabold sm:text-6xl lg:text-7xl">
              {t.heroPromise}
            </h1>
            <p className="mx-auto mt-6 max-w-md whitespace-pre-line text-base leading-relaxed text-ink/60 sm:text-lg">
              {t.heroLead}
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href={primaryHref} className={primaryCtaClass}>
                {t.ctaCreateAccount}
              </Link>
              <Link href={secondaryHref} className={secondaryCtaClass}>
                {t.ctaEvents}
              </Link>
            </div>
            {/* Solo pro: la demo es acceso inmediato, no una llamada de
                ventas - la promesa va visible en el hero. */}
            {isPro && (
              <p className="mt-4 text-xs text-ink/50">{t.heroNote}</p>
            )}
          </div>
        </section>

        {/* ─── Solo pro: el caos que reemplaza la app (PAS) - los ítems
            van densos y apagados; la resolución, limpia. ─── */}
        {isPro && (
          <section className="border-t border-ink/5 px-6 py-12 lg:py-16">
            <div className="mx-auto max-w-2xl text-center lg:max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">
                {t.painLabel}
              </p>
              <p className="mt-4 text-sm leading-loose text-ink/50">
                {t.painItems}
              </p>
              <p className="mt-6 text-lg font-semibold text-ink">
                {t.painResolution}
              </p>
            </div>
          </section>
        )}

        {/* ─── Prueba social por audiencia: eventos reales (dancer/
            producer) o academias reales (academy). ─── */}
        <section className="border-t border-ink/5 px-6 py-10 lg:py-14">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold text-ink">{weekLabel}</p>
            {variant === "academy" && academies.length > 0 && (
              <ul className="flex flex-col items-center gap-1 lg:flex-row lg:flex-wrap lg:justify-center lg:gap-x-5">
                {academies.slice(0, 3).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 text-sm text-ink/60"
                  >
                    <span className="text-ink/80">{a.name}</span>
                    {a.styles.length > 0 && (
                      <span className="text-neon">
                        · {a.styles.map((s) => s.name).join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {variant !== "academy" && weekEvents.length > 0 && (
              <ul className="flex flex-col items-center gap-1 lg:flex-row lg:flex-wrap lg:justify-center lg:gap-x-3">
                {weekEvents.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/eventos/${event.id}`}
                      className="inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm text-ink/60 transition-colors hover:text-ink"
                    >
                      <span className="font-medium capitalize text-neon">
                        {eventDayFmt.format(new Date(event.startsAt))}
                      </span>
                      <span className="text-ink/80">{event.name}</span>
                      {event.venue?.name && (
                        <span className="text-ink/50">
                          · {event.venue.name}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs uppercase tracking-[0.2em] text-ink/60">
              {t.weekStyles}
            </p>
            <Link
              href={isPro ? "#contacto" : "/login?mode=register"}
              className="mt-1 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-neon transition-colors hover:bg-neon/10"
            >
              {t.weekCta}
              <ChevronRightIcon />
            </Link>
          </div>
        </section>

        {/* ─── Features: 3 cards, menos texto más claridad ─── */}
        <section
          aria-labelledby="features-title"
          className="border-t border-ink/5 px-6 py-16 sm:py-20 lg:py-24"
        >
          <div className="mx-auto max-w-5xl">
            <h2
              id="features-title"
              className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
            >
              {t.featuresTitle}
            </h2>
            {/* Solo dancer: "la app de la comunidad…" baja del hero - el
                heroPromise ya comunica pertenencia por sí solo. */}
            {!isPro && (
              <p className="mx-auto mt-3 max-w-md text-center text-sm text-ink/50">
                {t.featuresLead}
              </p>
            )}
            <ul className="mt-10 grid gap-4 sm:grid-cols-3 lg:gap-6">
              {features.map((feature) => (
                <li
                  key={feature.index}
                  className="rounded-2xl border border-ink/10 bg-surface/60 p-6 lg:p-8"
                >
                  <span
                    aria-hidden="true"
                    className="text-xs font-semibold tracking-[0.2em] text-neon"
                  >
                    {feature.index}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold">
                    {feature.title}
                  </h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/60">
                    {feature.desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── CTA final: botón (dancer) o formulario de lead (pro) ─── */}
        <section
          id={isPro ? "contacto" : undefined}
          className="border-t border-ink/5 px-6 py-20 text-center sm:py-24 lg:py-28"
        >
          <h2 className="text-display text-3xl font-extrabold sm:text-4xl">
            {t.finalCta}
          </h2>
          <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-base leading-relaxed text-ink/60">
            {t.finalCtaDesc}
          </p>
          {isPro ? (
            <div className="mt-10">
              <ProLeadForm
                fixedRole={
                  variant === "academy" ? "ACADEMY_OWNER" : "PRODUCER"
                }
              />
              <Link
                href={cross.href}
                className="mt-4 inline-flex min-h-11 items-center text-xs font-medium text-ink/50 transition-colors hover:text-ink"
              >
                {cross.label} →
              </Link>
            </div>
          ) : (
            <Link href="/login" className={`${primaryCtaClass} mt-8`}>
              {t.ctaCreateAccount}
            </Link>
          )}
        </section>
      </main>

      {/* ─── Footer mínimo: marca + tagline + cruce a la otra
          audiencia - todo centrado, una cosa por línea. ─── */}
      <footer className="border-t border-ink/5 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center">
          <p className="text-sm font-bold tracking-tight">
            Omni<span className="text-neon">dance</span>
          </p>
          <p className="text-xs text-ink/50">{t.footerTagline}</p>
          <nav aria-label={t.navFooter} className="mt-2 flex items-center gap-6">
            <Link
              href={isPro ? "/" : "/pro"}
              className="inline-flex min-h-11 items-center text-xs font-medium text-ink/50 transition-colors hover:text-ink"
            >
              {t.footerAlt}
            </Link>
            {isPro && (
              <Link
                href={cross.href}
                className="inline-flex min-h-11 items-center text-xs font-medium text-ink/50 transition-colors hover:text-ink"
              >
                {cross.label}
              </Link>
            )}
            <Link
              href="/terminos"
              className="inline-flex min-h-11 items-center text-xs font-medium text-ink/50 transition-colors hover:text-ink"
            >
              {t.footerTerms}
            </Link>
            <Link
              href="/privacidad"
              className="inline-flex min-h-11 items-center text-xs font-medium text-ink/50 transition-colors hover:text-ink"
            >
              {t.footerPrivacy}
            </Link>
          </nav>
          <div className="mt-3 w-full max-w-56">
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}

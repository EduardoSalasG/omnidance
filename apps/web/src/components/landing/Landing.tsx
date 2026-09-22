import Link from "next/link";
// Las claves de la landing viven en este fragmento, que se fusiona con
// messages/es-CL.json bajo los namespaces "landing" y "landingPro"
// (ver src/i18n/parts/). landingPro solo declara overrides: las claves
// compartidas (nav, CTAs de header, footerTagline) vienen de `landing`.
import landingParts from "@/i18n/parts/landing.json";
import { ProLeadForm } from "./ProLeadForm";
import type { JsonLdEvent } from "./JsonLd";

// Acento de marca via token `neon` (#a78bfa violeta en :root) — icon.svg,
// og-image e íconos PWA comparten el mismo valor. La atmósfera del hero es
// el utility `glow-neon` (globals.css), que ya lee el token: cero JS.

const primaryCtaClass =
  "inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full bg-neon px-8 text-base font-semibold text-night-950 transition-colors hover:bg-neon-soft active:scale-[0.97] sm:w-auto";

const secondaryCtaClass =
  "inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full border border-white/15 px-8 text-base font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white sm:w-auto";

export type LandingVariant = "dancer" | "pro";

/**
 * Landing de marketing en dos variantes que comparten layout y estilo:
 * - `dancer` ("/"): bailarines y alumnos — QR, Academy, Nightlife.
 * - `pro` ("/pro"): productores, academias y venues — consolas de negocio.
 * `weeklyEvents` alimenta el strip "esta semana" (0 → copy genérico).
 */
export function Landing({
  variant = "dancer",
  weeklyEvents = 0,
  weekEvents = [],
}: {
  variant?: LandingVariant;
  weeklyEvents?: number;
  // Eventos reales de la semana para el strip de prueba social — la
  // landing muestra la escena en vez de solo afirmarla.
  weekEvents?: JsonLdEvent[];
}) {
  const t = {
    ...landingParts.landing,
    ...(variant === "pro" ? landingParts.landingPro : {}),
  };

  const features = [
    { index: "01", title: t.featureQrTitle, desc: t.featureQrDesc },
    { index: "02", title: t.featureLearnTitle, desc: t.featureLearnDesc },
    { index: "03", title: t.featureSceneTitle, desc: t.featureSceneDesc },
  ];

  const isPro = variant === "pro";

  const weekLabel =
    weeklyEvents > 0
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
    <>
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-xl focus-visible:bg-neon focus-visible:px-4 focus-visible:py-2 focus-visible:font-semibold focus-visible:text-night-950"
      >
        {t.skipToContent}
      </a>

      {/* ─── Header sticky mínimo: marca + entrar + crear cuenta ─── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-night-950/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 sm:px-6">
          <Link
            href={variant === "pro" ? "/pro" : "/"}
            className="inline-flex min-h-11 items-center text-sm font-bold tracking-tight"
          >
            Omni<span className="text-neon">dance</span>
            {variant === "pro" && (
              <span className="ml-2 rounded-full border border-neon/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neon">
                Pro
              </span>
            )}
          </Link>
          <nav aria-label={t.navPrimary} className="flex items-center gap-1">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-white/60 transition-colors hover:text-white sm:px-4"
            >
              {t.ctaLogin}
            </Link>
            {/* En /pro el camino de alta es el lead form (con roles), no el
                registro genérico — el header solo ofrece Entrar. */}
            {!isPro && (
              <Link
                href="/login?mode=register"
                className="inline-flex min-h-11 items-center rounded-full bg-neon px-4 text-sm font-semibold text-night-950 transition-colors hover:bg-neon-soft active:scale-[0.97]"
              >
                {t.ctaSignup}
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main id="contenido" tabIndex={-1}>
        {/* ─── Hero: una promesa + dos CTAs ─── */}
        <section className="relative overflow-hidden px-6 pb-12 pt-16 text-center sm:pb-16 sm:pt-24">
          <div aria-hidden="true" className="glow-neon absolute inset-0" />
          <div className="relative mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neon">
              {t.eyebrow}
            </p>
            <h1 className="text-display mt-6 text-4xl font-extrabold sm:text-6xl lg:text-7xl">
              {t.heroPromise}
            </h1>
            <p className="mx-auto mt-6 max-w-md whitespace-pre-line text-base leading-relaxed text-white/60 sm:text-lg">
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
                ventas — la promesa va visible en el hero. */}
            {isPro && (
              <p className="mt-4 text-xs text-white/50">{t.heroNote}</p>
            )}
          </div>
        </section>

        {/* ─── Solo pro: el caos que reemplaza la app (PAS) — los ítems
            van densos y apagados; la resolución, limpia. ─── */}
        {isPro && (
          <section className="border-t border-white/5 px-6 py-12">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                {t.painLabel}
              </p>
              <p className="mt-4 text-sm leading-loose text-white/50">
                {t.painItems}
              </p>
              <p className="mt-6 text-lg font-semibold text-white">
                {t.painResolution}
              </p>
            </div>
          </section>
        )}

        {/* ─── Prueba social: eventos reales de la semana → registro ─── */}
        <section className="border-t border-white/5 px-6 py-10">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold text-white">{weekLabel}</p>
            {weekEvents.length > 0 && (
              <ul className="flex flex-col items-center gap-1">
                {weekEvents.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/eventos/${event.id}`}
                      className="inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm text-white/60 transition-colors hover:text-white"
                    >
                      <span className="font-medium capitalize text-neon">
                        {eventDayFmt.format(new Date(event.startsAt))}
                      </span>
                      <span className="text-white/80">{event.name}</span>
                      {event.venue?.name && (
                        <span className="text-white/50">
                          · {event.venue.name}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">
              {t.weekStyles}
            </p>
            <Link
              href={isPro ? "#contacto" : "/login?mode=register"}
              className="mt-1 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-neon transition-colors hover:bg-neon/10"
            >
              {t.weekCta} →
            </Link>
          </div>
        </section>

        {/* ─── Features: 3 cards, menos texto más claridad ─── */}
        <section
          aria-labelledby="features-title"
          className="border-t border-white/5 px-6 py-16 sm:py-20"
        >
          <div className="mx-auto max-w-5xl">
            <h2
              id="features-title"
              className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
            >
              {t.featuresTitle}
            </h2>
            {/* Solo dancer: "la app de la comunidad…" baja del hero — el
                heroPromise ya comunica pertenencia por sí solo. */}
            {!isPro && (
              <p className="mx-auto mt-3 max-w-md text-center text-sm text-white/50">
                {t.featuresLead}
              </p>
            )}
            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {features.map((feature) => (
                <li
                  key={feature.index}
                  className="rounded-2xl border border-white/10 bg-night-900/60 p-6"
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
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/60">
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
          className="border-t border-white/5 px-6 py-20 text-center sm:py-24"
        >
          <h2 className="text-display text-3xl font-extrabold sm:text-4xl">
            {t.finalCta}
          </h2>
          <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-base leading-relaxed text-white/60">
            {t.finalCtaDesc}
          </p>
          {isPro ? (
            <div className="mt-10">
              <ProLeadForm />
            </div>
          ) : (
            <Link href="/login" className={`${primaryCtaClass} mt-8`}>
              {t.ctaCreateAccount}
            </Link>
          )}
        </section>
      </main>

      {/* ─── Footer mínimo: marca + tagline + cruce a la otra
          audiencia — todo centrado, una cosa por línea. ─── */}
      <footer className="border-t border-white/5 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center">
          <p className="text-sm font-bold tracking-tight">
            Omni<span className="text-neon">dance</span>
          </p>
          <p className="text-xs text-white/50">{t.footerTagline}</p>
          <nav aria-label={t.navFooter} className="mt-2 flex items-center gap-6">
            <Link
              href={variant === "pro" ? "/" : "/pro"}
              className="inline-flex min-h-11 items-center text-xs font-medium text-white/50 transition-colors hover:text-white"
            >
              {t.footerAlt}
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

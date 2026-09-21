import Link from "next/link";
import messages from "../../../messages/es-CL.json";
// Las claves de la landing viven en este fragmento, que se fusiona con
// messages/es-CL.json bajo el namespace "landing" (ver src/i18n/parts/).
import landingParts from "@/i18n/parts/landing.json";

// Acento de marca via token `neon` (#a78bfa violeta en :root) — icon.svg,
// og-image e íconos PWA comparten el mismo valor. La atmósfera del hero es
// el utility `glow-neon` (globals.css), que ya lee el token: cero JS.

const primaryCtaClass =
  "inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full bg-neon px-8 text-base font-semibold text-night-950 transition-colors hover:bg-neon-soft active:scale-[0.97] sm:w-auto";

export function Landing() {
  const t = { ...messages.landing, ...landingParts.landing };

  const features = [
    { index: "01", title: t.featureQrTitle, desc: t.featureQrDesc },
    { index: "02", title: t.featureLearnTitle, desc: t.featureLearnDesc },
    { index: "03", title: t.featureSceneTitle, desc: t.featureSceneDesc },
  ];

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-neon focus:px-4 focus:py-2 focus:font-semibold focus:text-night-950"
      >
        {t.skipToContent}
      </a>

      {/* ─── Header sticky mínimo: marca + entrar + crear cuenta ─── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-night-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm font-bold tracking-tight"
          >
            Omni<span className="text-neon">dance</span>
          </Link>
          <nav aria-label={t.navPrimary} className="flex items-center gap-1">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-white/60 transition-colors hover:text-white sm:px-4"
            >
              {t.ctaLogin}
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-full bg-neon px-4 text-sm font-semibold text-night-950 transition-colors hover:bg-neon-soft active:scale-[0.97]"
            >
              {t.ctaSignup}
            </Link>
          </nav>
        </div>
      </header>

      <main id="contenido">
        {/* ─── Hero: una promesa + dos CTAs ─── */}
        <section className="relative overflow-hidden px-6 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
          <div aria-hidden="true" className="glow-neon absolute inset-0" />
          <div className="relative mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neon">
              {t.eyebrow}
            </p>
            <h1 className="text-display mt-6 text-4xl font-extrabold sm:text-6xl lg:text-7xl">
              {t.heroPromise}
            </h1>
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-white/60 sm:text-lg">
              {t.heroLead}
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/login" className={primaryCtaClass}>
                {t.ctaCreateAccount}
              </Link>
              <Link
                href="/eventos"
                className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full border border-white/15 px-8 text-base font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white sm:w-auto"
              >
                {t.ctaEvents}
              </Link>
            </div>
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
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    {feature.desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── CTA final: una frase + botón grande ─── */}
        <section className="border-t border-white/5 px-6 py-20 text-center sm:py-24">
          <h2 className="text-display text-3xl font-extrabold sm:text-4xl">
            {t.finalCta}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/60">
            {t.finalCtaDesc}
          </p>
          <Link href="/login" className={`${primaryCtaClass} mt-8`}>
            {t.ctaCreateAccount}
          </Link>
        </section>
      </main>

      {/* ─── Footer mínimo ─── */}
      <footer className="border-t border-white/5 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-xs text-white/50">
            Omni<span className="text-neon">dance</span> · {t.footerTagline}
          </p>
          <nav aria-label={t.navFooter} className="flex items-center gap-6">
            <Link
              href="/eventos"
              className="inline-flex min-h-11 items-center text-xs font-medium text-white/50 transition-colors hover:text-white"
            >
              {t.footerEvents}
            </Link>
            <Link
              href="/estilos"
              className="inline-flex min-h-11 items-center text-xs font-medium text-white/50 transition-colors hover:text-white"
            >
              {t.footerStyles}
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

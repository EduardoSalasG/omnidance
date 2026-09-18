import Link from "next/link";
import messages from "../../../messages/es-CL.json";
// Las claves nuevas de la landing llegan en este fragmento, que se fusiona
// en messages/es-CL.json bajo el namespace "landing" (ver src/i18n/parts/).
import landingParts from "@/i18n/parts/landing.json";
import { LandingScene } from "./LandingScene";

// Acento de marca via token `neon` (#a3e635 lime) — icon.svg, og-image e
// íconos PWA comparten el mismo valor.

export function Landing() {
  const t = { ...messages.landing, ...landingParts.landing };

  return (
    <>
      {/* ─── Hero a pantalla completa: una promesa + un CTA ─── */}
      <main className="relative flex min-h-dvh flex-col overflow-hidden bg-night-950">
        {/* Gradiente inmediato (pinta con el HTML, sin esperar al chunk de
            three.js); la escena entra en fade encima cuando está lista. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_40%,rgba(163,230,53,0.07),transparent_70%)]"
        />
        <LandingScene />
        {/* Veladura para que el texto mantenga contraste sobre la escena. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-night-950/70 via-night-950/20 to-night-950"
        />

        <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
          <Link href="/" className="text-sm font-bold tracking-tight">
            Omni<span className="text-neon">dance</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            {t.ctaLogin}
          </Link>
        </header>

        <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-28 pt-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neon">
            {t.eyebrow}
          </p>
          <h1 className="text-display mt-6 max-w-3xl text-5xl font-extrabold sm:text-6xl lg:text-7xl">
            {t.heroPromise}
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/60 sm:text-lg">
            {t.heroLead}
          </p>
          <Link
            href="/login"
            className="mt-10 inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full bg-neon px-8 text-base font-semibold text-night-950 transition-transform active:scale-[0.97] hover:bg-neon-soft sm:min-h-14 sm:w-auto sm:px-10"
          >
            {t.ctaCreateAccount}
          </Link>
          <Link
            href="/eventos"
            className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-white/45 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
          >
            {t.ctaEvents}
          </Link>
        </section>
      </main>

      {/* ─── Una sola línea: para quién es ─── */}
      <section className="border-t border-white/5 px-6 py-14 text-center">
        <p className="mx-auto max-w-md text-sm leading-relaxed text-white/45">
          {t.finalCtaRoles}
        </p>
      </section>

      <footer className="px-6 pb-12 pt-2 text-center">
        <p className="text-xs text-white/40">
          Omni<span className="text-neon">dance</span> · {t.footer}
        </p>
      </footer>
    </>
  );
}

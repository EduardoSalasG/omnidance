import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronRightIcon } from "@/components/ui";
import { JsonLd } from "@/components/landing/JsonLd";
import { ProLeadForm } from "@/components/landing/ProLeadForm";
import landingParts from "@/i18n/parts/landing.json";
import { fetchPublicEvents } from "@/lib/public-events";

const t = landingParts.landingProHub;
const base = landingParts.landing;

export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: "/pro" },
  openGraph: {
    title: `${t.metaTitle} | Omnidance`,
    description: t.metaDescription,
    url: "/pro",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
};

const cardClass =
  "group flex flex-col gap-2 rounded-2xl border border-white/10 bg-night-900/60 p-6 text-left transition-colors hover:border-neon/50 sm:p-8";

// Selector de audiencia: cada rol tiene su landing propia; DJ y locales
// usan el form compacto de abajo (roles restringidos).
export default async function ProHub() {
  if (cookies().has("omnidance_session")) redirect("/inicio");
  const events = await fetchPublicEvents();
  return (
    <>
      <JsonLd events={events.slice(0, 3)} />
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-xl focus-visible:bg-neon focus-visible:px-4 focus-visible:py-2 focus-visible:font-semibold focus-visible:text-night-950"
      >
        {base.skipToContent}
      </a>

      <header className="sticky top-0 z-50 border-b border-white/5 bg-night-950/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 sm:px-6">
          <Link
            href="/pro"
            className="inline-flex min-h-11 items-center text-sm font-bold tracking-tight"
          >
            Omni<span className="text-neon">dance</span>
            <span className="ml-2 rounded-full border border-neon/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neon">
              Pro
            </span>
          </Link>
          <nav aria-label={base.navPrimary} className="flex items-center gap-1">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-white/60 transition-colors hover:text-white sm:px-4"
            >
              {base.ctaLogin}
            </Link>
          </nav>
        </div>
      </header>

      <main id="contenido" tabIndex={-1}>
        <section className="relative overflow-hidden px-6 pb-12 pt-16 text-center sm:pb-16 sm:pt-24">
          <div aria-hidden="true" className="glow-neon absolute inset-0" />
          <div className="relative mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neon">
              {t.eyebrow}
            </p>
            <h1 className="text-display mt-6 text-4xl font-extrabold sm:text-6xl">
              {t.title}
            </h1>
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-white/60 sm:text-lg">
              {t.lead}
            </p>
          </div>
        </section>

        <section className="border-t border-white/5 px-6 py-12">
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <Link href="/para-productores" className={cardClass}>
              <span className="text-lg font-semibold">
                {t.cardProducerTitle}
              </span>
              <span className="text-sm leading-relaxed text-white/60">
                {t.cardProducerDesc}
              </span>
              <span
                aria-hidden="true"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-neon transition-transform group-hover:translate-x-1"
              >
                <ChevronRightIcon />
              </span>
            </Link>
            <Link href="/para-academias" className={cardClass}>
              <span className="text-lg font-semibold">
                {t.cardAcademyTitle}
              </span>
              <span className="text-sm leading-relaxed text-white/60">
                {t.cardAcademyDesc}
              </span>
              <span
                aria-hidden="true"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-neon transition-transform group-hover:translate-x-1"
              >
                <ChevronRightIcon />
              </span>
            </Link>
          </div>
        </section>

        <section className="border-t border-white/5 px-6 py-16 text-center sm:py-20">
          <h2 className="text-display text-3xl font-extrabold sm:text-4xl">
            {t.otherTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/60">
            {t.otherLead}
          </p>
          <div className="mt-10">
            <ProLeadForm roleOptions={["DJ", "VENUE_MANAGER"]} />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center">
          <p className="text-sm font-bold tracking-tight">
            Omni<span className="text-neon">dance</span>
          </p>
          <p className="text-xs text-white/50">{base.footerTagline}</p>
          <nav aria-label={base.navFooter} className="mt-2 flex items-center gap-6">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center text-xs font-medium text-white/50 transition-colors hover:text-white"
            >
              {t.footerAlt}
            </Link>
            <Link
              href="/terminos"
              className="inline-flex min-h-11 items-center text-xs font-medium text-white/50 transition-colors hover:text-white"
            >
              {base.footerTerms}
            </Link>
            <Link
              href="/privacidad"
              className="inline-flex min-h-11 items-center text-xs font-medium text-white/50 transition-colors hover:text-white"
            >
              {base.footerPrivacy}
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

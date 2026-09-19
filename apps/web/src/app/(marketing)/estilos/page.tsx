import Link from "next/link";
import type { Metadata } from "next";
import seoParts from "@/i18n/parts/seo.json";
import { fetchStyles, styleSlug, GENRE_LABEL } from "@/lib/styles";

const t = seoParts.seo;

export const metadata: Metadata = {
  title: `${t.stylesIndexTitle} — salsa, bachata y cubano en Santiago`,
  description: t.stylesIndexLead,
  alternates: { canonical: "/estilos" },
  openGraph: {
    title: `${t.stylesIndexTitle} — Omnidance`,
    description: t.stylesIndexLead,
    url: "/estilos",
  },
};

// Índice público de estilos — SSR con catálogo real de la API. El chrome
// es el mismo de la landing home: fondo night-950, acento neon, CTA login.
export default async function EstilosPage() {
  const styles = await fetchStyles();

  return (
    <>
      <main className="relative flex min-h-dvh flex-col overflow-hidden bg-night-950">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_20%,rgba(163,230,53,0.07),transparent_70%)]"
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

        <section className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neon">
            {t.landingEyebrow}
          </p>
          <h1 className="text-display mt-4 text-4xl font-extrabold sm:text-5xl">
            {t.stylesIndexHeading}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/60">
            {t.stylesIndexLead}
          </p>

          {styles.length === 0 ? (
            <p className="mt-12 text-sm text-white/50">{t.stylesIndexEmpty}</p>
          ) : (
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {styles.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/estilos/${styleSlug(s.name)}`}
                    className="flex h-full flex-col gap-2 rounded-2xl border border-white/10 bg-night-900/60 p-5 transition-colors hover:border-neon/50"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-neon">
                      {GENRE_LABEL[s.genre] ?? s.genre}
                    </span>
                    <span className="text-lg font-semibold">{s.name}</span>
                    <span className="mt-auto pt-2 text-sm text-white/45">
                      {t.stylesCtaLabel} →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-14 flex flex-col items-center gap-4 text-center">
            <Link
              href="/login"
              className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full bg-neon px-8 text-base font-semibold text-night-950 transition-transform active:scale-[0.97] hover:bg-neon-soft sm:w-auto"
            >
              {t.ctaCreateAccount}
            </Link>
            <Link
              href="/eventos"
              className="inline-flex min-h-11 items-center text-sm font-medium text-white/45 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
            >
              {t.ctaEvents}
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-6 pb-12 pt-2 text-center">
        <p className="text-xs text-white/40">
          Omni<span className="text-neon">dance</span> · {t.footer}
        </p>
      </footer>
    </>
  );
}

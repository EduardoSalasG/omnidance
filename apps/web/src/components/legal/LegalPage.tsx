import Link from "next/link";
// Texto legal completo vive en el part legal.json (mismo patrón que la
// landing: el JSON se importa directo, no vía useTranslations — son
// documentos, no copy de UI). Los placeholders [PENDIENTE] marcan datos
// societarios que faltan por confirmar antes de producción.
import legalParts from "@/i18n/parts/legal.json";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  list?: string[];
  listAfter?: string[];
};

const linkClass =
  "font-medium text-neon underline-offset-4 hover:underline";

/**
 * Documento legal público (/terminos, /privacidad) sobre el layout de
 * marketing — sin chrome de app, dark-first como el resto del sitio.
 */
export function LegalPage({ doc }: { doc: "terms" | "privacy" }) {
  const data = legalParts.legal[doc];
  const other = doc === "terms" ? "privacy" : "terms";
  const otherHref = doc === "terms" ? "/privacidad" : "/terminos";
  const sections = data.sections as LegalSection[];

  return (
    <main id="contenido" className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-sm text-white/60 transition-colors hover:text-white"
      >
        {legalParts.legal.backHome}
      </Link>

      <h1 className="text-display mt-4 text-3xl font-extrabold sm:text-4xl">
        {data.title}
      </h1>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/40">
        {legalParts.legal.versionNote}
      </p>
      <p className="mt-6 leading-relaxed text-white/70">{data.intro}</p>

      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold text-white">
              {section.title}
            </h2>
            {section.paragraphs?.map((p) => (
              <p
                key={p.slice(0, 48)}
                className="mt-3 leading-relaxed text-white/70"
              >
                {p}
              </p>
            ))}
            {section.list && (
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-white/70">
                {section.list.map((item) => (
                  <li key={item.slice(0, 48)}>{item}</li>
                ))}
              </ul>
            )}
            {section.listAfter?.map((p) => (
              <p
                key={p.slice(0, 48)}
                className="mt-3 leading-relaxed text-white/70"
              >
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-white/10 pt-6 text-sm text-white/50">
        <Link href={otherHref} className={linkClass}>
          {legalParts.legal[other].title}
        </Link>
      </p>
    </main>
  );
}

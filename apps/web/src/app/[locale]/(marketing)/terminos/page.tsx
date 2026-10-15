import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { getLocale, getMessages } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";
import { type Locale } from "@/i18n/routing";

export async function generateMetadata(): Promise<Metadata> {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const locale = (await getLocale()) as Locale;
  return {  title: m.legal.terms.metaTitle,
  description: m.legal.terms.metaDescription,
  alternates: localeAlternates(locale, "/terminos"),
};
}

export default function TerminosPage() {
  return <LegalPage doc="terms" />;
}

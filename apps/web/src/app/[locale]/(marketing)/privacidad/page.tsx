import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { getLocale, getMessages } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";
import { type Locale } from "@/i18n/routing";

export async function generateMetadata(): Promise<Metadata> {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const locale = (await getLocale()) as Locale;
  return {  title: m.legal.privacy.metaTitle,
  description: m.legal.privacy.metaDescription,
  alternates: localeAlternates(locale, "/privacidad"),
};
}

export default function PrivacidadPage() {
  return <LegalPage doc="privacy" />;
}

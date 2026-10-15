import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { getMessages } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  return {  title: m.legal.terms.metaTitle,
  description: m.legal.terms.metaDescription,
};
}

export default function TerminosPage() {
  return <LegalPage doc="terms" />;
}

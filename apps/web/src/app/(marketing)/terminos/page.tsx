import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import legalParts from "@/i18n/parts/legal.json";

export const metadata: Metadata = {
  title: legalParts.legal.terms.metaTitle,
  description: legalParts.legal.terms.metaDescription,
};

export default function TerminosPage() {
  return <LegalPage doc="terms" />;
}

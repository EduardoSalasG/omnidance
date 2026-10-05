import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import legalParts from "@/i18n/parts/legal.json";

export const metadata: Metadata = {
  title: legalParts.legal.privacy.metaTitle,
  description: legalParts.legal.privacy.metaDescription,
};

export default function PrivacidadPage() {
  return <LegalPage doc="privacy" />;
}

"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@/components/ui";

/** Destino del CTA: la sección Pro vive en /productor/parametros. */
export const PRO_SECTION_HREF = "/productor/parametros";

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-neon"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * Paywall de Producer Pro (spec academy-saas-billing): se renderiza
 * donde una feature Pro respondió 403 `pro.required` o donde
 * `effectivePro` de /me ya dice que la cuenta no tiene Pro. El CTA
 * lleva a la sección Pro (/productor/parametros), donde se contrata.
 * `feature` nombra la herramienta bloqueada (opcional — en secciones
 * ya tituladas sobra repetirla).
 */
export function ProPaywall({ feature }: { feature?: string }) {
  const t = useTranslations("producer.pro");
  const benefits = [
    t("benefits.analytics"),
    t("benefits.exports"),
    t("benefits.crm"),
  ] as const;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <LockIcon />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {feature ? t("featureTitle", { feature }) : t("title")}
          </p>
          {feature && (
            <p className="text-sm text-white/60">{t("title")}</p>
          )}
        </div>
        <Badge variant="neon">PRO</Badge>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-white/70">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span aria-hidden="true" className="text-neon">
              ·
            </span>
            {b}
          </li>
        ))}
      </ul>
      <Button href={PRO_SECTION_HREF} className="self-start">
        {t("cta")}
      </Button>
    </Card>
  );
}

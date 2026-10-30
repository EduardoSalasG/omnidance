"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { useRouter } from "@/i18n/navigation";

/**
 * CTA de compra de clase particular (specs private-lesson-product y
 * private-class-checkout): ya no compra inline, navega al checkout
 * dedicado (/academias/:id/checkout/particular), donde viven la
 * revisión de orden, el medio de pago de la academia y el cobro por
 * pasarela. El settle materializa la PrivateLesson "por asignar" al
 * PAID (el owner define fecha e instructor después del pago).
 */
export function BuyPrivateClass({
  academyId,
  disabled = false,
}: {
  academyId: string;
  /** Academia bloqueada por mora SaaS (S3): el checkout igual la
      rechaza (academy.unavailable); el botón disabled lo anticipa
      honestamente. */
  disabled?: boolean;
}) {
  const t = useTranslations("academy.profile");
  const router = useRouter();

  return (
    <Button
      className="w-full"
      disabled={disabled}
      onClick={() =>
        router.push(`/academias/${academyId}/checkout/particular`)
      }
    >
      {t("buyPrivate")}
    </Button>
  );
}

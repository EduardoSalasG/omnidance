"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { Skeleton } from "@/components/ui";
import type { Academy } from "./shared";

const DAY_MS = 86_400_000;

/**
 * Banner persistente de mora SaaS en la consola /academia (spec
 * academy-saas-billing, S3/S6): lo monta AcademyGate en estado ready, así
 * aparece arriba del contenido en el hub y en todas las subrutas.
 * - billingBlockedAt → banner rojo "bloqueada" (las mutaciones ya
 *   responden 403 billing.blocked — el banner explica el porqué).
 * - billingGraceUntil > ahora → banner ámbar con los días de gracia.
 * El CTA a /academia/suscripcion solo se muestra a owner/ADMIN (los
 * endpoints de billing son requireAdminister) — usa el /me compartido;
 * mientras resuelve, el slot del CTA queda reservado con un skeleton
 * pill para que el banner no se reajuste al resolver. En la propia
 * página de suscripción no se repite: el estado ya va detallado ahí.
 */
export function AcademyBillingBanner({ academy }: { academy: Academy }) {
  const t = useTranslations("academyBilling");
  const pathname = usePathname();

  const blocked = academy.billingBlockedAt != null;
  const graceDays =
    academy.billingGraceUntil != null
      ? Math.ceil(
          (new Date(academy.billingGraceUntil).getTime() - Date.now()) /
            DAY_MS,
        )
      : null;
  const show = blocked || (graceDays != null && graceDays > 0);

  // El CTA solo aplica a quien puede administrar el billing
  // (owner/admin) — /me compartido, sin fetch propio.
  const { me, loading: meLoading } = useMe();
  const canManage =
    !meLoading &&
    !!me &&
    (me.roles.includes("ADMIN") || me.id === academy.ownerId);

  // En /academia/suscripcion el estado va completo — el banner sería
  // redundante.
  if (!show || pathname === "/academia/suscripcion") return null;

  // Slot reservado mientras /me resuelve — mismo alto mínimo que el
  // pill real; si no puede administrar colapsa sin mover el mensaje.
  const cta = meLoading ? (
    <Skeleton className="page-loading h-11 w-28 shrink-0 rounded-full" />
  ) : (
    canManage && (
      <Link
        href="/academia/suscripcion"
        className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
          blocked
            ? "border border-red-300/40 hover:bg-red-300/10"
            : "border border-amber-300/40 hover:bg-amber-300/10"
        }`}
      >
        {t("bannerCta")}
      </Link>
    )
  );

  if (blocked) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
      >
        {t("bannerBlocked")}
        {cta}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"
    >
      {t("bannerGrace", { days: graceDays ?? 0 })}
      {cta}
    </div>
  );
}

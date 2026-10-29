"use client";

import { useTranslations } from "next-intl";
import { Badge, Card } from "@/components/ui";
import { Link } from "@/i18n/navigation";

type ReviewChecks = Record<string, boolean>;

const CHECK_KEYS = [
  "name",
  "description",
  "address",
  "contact",
  "photo",
  "activeSeries",
  "upcomingClass",
  "plan",
  "ownerApproved",
] as const;

// A qué sección de la consola va cada check faltante.
const CHECK_HREF: Partial<Record<(typeof CHECK_KEYS)[number], string>> = {
  description: "/academia/configuracion/perfil",
  address: "/academia/configuracion/perfil",
  contact: "/academia/configuracion/perfil",
  photo: "/academia/configuracion/perfil",
  activeSeries: "/academia/series",
  upcomingClass: "/academia/series",
  plan: "/academia/planes",
};

/**
 * Card de visibilidad pública (spec academy-approval-gate): muestra al
 * owner el estado de revisión de su academia y el checklist server-side
 * de lo que falta para publicarse. Oculta cuando está aprobada.
 */
export function AcademyVisibilityCard({
  reviewStatus,
  reviewChecks,
}: {
  reviewStatus?: string;
  reviewChecks?: ReviewChecks | null;
}) {
  const t = useTranslations("academyReview");
  const checks = reviewChecks ?? {};
  const missing = CHECK_KEYS.filter((k) => checks[k] === false);

  if (reviewStatus === "APPROVED" && missing.length === 0) return null;

  const statusKey =
    reviewStatus === "APPROVED"
      ? "approved"
      : reviewStatus === "REJECTED"
        ? "rejected"
        : "pending";
  const hintKey =
    statusKey === "approved"
      ? "hintApproved"
      : statusKey === "rejected"
        ? "hintRejected"
        : "hintPending";

  return (
    <Card className="flex flex-col gap-3 border-amber-400/30 bg-amber-400/5 p-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <Badge variant={statusKey === "rejected" ? "muted" : "neon"}>
          {t(statusKey)}
        </Badge>
      </div>
      <p className="text-xs text-ink/60">{t(hintKey)}</p>
      {missing.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {missing.map((k) => {
            const href = CHECK_HREF[k];
            const label = t(`checks.${k}`);
            // ownerApproved no es accionable por el dueño: lo valida el
            // equipo en /admin/roles - se muestra como pendiente de
            // revisión, no como tarea clickeable.
            const isReview = k === "ownerApproved";
            return (
              <li key={k}>
                {href ? (
                  <Link
                    href={href}
                    className="inline-flex items-center rounded-full bg-elevated px-2 py-0.5 text-[11px] text-ink/60 transition-colors hover:bg-neon/15 hover:text-neon"
                  >
                    ✗ {label}
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-elevated px-2 py-0.5 text-[11px] text-ink/50">
                    {isReview ? "⏳" : "✗"} {label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* El tooltip no sirve en touch: cuando el único check que falta es
          la validación del rol (aprobación admin), la nota va visible. */}
      {missing.includes("ownerApproved") && (
        <p className="text-[11px] text-ink/40">{t("ownerApprovedHint")}</p>
      )}
    </Card>
  );
}

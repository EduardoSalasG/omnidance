"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card, ChevronRightIcon, SkeletonList } from "@/components/ui";
import { Link } from "@/i18n/navigation";

/** GET /classes/my-quota - una fila por inscripción reservable del
    viewer (spec home-weekly-quota). */
type QuotaRow = {
  academyId: string;
  academyName: string;
  // MEMBERSHIP: academia sin clases (tier COBROS) - se muestra la
  // membresía y su vigencia, no cuota reservable.
  kind: "WEEKLY" | "PACK" | "UNLIMITED" | "MEMBERSHIP";
  used: number | null;
  limit: number | null;
  planName?: string | null;
  endsAt?: string | null;
};

/**
 * Resumen de compromiso del bailarín con sus academias: cuántas clases
 * del plan consumió y el CTA directo a agendar. Una fila por
 * inscripción (multi-academia). Sin inscripciones o sin respuesta la
 * card no se monta (cero hueco) - el loading usa SkeletonList porque el
 * layout es conocido (estándar de carga percibida).
 */
export function WeeklyQuotaCard() {
  const t = useTranslations("home");
  // null = aún resolviendo; [] = sin inscripciones → no renderiza.
  const [rows, setRows] = useState<QuotaRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/classes/my-quota")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        setRows((await res.json()) as QuotaRow[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) return <SkeletonList items={1} lines={2} />;
  if (rows.length === 0) return null;

  return (
    <section aria-label={t("quota.title")}>
      <Card padded={false}>
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((q, i) => (
            <QuotaLine key={`${q.academyId}:${q.kind}:${i}`} q={q} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

function QuotaLine({ q }: { q: QuotaRow }) {
  const t = useTranslations("home");

  const used = q.used ?? 0;
  const limit = q.limit ?? 0;
  // El pack agotado apunta a renovar en la ficha de la academia; el
  // resto (incluido el semanal agotado - la próxima semana ya es
  // reservable) lleva a agendar en /clases.
  const packEmpty = q.kind === "PACK" && used >= limit;
  const isMembership = q.kind === "MEMBERSHIP";
  const href = packEmpty || isMembership
    ? `/academias/${q.academyId}`
    : "/clases?scope=mias";

  let text: string;
  if (isMembership) {
    // Academia COBROS (sin clases): info del plan y su vigencia - el
    // "qué hacer" es ver/renovar la membresía, no agendar.
    text = q.planName
      ? t("quota.membershipPlan", { plan: q.planName })
      : t("quota.membership");
  } else if (q.kind === "WEEKLY") {
    text =
      used === 0
        ? t("quota.weeklyZero", { limit })
        : used < limit
          ? t("quota.weeklyPartial", { used, limit })
          : t("quota.weeklyFull", { limit });
  } else if (q.kind === "PACK") {
    text = packEmpty
      ? t("quota.packEmpty")
      : t("quota.packLeft", { count: Math.max(limit - used, 0) });
  } else {
    text = t("quota.unlimited");
  }

  const pct =
    q.kind !== "UNLIMITED" && limit > 0
      ? Math.min(Math.round((used / limit) * 100), 100)
      : 0;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold uppercase tracking-wide text-ink/50">
          {q.academyName}
        </span>
        <span className="mt-0.5 block text-sm text-ink/80">{text}</span>
        {isMembership && q.endsAt && (
          <span className="mt-0.5 block text-xs text-ink/50">
            {t("quota.validUntil", {
              date: new Date(q.endsAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            })}
          </span>
        )}
        {!isMembership && q.kind !== "UNLIMITED" && limit > 0 && (
          <span className="mt-2 flex items-center gap-2">
            <span
              role="progressbar"
              aria-valuenow={used}
              aria-valuemin={0}
              aria-valuemax={limit}
              className="h-1 flex-1 overflow-hidden rounded-full bg-elevated"
            >
              <span
                className="block h-full rounded-full bg-neon"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-xs tabular-nums text-ink/50">
              {used}/{limit}
            </span>
          </span>
        )}
      </span>
      <Link
        href={href}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-neon transition-colors hover:text-neon-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
      >
        {isMembership
          ? t("quota.viewPlan")
          : packEmpty
            ? t("quota.renew")
            : t("quota.book")}
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </Link>
    </li>
  );
}

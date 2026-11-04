"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  type BadgeVariant,
  Button,
  Card,
  Spinner,
} from "@/components/ui";
import { SkeletonCard } from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { readError, shortId } from "@/components/academy/shared";
import {
  AcademyPromoForm,
  type AcademyPromoPayload,
} from "@/components/academy/academy-promo-form";

type Promo = {
  id: string;
  name: string;
  discountType: "PERCENT" | "FIXED_CLP";
  percentOff: number | null;
  amountOffClp: number | null;
  validFrom: string;
  validUntil: string;
  maxCycles: number | null;
  enabled: boolean;
  plans: { id: string; name: string }[];
  persons: { id: string; name: string }[];
  subscriptionsCount: number;
  discountedPayments: number;
  createdBy: { id: string; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));

type PromoState =
  | "stateActive"
  | "stateScheduled"
  | "stateExpired"
  | "stateDisabled";

// Mismo cálculo de estado que el listado (vigente/programada/expirada/
// deshabilitada) con su mapa fijo de Badge.
function statusKey(p: Promo): PromoState {
  const now = Date.now();
  if (!p.enabled) return "stateDisabled";
  if (new Date(p.validUntil).getTime() < now) return "stateExpired";
  if (new Date(p.validFrom).getTime() > now) return "stateScheduled";
  return "stateActive";
}

const STATUS_VARIANT: Record<PromoState, BadgeVariant> = {
  stateActive: "neon",
  stateScheduled: "warn",
  stateExpired: "muted",
  stateDisabled: "muted",
};

/**
 * /academia/promos/[id] - ficha con datos, edición y el toggle
 * habilitar/deshabilitar en zona de acciones separada (console-patterns;
 * sin delete - los cobros ya descontados quedan auditados).
 */
export default function AcademiaPromoDetailPage() {
  const t = useTranslations("academyPromos");
  const { id } = useParams<{ id: string }>();
  const [promo, setPromo] = useState<Promo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [academyId, setAcademyId] = useState<string | null>(null);

  const load = useCallback(
    async (acId: string) => {
      setError(null);
      setNotFound(false);
      const res = await apiFetch(`/academies/${acId}/promos/${id}`).catch(
        () => null,
      );
      if (!res) {
        setError(t("loadError"));
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        setError((await readError(res)) ?? t("loadError"));
        return;
      }
      setPromo(await res.json());
    },
    [id, t],
  );

  useEffect(() => {
    if (academyId) void load(academyId);
  }, [academyId, load]);

  const toPayload = (p: Promo): AcademyPromoPayload => ({
    name: p.name,
    discountType: p.discountType,
    percentOff: p.percentOff,
    amountOffClp: p.amountOffClp,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    maxCycles: p.maxCycles,
    enabled: p.enabled,
    planIds: p.plans.map((x) => x.id),
    persons: p.persons,
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia/promos" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => {
          // Sync diferido (ver promos/page.tsx: setState del padre
          // fuera del render-prop).
          if (academy.id !== academyId) {
            queueMicrotask(() => setAcademyId(academy.id));
          }
          if (notFound || (error && !promo)) {
            return (
              <div className="flex items-center gap-3">
                <p role="alert" className="text-sm text-ink/60">
                  {notFound
                    ? t.has("notFound")
                      ? t("notFound")
                      : t("loadError")
                    : (error ?? t("loadError"))}
                </p>
                {!notFound && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void load(academy.id)}
                  >
                    {t("retry")}
                  </Button>
                )}
              </div>
            );
          }
          if (!promo) return <SkeletonCard />;
          const st = statusKey(promo);
          return (
            <section className="flex flex-col gap-5">
              {/* Header de entidad desnudo: nombre + estado (la edición
                  vive en el form de abajo - el header no navega). */}
              <div className="flex min-w-0 items-center justify-between gap-3">
                <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
                  {promo.name}
                </h2>
                <Badge variant={STATUS_VARIANT[st]}>{t(st)}</Badge>
              </div>

              {/* Stats del mantenedor (fuera del form - solo lectura). */}
              <Card padded={false}>
                <dl className="divide-y divide-line">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <dt className="text-xs text-ink/50">{t("subsUsing")}</dt>
                    <dd className="text-sm font-medium tabular-nums">
                      {promo.subscriptionsCount}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <dt className="text-xs text-ink/50">
                      {t("discountedPayments")}
                    </dt>
                    <dd className="text-sm font-medium tabular-nums">
                      {promo.discountedPayments}
                    </dd>
                  </div>
                  {promo.createdBy && (
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <dt className="text-xs text-ink/50">{t("createdBy")}</dt>
                      <dd className="min-w-0 truncate text-sm">
                        {promo.createdBy.name ?? shortId(promo.createdBy.id)}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="border-t border-line px-4 py-3 text-xs tabular-nums text-ink/50">
                  {t("window", {
                    from: fmtDate(promo.validFrom),
                    until: fmtDate(promo.validUntil),
                  })}
                </p>
              </Card>

              <Card className="p-4">
                <AcademyPromoForm
                  academyId={academy.id}
                  initial={toPayload(promo)}
                  submitLabel={t("save")}
                  busy={busy}
                  onSubmit={async (body) => {
                    setBusy(true);
                    setNotice(null);
                    const res = await apiFetch(
                      `/academies/${academy.id}/promos/${promo.id}`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                      },
                    ).catch(() => null);
                    setBusy(false);
                    if (!res || !res.ok) {
                      setNotice({ text: res ? ((await readError(res)) ?? t("error")) : t("error"), error: true });
                      return;
                    }
                    setPromo(await res.json());
                    setNotice({ text: t("saved") });
                  }}
                />
              </Card>

              {/* Zona de acciones (console-patterns): enable/disable va
                  separada al pie, centrada - nunca hay delete. */}
              <div className="flex flex-col items-center gap-2 border-t border-line pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={toggling}
                  onClick={async () => {
                    setToggling(true);
                    const res = await apiFetch(
                      `/academies/${academy.id}/promos/${promo.id}`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ enabled: !promo.enabled }),
                      },
                    ).catch(() => null);
                    setToggling(false);
                    if (!res || !res.ok) {
                      setNotice({ text: res ? ((await readError(res)) ?? t("error")) : t("error"), error: true });
                      return;
                    }
                    setPromo(await res.json());
                    // Feedback explícito del estado resultante (la
                    // mutación antes era silenciosa en éxito).
                    setNotice({
                      text: promo.enabled ? t("enabledOff") : t("enabledOn"),
                    });
                  }}
                >
                  {toggling && <Spinner size="sm" />}
                  {promo.enabled ? t("disable") : t("enable")}
                </Button>
                {promo.enabled && (
                  <p className="max-w-md text-center text-xs text-ink/50">
                    {t("disableHint")}
                  </p>
                )}
              </div>

              <ActionNotice
                notice={notice}
                onDismiss={() => setNotice(null)}
              />
            </section>
          );
        }}
      </AcademyGate>
    </main>
  );
}

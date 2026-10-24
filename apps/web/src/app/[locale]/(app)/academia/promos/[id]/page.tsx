"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Spinner } from "@/components/ui";
import { SkeletonCard } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { readError } from "@/components/academy/shared";
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
  const [saved, setSaved] = useState(false);
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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/promos" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => {
          if (academy.id !== academyId) setAcademyId(academy.id);
          if (notFound || (error && !promo)) {
            return (
              <div className="flex items-center gap-3">
                <p role="alert" className="text-sm text-ink/60">
                  {error ?? t("loadError")}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void load(academy.id)}
                >
                  {t("retry")}
                </Button>
              </div>
            );
          }
          if (!promo) return <SkeletonCard />;
          return (
            <section className="flex flex-col gap-5">
              {/* Stats del mantenedor (fuera del form - solo lectura). */}
              <Card className="flex flex-col gap-1 p-4 text-sm">
                <p>
                  <span className="text-ink/50">{t("subsUsing")}: </span>
                  {promo.subscriptionsCount}
                </p>
                <p>
                  <span className="text-ink/50">{t("discountedPayments")}: </span>
                  {promo.discountedPayments}
                </p>
                {promo.createdBy && (
                  <p>
                    <span className="text-ink/50">{t("createdBy")}: </span>
                    {promo.createdBy.name ?? "—"}
                  </p>
                )}
                <p className="text-xs text-ink/50">
                  {t("window", {
                    from: fmtDate(promo.validFrom),
                    until: fmtDate(promo.validUntil),
                  })}
                </p>
              </Card>

              {saved && (
                <p role="status" className="text-sm text-neon">
                  {t("saved")}
                </p>
              )}
              {error && promo && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}

              <Card className="p-4">
                <AcademyPromoForm
                  academyId={academy.id}
                  initial={toPayload(promo)}
                  submitLabel={t("save")}
                  busy={busy}
                  onSubmit={async (body) => {
                    setBusy(true);
                    setSaved(false);
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
                      setError(res ? ((await readError(res)) ?? t("error")) : t("error"));
                      return;
                    }
                    setPromo(await res.json());
                    setSaved(true);
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
                      setError(res ? ((await readError(res)) ?? t("error")) : t("error"));
                      return;
                    }
                    setPromo(await res.json());
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
            </section>
          );
        }}
      </AcademyGate>
    </main>
  );
}

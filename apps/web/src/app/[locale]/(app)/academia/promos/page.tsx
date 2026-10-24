"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { Link } from "@/i18n/navigation";

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
};

const clp = (v: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v);
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

function statusKey(p: Promo): "stateActive" | "stateScheduled" | "stateExpired" | "stateDisabled" {
  const now = Date.now();
  if (!p.enabled) return "stateDisabled";
  if (new Date(p.validUntil).getTime() < now) return "stateExpired";
  if (new Date(p.validFrom).getTime() > now) return "stateScheduled";
  return "stateActive";
}

/**
 * /academia/promos - becas y descuentos staff-managed sobre los planes
 * de membresía (spec member-promos). Lista clickeable → ficha [id];
 * crear en página dedicada /nueva (console-patterns). Sin delete -
 * baja = enabled=false en la ficha.
 */
export default function AcademiaPromosPage() {
  const t = useTranslations("academyPromos");
  const [items, setItems] = useState<Promo[] | null>(null);
  const [error, setError] = useState(false);
  const [academyId, setAcademyId] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setError(false);
    const res = await apiFetch(`/academies/${id}/promos`).catch(() => null);
    if (!res?.ok) {
      setError(true);
      return;
    }
    setItems(await res.json());
  }, []);

  useEffect(() => {
    if (academyId) void load(academyId);
  }, [academyId, load]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader
        backHref="/academia"
        backLabel={t("title")}
        actions={
          <Button href="/academia/promos/nueva" size="sm">
            + {t("new")}
          </Button>
        }
      />
      <AcademyGate>
        {({ academy }) => {
          if (academy.id !== academyId) setAcademyId(academy.id);
          return (
            <section className="flex flex-col gap-4">
              <p className="text-sm text-ink/60">{t("desc")}</p>
              {error && (
                <div className="flex items-center gap-3">
                  <p role="alert" className="text-sm text-ink/60">
                    {t("loadError")}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void load(academy.id)}
                  >
                    <RefreshIcon /> {t("retry")}
                  </Button>
                </div>
              )}
              {!error && items === null && <SkeletonList items={4} />}
              {!error && items !== null && items.length === 0 && (
                <p className="text-sm text-ink/60">{t("empty")}</p>
              )}
              {!error &&
                items?.map((p) => {
                  const st = statusKey(p);
                  return (
                    <Link key={p.id} href={`/academia/promos/${p.id}`}>
                      <Card className="flex flex-col gap-1 p-4 transition-colors hover:border-neon/40">
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="truncate font-semibold">{p.name}</h2>
                          <span
                            className={`shrink-0 text-xs font-medium ${
                              st === "stateActive"
                                ? "text-neon"
                                : st === "stateScheduled"
                                  ? "text-amber-300"
                                  : "text-ink/50"
                            }`}
                          >
                            {t(st)}
                          </span>
                        </div>
                        <p className="text-sm text-ink/70">
                          {p.discountType === "PERCENT"
                            ? `${p.percentOff}%`
                            : clp(p.amountOffClp ?? 0)}
                          {" · "}
                          {t("window", {
                            from: fmtDate(p.validFrom),
                            until: fmtDate(p.validUntil),
                          })}
                        </p>
                        <p className="text-xs text-ink/50">
                          {p.plans.length === 0
                            ? t("scopeAll")
                            : t("scopeCount", { count: p.plans.length })}
                          {" · "}
                          {p.persons.length === 0
                            ? "—"
                            : t("whitelistCount", { count: p.persons.length })}
                          {" · "}
                          {t("discountedPayments")}: {p.discountedPayments}
                          {" · "}
                          {p.maxCycles != null
                            ? t("cyclesMax", { count: p.maxCycles })
                            : t("cyclesUnlimited")}
                        </p>
                      </Card>
                    </Link>
                  );
                })}
            </section>
          );
        }}
      </AcademyGate>
    </main>
  );
}

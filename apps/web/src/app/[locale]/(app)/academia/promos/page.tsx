"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  type BadgeVariant,
  Button,
  Card,
  ChevronRightIcon,
  RefreshIcon,
} from "@/components/ui";
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

// Color por estado (mapa fijo por enum): vigente = neon/accionable,
// programada = warn (aún no corre), terminales = muted.
const STATUS_VARIANT: Record<ReturnType<typeof statusKey>, BadgeVariant> = {
  stateActive: "neon",
  stateScheduled: "warn",
  stateExpired: "muted",
  stateDisabled: "muted",
};

/**
 * /academia/promos - becas y descuentos staff-managed sobre los planes
 * de membresía (spec member-promos). Lista clickeable → ficha [id];
 * crear en página dedicada /nueva (console-patterns). Sin delete -
 * baja = enabled=false en la ficha.
 */
export default function AcademiaPromosPage() {
  const t = useTranslations("academy");
  const ts = useTranslations("academyPromos");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia"
        backLabel={t("title")}
        actions={
          <Button href="/academia/promos/nueva" size="sm">
            + {ts("new")}
          </Button>
        }
      />
      <AcademyGate>
        {({ academy }) => (
          <PromosModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function PromosModule({ academyId }: { academyId: string }) {
  const t = useTranslations("academyPromos");
  const [items, setItems] = useState<Promo[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const res = await apiFetch(`/academies/${academyId}/promos`).catch(
      () => null,
    );
    if (!res?.ok) {
      setError(true);
      return;
    }
    setItems(await res.json());
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink/60">{t("desc")}</p>
      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("loadError")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {t("retry")}
          </Button>
        </div>
      )}
      {!error && items === null && <SkeletonList items={4} />}
      {!error && items !== null && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-ink/60">{t("empty")}</p>
          <Button href="/academia/promos/nueva" size="sm" variant="secondary">
            + {t("new")}
          </Button>
        </div>
      )}
      {!error && items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((p) => {
            const st = statusKey(p);
            return (
              <li key={p.id}>
                <Link
                  href={`/academia/promos/${p.id}`}
                  className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-neon/60">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="min-w-0 flex-1 truncate font-semibold">
                        {p.name}
                      </h2>
                      <Badge variant={STATUS_VARIANT[st]}>{t(st)}</Badge>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                    </div>
                    <p className="text-sm text-ink/70">
                      <span className="tabular-nums">
                        {p.discountType === "PERCENT"
                          ? `${p.percentOff}%`
                          : clp(p.amountOffClp ?? 0)}
                      </span>
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
                      {t("whitelistCount", { count: p.persons.length })}
                      {" · "}
                      {t("discountedPayments")}:{" "}
                      <span className="tabular-nums">
                        {p.discountedPayments}
                      </span>
                      {" · "}
                      {p.maxCycles != null
                        ? t("cyclesMax", { count: p.maxCycles })
                        : t("cyclesUnlimited")}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, SkeletonList } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { Link } from "@/i18n/navigation";
import { useDateFmt, useNumFmt } from "@/lib/intl";

// Listado de promos de suscripción (spec platform-promos) - patrón
// consola: CTA → página dedicada, card clickeable → ficha.

type Promo = {
  id: string;
  name: string;
  kind: "ACADEMY" | "PRODUCER" | null;
  discountType: "PERCENT" | "FIXED_CLP";
  percentOff: number | null;
  amountOffClp: number | null;
  validFrom: string;
  validUntil: string;
  maxCycles: number | null;
  enabled: boolean;
  academies: { id: string; name: string }[];
  producers: { id: string; name: string }[];
  subscriptionsCount: number;
  discountedPayments: number;
};

function promoState(p: Promo): "active" | "scheduled" | "expired" | "disabled" {
  if (!p.enabled) return "disabled";
  const now = Date.now();
  if (new Date(p.validUntil).getTime() < now) return "expired";
  if (new Date(p.validFrom).getTime() > now) return "scheduled";
  return "active";
}

function promoDiscountLabel(
  p: Pick<Promo, "discountType" | "percentOff" | "amountOffClp">,
  clp: Intl.NumberFormat,
): string {
  return p.discountType === "PERCENT"
    ? `−${p.percentOff ?? 0}%`
    : `−${clp.format(p.amountOffClp ?? 0)}`;
}

export default function AdminPromosPage() {
  const t = useTranslations("admin.promos");
  const tn = useTranslations("nav");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <AdminGate>
        <PromosPanel />
      </AdminGate>
    </main>
  );
}

function PromosPanel() {
  const t = useTranslations("admin.promos");
  const clp = useNumFmt({ style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  const dateFmt = useDateFmt({ dateStyle: "medium" });
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const res = await apiFetch("/admin/platform-promos").catch(() => null);
    if (!res?.ok) return setError(true);
    setPromos((await res.json()) as Promo[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const stateBadge = (s: ReturnType<typeof promoState>) =>
    s === "active" ? (
      <Badge variant="neon">{t("stateActive")}</Badge>
    ) : s === "scheduled" ? (
      <Badge variant="outline">{t("stateScheduled")}</Badge>
    ) : s === "expired" ? (
      <Badge variant="muted">{t("stateExpired")}</Badge>
    ) : (
      <Badge variant="muted">{t("stateDisabled")}</Badge>
    );

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <Link href="/admin/facturacion/promos/nueva">
            <Button size="sm">＋ {t("new")}</Button>
          </Link>
        </div>
        <p className="text-sm text-ink/60">{t("desc")}</p>
      </section>

      {error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("loadError")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {t("retry")}
          </Button>
        </div>
      ) : promos === null ? (
        <SkeletonList items={3} />
      ) : promos.length === 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm text-ink/60">{t("empty")}</p>
          <div>
            <Link href="/admin/facturacion/promos/nueva">
              <Button size="sm">＋ {t("new")}</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {promos.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/facturacion/promos/${p.id}`} className="block">
                <Card className="flex flex-col gap-1.5 p-4 transition-colors hover:border-neon/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-ink/50">
                        {promoDiscountLabel(p, clp)} ·{" "}
                        {p.kind ? t(`kind${p.kind === "ACADEMY" ? "Academy" : "Producer"}`) : t("kindAll")}
                      </p>
                    </div>
                    {stateBadge(promoState(p))}
                  </div>
                  <p className="text-xs text-ink/50 tabular-nums">
                    {t("window", {
                      from: dateFmt.format(new Date(p.validFrom)),
                      until: dateFmt.format(new Date(p.validUntil)),
                    })}
                    {p.maxCycles != null
                      ? ` · ${t("cyclesMax", { count: p.maxCycles })}`
                      : ` · ${t("cyclesUnlimited")}`}
                  </p>
                  {(p.academies.length + p.producers.length > 0) && (
                    <p className="text-xs text-ink/50">
                      {t("whitelistCount", {
                        count: p.academies.length + p.producers.length,
                      })}
                    </p>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

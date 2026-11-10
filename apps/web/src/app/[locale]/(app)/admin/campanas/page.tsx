"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { readError } from "@/components/academy/shared";
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  SkeletonList,
} from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { FilterBar } from "@/components/query/FilterBar";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { Link } from "@/i18n/navigation";
import { useDateFmt } from "@/lib/intl";
import { type Campaign } from "@/components/admin/campaign-form";

// Campañas de mail (spec admin-jobs-mail-campaigns + context-audiences):
// el admin compone subject + HTML libre (preview en iframe sandbox) con
// variables {{var}} por destinatario, elige audiencia (todos / rol /
// evento / ciclo de vida con ventana en días, con conteo en vivo) y
// programa envío único o recurrente. Las audiencias de ciclo llevan
// dedup por ciclo - un cron diario no re-envía el mismo recordatorio.
// Crear/editar vive en /admin/campanas/nueva (+?edit=<id>) y la
// operación (probar/enviar/cancelar) + historial de corridas en la
// ficha /admin/campanas/[id] (change admin-campaign-detail) - el
// listado solo navega (console-patterns §2-3).

const CAMPAIGN_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "SENDING",
  "DONE",
  "FAILED",
  "CANCELLED",
] as const;

// Las campañas no son entidad del query catalog y su endpoint vive en el
// módulo mail (fuera del scope admin) - la barra compartida filtra por
// status en cliente sobre la lista ya cargada. Sin from/to: el payload
// no expone una fecha de creación consistente.
const CAMPAIGNS_DEF: EntityDef = {
  entity: "campaigns",
  filters: [{ key: "status", type: "enum", options: CAMPAIGN_STATUSES }],
  columns: [],
};

export default function AdminCampanasPage() {
  const t = useTranslations("admin");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/inicio" backLabel={t("modules.backHome")} />
      <AdminGate>
        <CampaignsPanel />
      </AdminGate>
    </main>
  );
}

function statusBadge(s: Campaign["status"], t: (k: string) => string) {
  const map: Record<Campaign["status"], "muted" | "neon" | "live" | "outline"> = {
    DRAFT: "muted",
    SCHEDULED: "neon",
    SENDING: "neon",
    DONE: "outline",
    FAILED: "live",
    CANCELLED: "muted",
  };
  return <Badge variant={map[s]}>{t(`campaigns.status.${s}`)}</Badge>;
}

function audienceLabel(a: Campaign["audience"], t: (k: string, v?: Record<string, string>) => string) {
  if (a.kind === "ALL") return t("campaigns.audienceAll");
  if (a.kind === "ROLE") return t("campaigns.audienceRole", { role: a.roleKey ?? "" });
  if (a.kind === "EVENT") return t("campaigns.audienceEvent", { event: a.eventId?.slice(0, 8) ?? "" });
  return t("campaigns.audienceLifecycle", {
    label: t(`campaigns.kind.${a.kind}`),
    days: String(a.days ?? 7),
  });
}

function scheduleLabel(c: Campaign, t: (k: string, v?: Record<string, string>) => string, fmt: (iso: string | null) => string) {
  if (c.scheduleKind === "ONCE") return t("campaigns.scheduleOnce", { at: fmt(c.runAt) });
  return `${c.cronExpr} (${c.timezone})`;
}

function CampaignsPanel() {
  const dt = useDateFmt({
    dateStyle: "short",
    timeStyle: "short",
  });
  const fmt = (iso: string | null) =>
    iso ? dt.format(new Date(iso)) : "—";
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [filters, setFilters] = useState<QueryFilters>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/admin/mail-campaigns");
      if (!res.ok) {
        setError(await readError(res));
        setCampaigns([]);
        return;
      }
      setCampaigns(await res.json());
    } catch {
      setError(tc("error"));
      setCampaigns([]);
    }
  }, [tc]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleCampaigns =
    campaigns?.filter((c) => !filters.status || c.status === filters.status) ??
    null;

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{t("campaigns.title")}</h1>
        <p className="text-sm text-ink/60">{t("campaigns.desc")}</p>
        {error && (
          <Card role="alert" className="border-red-500/40 p-3 text-sm text-red-300">
            {error}
          </Card>
        )}
        <div>
          <Button
            variant="primary"
            size="sm"
            href="/admin/campanas/nueva"
          >
            {t("campaigns.new")}
          </Button>
        </div>
      </section>

      <FilterBar
        entity={CAMPAIGNS_DEF}
        filters={filters}
        onChange={setFilters}
        options={{}}
      />

      {campaigns === null ? (
        <SkeletonList items={3} />
      ) : (visibleCampaigns ?? []).length === 0 ? (
        <Card className="p-4 text-sm text-ink/60">{t("campaigns.empty")}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {(visibleCampaigns ?? []).map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/campanas/${c.id}`}
                className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-neon/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="text-xs text-ink/50">{c.subject}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(c.status, t)}
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    <div>
                      <p className="text-ink/40">{t("campaigns.audience")}</p>
                      <p className="text-ink/80">{audienceLabel(c.audience, t)}</p>
                    </div>
                    <div>
                      <p className="text-ink/40">{t("campaigns.schedule")}</p>
                      <p className="text-ink/80">{scheduleLabel(c, t, fmt)}</p>
                    </div>
                    <div>
                      <p className="text-ink/40">{t("campaigns.counters")}</p>
                      <p className="text-ink/80">
                        {c.sentCount} ✓ / {c.failCount} ✗
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, Skeleton } from "@/components/ui";
import type { Academy, AcademyDashboard } from "./shared";

const clpFmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

// Academia seleccionada persiste en localStorage (misma key que
// AcademyGate) - el strip autocontenido la respeta al auto-resolver.
const STORAGE_KEY = "omnidance:academy-id";

/**
 * Strip de KPIs del mes de la academia (spec: consola del owner) -
 * 4 cards enlazables a su módulo. Usado en el dashboard del inicio
 * (data ya fetcheada → `AcademyKpiCards`) y como primera sección de
 * alumnos/clases/planes (`AcademyKpiStrip` se auto-resuelve).
 */
export function AcademyKpiCards({
  data,
  error,
  onRetry,
}: {
  data: AcademyDashboard | null;
  error?: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");

  if (error) {
    return onRetry ? (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    ) : null;
  }

  const items: {
    key: string;
    href: string;
    value: string | null;
    hint: string;
  }[] = data
    ? [
        {
          key: "activeStudents",
          href: "/academia/alumnos",
          value: String(data.kpis.activeStudentsMonth),
          hint: t("kpis.activeStudentsHint"),
        },
        {
          key: "purchasablePlans",
          href: "/academia/planes",
          value: String(data.kpis.purchasablePlans),
          hint: t("kpis.purchasablePlansHint"),
        },
        {
          key: "avgAttendance",
          href: "/academia/asistencia",
          value:
            data.kpis.avgAttendancePerClassMonth === null
              ? null
              : String(data.kpis.avgAttendancePerClassMonth),
          hint: t("kpis.avgAttendanceHint"),
        },
        {
          key: "avgTicket",
          href: "/academia/cobros",
          value:
            data.kpis.avgTicketMonth === null
              ? null
              : clpFmt.format(data.kpis.avgTicketMonth),
          hint: t("kpis.avgTicketHint"),
        },
      ]
    : [];

  return (
    <section aria-label={t("kpis.title")}>
      {data === null ? (
        <ul
          aria-hidden="true"
          className="page-loading grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Card className="flex h-full flex-col gap-1 p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16" />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {items.map((k) => (
            <li key={k.key}>
              <Link
                href={k.href}
                title={k.hint}
                className="block h-full rounded-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.98]"
              >
                <Card className="flex h-full flex-col gap-1 p-4 transition-colors hover:border-neon/40">
                  <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                    {t(`kpis.${k.key}`)}
                  </span>
                  <span className="text-3xl font-bold leading-none text-neon">
                    {k.value ?? "—"}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Versión autocontenida para las páginas de módulo: si recibe
 * `academyId` lo usa directo; si no, resuelve `/academies/mine`
 * respetando la selección persistida (páginas sin AcademyGate como
 * /academia/clases). Sin academia o sin acceso → no renderiza nada
 * (el dashboard responde 403 para quien no es del equipo).
 */
export function AcademyKpiStrip({ academyId }: { academyId?: string }) {
  const [resolvedId, setResolvedId] = useState<string | null>(
    academyId ?? null,
  );
  const [data, setData] = useState<AcademyDashboard | null>(null);
  const [hidden, setHidden] = useState(false);

  // Auto-resolución de academia cuando la página no tiene AcademyGate.
  useEffect(() => {
    if (academyId) {
      setResolvedId(academyId);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await apiFetch("/academies/mine").catch(() => null);
      if (cancelled) return;
      if (!res?.ok) {
        setHidden(true);
        return;
      }
      const list = (await res.json()) as Academy[];
      if (!list.length) {
        setHidden(true);
        return;
      }
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        // Sin storage (modo privado) - primera academia.
      }
      setResolvedId(
        stored && list.some((a) => a.id === stored) ? stored : list[0].id,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const load = useCallback(async () => {
    if (!resolvedId) return;
    setData(null);
    setHidden(false);
    const res = await apiFetch(`/academies/${resolvedId}/dashboard`).catch(
      () => null,
    );
    if (!res?.ok) {
      setHidden(true);
      return;
    }
    setData((await res.json()) as AcademyDashboard);
  }, [resolvedId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden) return null;
  if (!resolvedId) return null;
  return <AcademyKpiCards data={data} />;
}

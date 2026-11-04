"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  type BadgeVariant,
  Button,
  Card,
  ChevronRightIcon,
  RefreshIcon,
  SkeletonList,
  Spinner,
} from "@/components/ui";
import type { PaymentAuditRow } from "@/components/payments/shared";
import {
  PAYMENT_STATUS_VARIANT,
  paymentContext,
  paymentPaidAt,
} from "@/components/payments/shared";
import type { QueueClaim } from "./claims-queue";
import { Link } from "@/i18n/navigation";
import { getNumFmt, useDateFmt } from "@/lib/intl";

const clp = (locale: string) => getNumFmt(locale, {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type Row = {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  variant: BadgeVariant;
  date: string;
};

/**
 * Historial unificado de cobros (spec academy-console-v3): los claims
 * resueltos (validaciones manuales) y los pagos por pasarela del mismo
 * libro, ordenados por fecha, como lista densa - cada fila abre su
 * página de detalle.
 */
const WINDOW = 20;

export function CobrosHistory({ academyId }: { academyId: string }) {
  const locale = useLocale();
  const claimDateFmt = useDateFmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const t = useTranslations("academyPay");
  const tp = useTranslations("payments");
  const tc = useTranslations("common");

  const [rows, setRows] = useState<Row[] | null>(null);
  const [shown, setShown] = useState(WINDOW);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Merge de dos fuentes (claims resueltos + pagos de pasarela) con
  // ventana creciente: pide los primeros `shown` de cada fuente y une
  // - los primeros `shown` del merge son correctos (en el peor caso
  // todos vienen de una sola fuente). Cap 200 por fuente.
  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const size = Math.min(shown, 200);
      const fetchClaims = async (status: string) => {
        const res = await apiFetch(
          `/academies/${academyId}/claims?status=${status}&pageSize=${size}`,
        );
        if (!res.ok) throw new Error("cobros history load failed");
        return (await res.json()) as { items: QueueClaim[]; total: number };
      };
      const paysFetch = async () => {
        const res = await apiFetch(
          `/payments/by-academy/${academyId}?pageSize=${size}`,
        );
        if (!res.ok) throw new Error("cobros history load failed");
        return (await res.json()) as {
          items: PaymentAuditRow[];
          total: number;
        };
      };
      const [apr, rej, paysRes] = await Promise.all([
        fetchClaims("APPROVED"),
        fetchClaims("REJECTED"),
        paysFetch(),
      ]);
      const claims = [...apr.items, ...rej.items];
      const payments = paysRes.items;
      setTotal(apr.total + rej.total + paysRes.total);

      const claimRows: Row[] = claims.map((c) => ({
        key: `claim-${c.id}`,
        href: `/academia/cobros/claim/${c.id}`,
        title: c.person.name,
        subtitle: `${c.plan?.name ?? c.methodLabel} · ${clp(locale).format(c.amount)}`,
        status: c.status,
        statusLabel:
          c.status === "APPROVED" ? t("statusApproved") : t("statusRejected"),
        variant: c.status === "APPROVED" ? "neon" : "live",
        date: c.reviewedAt ?? c.createdAt,
      }));
      const paymentRows: Row[] = payments.map((p) => ({
        key: `pay-${p.id}`,
        href: `/academia/cobros/pago/${p.id}`,
        title:
          paymentContext(p) ??
          (tp.has(`orderTypes.${p.orderType}`)
            ? tp(`orderTypes.${p.orderType}`)
            : p.orderType),
        subtitle: `${p.gatewayMedia ?? t("methodGateway")} · ${clp(locale).format(p.amount)}`,
        status: p.status,
        statusLabel: tp.has(`status.${p.status}`) ? tp(`status.${p.status}`) : p.status,
        variant: PAYMENT_STATUS_VARIANT[p.status] ?? "muted",
        date: paymentPaidAt(p),
      }));

      setRows(
        [...claimRows, ...paymentRows]
          .sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          )
          .slice(0, shown),
      );
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [academyId, shown, locale, t, tp]);

  useEffect(() => {
    void load();
  }, [load]);

  // Error de fetch: nunca vacío silencioso - el historial es superficie
  // operativa y el fallo debe distinguirse de "sin movimientos".
  if (loadError) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (rows === null) return <SkeletonList />;
  if (rows.length === 0) return null;

  return (
    <Card
      className="flex flex-col gap-4"
      data-tour="academy-cobros-history"
    >
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("historyUnifiedTitle")}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t("historyUnifiedDesc")}</p>
      </div>
      {/* -mt-3: la py-3 de la primera fila ya aporta el aire que antes
          daba el gap-4; sin el ajuste quedaba doble espacio. Cada fila
          conserva ≥44px de touch target (py-3 + contenido). */}
      <ul className="-mt-3 flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key}>
            <Link
              href={r.href}
              className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-elevated/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.title}</p>
                <p className="truncate text-xs text-ink/50">
                  {r.subtitle} ·{" "}
                  {claimDateFmt.format(new Date(r.date))}
                </p>
              </div>
              <Badge variant={r.variant}>{r.statusLabel}</Badge>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
            </Link>
          </li>
        ))}
      </ul>
      {rows.length < total && (
        <Button
          variant="secondary"
          size="sm"
          className="self-center"
          disabled={loadingMore}
          onClick={() => {
            setLoadingMore(true);
            setShown((v) => v + WINDOW);
          }}
        >
          {loadingMore ? <Spinner size="sm" /> : tc("pager.loadMore")}
        </Button>
      )}
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card, SkeletonList } from "@/components/ui";
import type { PaymentAuditRow } from "@/components/payments/shared";
import {
  PAYMENT_STATUS_VARIANT,
  paymentContext,
  paymentPaidAt,
} from "@/components/payments/shared";
import type { QueueClaim } from "./claims-queue";
import { claimDateFmt } from "./claims-queue";

const clp = new Intl.NumberFormat("es-CL", {
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
  variant: "neon" | "live" | "muted" | "outline";
  date: string;
};

/**
 * Historial unificado de cobros (spec academy-console-v3): los claims
 * resueltos (validaciones manuales) y los pagos por pasarela del mismo
 * libro, ordenados por fecha. Cada card abre su página de detalle.
 */
export function CobrosHistory({ academyId }: { academyId: string }) {
  const t = useTranslations("academyPay");
  const tp = useTranslations("payments");

  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    const [claimsRes, paysRes] = await Promise.all([
      apiFetch(`/academies/${academyId}/claims`).catch(() => null),
      apiFetch(`/payments/by-academy/${academyId}`).catch(() => null),
    ]);
    const claims = claimsRes?.ok ? ((await claimsRes.json()) as QueueClaim[]) : [];
    const payments = paysRes?.ok ? ((await paysRes.json()) as PaymentAuditRow[]) : [];

    const claimRows: Row[] = claims
      .filter((c) => c.status === "APPROVED" || c.status === "REJECTED")
      .map((c) => ({
        key: `claim-${c.id}`,
        href: `/academia/cobros/claim/${c.id}`,
        title: c.person.name,
        subtitle: `${c.plan?.name ?? c.methodLabel} · ${clp.format(c.amount)}`,
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
      subtitle: `${p.gatewayMedia ?? t("methodGateway")} · ${clp.format(p.amount)}`,
      status: p.status,
      statusLabel: tp.has(`status.${p.status}`) ? tp(`status.${p.status}`) : p.status,
      variant: PAYMENT_STATUS_VARIANT[p.status] ?? "muted",
      date: paymentPaidAt(p),
    }));

    setRows(
      [...claimRows, ...paymentRows].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    );
  }, [academyId, t, tp]);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null) return <SkeletonList />;
  if (rows.length === 0) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("historyUnifiedTitle")}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t("historyUnifiedDesc")}</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.key}>
            <Link
              href={r.href}
              className="block rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
            >
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4 transition-colors hover:border-neon/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {r.title}
                  </span>
                  <Badge variant={r.variant}>{r.statusLabel}</Badge>
                </div>
                <p className="truncate text-xs text-ink/50">{r.subtitle}</p>
                <p className="text-xs text-ink/40">
                  {claimDateFmt.format(new Date(r.date))}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card } from "@/components/ui";

type MyClaim = {
  id: string;
  amount: number;
  methodLabel: string;
  status: "AWAITING" | "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  plan: { name: string } | null;
};

const statusStyle: Record<
  MyClaim["status"],
  { variant: "muted" | "neon" | "outline"; label: string; className?: string }
> = {
  AWAITING: { variant: "outline", label: "statusAwaiting" },
  PENDING: { variant: "muted", label: "statusPending" },
  APPROVED: { variant: "neon", label: "statusApproved" },
  REJECTED: {
    variant: "outline",
    label: "statusRejected",
    className: "border-red-400/50 text-red-300",
  },
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
});

/**
 * "Mis comprobantes" en la ficha (spec academy-checkout-manual-pay):
 * listado read-only del estado de los intentos/claims propios. El pago
 * como tal vive en el checkout de cada plan.
 */
export function AcademyClaimsMine({ academyId }: { academyId: string }) {
  const t = useTranslations("academyPay");
  const [claims, setClaims] = useState<MyClaim[] | null>(null);

  useEffect(() => {
    apiFetch(`/academies/${academyId}/claims/mine`)
      .then(async (res) => setClaims(res.ok ? await res.json() : []))
      .catch(() => setClaims([]));
  }, [academyId]);

  if (!claims || claims.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("myClaimsTitle")}
      </h2>
      <ul className="flex flex-col gap-2">
        {claims.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-night-700 px-3 py-2 text-sm"
          >
            <span className="font-medium">
              {c.plan?.name ?? c.methodLabel}
            </span>
            <span className="text-white/50">
              {clp.format(c.amount)} · {dayFmt.format(new Date(c.createdAt))}
            </span>
            <Badge
              variant={statusStyle[c.status].variant}
              className={`ml-auto ${statusStyle[c.status].className ?? ""}`}
            >
              {t(statusStyle[c.status].label)}
            </Badge>
            {c.status === "REJECTED" && c.reviewNote && (
              <p className="w-full text-xs text-red-300/80">{c.reviewNote}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

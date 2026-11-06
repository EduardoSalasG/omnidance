"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Button,
  Card,
  ChevronRightIcon,
  LIST_PREVIEW,
  RefreshIcon,
  SeeAllRow,
  SkeletonList,
} from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { formatMoney, useDateFmt } from "@/lib/intl";

// Comprobantes de inscripciones por transferencia (spec
// subscription-manual-transfer): TicketClaim domain=ACADEMY sobre
// órdenes MEMBERSHIP manuales - otra cola que la de los claims de
// pago único (ClaimsQueue), mismo gate de capacidad payments.
export type OrderClaim = {
  id: string;
  methodType: string;
  methodLabel: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  person: { id: string; name: string };
  payment: {
    id: string;
    amount: number;
    orderType: string;
    refId: string;
  };
};

// Preview visual de la cola de trabajo: sube vs LIST_PREVIEW porque es
// superficie operativa (design console-audit-fixes §3).
const QUEUE_PREVIEW = 20;

/**
 * Cola "Inscripciones por validar" del owner (spec
 * subscription-manual-transfer): comprobantes de órdenes MEMBERSHIP
 * manuales (alta o renovación por transferencia). Cada card abre la
 * ficha /academia/cobros/orden/[id] donde viven el comprobante y
 * aprobar/rechazar - la cola no muta ni filtra.
 *
 * Trae PENDING completa + historial resuelto acotado (la API solo
 * acepta un status por request).
 */
export function OrderClaimsQueue({ academyId }: { academyId: string }) {
  const locale = useLocale();
  const claimDateFmt = useDateFmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");

  const [claims, setClaims] = useState<OrderClaim[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [expandPending, setExpandPending] = useState(false);
  const [expandResolved, setExpandResolved] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const get = async (qs: string) => {
        const res = await apiFetch(
          `/academies/${academyId}/order-claims${qs}`,
        );
        if (!res.ok) throw new Error("order-claims load failed");
        return (await res.json()) as {
          claims: OrderClaim[];
          total: number;
        };
      };
      const [pen, app, rej] = await Promise.all([
        get("?status=PENDING&pageSize=100"),
        get("?status=APPROVED&pageSize=50"),
        get("?status=REJECTED&pageSize=50"),
      ]);
      setClaims([...pen.claims, ...app.claims, ...rej.claims]);
    } catch {
      setLoadError(true);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Error de fetch: nunca vacío silencioso - la cola es superficie
  // operativa y el fallo debe distinguirse de "nada que validar".
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
  if (claims === null) return <SkeletonList />;
  // Cola colapsa a nada cuando no hay comprobantes.
  if (claims.length === 0) return null;

  const pending = claims.filter((c) => c.status === "PENDING");
  const resolved = claims
    .filter((c) => c.status !== "PENDING" && c.reviewedAt)
    .sort(
      (a, b) =>
        new Date(b.reviewedAt!).getTime() - new Date(a.reviewedAt!).getTime(),
    );

  const claimLine = (c: OrderClaim) => (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{c.person.name}</span>
        <span className="text-ink/60">
          {t("orderMembership")} · {c.methodLabel} ·{" "}
          {formatMoney(c.payment.amount, undefined, locale)}
        </span>
        <span className="ml-auto text-xs text-ink/40">
          {claimDateFmt.format(new Date(c.createdAt))}
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
      </div>
      {c.note && <p className="text-xs italic text-ink/50">“{c.note}”</p>}
    </>
  );

  return (
    <div className="flex flex-col gap-4" data-tour="academy-order-claims">
      {pending.length > 0 && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("orderQueueTitle")}
            </h2>
            <p className="mt-1 text-xs text-ink/50">{t("orderQueueDesc")}</p>
          </div>
          {/* [&>li:last-child]: el SeeAllRow ocupa la fila completa del
              grid (solo existe cuando hay más de QUEUE_PREVIEW ítems). */}
          <ul
            className={`grid grid-cols-1 gap-3 sm:grid-cols-2${
              pending.length > QUEUE_PREVIEW
                ? " sm:[&>li:last-child]:col-span-2"
                : ""
            }`}
          >
            {pending
              .slice(0, expandPending ? undefined : QUEUE_PREVIEW)
              .map((c) => (
              <li key={c.id}>
                <Link
                  href={`/academia/cobros/orden/${c.id}?from=/academia/cobros`}
                  className="block rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
                >
                  <div className="flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4 transition-colors hover:border-neon/60">
                    {claimLine(c)}
                    <p className="text-xs text-ink/40">
                      {t("viewReceipt")}
                    </p>
                  </div>
                </Link>
              </li>
              ))}
            <SeeAllRow
              total={pending.length}
              expanded={expandPending}
              onToggle={() => setExpandPending((v) => !v)}
              preview={QUEUE_PREVIEW}
            />
          </ul>
        </Card>
      )}

      {resolved.length > 0 && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("orderHistoryTitle")}
            </h2>
          </div>
          <ul className="flex flex-col gap-2">
            {resolved
              .slice(0, expandResolved ? undefined : LIST_PREVIEW)
              .map((c) => (
              <li key={c.id}>
                <Link
                  href={`/academia/cobros/orden/${c.id}?from=/academia/cobros`}
                  className="-mx-2 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-elevated/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  <span className="font-semibold">{c.person.name}</span>
                  <span className="text-ink/60">
                    {t("orderMembership")} ·{" "}
                    {formatMoney(c.payment.amount, undefined, locale)}
                  </span>
                  <span
                    className={`ml-auto text-xs ${
                      c.status === "APPROVED" ? "text-neon" : "text-red-400"
                    }`}
                  >
                    {c.reviewedBy
                      ? t(
                          c.status === "APPROVED"
                            ? "reviewedByApproved"
                            : "reviewedByRejected",
                          { name: c.reviewedBy.name },
                        )
                      : t(
                          c.status === "APPROVED"
                            ? "statusApproved"
                            : "statusRejected",
                        )}
                    {" · "}
                    {claimDateFmt.format(new Date(c.reviewedAt!))}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                </Link>
              </li>
              ))}
            <SeeAllRow
              total={resolved.length}
              expanded={expandResolved}
              onToggle={() => setExpandResolved((v) => !v)}
            />
          </ul>
        </Card>
      )}
    </div>
  );
}

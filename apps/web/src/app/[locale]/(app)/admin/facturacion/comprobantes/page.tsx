"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Card, ChevronRightIcon, Pager, SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { CLAIM_STATUSES, filtersParams } from "@/components/producer/shared";
import { Link } from "@/i18n/navigation";
import { formatMoney, useDateFmt } from "@/lib/intl";

// Comprobantes de suscripciones de plataforma por transferencia (spec
// subscription-manual-transfer): TicketClaim domain=PLATFORM sobre
// órdenes PLATFORM_SUB manuales - los valida admin.access.
const CLAIMS_ENTITY: EntityDef = {
  entity: "payment-claims",
  filters: [
    { key: "status", type: "enum", options: CLAIM_STATUSES },
    { key: "from", type: "date" },
    { key: "to", type: "date" },
  ],
  columns: [],
};

type PlatformClaim = {
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

const PAGE_SIZE = 20;

const claimCardCls =
  "block rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]";
const claimCardInnerCls =
  "flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4 transition-colors hover:border-neon/40";

/**
 * /admin/facturacion/comprobantes - cola admin de comprobantes de
 * suscripciones de plataforma pagadas por transferencia (spec
 * subscription-manual-transfer): academia SaaS y Producer Pro. Cada
 * card abre la ficha donde viven el comprobante y aprobar/rechazar -
 * la cola no muta inline. Misma forma que la cola del productor.
 */
export default function AdminComprobantesPage() {
  const tn = useTranslations("nav");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <AdminGate>
        <ClaimsPanel />
      </AdminGate>
    </main>
  );
}

function ClaimsPanel() {
  const locale = useLocale();
  const dayFmt = useDateFmt({
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const t = useTranslations("admin.claims");
  const tq = useTranslations("query");

  const [claims, setClaims] = useState<PlatformClaim[] | null>(null);
  const [filters, setFilters] = useState<QueryFilters>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (f: QueryFilters, p: number) => {
    // Con filtro de estado la vista es un listado paginado; sin filtro
    // la cola trae PENDING + historial resuelto en requests separadas
    // (la API solo acepta un status por request).
    if (typeof f.status === "string") {
      const params = filtersParams(f);
      const sep = params ? "&" : "?";
      const res = await apiFetch(
        `/admin/payment-claims${params}${sep}page=${p}&pageSize=${PAGE_SIZE}`,
      ).catch(() => null);
      const data = res?.ok
        ? ((await res.json()) as {
            claims: PlatformClaim[];
            total: number;
          })
        : { claims: [], total: 0 };
      setClaims(data.claims);
      setTotal(data.total);
      return;
    }
    const get = (status: string, size: number) =>
      apiFetch(`/admin/payment-claims?status=${status}&pageSize=${size}`)
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ claims: PlatformClaim[] }>)
            : { claims: [] },
        )
        .catch(() => ({ claims: [] as PlatformClaim[] }));
    const [pending, approved, rejected] = await Promise.all([
      get("PENDING", 100),
      get("APPROVED", 50),
      get("REJECTED", 50),
    ]);
    setClaims([...pending.claims, ...approved.claims, ...rejected.claims]);
    setTotal(0);
  }, []);

  useEffect(() => {
    void load(filters, page);
  }, [load, filters, page]);

  if (claims === null) return <SkeletonList items={2} />;

  const filtered = typeof filters.status === "string";
  const pending = filtered
    ? claims
    : claims.filter((c) => c.status === "PENDING");
  const resolved = filtered
    ? []
    : claims
        .filter((c) => c.status !== "PENDING" && c.reviewedAt)
        .sort(
          (a, b) =>
            new Date(b.reviewedAt!).getTime() -
            new Date(a.reviewedAt!).getTime(),
        )
        .slice(0, 20);

  const claimLine = (c: PlatformClaim) => (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{c.person.name}</span>
        <span className="text-ink/60">
          {t("orderPlatformSub")} · {c.methodLabel} ·{" "}
          {formatMoney(c.payment.amount, undefined, locale)}
        </span>
        <span className="ml-auto text-xs text-ink/40">
          {dayFmt.format(new Date(c.createdAt))}
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
      </div>
      {c.note && <p className="text-xs italic text-ink/50">“{c.note}”</p>}
    </>
  );

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-ink/60">{t("desc")}</p>
      </section>

      {/* Cola accionable primero (mismo orden que cobros del owner):
          todos los pendientes, masivos. */}
      {pending.length > 0 && !filtered && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("queueTitle")}
            </h2>
            <p className="mt-1 text-xs text-ink/50">{t("queueDesc")}</p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pending.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/facturacion/comprobantes/${c.id}`}
                  className={claimCardCls}
                >
                  <div className={claimCardInnerCls}>{claimLine(c)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {claims.length === 0 && !filtered && (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <p role="status" className="text-ink/70">
            {t("queueEmpty")}
          </p>
          <p className="text-xs text-ink/50">{t("queueEmptyDesc")}</p>
        </Card>
      )}

      {resolved.length > 0 && !filtered && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("historyTitle")}
            </h2>
          </div>
          <ul className="flex flex-col gap-2">
            {resolved.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/facturacion/comprobantes/${c.id}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1 text-sm transition-colors hover:bg-neon/5"
                >
                  <span className="font-semibold">{c.person.name}</span>
                  <span className="text-ink/60">
                    {t("orderPlatformSub")} ·{" "}
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
                    {dayFmt.format(new Date(c.reviewedAt!))}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FilterBar
        entity={CLAIMS_ENTITY}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        options={{}}
      />
      {filtered && claims.length === 0 && (
        <p role="status" className="text-sm text-ink/50">
          {tq("empty")}
        </p>
      )}
      {filtered && claims.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {claims.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/facturacion/comprobantes/${c.id}`}
                className={claimCardCls}
              >
                <div className={claimCardInnerCls}>{claimLine(c)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {filtered && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
        />
      )}
    </>
  );
}

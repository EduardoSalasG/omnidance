"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card, Pager, SkeletonList } from "@/components/ui";

export type InstructorRow = {
  person: { id: string; name: string | null; email: string | null };
  payType: "PER_CLASS" | "MONTHLY" | "COMMISSION" | null;
  payAmount: number | null;
  payClasses: number | null;
  commissionPct: number | null;
  createdAt: string;
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Listado de profesores (spec academy-console-v3) - cards navegables
 * al detalle del profesor (/academia/equipo/profesor/[id]), donde viven
 * el acuerdo económico, las métricas y la baja. Gated por capacidad
 * `team` en el backend.
 */
const PAGE_SIZE = 20;

export function InstructorSection({ academyId }: { academyId: string }) {
  const t = useTranslations("academyStaff");

  const [rows, setRows] = useState<InstructorRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const res = await apiFetch(
      `/academies/${academyId}/instructors?page=${page}&pageSize=${PAGE_SIZE}`,
    ).catch(() => null);
    const data = res?.ok
      ? ((await res.json()) as { items: InstructorRow[]; total: number })
      : { items: [], total: 0 };
    setRows(data.items);
    setTotal(data.total);
  }, [academyId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null) return <SkeletonList />;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("instructorsTitle")}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t("instructorsDesc")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink/60">{t("instructorsEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.person.id}>
              <Link
                href={`/academia/equipo/profesor/${r.person.id}`}
                className="block rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
              >
                <div className="flex flex-col gap-1 rounded-xl border border-line bg-elevated p-4 transition-colors hover:border-neon/40">
                  <span className="truncate text-sm font-semibold">
                    {r.person.name ?? r.person.email}
                  </span>
                  {r.person.email && (
                    <span className="truncate text-xs text-ink/50">
                      {r.person.email}
                    </span>
                  )}
                  <span className="text-xs text-ink/40">
                    {r.payType === "MONTHLY" && r.payAmount != null
                      ? t("payClassesOf", {
                          amount: clp.format(r.payAmount),
                          classes: r.payClasses ?? 0,
                        })
                      : r.payType === "PER_CLASS" && r.payAmount != null
                        ? t("payPerClassOf", {
                            amount: clp.format(r.payAmount),
                          })
                        : r.payType === "COMMISSION" && r.commissionPct != null
                          ? t("payCommissionOf", { pct: r.commissionPct })
                          : t("agreementNone")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
        />
      )}
    </Card>
  );
}

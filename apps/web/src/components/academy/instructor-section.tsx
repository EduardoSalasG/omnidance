"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card, SkeletonList } from "@/components/ui";

export type InstructorRow = {
  person: { id: string; name: string | null; email: string | null };
  commissionPct: number | null;
  payType: "PER_CLASS" | "MONTHLY" | null;
  payAmount: number | null;
  payClasses: number | null;
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
export function InstructorSection({ academyId }: { academyId: string }) {
  const t = useTranslations("academyStaff");

  const [rows, setRows] = useState<InstructorRow[] | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`/academies/${academyId}/instructors`).catch(
      () => null,
    );
    setRows(res?.ok ? ((await res.json()) as InstructorRow[]) : []);
  }, [academyId]);

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
                        : t("agreementNone")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

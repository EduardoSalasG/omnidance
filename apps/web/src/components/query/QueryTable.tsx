"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui";

// Tabla de preview del query engine (spec analytics/query-console):
// headers = keys de columna de la entidad (labels via
// `query.cols.<entity>.<col>` con fallback `query.cols.<col>`); rows
// capadas a ~50 y `total` real → "Mostrando N de M" cuando hay cap.
// Tabla real en ≥lg; en móvil cards de una columna con label: valor
// (mismo criterio que las listas de /admin/datos).

const num = new Intl.NumberFormat("es-CL");

export type QueryTableProps = {
  /** Entidad consultada - prefijo de las labels de columna. */
  entity: string;
  headers: string[];
  rows: unknown[][];
  /** Total real del resultado (rows puede venir capado para preview). */
  total: number;
};

export function QueryTable({ entity, headers, rows, total }: QueryTableProps) {
  const t = useTranslations("query");

  const colLabel = (col: string) =>
    t.has(`cols.${entity}.${col}`)
      ? t(`cols.${entity}.${col}`)
      : t.has(`cols.${col}`)
        ? t(`cols.${col}`)
        : col;

  const cellText = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "·";
    if (typeof v === "number") return num.format(v);
    if (typeof v === "boolean")
      return t(v ? "optionLabels.true" : "optionLabels.false");
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  };

  const capped = rows.length < total;

  if (rows.length === 0) {
    return (
      <Card className="py-6 text-center">
        <p className="text-sm text-ink/70">{t("empty")}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Cards en móvil - label:valor por columna, primera como título. */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((row, i) => (
          <li key={i}>
            <Card className="flex flex-col gap-1 p-4">
              <p className="min-w-0 truncate text-sm font-semibold">
                {cellText(row[0])}
              </p>
              {headers.slice(1).map((h, j) => {
                const v = cellText(row[j + 1]);
                if (v === "·") return null;
                return (
                  <p key={h} className="truncate text-xs text-ink/60">
                    <span className="text-ink/40">{colLabel(h)}:</span> {v}
                  </p>
                );
              })}
            </Card>
          </li>
        ))}
      </ul>

      {/* Tabla real en desktop. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface lg:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {headers.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink/50"
                >
                  {colLabel(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-line/60 last:border-b-0"
              >
                {headers.map((h, j) => (
                  <td
                    key={h}
                    className="max-w-56 truncate px-4 py-2.5 tabular-nums text-ink/80"
                  >
                    {cellText(row[j])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink/50">
        {capped
          ? t("showingCapped", { shown: rows.length, total })
          : t("showing", { total })}
      </p>
    </div>
  );
}

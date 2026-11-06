"use client";

import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { getNumFmt, useDateFmt } from "@/lib/intl";

const num = (locale: string) => getNumFmt(locale);

// Columnas que muestran a la persona-sujeto de la fila, en orden de
// prioridad (drill a personBasePath/[personId] cuando el runner
// adjunta `personId` como celda suplementaria al final de la fila -
// fuera de `headers`, nunca se pinta como columna). `nombre` va último:
// en entidades mixtas puede ser una org (events.productor va antes).
const PERSON_COL_PRIORITY = [
  "persona",
  "alumno",
  "asistente",
  "invitado",
  "actor",
  "usuario",
  "productor",
  "instructor",
  "dueno_lista",
  "nombre",
];

const personColIndex = (headers: string[]) =>
  PERSON_COL_PRIORITY.reduce(
    (idx, key) => (idx >= 0 ? idx : headers.indexOf(key)),
    -1,
  );

const personIdOf = (row: unknown[], cols: number): string | null => {
  const v = row.length > cols ? row[cols] : null;
  return typeof v === "string" && v !== "" ? v : null;
};

const personLinkCls =
  "text-neon underline-offset-2 hover:underline " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";

// Tabla de preview del query engine (spec analytics/query-console):
// headers = keys de columna de la entidad (labels via
// `query.cols.<entity>.<col>` con fallback `query.cols.<col>`); rows
// capadas a ~50 y `total` real → "Mostrando N de M" cuando hay cap.
// Tabla real en ≥lg; en móvil cards de una columna con label: valor
// (mismo criterio que las listas de /admin/datos).

;

type QueryTableProps = {
  /** Entidad consultada - prefijo de las labels de columna. */
  entity: string;
  headers: string[];
  rows: unknown[][];
  /** Total real del resultado (rows puede venir capado para preview). */
  total: number;
  /** Base del link de la celda persona, por lente:
      `/academia/alumnos` en ACADEMY_OWNER, `/analitica/usuarios` en el
      resto (ficha solo-admin). */
  personBasePath: string;
};

// Fechas en las celdas: el motor emite ISO; `YYYY-MM-DD` y los ISO a
// medianoche UTC son días-calendario (convención Class.date) → se
// formatean en UTC para no correr el día; el resto de ISO son instantes
// → fecha+hora del locale en zona local.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MIDNIGHT_RE = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.\d+)?Z$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function QueryTable({
  entity,
  headers,
  rows,
  total,
  personBasePath,
}: QueryTableProps) {
  const locale = useLocale();
  const t = useTranslations("query");
  const dayUtcFmt = useDateFmt({ dateStyle: "medium", timeZone: "UTC" });
  const dateTimeFmt = useDateFmt({ dateStyle: "medium", timeStyle: "short" });

  const colLabel = (col: string) =>
    t.has(`cols.${entity}.${col}`)
      ? t(`cols.${entity}.${col}`)
      : t.has(`cols.${col}`)
        ? t(`cols.${col}`)
        : col;

  const cellText = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "·";
    if (typeof v === "number") return num(locale).format(v);
    if (typeof v === "boolean")
      return t(v ? "optionLabels.true" : "optionLabels.false");
    if (typeof v === "string") {
      if (DAY_RE.test(v) || ISO_MIDNIGHT_RE.test(v)) {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? v : dayUtcFmt.format(d);
      }
      if (ISO_RE.test(v)) {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? v : dateTimeFmt.format(d);
      }
      // Enum conocido (estado/método/tipo de orden…) → label i18n; el
      // resto de strings se muestran tal cual (nombres, ids, emails).
      return t.has(`optionLabels.${v}`) ? t(`optionLabels.${v}`) : v;
    }
    return JSON.stringify(v);
  };

  // Celda de la persona-sujeto → Link a su ficha cuando la fila trae
  // personId suplementario (resto de celdas y filas sin id: texto).
  const pCol = personColIndex(headers);
  const personCell = (row: unknown[], colIdx: number, text: string) => {
    const pid =
      colIdx === pCol ? personIdOf(row, headers.length) : null;
    if (!pid || text === "·") return text;
    return (
      <Link href={`${personBasePath}/${pid}`} className={personLinkCls}>
        {text}
      </Link>
    );
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
                {personCell(row, 0, cellText(row[0]))}
              </p>
              {headers.slice(1).map((h, j) => {
                const v = cellText(row[j + 1]);
                if (v === "·") return null;
                return (
                  <p key={h} className="truncate text-xs text-ink/60">
                    <span className="text-ink/40">{colLabel(h)}:</span>{" "}
                    {personCell(row, j + 1, v)}
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
                    {personCell(row, j, cellText(row[j]))}
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

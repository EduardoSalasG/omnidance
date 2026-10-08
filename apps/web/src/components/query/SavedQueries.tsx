"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  SYSTEM_QUERIES,
  type QueryRole,
  type SavedReportParams,
} from "@omnidance/shared";
import { Card, CheckIcon, XIcon } from "@/components/ui";
import { inputCls } from "@/components/academy/shared";

// Consultas guardadas + plantillas de sistema (spec analytics/query-console):
// las del sistema viven en shared (SYSTEM_QUERIES por lente, sin scope fijo -
// el usuario elige al aplicar) y no se persisten ni borran; las propias
// vienen de GET /query/saved y se pueden renombrar/borrar. Seleccionar
// cualquiera emite sus params para precargar la barra de filtros.

export type SavedQuery = {
  id: string;
  name: string;
  params: SavedReportParams;
  createdAt: string;
};

export type SavedQueriesProps = {
  role: QueryRole;
  /** Consultas propias del usuario en este lente. */
  saved: SavedQuery[];
  /** id en mutación (rename/delete en vuelo) - deshabilita su fila. */
  busyId?: string | null;
  onSelect: (params: SavedReportParams) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

const dateFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

export function SavedQueries({
  role,
  saved,
  busyId = null,
  onSelect,
  onRename,
  onDelete,
}: SavedQueriesProps) {
  const t = useTranslations("query");
  const tc = useTranslations("common");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const system = SYSTEM_QUERIES[role] ?? [];

  function startRename(q: SavedQuery) {
    setEditingId(q.id);
    setDraft(q.name);
  }

  function commitRename(id: string) {
    const name = draft.trim();
    setEditingId(null);
    if (name) onRename(id, name);
  }

  const iconBtn =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink/50 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:pointer-events-none disabled:opacity-50";

  return (
    <Card className="flex flex-col gap-4">
      <section aria-label={t("saved.system")} className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("saved.system")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {system.map((s) => (
            <li key={s.nameKey}>
              <button
                type="button"
                onClick={() =>
                  onSelect({ entity: s.entity, filters: { ...s.filters } })
                }
                className="inline-flex min-h-11 items-center rounded-full bg-ink/10 px-4 text-sm font-semibold text-ink/70 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                {t.has(`system.${s.nameKey}`)
                  ? t(`system.${s.nameKey}`)
                  : s.nameKey}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={t("saved.mine")} className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("saved.mine")}
        </h2>
        {saved.length === 0 ? (
          <p className="text-sm text-ink/50">{t("saved.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {saved.map((q) => (
              <li
                key={q.id}
                className="flex items-center gap-2 py-2 first:pt-0"
              >
                {editingId === q.id ? (
                  <>
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(q.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      aria-label={t("saved.rename")}
                      className={`${inputCls} flex-1`}
                    />
                    <button
                      type="button"
                      aria-label={tc("save")}
                      disabled={busyId === q.id}
                      onClick={() => commitRename(q.id)}
                      className={iconBtn}
                    >
                      <CheckIcon />
                    </button>
                    <button
                      type="button"
                      aria-label={tc("cancel")}
                      onClick={() => setEditingId(null)}
                      className={iconBtn}
                    >
                      <XIcon />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => onSelect(q.params)}
                      className="min-w-0 flex-1 rounded-lg py-1 text-left disabled:opacity-50"
                    >
                      <span className="block truncate text-sm font-medium">
                        {q.name}
                      </span>
                      <span className="block text-xs text-ink/40">
                        {dateFmt.format(new Date(q.createdAt))}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => startRename(q)}
                      className={`${iconBtn} px-3 text-xs font-semibold`}
                    >
                      {t("saved.rename")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => onDelete(q.id)}
                      className={`${iconBtn} px-3 text-xs font-semibold hover:text-red-400`}
                    >
                      {t("saved.delete")}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}

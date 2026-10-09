"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, SkeletonList, Spinner } from "@/components/ui";
import { inputCls, readError } from "./shared";

type InstructorRow = {
  person: { id: string; name: string | null; email: string | null };
  commissionPct: number | null;
  createdAt: string;
};

/**
 * Mantenedor de profesores (spec academy-team-instructors) - lista de
 * AcademyInstructor con comisión editable inline (PATCH existente del
 * spec instructor-commission) y baja. El alta por email vive en
 * /academia/equipo/nuevo (selector de tipo). Gated por capacidad
 * `team` en el backend, igual que el listado de colaboradores.
 */
export function InstructorSection({ academyId }: { academyId: string }) {
  const t = useTranslations("academyStaff");

  const [rows, setRows] = useState<InstructorRow[] | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await apiFetch(`/academies/${academyId}/instructors`).catch(
      () => null,
    );
    const list = res?.ok ? ((await res.json()) as InstructorRow[]) : [];
    setRows(list);
    setDraft(
      Object.fromEntries(
        list.map((r) => [r.person.id, String(r.commissionPct ?? "")]),
      ),
    );
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCommission(personId: string) {
    const raw = (draft[personId] ?? "").trim();
    const pct = raw === "" ? null : Number(raw);
    if (pct !== null && (!Number.isInteger(pct) || pct < 0 || pct > 100)) {
      setErr(t("error"));
      return;
    }
    setRowBusy(personId);
    setMsg(null);
    setErr(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/instructors/${personId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ commissionPct: pct ?? 0 }),
        },
      );
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      setMsg(t("commissionSaved"));
      await load();
    } finally {
      setRowBusy(null);
    }
  }

  async function remove(row: InstructorRow) {
    const label = row.person.name ?? row.person.email ?? row.person.id;
    if (!window.confirm(t("removeInstructorConfirm", { name: label }))) {
      return;
    }
    setRowBusy(row.person.id);
    setMsg(null);
    setErr(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/instructors/${row.person.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      setMsg(t("removed"));
      await load();
    } finally {
      setRowBusy(null);
    }
  }

  if (rows === null) return <SkeletonList />;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("instructorsTitle")}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t("instructorsDesc")}</p>
      </div>
      {msg && (
        <p role="status" className="text-sm text-neon">
          {msg}
        </p>
      )}
      {err && (
        <p role="alert" className="text-sm text-red-400">
          {err}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-ink/60">{t("instructorsEmpty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line -mx-4 sm:mx-0">
          {rows.map((r) => (
            <li
              key={r.person.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {r.person.name ?? r.person.email}
                </span>
                {r.person.email && (
                  <span className="block truncate text-xs text-ink/50">
                    {r.person.email}
                  </span>
                )}
              </span>
              <label className="flex items-center gap-2 text-xs text-ink/60">
                {t("fieldCommission")}
                <input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  className={`${inputCls} w-20`}
                  value={draft[r.person.id] ?? ""}
                  disabled={rowBusy === r.person.id}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      [r.person.id]: e.target.value,
                    }))
                  }
                  onBlur={() => void saveCommission(r.person.id)}
                />
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove(r)}
                disabled={rowBusy === r.person.id}
              >
                {rowBusy === r.person.id ? <Spinner size="sm" /> : null}
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

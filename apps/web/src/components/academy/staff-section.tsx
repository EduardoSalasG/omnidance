"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, SkeletonList, Spinner } from "@/components/ui";
import { readError } from "./shared";
import type { AcademyCap } from "./use-academy-access";

export type Caps = Record<AcademyCap, boolean>;

type StaffRow = {
  person: { id: string; name: string | null; email: string | null };
  caps: Caps;
  createdAt: string;
};

export const CAPS: AcademyCap[] = [
  "students",
  "payments",
  "plans",
  "schedule",
  "profile",
  "team",
  "billing",
];

export const EMPTY_CAPS: Caps = {
  students: false,
  payments: false,
  plans: false,
  schedule: false,
  profile: false,
  team: false,
  billing: false,
};

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function CapCheckbox({
  cap,
  checked,
  disabled,
  onToggle,
}: {
  cap: AcademyCap;
  checked: boolean;
  disabled?: boolean;
  onToggle: (cap: AcademyCap, next: boolean) => void;
}) {
  const t = useTranslations("academyStaff");
  return (
    <label
      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
      title={t(`cap.${cap}Desc`)}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(cap, e.target.checked)}
        className="size-4 accent-neon"
      />
      {t(`cap.${cap}`)}
    </label>
  );
}

/**
 * Mantenedor de colaboradores (spec academy-staff-roles) - lista staff
 * con flags granulares, PATCH por flag y baja (acciones por fila). El
 * alta por email vive en /academia/equipo/nuevo. Gated por capacidad
 * `team` en el backend.
 */
export function StaffSection({ academyId }: { academyId: string }) {
  const t = useTranslations("academyStaff");

  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`/academies/${academyId}/staff`).catch(
      () => null,
    );
    setRows(res?.ok ? await res.json() : []);
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(personId: string, cap: AcademyCap, next: boolean) {
    setRowBusy(personId);
    setMsg(null);
    setErr(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/staff/${personId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [cap]: next }),
        },
      );
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      setRows(
        (prev) =>
          prev?.map((r) =>
            r.person.id === personId
              ? { ...r, caps: { ...r.caps, [cap]: next } }
              : r,
          ) ?? prev,
      );
      setMsg(t("capsSaved"));
    } finally {
      setRowBusy(null);
    }
  }

  async function remove(row: StaffRow) {
    const label = row.person.name ?? row.person.email ?? row.person.id;
    if (!window.confirm(t("removeConfirm", { name: label }))) return;
    setRowBusy(row.person.id);
    setMsg(null);
    setErr(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/staff/${row.person.id}`,
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
          {t("listTitle")}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t("desc")}</p>
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
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink/60">{t("empty")}</p>
          <Button href="/academia/equipo/nuevo" size="sm">
            + {t("addTitle")}
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <li
              key={r.person.id}
              className="flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">
                  {r.person.name ?? r.person.email}
                </span>
                {r.person.email && (
                  <span className="text-ink/60">{r.person.email}</span>
                )}
                <span className="ml-auto text-xs text-ink/40">
                  {t("since", {
                    date: dayFmt.format(new Date(r.createdAt)),
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(r)}
                  disabled={rowBusy === r.person.id}
                >
                  {rowBusy === r.person.id ? (
                    <Spinner size="sm" />
                  ) : null}
                  {t("remove")}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
                {CAPS.map((cap) => (
                  <CapCheckbox
                    key={cap}
                    cap={cap}
                    checked={r.caps[cap]}
                    disabled={rowBusy === r.person.id}
                    onToggle={(c, next) => void toggle(r.person.id, c, next)}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

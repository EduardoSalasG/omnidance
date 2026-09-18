"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import {
  STAFF_ROLES,
  inputCls,
  readError,
  type StaffEntry,
  type StaffRole,
} from "./shared";

type Props = { eventId: string };

/**
 * Staff del evento (POST /events/:id/staff upsert por personId).
 * v1: personId se ingresa a mano — no hay endpoint de búsqueda de personas.
 */
export function StaffSection({ eventId }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [staff, setStaff] = useState<StaffEntry[] | null>(null);
  const [error, setError] = useState(false);

  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<StaffRole>("DOOR");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/events/${eventId}/staff`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setStaff((await res.json()) as StaffEntry[]);
    } catch {
      setError(true);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!personId.trim() || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/events/${eventId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: personId.trim(), role }),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setPersonId("");
      await load();
    } catch {
      setFormError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("sections.staff")}
      </h2>

      {staff === null && !error && (
        <p role="status" className="text-sm text-white/60">
          {tc("loading")}
        </p>
      )}
      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}
      {staff !== null && staff.length === 0 && (
        <p role="status" className="text-sm text-white/50">
          {t("staffSection.empty")}
        </p>
      )}
      {staff !== null && staff.length > 0 && (
        <ul className="flex flex-col gap-2">
          {staff.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {s.person.name ?? s.person.email ?? s.person.id}
                  </p>
                  {s.person.email && s.person.name && (
                    <p className="truncate text-xs text-white/50">
                      {s.person.email}
                    </p>
                  )}
                </div>
                <Badge variant="outline">
                  {t.has(`staffSection.roles.${s.role}`)
                    ? t(`staffSection.roles.${s.role}`)
                    : s.role}
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={submit}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50">
            {t("staffSection.personId")}
            <span aria-hidden="true" className="text-neon"> *</span>
          </span>
          <input
            type="text"
            required
            autoComplete="off"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className={`${inputCls} min-h-11 py-2 text-sm`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50">
            {t("staffSection.role")}
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className={`${inputCls} min-h-11 py-2 text-sm`}
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`staffSection.roles.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={!personId.trim() || busy}>
          {busy ? tc("loading") : t("staffSection.add")}
        </Button>
        {formError && (
          <p role="alert" className="text-sm text-red-400 sm:col-span-3">
            {formError}
          </p>
        )}
      </form>
    </section>
  );
}

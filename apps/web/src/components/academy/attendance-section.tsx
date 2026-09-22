"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, EventDate } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import {
  inputCls,
  readError,
  type AttendanceItem,
  type ClassSlot,
} from "./shared";

type Props = {
  academyId: string;
  slots: ClassSlot[];
  onChanged: () => Promise<void>;
};

/**
 * Asistencia. POST /academies/:id/attendance recibe {slotId, personId, date?}
 * — el DTO no tiene `present`: registrar la fila = presente. Si se omite
 * `date` el server usa hoy (UTC). 409 = duplicado slot+persona+fecha.
 * GET lista los últimos 30 días por defecto.
 */
export function AttendanceSection({ academyId, slots, onChanged }: Props) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const tp = useTranslations("practices");

  const [items, setItems] = useState<AttendanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [personId, setPersonId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const slotById = useMemo(
    () => new Map(slots.map((s) => [s.id, s])),
    [slots],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiFetch(`/academies/${academyId}/attendance`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setItems((await res.json()) as AttendanceItem[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function slotText(s: ClassSlot | undefined): string {
    if (!s) return "—";
    return `${s.series.name} · ${t(`weekday.${s.weekday}`)} ${s.startTime}–${s.endTime}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId,
          personId: personId.trim(),
          ...(date ? { date } : {}),
        }),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setPersonId("");
      await Promise.all([load(), onChanged()]);
    } catch {
      setFormError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Registro rápido — operación diaria primero, historial después */}
      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("markPresent")}
        </h3>
        <form
          onSubmit={submit}
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">
              {t("personId")}
              <span aria-hidden="true" className="text-neon"> *</span>
            </span>
            <input
              className={inputCls}
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">
              {t("slots")}
              <span aria-hidden="true" className="text-neon"> *</span>
            </span>
            <select
              className={inputCls}
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
              required
            >
              <option value="" disabled>
                —
              </option>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {slotText(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{tp("startsAt")}</span>
            <input
              className={inputCls}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {formError && (
            <p role="alert" className="text-sm text-red-400 sm:col-span-2">
              {formError}
            </p>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy || slots.length === 0}>
              {busy ? tc("loading") : t("markPresent")}
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <Spinner size="sm" className="page-loading" />
      ) : error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-white/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p role="status" className="text-sm text-white/50">
          —
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {a.person.name ?? a.personId}
                </span>
                <span className="text-sm text-white/60">
                  {slotText(slotById.get(a.class.classSlotId))}
                </span>
                <EventDate
                  start={a.checkedAt}
                  className="text-xs text-white/50"
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

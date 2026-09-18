"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { inputCls, readError, type ClassSlot } from "./shared";

type Props = {
  academyId: string;
  slots: ClassSlot[];
  onChanged: () => Promise<void>;
};

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Horarios (ClassSlot). POST /academies/:id/slots exige weekday (0-6) +
 * startTime/endTime (string "HH:MM") + capacity (int, requerido por el DTO).
 */
export function SlotsSection({ academyId, slots, onChanged }: Props) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const te = useTranslations("events");
  const tp = useTranslations("practices");
  const tprod = useTranslations("producer");

  const [weekday, setWeekday] = useState("1");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("20:00");
  const [capacity, setCapacity] = useState("20");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekday: Number.parseInt(weekday, 10),
          startTime,
          endTime,
          capacity: Number.parseInt(capacity, 10) || 0,
        }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        return;
      }
      await onChanged();
    } catch {
      setError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {slots.length === 0 ? (
        <p className="text-sm text-white/50">—</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {slots.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <Badge variant="neon">{t(`weekday.${s.weekday}`)}</Badge>
                <span className="font-medium tabular-nums">
                  {s.startTime} – {s.endTime}
                </span>
                <span className="ml-auto text-xs text-white/50">
                  {te("capacity", { count: s.capacity })}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("slots")}
        </h3>
        <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className="text-xs text-white/50">{t("slots")}</span>
              <select
                className={inputCls}
                value={weekday}
                onChange={(e) => setWeekday(e.target.value)}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {t(`weekday.${d}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">
                {tp("startsAt")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                className={inputCls}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">
                {tprod("expiresAt")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                className={inputCls}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className="text-xs text-white/50">
                {te("capacity", { count: Number.parseInt(capacity, 10) || 0 })}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                className={inputCls}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? tc("loading") : tc("create")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

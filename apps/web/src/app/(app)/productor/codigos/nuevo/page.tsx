"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import {
  CODE_TYPES,
  inputCls,
  readError,
  type EventOption,
} from "@/components/producer/shared";

/**
 * /productor/codigos/nuevo - alta de código de descuento (POST
 * /discount-codes). Al crear vuelve al listado tras un aviso breve.
 */
function NewDiscountCode() {
  const t = useTranslations("producer");
  const te = useTranslations("events");
  const tc = useTranslations("common");
  const router = useRouter();

  // null = GET /events en vuelo → select de evento disabled; habilitado
  // desde el mount dejaría elegir contra un catálogo vacío.
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [eventsError, setEventsError] = useState(false);
  const [eventsNonce, setEventsNonce] = useState(0);

  const [form, setForm] = useState({
    code: "",
    type: CODE_TYPES[0] as string,
    percentOff: "",
    amountOff: "",
    maxUses: "",
    expiresAt: "",
    eventId: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const loadEvents = useCallback(async () => {
    setEventsError(false);
    try {
      const res = await apiFetch("/events");
      if (!res.ok) {
        setEventsError(true);
        return;
      }
      setEvents((await res.json()) as EventOption[]);
    } catch {
      setEventsError(true);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents, eventsNonce]);

  // percentOff XOR amountOff: se deshabilita el input contrario cuando hay valor.
  const percent = form.percentOff === "" ? null : Number(form.percentOff);
  const amount = form.amountOff === "" ? null : Number(form.amountOff);
  const discountValid =
    (percent !== null && percent >= 1 && percent <= 100) !==
    (amount !== null && amount >= 1);
  const codeValid = form.code.trim() !== "" && discountValid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!codeValid || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch("/discount-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          type: form.type,
          ...(percent !== null ? { percentOff: percent } : {}),
          ...(amount !== null ? { amountOff: amount } : {}),
          ...(form.maxUses !== "" ? { maxUses: Number(form.maxUses) } : {}),
          ...(form.expiresAt !== ""
            ? { expiresAt: new Date(form.expiresAt).toISOString() }
            : {}),
          ...(form.eventId !== "" ? { eventId: form.eventId } : {}),
        }),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setCreated(true);
      setTimeout(() => router.push("/productor/codigos"), 1200);
    } catch {
      setFormError(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ConsoleHeader
        backHref="/productor/codigos"
        backLabel={t("discountCodes")}
      />

      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold leading-tight">{t("newCode")}</h1>

        {created && (
          <Card className="p-6 text-center">
            <p role="status" className="text-lg font-bold text-neon">
              {t("codeCreated")}
            </p>
          </Card>
        )}

        {!created && eventsError && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEventsNonce((n) => n + 1)}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        )}

        {!created && !eventsError && (
          <Card>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-white/70">
                  {t("code")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                  className={`${inputCls} uppercase`}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-white/70">{t("type")}</span>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  className={inputCls}
                >
                  {CODE_TYPES.map((ct) => (
                    <option key={ct} value={ct}>
                      {t.has(`types.${ct}`) ? t(`types.${ct}`) : ct}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-white/70">
                    {t("percentOff")}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    disabled={form.amountOff !== ""}
                    value={form.percentOff}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        percentOff: e.target.value,
                      }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-white/70">
                    {t("amountOff")}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    disabled={form.percentOff !== ""}
                    value={form.amountOff}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        amountOff: e.target.value,
                      }))
                    }
                    className={inputCls}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-white/70">
                    {t("maxUses")}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={form.maxUses}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxUses: e.target.value,
                      }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-white/70">
                    {t("expiresAt")}
                  </span>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        expiresAt: e.target.value,
                      }))
                    }
                    className={inputCls}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-white/70">{te("title")}</span>
                <select
                  value={form.eventId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, eventId: e.target.value }))
                  }
                  disabled={events === null}
                  aria-busy={events === null}
                  className={inputCls}
                >
                  <option value="">·</option>
                  {(events ?? []).map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </label>

              {formError && (
                <p role="alert" className="text-sm text-red-400">
                  {formError}
                </p>
              )}

              <Button type="submit" disabled={!codeValid || saving}>
                {saving ? `${tc("loading")}` : tc("create")}
              </Button>
            </form>
          </Card>
        )}
      </section>
    </>
  );
}

export default function NewDiscountCodePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <ProducerGate>
        <NewDiscountCode />
      </ProducerGate>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";

// Enum cerrado del dominio (DISCOUNT_CODE_TYPES en apps/api) — no libre.
const CODE_TYPES = [
  "CUMPLEANOS",
  "CORTESIA",
  "CASO_BORDE_PUERTA",
  "CAMPAIGN",
  "WINBACK",
  "STAFF_COMP",
] as const;

type EventOption = {
  id: string;
  name: string;
  startsAt: string;
  series: { name: string } | null;
};

type DiscountCode = {
  id: string;
  code: string;
  type: string;
  eventId: string | null;
  seriesId: string | null;
  percentOff: number | null;
  amountOff: number | null;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string;
};

const fmtDay = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

const inputCls =
  "min-h-12 w-full rounded-xl border border-night-700 bg-night-950 px-4 py-3 " +
  "text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50 disabled:opacity-50";

/**
 * /productor/codigos — códigos de descuento del productor
 * (GET/POST /discount-codes). Monta solo cuando ProducerGate confirma rol.
 */
function DiscountCodes() {
  const t = useTranslations("producer");
  const te = useTranslations("events");
  const tc = useTranslations("common");

  const [events, setEvents] = useState<EventOption[]>([]);

  const [codes, setCodes] = useState<DiscountCode[] | null>(null);
  const [codesError, setCodesError] = useState(false);
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [codeForm, setCodeForm] = useState({
    code: "",
    type: CODE_TYPES[0] as string,
    percentOff: "",
    amountOff: "",
    maxUses: "",
    expiresAt: "",
    eventId: "",
  });
  const [codeSaving, setCodeSaving] = useState(false);
  const [codeFormError, setCodeFormError] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    setCodesError(false);
    try {
      const res = await apiFetch("/discount-codes");
      if (!res.ok) {
        setCodesError(true);
        return;
      }
      setCodes((await res.json()) as DiscountCode[]);
    } catch {
      setCodesError(true);
    }
  }, []);

  const boot = useCallback(async () => {
    // Eventos para el select del form + listado de códigos en paralelo.
    const [evRes] = await Promise.all([apiFetch("/events"), loadCodes()]);
    if (evRes.ok) {
      setEvents((await evRes.json()) as EventOption[]);
    }
  }, [loadCodes]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // percentOff XOR amountOff: se deshabilita el input contrario cuando hay valor.
  const percent = codeForm.percentOff === "" ? null : Number(codeForm.percentOff);
  const amount = codeForm.amountOff === "" ? null : Number(codeForm.amountOff);
  const discountValid =
    (percent !== null && percent >= 1 && percent <= 100) !==
    (amount !== null && amount >= 1);
  const codeValid = codeForm.code.trim() !== "" && discountValid;

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!codeValid || codeSaving) return;
    setCodeSaving(true);
    setCodeFormError(false);
    try {
      const res = await apiFetch("/discount-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeForm.code.trim(),
          type: codeForm.type,
          ...(percent !== null ? { percentOff: percent } : {}),
          ...(amount !== null ? { amountOff: amount } : {}),
          ...(codeForm.maxUses !== ""
            ? { maxUses: Number(codeForm.maxUses) }
            : {}),
          ...(codeForm.expiresAt !== ""
            ? { expiresAt: new Date(codeForm.expiresAt).toISOString() }
            : {}),
          ...(codeForm.eventId !== "" ? { eventId: codeForm.eventId } : {}),
        }),
      });
      if (!res.ok) {
        setCodeFormError(true);
        return;
      }
      const created = (await res.json()) as { id: string };
      setJustCreatedId(created.id);
      setCodeForm({
        code: "",
        type: CODE_TYPES[0],
        percentOff: "",
        amountOff: "",
        maxUses: "",
        expiresAt: "",
        eventId: "",
      });
      setShowCodeForm(false);
      await loadCodes();
    } catch {
      setCodeFormError(true);
    } finally {
      setCodeSaving(false);
    }
  }

  const eventName = (id: string | null) =>
    id ? (events.find((e) => e.id === id)?.name ?? null) : null;

  return (
    <>
      <ConsoleHeader
        backHref="/productor"
        backLabel={t("title")}
        actions={
          <Button
            size="sm"
            variant={showCodeForm ? "ghost" : "secondary"}
            onClick={() => setShowCodeForm((v) => !v)}
          >
            {showCodeForm ? tc("cancel") : `＋ ${t("newCode")}`}
          </Button>
        }
      />

      <section className="flex flex-col gap-4">
        {showCodeForm && (
          <Card>
            <form onSubmit={submitCode} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-white/70">
                  {t("code")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={codeForm.code}
                  onChange={(e) =>
                    setCodeForm((f) => ({ ...f, code: e.target.value }))
                  }
                  className={`${inputCls} uppercase`}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-white/70">{t("type")}</span>
                <select
                  value={codeForm.type}
                  onChange={(e) =>
                    setCodeForm((f) => ({ ...f, type: e.target.value }))
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
                    disabled={codeForm.amountOff !== ""}
                    value={codeForm.percentOff}
                    onChange={(e) =>
                      setCodeForm((f) => ({
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
                    disabled={codeForm.percentOff !== ""}
                    value={codeForm.amountOff}
                    onChange={(e) =>
                      setCodeForm((f) => ({
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
                    value={codeForm.maxUses}
                    onChange={(e) =>
                      setCodeForm((f) => ({
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
                    value={codeForm.expiresAt}
                    onChange={(e) =>
                      setCodeForm((f) => ({
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
                  value={codeForm.eventId}
                  onChange={(e) =>
                    setCodeForm((f) => ({ ...f, eventId: e.target.value }))
                  }
                  className={inputCls}
                >
                  <option value="">—</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </label>

              {codeFormError && (
                <p role="alert" className="text-sm text-red-400">
                  {tc("error")}
                </p>
              )}

              <Button type="submit" disabled={!codeValid || codeSaving}>
                {codeSaving ? `${tc("loading")}` : tc("create")}
              </Button>
            </form>
          </Card>
        )}

        {codes === null && !codesError && <Spinner size="sm" className="page-loading" />}
        {codesError && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-400">{tc("error")}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadCodes()}
            >
              ↻ {tc("retry")}
            </Button>
          </div>
        )}
        {codes !== null && codes.length === 0 && (
          <p className="text-white/60">{t("empty")}</p>
        )}
        {codes !== null && codes.length > 0 && (
          <ul className="flex flex-col gap-3">
            {codes.map((c) => (
              <li key={c.id}>
                <Card
                  className={`flex flex-col gap-2 ${
                    c.id === justCreatedId ? "border-neon" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-lg font-bold tracking-wide">
                      {c.code}
                    </span>
                    <Badge variant="neon">
                      {t.has(`types.${c.type}`)
                        ? t(`types.${c.type}`)
                        : c.type}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
                    <span>
                      {c.percentOff !== null ? (
                        <span className="font-semibold text-neon">
                          −{c.percentOff}%
                        </span>
                      ) : (
                        <PriceTag amount={c.amountOff} />
                      )}
                    </span>
                    <span>
                      {t("usedCount")}: {c.usedCount}
                      {c.maxUses !== null ? `/${c.maxUses}` : ""}
                    </span>
                    {c.expiresAt && (
                      <span>
                        {t("expiresAt")}:{" "}
                        {fmtDay.format(new Date(c.expiresAt))}
                      </span>
                    )}
                    {eventName(c.eventId) && (
                      <span className="text-white/50">
                        {eventName(c.eventId)}
                      </span>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function ProducerCodesPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <ProducerGate>
        <DiscountCodes />
      </ProducerGate>
    </main>
  );
}

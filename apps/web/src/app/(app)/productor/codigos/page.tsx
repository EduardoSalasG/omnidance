"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import type { EventOption } from "@/components/producer/shared";

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

/**
 * /productor/codigos - códigos de descuento del productor
 * (GET /discount-codes). La creación vive en /productor/codigos/nuevo.
 * Monta solo cuando ProducerGate confirma rol.
 */
function DiscountCodes() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  // null = GET /events en vuelo - solo se usa para resolver el nombre del
  // evento ligado a cada código.
  const [events, setEvents] = useState<EventOption[] | null>(null);

  const [codes, setCodes] = useState<DiscountCode[] | null>(null);
  const [codesError, setCodesError] = useState(false);

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
    // Eventos para el label del código + listado en paralelo. Fallo de
    // /events → [] resuelto: la columna "evento" simplemente no aparece.
    const [evRes] = await Promise.all([
      apiFetch("/events").catch(() => null),
      loadCodes(),
    ]);
    if (evRes?.ok) {
      setEvents((await evRes.json()) as EventOption[]);
    } else {
      setEvents([]);
    }
  }, [loadCodes]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const eventName = (id: string | null) =>
    id ? ((events ?? []).find((e) => e.id === id)?.name ?? null) : null;

  return (
    <>
      <ConsoleHeader
        backHref="/productor"
        backLabel={t("title")}
        actions={
          <Button size="sm" variant="secondary" href="/productor/codigos/nuevo">
            {`＋ ${t("newCode")}`}
          </Button>
        }
      />

      <section className="flex flex-col gap-4">
        {codes === null && !codesError && <SkeletonList />}
        {codesError && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-400">{tc("error")}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadCodes()}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        )}
        {codes !== null && codes.length === 0 && (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <p role="status" className="text-white/70">
              {t("empty")}
            </p>
            <Button href="/productor/codigos/nuevo">
              {`＋ ${t("newCode")}`}
            </Button>
          </Card>
        )}
        {codes !== null && codes.length > 0 && (
          <ul className="flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {codes.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-col gap-2">
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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-5xl lg:px-8">
      <ProducerGate>
        <DiscountCodes />
      </ProducerGate>
    </main>
  );
}

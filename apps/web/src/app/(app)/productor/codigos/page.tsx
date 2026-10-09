"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  Pager,
  PriceTag,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { FilterBar } from "@/components/query/FilterBar";
import {
  CODE_STATUSES,
  filtersParams,
  type EventOption,
} from "@/components/producer/shared";
import type { EntityDef, QueryFilters } from "@omnidance/shared";

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
 * Filtros de /productor/codigos - contrato compartido (spec
 * analytics/query-console): q sobre el código, status derivado de
 * expiresAt (ACTIVE|EXPIRED), from/to sobre createdAt.
 * GET /discount-codes los acepta.
 */
const CODES_ENTITY: EntityDef = {
  entity: "discountCodes",
  filters: [
    { key: "q", type: "text" },
    { key: "status", type: "enum", options: CODE_STATUSES },
    { key: "from", type: "date" },
    { key: "to", type: "date" },
  ],
  columns: [],
};

function DiscountCodes() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");
  const tq = useTranslations("query");

  // null = GET /events en vuelo - solo se usa para resolver el nombre del
  // evento ligado a cada código.
  const [events, setEvents] = useState<EventOption[] | null>(null);

  const [codes, setCodes] = useState<DiscountCode[] | null>(null);
  const [codesTotal, setCodesTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [codesError, setCodesError] = useState(false);
  const [filters, setFilters] = useState<QueryFilters>({});

  const loadCodes = useCallback(async (f: QueryFilters, pageNo: number) => {
    setCodesError(false);
    try {
      const qs = filtersParams(f);
      const res = await apiFetch(
        `/discount-codes${qs}${qs ? "&" : "?"}page=${pageNo}&pageSize=25`,
      );
      if (!res.ok) {
        setCodesError(true);
        return;
      }
      const data = (await res.json()) as {
        items: DiscountCode[];
        total: number;
      };
      setCodes(data.items);
      setCodesTotal(data.total);
    } catch {
      setCodesError(true);
    }
  }, []);

  const boot = useCallback(async () => {
    // Eventos para el label del código + listado en paralelo. Fallo de
    // /events → [] resuelto: la columna "evento" simplemente no aparece.
    const evRes = await apiFetch("/events").catch(() => null);
    if (evRes?.ok) {
      setEvents((await evRes.json()) as EventOption[]);
    } else {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // El FilterBar es controlled: cada cambio recarga la lista (q va
  // debounced desde la barra) y vuelve a pág. 1.
  useEffect(() => {
    setPage(1);
    void loadCodes(filters, 1);
  }, [loadCodes, filters]);

  useEffect(() => {
    if (page !== 1) void loadCodes(filters, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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
        <FilterBar
          entity={CODES_ENTITY}
          filters={filters}
          onChange={setFilters}
          options={{}}
        />
        {codes === null && !codesError && <SkeletonList />}
        {codesError && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-400">{tc("error")}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadCodes(filters, page)}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        )}
        {codes !== null &&
          codes.length === 0 &&
          (Object.keys(filters).length > 0 ? (
            <Card className="py-10 text-center">
              <p role="status" className="text-ink/70">
                {tq("empty")}
              </p>
            </Card>
          ) : (
            <Card className="flex flex-col items-center gap-4 py-10 text-center">
              <p role="status" className="text-ink/70">
                {t("empty")}
              </p>
              <Button href="/productor/codigos/nuevo">
                {`＋ ${t("newCode")}`}
              </Button>
            </Card>
          ))}
        {codes !== null && codes.length > 0 && (
          <ul className="flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {codes.map((c) => (
              <li key={c.id}>
                <Link href={`/productor/codigos/${c.id}`} className="block">
                  <Card className="flex flex-col gap-2 transition-colors hover:border-neon/60">
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
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/70">
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
                        <span className="text-ink/50">
                          {eventName(c.eventId)}
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {codes !== null && codes.length > 0 && (
          <Pager
            page={page}
            pageSize={25}
            total={codesTotal}
            onPage={setPage}
          />
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { inputCls } from "@/components/academy/shared";
import { EVENT_STATUS_VARIANT, readError } from "@/components/producer/shared";

/**
 * /venue — consola del VENUE_MANAGER. Boot: GET /venues/mine resuelve los
 * venues del usuario (401 → login, 403/[] → sin venues asignados, lista →
 * selector si hay más de uno). El dashboard (GET /venues/:id/dashboard) se
 * refetchea al cambiar de venue. Sin h1 visible: el chrome muestra "Venue"
 * via pageLabel del tab central.
 *
 * Arriendos: PATCH /venues/:id/rentals/:rentalId con mini-confirmación
 * inline (el contrato no define body de respuesta → se aplica el status
 * pedido al estado local tras res.ok).
 */

// Contrato API (prefijo /api, cookie de sesión).
type VenueMine = {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
  upcomingCount: number;
};

type UpcomingEvent = {
  id: string;
  name: string;
  type: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

type Rental = {
  id: string;
  date: string;
  price: number;
  status: "REQUESTED" | "CONFIRMED" | "CANCELLED" | string;
  academyId: string;
  eventId: string | null;
};

type Menu = { id: string; pdfUrl: string; version: number };

type Dashboard = {
  venue: {
    id: string;
    name: string;
    address: string | null;
    capacity: number | null;
  };
  upcoming: UpcomingEvent[];
  past30d: { events: number; checkins: number };
  rentals: Rental[];
  menus: Menu[];
};

type Phase = "loading" | "unauth" | "forbidden" | "empty" | "error" | "ready";
type DashPhase = "loading" | "error" | "forbidden" | "ready";

const RENTAL_STATUS_VARIANT: Record<string, BadgeVariant> = {
  REQUESTED: "outline",
  CONFIRMED: "neon",
  CANCELLED: "muted",
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CL");
const rentalDayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Skeleton simple: bloques night-800 con pulse (scanability > detalle).
function SkeletonBlocks() {
  return (
    <>
      <div className="flex flex-col gap-2 pt-4" aria-hidden>
        <div className="h-6 w-2/3 animate-pulse rounded-lg bg-night-800" />
        <div className="h-4 w-1/2 animate-pulse rounded-lg bg-night-800" />
      </div>
      <div className="grid grid-cols-3 gap-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-night-700 bg-night-800/60"
          />
        ))}
      </div>
      <div
        aria-hidden
        className="h-36 animate-pulse rounded-2xl border border-night-700 bg-night-900"
      />
      <div
        aria-hidden
        className="h-36 animate-pulse rounded-2xl border border-night-700 bg-night-900"
      />
    </>
  );
}

export default function VenuePage() {
  const t = useTranslations("venue");
  const tc = useTranslations("common");
  const te = useTranslations("events");
  const tp = useTranslations("producer");

  const [phase, setPhase] = useState<Phase>("loading");
  const [venues, setVenues] = useState<VenueMine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [dashPhase, setDashPhase] = useState<DashPhase>("loading");
  const [dash, setDash] = useState<Dashboard | null>(null);

  // Mini-confirmación inline de arriendos + busy/error por fila.
  const [confirming, setConfirming] = useState<{
    id: string;
    status: "CONFIRMED" | "CANCELLED";
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Boot: qué venues administra el usuario.
  const boot = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await apiFetch("/venues/mine");
      if (res.status === 401) {
        setPhase("unauth");
        return;
      }
      if (res.status === 403) {
        setPhase("forbidden");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const list = (await res.json()) as VenueMine[];
      if (list.length === 0) {
        setPhase("empty");
        return;
      }
      setVenues(list);
      setSelectedId((prev) =>
        prev && list.some((v) => v.id === prev) ? prev : list[0].id,
      );
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Dashboard del venue activo — refetch al cambiar el selector. Un 403
  // (venue desvinculado entre requests) muestra el aviso pero deja vivo
  // el selector para elegir otro venue válido.
  const loadDash = useCallback(async (id: string) => {
    setDashPhase("loading");
    setDash(null);
    setConfirming(null);
    setRowErrors({});
    try {
      const res = await apiFetch(`/venues/${id}/dashboard`);
      if (res.status === 401 || res.status === 403) {
        setDashPhase("forbidden");
        return;
      }
      if (!res.ok) {
        setDashPhase("error");
        return;
      }
      setDash((await res.json()) as Dashboard);
      setDashPhase("ready");
    } catch {
      setDashPhase("error");
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDash(selectedId);
  }, [selectedId, loadDash]);

  async function decide(rentalId: string, status: "CONFIRMED" | "CANCELLED") {
    if (!selectedId || busyId) return;
    setBusyId(rentalId);
    setRowErrors((prev) => {
      const copy = { ...prev };
      delete copy[rentalId];
      return copy;
    });
    try {
      const res = await apiFetch(
        `/venues/${selectedId}/rentals/${rentalId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) {
        const msg = (await readError(res)) ?? tc("error");
        setRowErrors((prev) => ({ ...prev, [rentalId]: msg }));
        return;
      }
      setDash((prev) =>
        prev
          ? {
              ...prev,
              rentals: prev.rentals.map((r) =>
                r.id === rentalId ? { ...r, status } : r,
              ),
            }
          : prev,
      );
    } catch {
      setRowErrors((prev) => ({ ...prev, [rentalId]: tc("error") }));
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  }

  const selected = venues.find((v) => v.id === selectedId) ?? venues[0];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      {phase === "loading" && <SkeletonBlocks />}

      {phase === "unauth" && (
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-white/70">{t("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </Card>
      )}

      {phase === "error" && (
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-white/70">{t("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void boot()}>
            ↻ {tc("retry")}
          </Button>
        </Card>
      )}

      {phase === "forbidden" && (
        <Card className="py-6 text-center">
          <p className="text-sm text-white/70">{t("forbidden")}</p>
        </Card>
      )}

      {/* mine=[] no es error: la cuenta simplemente no tiene venues. */}
      {phase === "empty" && (
        <Card className="py-6 text-center">
          <p className="text-sm text-white/70">{t("empty")}</p>
        </Card>
      )}

      {phase === "ready" && selected && (
        <>
          {/* Selector de venue — mismo patrón <select> del AcademyGate;
              con un solo venue se va directo al dashboard. */}
          {venues.length > 1 && (
            <label className="flex flex-col gap-1 pt-4">
              <span className="sr-only">{t("pickVenue")}</span>
              <select
                className={inputCls}
                value={selected.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {dashPhase === "loading" && <SkeletonBlocks />}

          {dashPhase === "error" && (
            <Card className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-white/70">{t("error")}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadDash(selected.id)}
              >
                ↻ {tc("retry")}
              </Button>
            </Card>
          )}

          {dashPhase === "forbidden" && (
            <Card className="py-6 text-center">
              <p className="text-sm text-white/70">{t("forbidden")}</p>
            </Card>
          )}

          {dashPhase === "ready" && dash && (
            <>
              {/* Header del venue — el nombre es dato, no título de
                  sección (el chrome ya muestra "Venue"). */}
              <header className="flex flex-col gap-1 pt-4">
                <p className="text-xl font-bold">{dash.venue.name}</p>
                {dash.venue.address && (
                  <p className="text-sm text-white/50">
                    {dash.venue.address}
                  </p>
                )}
                {dash.venue.capacity != null && (
                  <p className="text-sm text-white/50">
                    {t("capacity", { count: num.format(dash.venue.capacity) })}
                  </p>
                )}
              </header>

              {/* KPIs — tiles neon del HomeHub/analitica. */}
              <ul className="grid grid-cols-3 gap-3">
                {(
                  [
                    [
                      t("kpi.upcoming"),
                      selected.upcomingCount ?? dash.upcoming.length,
                    ],
                    [t("kpi.events30d"), dash.past30d.events],
                    [t("kpi.checkins30d"), dash.past30d.checkins],
                  ] as const
                ).map(([label, value]) => (
                  <li
                    key={label}
                    className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3"
                  >
                    <span className="block text-2xl font-bold tabular-nums text-neon">
                      {num.format(value)}
                    </span>
                    <span className="text-xs text-white/50">{label}</span>
                  </li>
                ))}
              </ul>

              {/* Próximos eventos */}
              <section aria-label={t("sections.upcoming")}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.upcoming")}
                </h2>
                {dash.upcoming.length === 0 ? (
                  <p className="text-sm text-white/50">{t("emptyUpcoming")}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {dash.upcoming.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-2xl border border-night-700 bg-night-900 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {e.name}
                            </p>
                            <p className="mt-0.5 text-xs text-white/50">
                              <EventDate start={e.startsAt} end={e.endsAt} />
                              {" · "}
                              {te.has(`type.${e.type}`)
                                ? te(`type.${e.type}`)
                                : e.type}
                            </p>
                          </div>
                          <Badge
                            variant={
                              EVENT_STATUS_VARIANT[e.status] ?? "muted"
                            }
                          >
                            {tp.has(`status.${e.status}`)
                              ? tp(`status.${e.status}`)
                              : e.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Arriendos — Confirmar/Cancelar solo en REQUESTED, con
                  mini-confirmación inline antes del PATCH. */}
              <section aria-label={t("sections.rentals")}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.rentals")}
                </h2>
                {dash.rentals.length === 0 ? (
                  <p className="text-sm text-white/50">{t("emptyRentals")}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {dash.rentals.map((r) => {
                      const isConfirming = confirming?.id === r.id;
                      return (
                        <li
                          key={r.id}
                          className="rounded-2xl border border-night-700 bg-night-900 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">
                                {rentalDayFmt.format(new Date(r.date))}
                              </p>
                              <p className="mt-0.5 text-xs text-white/50">
                                {clp.format(r.price)}
                              </p>
                            </div>
                            <Badge
                              variant={
                                RENTAL_STATUS_VARIANT[r.status] ?? "muted"
                              }
                            >
                              {t.has(`rentals.statuses.${r.status}`)
                                ? t(`rentals.statuses.${r.status}`)
                                : r.status}
                            </Badge>
                          </div>

                          {r.status === "REQUESTED" && !isConfirming && (
                            <div className="mt-3 flex gap-2 border-t border-night-700 pt-3">
                              <Button
                                type="button"
                                size="sm"
                                disabled={busyId === r.id}
                                onClick={() =>
                                  setConfirming({
                                    id: r.id,
                                    status: "CONFIRMED",
                                  })
                                }
                              >
                                {t("rentals.confirm")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busyId === r.id}
                                onClick={() =>
                                  setConfirming({
                                    id: r.id,
                                    status: "CANCELLED",
                                  })
                                }
                              >
                                {tc("cancel")}
                              </Button>
                            </div>
                          )}

                          {r.status === "REQUESTED" && isConfirming && (
                            <div className="mt-3 flex flex-col gap-2 border-t border-night-700 pt-3">
                              <p className="text-sm text-white/70">
                                {confirming.status === "CONFIRMED"
                                  ? t("rentals.confirmAsk")
                                  : t("rentals.cancelAsk")}
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={busyId === r.id}
                                  onClick={() =>
                                    void decide(r.id, confirming.status)
                                  }
                                >
                                  {busyId === r.id
                                    ? tc("loading")
                                    : confirming.status === "CONFIRMED"
                                      ? t("rentals.yesConfirm")
                                      : t("rentals.yesCancel")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyId === r.id}
                                  onClick={() => setConfirming(null)}
                                >
                                  {tc("back")}
                                </Button>
                              </div>
                            </div>
                          )}

                          {rowErrors[r.id] && (
                            <p role="alert" className="mt-2 text-sm text-red-400">
                              {rowErrors[r.id]}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Cartas/menús — PDFs externos en pestaña nueva. */}
              <section aria-label={t("sections.menus")}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.menus")}
                </h2>
                {dash.menus.length === 0 ? (
                  <p className="text-sm text-white/50">{t("emptyMenus")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {dash.menus.map((m) => (
                      <li key={m.id}>
                        <a
                          href={m.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-night-700 bg-night-900 px-4 py-3 text-sm font-medium transition-colors hover:border-neon/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon"
                        >
                          <span>{t("menus.item", { version: m.version })}</span>
                          <span aria-hidden className="text-white/50">
                            ↗
                          </span>
                          <span className="sr-only">{tc("newTab")}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}

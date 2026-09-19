"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import type {
  PaymentStatus,
  RoleStatus,
  TicketStatus,
} from "@omnidance/shared";

/**
 * /soporte — consola read-only del rol SUPPORT (también ADMIN).
 * Buscador con debounce (mismo patrón que /amigos) contra
 * GET /support/users y detalle inline contra GET /support/users/:id.
 * Sin acciones de escritura ni h1 de sección: el chrome muestra
 * "Soporte" via SUPPORT_TAB del BottomNav.
 */

type RoleEntry = { role: string; status: RoleStatus };

type UserResult = {
  id: string;
  name: string;
  email: string;
  roles: RoleEntry[];
  createdAt: string;
};

type UserDetail = {
  person: { id: string; name: string; email: string; createdAt: string };
  roles: { role: string; status: RoleStatus; createdAt: string }[];
  tickets: {
    id: string;
    status: TicketStatus;
    eventId: string;
    createdAt: string;
  }[];
  payments: {
    id: string;
    status: PaymentStatus;
    amount: number;
    createdAt: string;
  }[];
  checkinsCount: number;
  friendsCount: number;
};

// 401/403 elevan a gate de página (como "forbidden" de /analitica);
// el resto de fallos quedan inline junto al bloque que falló.
type Gate = "ok" | "unauth" | "forbidden";
type DetailPhase = "loading" | "error" | "ready";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CL");
const dateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Chips de estado: Badge no tiene variantes amber/red, así que el chip
// lleva sus propias clases (misma geometría que Badge).
const CHIP_BASE =
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide";
const NEON = "bg-neon/15 text-neon";
const AMBER = "bg-amber-500/15 text-amber-400";
const RED = "bg-red-500/15 text-red-400";
const MUTED = "bg-night-800 text-white/70";
const OUTLINE = "border border-night-700 text-white/70";

const ROLE_STATUS_CHIP: Record<string, string> = {
  APPROVED: NEON,
  PENDING: AMBER,
  SANDBOX: MUTED,
  REJECTED: RED,
};
const TICKET_STATUS_CHIP: Record<string, string> = {
  ACTIVE: NEON,
  USED: MUTED,
  TRANSFERRED: OUTLINE,
  CANCELLED: RED,
};
const PAYMENT_STATUS_CHIP: Record<string, string> = {
  PAID: NEON,
  PENDING: AMBER,
  FAILED: RED,
  REFUNDED: OUTLINE,
};

function Chip({ label, tone }: { label: string; tone?: string }) {
  return (
    <span className={`${CHIP_BASE} ${tone ?? MUTED}`}>{label}</span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}

export default function SoportePage() {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const tp = useTranslations("profile");

  const [gate, setGate] = useState<Gate>("ok");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailPhase, setDetailPhase] = useState<DetailPhase>("loading");

  // Descarta respuestas de búsqueda que llegan fuera de orden.
  const searchSeq = useRef(0);

  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;
  const roleStatusLabel = (s: string) =>
    t.has(`roleStatus.${s}`) ? t(`roleStatus.${s}`) : s;
  const ticketStatusLabel = (s: string) =>
    t.has(`ticketStatus.${s}`) ? t(`ticketStatus.${s}`) : s;
  const paymentStatusLabel = (s: string) =>
    t.has(`paymentStatus.${s}`) ? t(`paymentStatus.${s}`) : s;

  const runSearch = useCallback(async (q: string) => {
    const seq = ++searchSeq.current;
    try {
      const res = await apiFetch(
        `/support/users?q=${encodeURIComponent(q)}`,
      );
      if (res.status === 401 || res.status === 403) {
        if (seq === searchSeq.current) {
          setGate(res.status === 401 ? "unauth" : "forbidden");
        }
        return;
      }
      if (seq !== searchSeq.current) return;
      if (res.ok) {
        setResults((await res.json()) as UserResult[]);
        setSearchErr(false);
      } else {
        setResults([]);
        setSearchErr(true);
      }
    } catch {
      if (seq === searchSeq.current) {
        setResults([]);
        setSearchErr(true);
      }
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  // Debounce: busca en cada cambio tras 300ms; <2 chars limpia y muestra hint.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      searchSeq.current++;
      setResults(null);
      setSearching(false);
      setSearchErr(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => void runSearch(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailPhase("loading");
    try {
      const res = await apiFetch(`/support/users/${id}`);
      if (res.status === 401 || res.status === 403) {
        setGate(res.status === 401 ? "unauth" : "forbidden");
        return;
      }
      if (!res.ok) {
        setDetailPhase("error");
        return;
      }
      setDetail((await res.json()) as UserDetail);
      setDetailPhase("ready");
    } catch {
      setDetailPhase("error");
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
  }, []);

  if (gate === "unauth") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  if (gate === "forbidden") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <Card className="py-6 text-center">
          <p className="text-sm text-white/70">{t("forbidden")}</p>
        </Card>
      </main>
    );
  }

  const trimmed = query.trim();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      {/* Buscador */}
      <section aria-label={t("search")} className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          className="min-h-11 w-full rounded-xl border border-night-700 bg-night-900 px-4 text-white placeholder:text-white/40 focus:border-neon focus:outline-none"
        />
        {trimmed.length > 0 && trimmed.length < MIN_CHARS && (
          <p className="text-sm text-white/50">{t("minChars")}</p>
        )}
        {searching && (
          <p role="status" className="text-sm text-white/50">
            {tc("loading")}
          </p>
        )}
        {searchErr && (
          <p role="alert" className="text-sm text-red-400">
            {t("searchError")}
          </p>
        )}
        {!searching && results !== null && results.length === 0 && (
          <p role="status" className="text-sm text-white/50">
            {t("noResults")}
          </p>
        )}
      </section>

      {/* Detalle del usuario seleccionado — reemplaza la lista de
          resultados; "volver" la recupera sin re-buscar. */}
      {selectedId !== null ? (
        <section className="flex flex-col gap-4">
          <button
            type="button"
            onClick={closeDetail}
            className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
          >
            <span aria-hidden="true">‹</span> {t("backToResults")}
          </button>

          {detailPhase === "loading" && (
            <p role="status" className="text-sm text-white/50">
              {tc("loading")}
            </p>
          )}
          {detailPhase === "error" && (
            <Card className="flex flex-col items-center gap-3 py-6 text-center">
              <p role="alert" className="text-sm text-white/70">
                {tc("error")}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void openDetail(selectedId)}
              >
                {tc("retry")}
              </Button>
            </Card>
          )}

          {detailPhase === "ready" && detail && (
            <>
              {/* Datos personales */}
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.person")}
                </h2>
                <p className="mt-3 truncate font-semibold text-white">
                  {detail.person.name}
                </p>
                <p className="truncate text-sm text-white/60">
                  {detail.person.email}
                </p>
                <p className="mt-1 text-xs text-white/40">
                  {t("memberSince")}:{" "}
                  {dateFmt.format(new Date(detail.person.createdAt))}
                </p>
              </Card>

              {/* Contadores */}
              <section aria-label={t("sections.activity")}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.activity")}
                </h2>
                <ul className="grid grid-cols-2 gap-3">
                  <li className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3">
                    <span className="block text-2xl font-bold tabular-nums text-neon">
                      {num.format(detail.checkinsCount)}
                    </span>
                    <span className="text-xs text-white/50">
                      {t("checkins")}
                    </span>
                  </li>
                  <li className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3">
                    <span className="block text-2xl font-bold tabular-nums text-neon">
                      {num.format(detail.friendsCount)}
                    </span>
                    <span className="text-xs text-white/50">
                      {t("friends")}
                    </span>
                  </li>
                </ul>
              </section>

              {/* Roles con fecha */}
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.roles")}
                </h2>
                {detail.roles.length === 0 ? (
                  <p className="mt-3 text-sm text-white/40">
                    {t("noRoles")}
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col divide-y divide-night-700">
                    {detail.roles.map((r) => (
                      <li
                        key={r.role}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Chip
                            label={roleLabel(r.role)}
                            tone={ROLE_STATUS_CHIP[r.status]}
                          />
                          <span className="text-xs text-white/50">
                            {roleStatusLabel(r.status)}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-white/40">
                          {t("roleSince", {
                            date: dateFmt.format(new Date(r.createdAt)),
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Últimos tickets — linkean al evento (solo lectura). */}
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.tickets")}
                </h2>
                {detail.tickets.length === 0 ? (
                  <p className="mt-3 text-sm text-white/40">
                    {t("noTickets")}
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col divide-y divide-night-700">
                    {detail.tickets.map((tk) => (
                      <li key={tk.id} className="py-2.5">
                        <Link
                          href={`/eventos/${tk.eventId}`}
                          className="flex min-h-11 items-center justify-between gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                        >
                          <Chip
                            label={ticketStatusLabel(tk.status)}
                            tone={TICKET_STATUS_CHIP[tk.status]}
                          />
                          <span className="text-xs text-white/50">
                            {dateFmt.format(new Date(tk.createdAt))}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Últimos pagos */}
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.payments")}
                </h2>
                {detail.payments.length === 0 ? (
                  <p className="mt-3 text-sm text-white/40">
                    {t("noPayments")}
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col divide-y divide-night-700">
                    {detail.payments.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <span className="text-sm font-semibold tabular-nums">
                          {clp.format(p.amount)}
                        </span>
                        <div className="flex items-center gap-2">
                          <Chip
                            label={paymentStatusLabel(p.status)}
                            tone={PAYMENT_STATUS_CHIP[p.status]}
                          />
                          <span className="text-xs text-white/50">
                            {dateFmt.format(new Date(p.createdAt))}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </section>
      ) : (
        <>
          {/* Estado inicial / resultados */}
          {results === null && !searching && (
            <Card className="py-10 text-center">
              <p className="text-white/60">{t("initialHint")}</p>
            </Card>
          )}
          {results !== null && results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => void openDetail(u.id)}
                    className="flex min-h-11 w-full flex-col gap-2 rounded-xl border border-night-700 bg-night-800/60 p-3 text-left transition-colors hover:border-night-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-white">
                        {u.name}
                      </span>
                      <span className="truncate text-sm text-white/50">
                        {u.email}
                      </span>
                    </span>
                    {u.roles.length > 0 && (
                      <span className="flex flex-wrap gap-1.5">
                        {u.roles.map((r) => (
                          <Chip
                            key={r.role}
                            label={roleLabel(r.role)}
                            tone={ROLE_STATUS_CHIP[r.status]}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

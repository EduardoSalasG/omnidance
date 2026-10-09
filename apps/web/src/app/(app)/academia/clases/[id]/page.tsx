"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { QuorumBar } from "@/components/academy/quorum-bar";
import {
  classDayFmt,
  shortId,
  type ClassRoster,
} from "@/components/academy/shared";

type LoadState =
  | "loading"
  | "ready"
  | "unauth"
  | "forbidden"
  | "notfound"
  | "error";

/**
 * /academia/clases/[id] - roster de una clase (GET /classes/:id/roster):
 * detalle (serie, estilo/nivel, fecha/hora, profesor), quórum destacado
 * booked/quorum, reservados y lista de espera. Vista por clase - el server
 * decide el acceso (instructor de la clase u owner/admin): 401/403/404
 * tienen estado propio.
 */
export default function AcademiaClaseRosterPage({
  params,
}: {
  params: { id: string };
}) {
  const classId = params.id;
  const t = useTranslations("instructor");
  const tc = useTranslations("common");

  const [roster, setRoster] = useState<ClassRoster | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/classes/${classId}/roster`);
      if (res.status === 401) {
        setState("unauth");
        return;
      }
      if (res.status === 403) {
        setState("forbidden");
        return;
      }
      if (res.status === 404) {
        setState("notfound");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setRoster((await res.json()) as ClassRoster);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-4xl lg:px-8">
      {state === "loading" && <SkeletonList />}
      {state === "unauth" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{t("loginRequired")}</p>
          <Button href="/login">{tc("login")}</Button>
        </div>
      )}
      {(state === "forbidden" || state === "notfound") && (
        <p role="alert" className="text-sm text-ink/60">
          {state === "forbidden" ? t("forbidden") : t("notFound")}
        </p>
      )}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {state === "ready" && roster && (
        <RosterDetail
          roster={roster}
          classId={classId}
          onChanged={() => void load()}
        />
      )}
    </main>
  );
}

function RosterDetail({
  roster,
  classId,
  onChanged,
}: {
  roster: ClassRoster;
  classId: string;
  onChanged: () => void;
}) {
  const t = useTranslations("instructor");
  const tc = useTranslations("common");
  const c = roster.class;
  const booked = roster.booked.length;
  // POST /classes/:id/attendance - solo si el caller es el instructor
  // efectivo (canMark del server); el owner no marca asistencia.
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  async function markPresent(personId: string): Promise<void> {
    setMarkingId(personId);
    setMarkError(null);
    try {
      const res = await apiFetch(`/classes/${classId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      if (!res.ok) {
        setMarkError(tc("error"));
        return;
      }
      onChanged();
    } catch {
      setMarkError(tc("error"));
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Meta de la clase + quórum: en desktop quórum actúa de panel
          lateral (display:contents en móvil - el DOM no cambia bajo lg). */}
      <div className="contents lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold capitalize">
            {classDayFmt.format(new Date(c.date))}
          </p>
          <p className="text-sm tabular-nums text-ink/70">
            {c.startTime}–{c.endTime}
          </p>
        </div>
        <p className="font-medium">
          {c.seriesName ?? t("classFallback")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {c.styleName && <Badge variant="neon">{c.styleName}</Badge>}
          {c.levelName && <Badge variant="muted">{c.levelName}</Badge>}
        </div>
        {c.instructor && (
          <p className="text-xs text-ink/60">
            {t("taughtBy")}: {c.instructor.name ?? shortId(c.instructor.id)}
          </p>
        )}
      </Card>

      {/* Quórum destacado */}
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
          {t("quorum")}
        </p>
        <p className="text-3xl font-bold leading-none tabular-nums">
          <span className="text-neon">{booked}</span>
          <span className="text-ink/50">/{roster.quorum}</span>
        </p>
        <QuorumBar booked={booked} quorum={roster.quorum} />
      </Card>
      </div>

      {/* Reservados */}
      <section aria-label={t("booked")} className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("booked")} ({booked})
        </h3>
        {roster.booked.length === 0 ? (
          <p className="text-sm text-ink/50">{t("emptyBooked")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.booked.map((b) => (
              <li
                key={b.personId}
                className="flex items-center gap-3 rounded-xl border border-line bg-elevated/60 px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {b.name ?? t("personFallback", { id: shortId(b.personId) })}
                </span>
                {b.attended ? (
                  <Badge variant="neon">{t("present")}</Badge>
                ) : (
                  roster.canMark && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={markingId === b.personId}
                      onClick={() => void markPresent(b.personId)}
                    >
                      {markingId === b.personId
                        ? tc("loading")
                        : t("markPresent")}
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
        {markError && (
          <p role="alert" className="text-sm text-red-400">
            {markError}
          </p>
        )}
      </section>

      {/* Lista de espera */}
      <section aria-label={t("waitlistTitle")} className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("waitlistTitle")} ({roster.waitlist.length})
        </h3>
        {roster.waitlist.length === 0 ? (
          <p className="text-sm text-ink/50">{t("emptyWaitlist")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.waitlist.map((w, i) => (
              <li
                key={w.personId}
                className="flex items-center gap-3 rounded-xl border border-line bg-elevated/60 px-4 py-3 text-sm"
              >
                <span className="text-xs tabular-nums text-ink/40">
                  #{i + 1}
                </span>
                {w.name ?? t("personFallback", { id: shortId(w.personId) })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

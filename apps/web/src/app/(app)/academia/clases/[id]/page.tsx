"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
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
 * /academia/clases/[id] — roster de una clase (GET /classes/:id/roster):
 * detalle (serie, estilo/nivel, fecha/hora, profesor), quórum destacado
 * booked/quorum, reservados y lista de espera. Vista por clase — el server
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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia/clases" backLabel={t("title")} />

      {state === "loading" && (
        <p role="status" className="text-sm text-white/60">
          {tc("loading")}
        </p>
      )}
      {state === "unauth" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{t("loginRequired")}</p>
          <Button href="/login">{tc("login")}</Button>
        </div>
      )}
      {(state === "forbidden" || state === "notfound") && (
        <p role="alert" className="text-sm text-white/60">
          {state === "forbidden" ? t("forbidden") : t("notFound")}
        </p>
      )}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-white/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {state === "ready" && roster && (
        <RosterDetail roster={roster} />
      )}
    </main>
  );
}

function RosterDetail({ roster }: { roster: ClassRoster }) {
  const t = useTranslations("instructor");
  const c = roster.class;
  const booked = roster.booked.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Detalle de la clase */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold capitalize">
            {classDayFmt.format(new Date(c.date))}
          </p>
          <p className="text-sm tabular-nums text-white/70">
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
          <p className="text-xs text-white/60">
            {t("taughtBy")}: {c.instructor.name ?? shortId(c.instructor.id)}
          </p>
        )}
      </Card>

      {/* Quórum destacado */}
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-white/50">
          {t("quorum")}
        </p>
        <p className="text-3xl font-bold leading-none tabular-nums">
          <span className="text-neon">{booked}</span>
          <span className="text-white/50">/{roster.quorum}</span>
        </p>
        <QuorumBar booked={booked} quorum={roster.quorum} />
      </Card>

      {/* Reservados */}
      <section aria-label={t("booked")} className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("booked")} ({booked})
        </h3>
        {roster.booked.length === 0 ? (
          <p className="text-sm text-white/50">{t("emptyBooked")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.booked.map((b) => (
              <li
                key={b.personId}
                className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3 text-sm"
              >
                {b.name ?? t("personFallback", { id: shortId(b.personId) })}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Lista de espera */}
      <section aria-label={t("waitlistTitle")} className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("waitlistTitle")} ({roster.waitlist.length})
        </h3>
        {roster.waitlist.length === 0 ? (
          <p className="text-sm text-white/50">{t("emptyWaitlist")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.waitlist.map((w, i) => (
              <li
                key={w.personId}
                className="flex items-center gap-3 rounded-xl border border-night-700 bg-night-800/60 px-4 py-3 text-sm"
              >
                <span className="text-xs tabular-nums text-white/40">
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

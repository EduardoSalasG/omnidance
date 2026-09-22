"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, type BadgeVariant } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { AcademyGate } from "@/components/academy/academy-gate";
import {
  classDayFmt,
  shortId,
  type Academy,
  type StudentProfile,
} from "@/components/academy/shared";

type LoadState = "loading" | "ready" | "forbidden" | "error";

// Badges del historial: attended = asistió (neon), booked = reservó sin
// asistir (outline), cancelled = cancelada (live/rojo).
const HISTORY_VARIANT: Record<string, BadgeVariant> = {
  attended: "neon",
  booked: "outline",
  cancelled: "live",
};

// Claves i18n conocidas — status llega como string libre del server; uno
// desconocido se muestra crudo (el enum puede crecer sin romper la UI).
const KNOWN_ENROLLMENT_STATUS = [
  "ACTIVE",
  "PAUSED",
  "TRIAL",
  "FROZEN",
  "ONLINE",
  "CANCELLED",
];
const KNOWN_HISTORY_STATUS = ["attended", "booked", "cancelled"];

/**
 * /academia/alumnos/[personId] — perfil del alumno en la academia
 * seleccionada: plan/estado de enrollment, historial de clases y próximas
 * reservas. GET /academies/:id/students/:personId (owner e instructor).
 * AcademyGate resuelve la academia (el endpoint es por academia).
 */
export default function AcademiaAlumnoPage({
  params,
}: {
  params: { personId: string };
}) {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <AcademyGate>
        {({ academy }) => (
          <ProfileModule
            key={academy.id}
            academy={academy}
            personId={params.personId}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function ProfileModule({
  academy,
  personId,
}: {
  academy: Academy;
  personId: string;
}) {
  const t = useTranslations("academy");
  const tp = useTranslations("academy.studentProfile");
  const tc = useTranslations("common");
  const tClasses = useTranslations("classes");

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/students/${personId}`,
      );
      if (res.status === 403 || res.status === 404) {
        // 403 = sin acceso (instructor de otra academia); 404 = alumno
        // inexistente en esta academia — misma superficie de "no disponible".
        setState("forbidden");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setProfile((await res.json()) as StudentProfile);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academy.id, personId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return <PageLoading />;
  }
  if (state === "forbidden") {
    return (
      <p role="alert" className="text-sm text-white/60">
        {tp("forbidden")}
      </p>
    );
  }
  if (state === "error") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-white/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          ↻ {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!profile) return null;

  const statusLabel = (s: string): string =>
    KNOWN_ENROLLMENT_STATUS.includes(s) ? t(`status.${s}`) : s;

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado: nombre + plan + estado del enrollment */}
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-lg font-semibold">
          {profile.person.name ?? shortId(profile.person.id)}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/60">
          <span>
            {tp("plan")}: {profile.plan?.name ?? "—"}
          </span>
          <Badge variant="outline">
            {tp("enrollmentStatus")}: {statusLabel(profile.enrollmentStatus)}
          </Badge>
        </div>
      </Card>

      {/* Historial */}
      <section
        aria-label={tp("history")}
        className="flex flex-col gap-2"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {tp("history")}
        </h3>
        {profile.history.length === 0 ? (
          <p className="text-sm text-white/50">{tp("emptyHistory")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {profile.history.map((h) => (
              <li
                key={h.classId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-night-700 bg-night-800/60 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold capitalize tabular-nums">
                    {classDayFmt.format(new Date(h.date))}
                  </p>
                  <p className="truncate text-xs text-white/60">
                    {h.seriesName ?? "—"}
                    {h.styleName ? ` · ${h.styleName}` : ""}
                  </p>
                </div>
                <Badge variant={HISTORY_VARIANT[h.status] ?? "muted"}>
                  {KNOWN_HISTORY_STATUS.includes(h.status)
                    ? tp(`historyStatus.${h.status}`)
                    : h.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Próximas reservas */}
      <section
        aria-label={tp("upcoming")}
        className="flex flex-col gap-2"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {tp("upcoming")}
        </h3>
        {profile.upcoming.length === 0 ? (
          <p className="text-sm text-white/50">{tp("emptyUpcoming")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {profile.upcoming.map((u) => (
              <li
                key={u.classId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-night-700 bg-night-800/60 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold capitalize tabular-nums">
                    {classDayFmt.format(new Date(u.date))}
                  </p>
                  <p className="truncate text-xs text-white/60">
                    {u.seriesName ?? "—"}
                  </p>
                </div>
                <Badge variant={u.status === "BOOKED" ? "neon" : "outline"}>
                  {u.status === "BOOKED"
                    ? tClasses("booked")
                    : u.status === "WAITLIST"
                      ? tClasses("waitlist")
                      : u.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

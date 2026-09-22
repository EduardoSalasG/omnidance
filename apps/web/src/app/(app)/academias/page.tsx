"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { PrivateLessons } from "@/components/academy/private-lessons";

// /academias — "Mi Aprendizaje" del modo Academia (spec §9):
// 1. Mis academias — inscripciones con estado (presencial/online/
//    pausada), plan, asistencias del mes (progreso personal, no
//    competitivo) y videos: desbloqueados con link externo, los
//    restringidos como teaser hasta asistir a la clase.
// 2. Explorar academias — directorio; las mías llevan badge "Inscrita".
// 3. PrivateLessons — mis solicitudes + form de clase particular.
// Contratos: GET /academies/enrolled, GET /academies,
// GET /academies/:id/videos (gate learner: locked sin url).

type DirectoryAcademy = {
  id: string;
  name: string;
  instructors: { id: string; personId: string; name: string | null }[];
};

type Enrollment = {
  id: string;
  academy: { id: string; name: string; active: boolean };
  status: "ACTIVE" | "PAUSED" | "TRIAL" | "FROZEN" | "ONLINE";
  plan: { name: string; type: string } | null;
  startedAt: string;
  attendance30d: number;
};

type AcademyVideo = {
  id: string;
  title: string;
  url?: string;
  locked?: boolean;
};

type LoadState = "loading" | "ready" | "error";

function LockIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-3.5 w-3.5 shrink-0"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

/** Card de una inscripción: estado, plan, progreso del mes y videos. */
function MyAcademyCard({ enrollment }: { enrollment: Enrollment }) {
  const t = useTranslations("academy.learner");
  const tp = useTranslations("academy.planTypes");
  const tv = useTranslations("academyExtras.videos");
  const [videos, setVideos] = useState<AcademyVideo[] | null>(null);

  useEffect(() => {
    apiFetch(`/academies/${enrollment.academy.id}/videos`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as AcademyVideo[]) : [],
      )
      .then(setVideos)
      .catch(() => setVideos([]));
  }, [enrollment.academy.id]);

  const statusVariant =
    enrollment.status === "ACTIVE" || enrollment.status === "ONLINE"
      ? "neon"
      : "muted";

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{enrollment.academy.name}</p>
        <Badge variant={statusVariant}>
          {t(`status.${enrollment.status}`)}
        </Badge>
      </div>

      {enrollment.plan && (
        <p className="text-sm text-white/60">
          {enrollment.plan.name}
          {tp.has(enrollment.plan.type) ? ` · ${tp(enrollment.plan.type)}` : ""}
        </p>
      )}

      {enrollment.attendance30d > 0 && (
        <p className="text-sm font-medium text-neon">
          {t("attendance30d", { count: enrollment.attendance30d })}
        </p>
      )}

      {videos !== null && videos.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label={tv("title")}>
          {videos.slice(0, 3).map((v) =>
            v.locked || !v.url ? (
              <li
                key={v.id}
                className="flex items-center gap-2 text-sm text-white/40"
                title={tv("lockedHint")}
              >
                <LockIcon />
                <span className="truncate">{v.title}</span>
                <span className="sr-only">— {tv("lockedHint")}</span>
              </li>
            ) : (
              <li key={v.id}>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-neon underline-offset-4 hover:underline"
                >
                  <span aria-hidden>▸</span>
                  <span className="truncate">{v.title}</span>
                </a>
              </li>
            ),
          )}
        </ul>
      )}

      <Link
        href="/clases"
        className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-neon"
      >
        {t("reserveCta")}
        <span aria-hidden>→</span>
      </Link>
    </Card>
  );
}

export default function AcademiasPage() {
  const t = useTranslations("academy");
  const [academies, setAcademies] = useState<DirectoryAcademy[] | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [enrolledState, setEnrolledState] = useState<LoadState>("loading");

  useEffect(() => {
    apiFetch("/academies")
      .then(async (res) =>
        res.ok ? ((await res.json()) as DirectoryAcademy[]) : [],
      )
      .then(setAcademies)
      .catch(() => setAcademies([]));
    apiFetch("/academies/enrolled")
      .then(async (res) => {
        if (!res.ok) {
          setEnrolledState("error");
          return;
        }
        setEnrollments((await res.json()) as Enrollment[]);
        setEnrolledState("ready");
      })
      .catch(() => setEnrolledState("error"));
  }, []);

  const enrolledIds = new Set(
    (enrollments ?? []).map((e) => e.academy.id),
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 py-6 sm:px-6">
      {/* ─── Mis academias (solo si hay inscripciones) ─── */}
      {enrolledState === "loading" && (
        <Spinner size="sm" className="page-loading" />
      )}
      {enrolledState === "ready" &&
        enrollments !== null &&
        enrollments.length > 0 && (
          <section
            aria-label={t("learner.myAcademies")}
            className="flex flex-col gap-3"
          >
            <h2 className="text-lg font-semibold">
              {t("learner.myAcademies")}
            </h2>
            <ul className="grid gap-3">
              {enrollments.map((e) => (
                <li key={e.id}>
                  <MyAcademyCard enrollment={e} />
                </li>
              ))}
            </ul>
          </section>
        )}

      {/* ─── Directorio ─── */}
      <section
        aria-label={t("directoryTitle")}
        className="flex flex-col gap-3"
      >
        <h2 className="text-lg font-semibold">{t("directoryTitle")}</h2>
        {academies === null ? (
          <Spinner size="sm" className="page-loading" />
        ) : academies.length === 0 ? (
          <p className="text-sm text-white/60">{t("directoryEmpty")}</p>
        ) : (
          <ul className="grid gap-3">
            {academies.map((a) => (
              <li key={a.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{a.name}</p>
                    {enrolledIds.has(a.id) && (
                      <Badge variant="neon">
                        {t("learner.enrolledBadge")}
                      </Badge>
                    )}
                  </div>
                  {a.instructors.length > 0 && (
                    <p className="mt-1 text-sm text-white/50">
                      {t("instructorsLabel")}:{" "}
                      {a.instructors
                        .map((i) => i.name)
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Vista alumno: mis solicitudes + form para pedir clase particular. */}
      <PrivateLessons />
    </main>
  );
}

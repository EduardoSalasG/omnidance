"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, SkeletonList, Spinner } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { CourseSurveyResults } from "@/components/academy/survey-results";
import { readError } from "@/components/academy/shared";

type InstructorDetail = {
  person: { id: string; name: string | null; email: string | null; phone: string | null };
  payType: "PER_CLASS" | "MONTHLY" | "COMMISSION" | null;
  payAmount: number | null;
  payClasses: number | null;
  commissionPct: number | null;
  createdAt: string;
  stats: { taughtTotal: number; taughtMonth: number; attendanceMonth: number };
  upcoming: {
    id: string;
    date: string;
    startTime: string;
    seriesName: string | null;
    bookings: number;
  }[];
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * /academia/equipo/profesor/[id] - detalle del profesor (nivel 2):
 * datos, acuerdo económico, clases impartidas y próximas. La edición
 * del acuerdo vive en /editar (nivel 3).
 */
export default function InstructorDetailPage() {
  const t = useTranslations("academyStaff");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/equipo" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <Detail
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            personId={params.id}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function Detail({
  academyId,
  personId,
}: {
  academyId: string;
  personId: string;
}) {
  const t = useTranslations("academyStaff");
  const tc = useTranslations("common");
  const router = useRouter();

  const [detail, setDetail] = useState<InstructorDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await apiFetch(
      `/academies/${academyId}/instructors/${personId}`,
    ).catch(() => null);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setDetail((await res.json()) as InstructorDetail);
  }, [academyId, personId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    if (!detail) return;
    const label = detail.person.name ?? detail.person.email ?? personId;
    if (!window.confirm(t("removeInstructorConfirm", { name: label }))) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/instructors/${personId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setErr((await readError(res)) ?? t("error"));
        return;
      }
      router.push("/academia/equipo");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!detail) return <SkeletonList />;

  const agreement =
    detail.payType === "MONTHLY" && detail.payAmount != null
      ? t("payClassesOf", {
          amount: clp.format(detail.payAmount),
          classes: detail.payClasses ?? 0,
        })
      : detail.payType === "PER_CLASS" && detail.payAmount != null
        ? t("payPerClassOf", { amount: clp.format(detail.payAmount) })
        : detail.payType === "COMMISSION" && detail.commissionPct != null
          ? t("payCommissionOf", { pct: detail.commissionPct })
          : t("agreementNone");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {detail.person.name ?? detail.person.email}
        </h2>
        <Card className="flex flex-col gap-3 p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {detail.person.email && (
              <div>
                <dt className="text-xs text-ink/50">{t("fieldEmail")}</dt>
                <dd className="font-medium">{detail.person.email}</dd>
              </div>
            )}
            {detail.person.phone && (
              <div>
                <dt className="text-xs text-ink/50">{t("fieldPhone")}</dt>
                <dd className="font-medium">{detail.person.phone}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-ink/50">{t("memberSince")}</dt>
              <dd className="tabular-nums text-ink/70">
                {dayFmt.format(new Date(detail.createdAt))}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-label={t("agreementTitle")}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("agreementTitle")}
          </h3>
          <Button
            size="sm"
            variant="secondary"
            href={`/academia/equipo/profesor/${personId}/editar`}
          >
            {t("editAgreement")}
          </Button>
        </div>
        <Card className="p-4">
          <p className="text-sm font-medium">{agreement}</p>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-label={t("statsTaughtMonth")}>
        <ul className="grid grid-cols-3 gap-3">
          {[
            { label: t("statsTaughtMonth"), value: detail.stats.taughtMonth },
            { label: t("statsTaughtTotal"), value: detail.stats.taughtTotal },
            {
              label: t("statsAttendanceMonth"),
              value: detail.stats.attendanceMonth,
            },
          ].map((s) => (
            <li key={s.label}>
              <Card className="flex h-full flex-col gap-1 p-4">
                <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                  {s.label}
                </span>
                <span className="text-3xl font-bold leading-none text-neon">
                  {s.value}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-label={t("upcomingTitle")}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("upcomingTitle")}
        </h3>
        <Card className="p-4">
          {detail.upcoming.length === 0 ? (
            <p className="text-sm text-ink/50">{t("upcomingEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {detail.upcoming.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/academia/clases/${c.id}`}
                    className="flex items-center gap-3 py-2 text-sm transition-colors hover:text-neon"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {c.seriesName ?? "—"}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink/50">
                      {dayFmt.format(new Date(c.date))} · {c.startTime}
                    </span>
                    <span className="shrink-0 text-xs text-ink/40">
                      {t("bookingsOf", { count: c.bookings })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Encuestas del profe - agrupadas mes × serie, solo owner/ADMIN. */}
      <CourseSurveyResults academyId={academyId} instructorId={personId} />

      {err && (
        <p role="alert" className="text-sm text-red-400">
          {err}
        </p>
      )}
      {/* Zona destructiva al pie, centrada y en rojo - mismo patrón que
          "Eliminar amigo" (/amigos/[id]). */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-red-400/80 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-50"
        >
          {busy ? <Spinner size="sm" /> : null}
          {t("removeInstructor")}
        </button>
      </div>
    </div>
  );
}

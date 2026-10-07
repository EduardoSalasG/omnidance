"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate, type BadgeVariant, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import {
  ENROLLMENT_STATUSES,
  fromDateInput,
  inputCls,
  planDateFmt,
  readError,
  toDateInput,
  type EnrollmentStatus,
  type Student,
} from "./shared";

type Props = {
  academyId: string;
  /** Instructor: ve la lista y fichas, pero no crea enrollments ni cambia status. */
  readOnly?: boolean;
};

const STATUS_VARIANT: Record<EnrollmentStatus, BadgeVariant> = {
  ACTIVE: "neon",
  ONLINE: "neon",
  TRIAL: "outline",
  PAUSED: "muted",
  FROZEN: "muted",
};

/**
 * Alumnos (enrollments) - solo listado. El alta vive en la página
 * dedicada /academia/alumnos/nuevo detrás del CTA (solo si !readOnly).
 * PATCH /enrollments/:id {status, endsAt} inline; las transiciones
 * válidas las valida el server (400 → se muestra su message y el
 * control vuelve al valor real).
 */
export function StudentsSection({
  academyId,
  readOnly = false,
}: Props) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const tp = useTranslations("practices");

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [patching, setPatching] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiFetch(`/academies/${academyId}/students`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setStudents((await res.json()) as Student[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(id: string, next: EnrollmentStatus) {
    setPatching(id);
    setRowErrors((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    try {
      const res = await apiFetch(`/enrollments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        // Transición inválida u otro 4xx - el select queda ligado a
        // student.status, así que vuelve solo al valor real.
        const msg = (await readError(res)) ?? tc("error");
        setRowErrors((prev) => ({ ...prev, [id]: msg }));
        return;
      }
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: next } : s)),
      );
    } catch {
      setRowErrors((prev) => ({ ...prev, [id]: tc("error") }));
    } finally {
      setPatching(null);
    }
  }

  /** Renovar/corregir "pagado hasta" - PATCH con el status actual
      (mismo status es transición idempotente; el DTO lo exige). */
  async function changeEndsAt(s: Student, value: string) {
    setPatching(s.id);
    setRowErrors((prev) => {
      const copy = { ...prev };
      delete copy[s.id];
      return copy;
    });
    try {
      const res = await apiFetch(`/enrollments/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: s.status,
          endsAt: value ? fromDateInput(value) : null,
        }),
      });
      if (!res.ok) {
        const msg = (await readError(res)) ?? tc("error");
        setRowErrors((prev) => ({ ...prev, [s.id]: msg }));
        return;
      }
      const updated = (await res.json()) as { endsAt: string | null };
      setStudents((prev) =>
        prev.map((x) =>
          x.id === s.id ? { ...x, endsAt: updated.endsAt } : x,
        ),
      );
    } catch {
      setRowErrors((prev) => ({ ...prev, [s.id]: tc("error") }));
    } finally {
      setPatching(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <Button
          href="/academia/alumnos/nuevo"
          size="sm"
          className="self-start"
        >
          + {t("newEnrollment")}
        </Button>
      )}

      {loading ? (
        <SkeletonList items={3} lines={1} />
      ) : error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p role="status" className="text-sm text-ink/50">
            {t("studentsEmpty")}
          </p>
          {!readOnly && (
            <Button href="/academia/alumnos/nuevo" size="sm">
              + {t("newEnrollment")}
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => (
            <li key={s.id}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {/* Perfil del alumno: historial + próximas reservas. */}
                  <Link
                    href={`/academia/alumnos/${s.person.id}`}
                    aria-label={t("studentProfile.viewProfile", {
                      name: s.person.name ?? s.person.email ?? s.person.id,
                    })}
                    className="min-w-0 flex-1 truncate font-medium underline-offset-4 transition-colors hover:text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                  >
                    {s.person.name ?? s.person.email ?? s.person.id}
                  </Link>
                  <Badge variant={STATUS_VARIANT[s.status]}>
                    {t(`status.${s.status}`)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink/50">
                  <span className="truncate">{s.plan?.name ?? "-"}</span>
                  {s.startsAt && <EventDate start={s.startsAt} />}
                  {readOnly ? (
                    s.endsAt && (
                      <span>
                        {tp("endsAt")}:{" "}
                        {planDateFmt.format(new Date(s.endsAt))}
                      </span>
                    )
                  ) : (
                    <label className="flex items-center gap-1.5">
                      <span>{tp("endsAt")}</span>
                      <input
                        type="date"
                        aria-label={`${tp("endsAt")} - ${s.person.name ?? s.person.email ?? s.person.id}`}
                        className={`${inputCls} w-auto px-2 py-1`}
                        value={s.endsAt ? toDateInput(s.endsAt) : ""}
                        disabled={patching === s.id}
                        onChange={(e) =>
                          void changeEndsAt(s, e.target.value)
                        }
                      />
                    </label>
                  )}
                  {!readOnly && (
                  <select
                    aria-label={t("studentStatus", {
                      name:
                        s.person.name ?? s.person.email ?? s.person.id,
                    })}
                    className={`${inputCls} ml-auto w-auto min-h-11`}
                    value={s.status}
                    disabled={patching === s.id}
                    onChange={(e) =>
                      void changeStatus(
                        s.id,
                        e.target.value as EnrollmentStatus,
                      )
                    }
                  >
                    {ENROLLMENT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {t(`status.${st}`)}
                      </option>
                    ))}
                  </select>
                  )}
                </div>
                {rowErrors[s.id] && (
                  <p role="alert" className="text-sm text-red-400">
                    {rowErrors[s.id]}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

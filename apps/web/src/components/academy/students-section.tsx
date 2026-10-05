"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate, type BadgeVariant, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import {
  ENROLLMENT_STATUSES,
  inputCls,
  planDateFmt,
  readError,
  type EnrollmentStatus,
  type MembershipPlan,
  type Student,
} from "./shared";

// <input type="date"> trabaja en fecha local YYYY-MM-DD; endsAt llega ISO.
const toDateInput = (iso: string) => {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

// Un "YYYY-MM-DD" del input se manda como mediodía local - si se envía
// crudo el server lo parsea como medianoche UTC y el día se corre en
// zonas negativas (CLT = UTC-3/-4).
const fromDateInput = (v: string) =>
  new Date(`${v}T12:00:00`).toISOString();

type Props = {
  academyId: string;
  plans: MembershipPlan[];
  onChanged: () => Promise<void>;
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
 * Alumnos (enrollments). personId es FK plana → input de texto en v1.
 * PATCH /enrollments/:id {status} inline; las transiciones válidas las
 * valida el server (400 → se muestra su message y el select vuelve al valor real).
 */
export function StudentsSection({
  academyId,
  plans,
  onChanged,
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

  const [personId, setPersonId] = useState("");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<EnrollmentStatus>("ACTIVE");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      await onChanged();
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
      await onChanged();
    } catch {
      setRowErrors((prev) => ({ ...prev, [s.id]: tc("error") }));
    } finally {
      setPatching(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: personId.trim(),
          planId,
          status,
          ...(startsAt ? { startsAt: fromDateInput(startsAt) } : {}),
          ...(endsAt ? { endsAt: fromDateInput(endsAt) } : {}),
        }),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setPersonId("");
      setStartsAt("");
      setEndsAt("");
      await Promise.all([load(), onChanged()]);
    } catch {
      setFormError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <SkeletonList items={3} lines={1} />
      ) : error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-white/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      ) : students.length === 0 ? (
        <p role="status" className="text-sm text-white/50">
          -
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {students.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-col gap-2 p-4">
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-white/50">
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

      {!readOnly && (
      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("newEnrollment")}
        </h3>
        <form
          onSubmit={submit}
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">
              {t("personId")}
              <span aria-hidden="true" className="text-neon"> *</span>
            </span>
            <input
              className={inputCls}
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">
              {t("plans")}
              <span aria-hidden="true" className="text-neon"> *</span>
            </span>
            <select
              className={inputCls}
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              required
            >
              <option value="" disabled>
                -
              </option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{t("students")}</span>
            <select
              className={inputCls}
              value={status}
              onChange={(e) => setStatus(e.target.value as EnrollmentStatus)}
            >
              {ENROLLMENT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {t(`status.${st}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{tp("startsAt")}</span>
            <input
              className={inputCls}
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{tp("endsAt")}</span>
            <input
              className={inputCls}
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
          {formError && (
            <p role="alert" className="text-sm text-red-400 sm:col-span-2">
              {formError}
            </p>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? tc("loading") : tc("create")}
            </Button>
          </div>
        </form>
      </Card>
      )}
    </div>
  );
}

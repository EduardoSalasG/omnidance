"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Badge, Button, Card, PriceTag, RefreshIcon } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { Skeleton, SkeletonList } from "@/components/ui";
import academyExtras from "@/i18n/parts/academyExtras.json";
import { inputCls, readError, type Academy } from "./shared";

const t = academyExtras.academyExtras.lessons;

function statusLabel(status: string): string {
  return (t.status as Record<string, string>)[status] ?? status;
}

type LoadState = "loading" | "ready" | "error";

/**
 * PrivateLesson - espejo del schema + join manual del controller.
 * GET /academies/:id/private-lessons agrega `person`/`instructor`
 * ({id, name} | null); GET /private-lessons/mine devuelve la fila cruda.
 * instructorId/scheduledAt son nullables desde private-lesson-product:
 * una lección comprada nace "por asignar" hasta que el owner agenda.
 * status es String libre: REQUESTED | CONFIRMED | DONE | CANCELLED.
 */
type PrivateLesson = {
  id: string;
  academyId: string;
  instructorId: string | null; // personId del instructor; null = por asignar
  personId: string; // alumno
  scheduledAt: string | null; // ISO; null = por agendar
  price: number;
  status: string;
  person?: { id: string; name: string | null };
  instructor?: { id: string; name: string | null } | null;
  // Solo vienen en la vista staff para owner/admin/instructor de la clase
  // (la comisión es del acuerdo academia↔instructor - el alumno no la ve).
  commissionPct?: number;
  commissionPaidAt?: string | null;
};

// Rama as=instructor de GET /private-lessons/mine - el server calcula
// comisión y neto (la comisión es del acuerdo academia↔instructor; el
// alumno nunca la ve).
type InstructorLesson = PrivateLesson & {
  commissionPct: number;
  commissionClp: number;
  netClp: number;
  commissionPaidAt: string | null;
};

/** GET /academies/:id (requireManage) incluye instructors:[{personId}]. */
type AcademyDetail = Academy & { instructors?: { personId: string }[] };

/** GET /academies (directorio autenticado): incluye instructores con nombre. */
type DirectoryAcademy = {
  id: string;
  name: string;
  instructors: { id: string; personId: string; name: string | null }[];
};

type LessonAction =
  | "confirm"
  | "cancel"
  | "done"
  | "reschedule"
  | "assign"
  | "pay-commission";

type Props = {
  /** Academia de la consola staff (obligatoria - la vista alumno vive
      en reservadas de /clases, particulares-en-reservadas). */
  academy: Academy;
  /** Academias ya cargadas en la página - resuelven nombres de academia. */
  academies?: Academy[];
};

const df = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "CONFIRMED":
      return "neon";
    case "DONE":
      return "muted";
    case "CANCELLED":
      return "live";
    default: // REQUESTED u otro string libre del schema
      return "outline";
  }
}

function shortId(id: string) {
  return id.slice(0, 8);
}

/**
 * Clases particulares 1:1 - vista staff de la consola (/academia/
 * particulares): GET /academies/:id/private-lessons + PATCH
 * /private-lessons/:id {action} - assign (owner: instructor+fecha a las
 * compradas "por asignar"), confirm/done/reschedule para instructor de
 * la clase u owner(ADMIN); cancel para alumno u owner. Además la vista
 * "mis clases como instructor" (neto del mes).
 * La vista alumno NO vive acá: sus particulares aparecen en reservadas
 * de /clases (particulares-en-reservadas).
 */
export function PrivateLessons({ academy, academies = [] }: Props) {
  const tc = useTranslations("common");

  // /me compartido (MeProvider) - sin fetch propio.
  const { me } = useMe();

  // ─── vista staff ───
  const [lessons, setLessons] = useState<PrivateLesson[]>([]);
  const [staffState, setStaffState] = useState<LoadState>("loading");

  // ─── vista instructor (mis clases como profesor, con neto) ───
  // null = fetch en vuelo → skeleton en el slot (la sección va arriba
  // de "Mis solicitudes"; sin slot la insertaba de golpe al resolver).
  const [mineInstructor, setMineInstructor] = useState<
    InstructorLesson[] | null
  >(null);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reschedId, setReschedId] = useState<string | null>(null);
  const [reschedWhen, setReschedWhen] = useState("");

  // ─── asignación (owner): lección comprada sin instructor/fecha ───
  const [assignId, setAssignId] = useState<string | null>(null);
  const [assignInstructorId, setAssignInstructorId] = useState("");
  const [assignWhen, setAssignWhen] = useState("");

  // Instructores de la academia del contexto staff - para el select de
  // asignación. El directorio trae nombres; si no, GET /academies/:id
  // (requireManage) da los personIds y se resuelve con instructorNames.
  const [directory, setDirectory] = useState<DirectoryAcademy[]>([]);
  const [academyInstructors, setAcademyInstructors] = useState<
    { personId: string; name?: string | null }[]
  >([]);

  useEffect(() => {
    apiFetch("/academies")
      .then(async (res) =>
        res.ok ? ((await res.json()) as DirectoryAcademy[]) : [],
      )
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }, []);

  useEffect(() => {
    const dir = directory.find((a) => a.id === academy.id);
    if (dir) {
      setAcademyInstructors(dir.instructors);
      return;
    }
    apiFetch(`/academies/${academy.id}`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as AcademyDetail) : null,
      )
      .then((detail) =>
        setAcademyInstructors(
          (detail?.instructors ?? []).map((i) => ({ personId: i.personId })),
        ),
      )
      .catch(() => {});
  }, [academy, directory]);

  // Mis clases como instructor - [] resuelto es el caso común (alumno
  // puro) y la sección no se monta; errores = [] también (la vista
  // staff sigue).
  const loadMineInstructor = useCallback(async () => {
    try {
      const res = await apiFetch("/private-lessons/mine?as=instructor");
      setMineInstructor(
        res.ok ? ((await res.json()) as InstructorLesson[]) : [],
      );
    } catch {
      setMineInstructor([]);
    }
  }, []);

  const loadStaff = useCallback(async () => {
    setStaffState("loading");
    try {
      const res = await apiFetch(`/academies/${academy.id}/private-lessons`);
      if (!res.ok) {
        setStaffState("error");
        return;
      }
      setLessons((await res.json()) as PrivateLesson[]);
      setStaffState("ready");
    } catch {
      setStaffState("error");
    }
  }, [academy]);

  useEffect(() => {
    void loadMineInstructor();
  }, [loadMineInstructor]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  // Nombres de instructor cosechados del join de la lista staff (+ yo
  // mismo): GET /academies/:id solo devuelve personIds, sin nombres.
  const instructorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lessons) {
      if (l.instructor?.name && l.instructorId) {
        map.set(l.instructorId, l.instructor.name);
      }
    }
    if (me?.id && me.name) map.set(me.id, me.name);
    return map;
  }, [lessons, me]);

  const academyNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of directory) map.set(a.id, a.name);
    for (const a of academies) map.set(a.id, a.name);
    if (academy) map.set(academy.id, academy.name);
    return map;
  }, [directory, academies, academy]);

  async function act(
    id: string,
    action: LessonAction,
    extra?: { scheduledAt?: string; instructorId?: string },
  ): Promise<void> {
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await apiFetch(`/private-lessons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(extra?.scheduledAt ? { scheduledAt: extra.scheduledAt } : {}),
          ...(extra?.instructorId
            ? { instructorId: extra.instructorId }
            : {}),
        }),
      });
      if (!res.ok) {
        setFeedback((await readError(res)) ?? tc("error"));
        return;
      }
      setFeedback(action === "assign" ? t.assigned : t.updated);
      setReschedId(null);
      setReschedWhen("");
      setAssignId(null);
      setAssignInstructorId("");
      setAssignWhen("");
      await Promise.all([loadStaff(), loadMineInstructor()]);
    } catch {
      setFeedback(tc("error"));
    } finally {
      setBusyId(null);
    }
  }

  function cancel(id: string): void {
    if (!window.confirm(t.confirmCancel)) return;
    void act(id, "cancel");
  }

  function submitAssign(e: React.FormEvent, id: string): void {
    e.preventDefault();
    if (!assignInstructorId || !assignWhen) return;
    void act(id, "assign", {
      instructorId: assignInstructorId,
      scheduledAt: new Date(assignWhen).toISOString(),
    });
  }

  /**
   * Matriz de acciones del controller:
   * assign → solo owner(ADMIN), sobre REQUESTED sin instructor/fecha.
   * confirm/done/reschedule → instructor de la clase u owner(ADMIN).
   * cancel → alumno (REQUESTED/CONFIRMED) u owner (cualquier no cancelada);
   * el instructor no cancela. En UI solo se ofrece cancelar estados activos.
   */
  function staffActions(l: PrivateLesson) {
    const isOwner =
      !!me && (me.roles.includes("ADMIN") || me.id === academy.ownerId);
    const isInstructor = !!me && l.instructorId === me.id;
    const isStudent = !!me && l.personId === me.id;
    const active = l.status === "REQUESTED" || l.status === "CONFIRMED";
    const unassigned = !l.instructorId || !l.scheduledAt;
    return {
      assign: isOwner && l.status === "REQUESTED" && unassigned,
      confirm: (isOwner || isInstructor) && l.status === "REQUESTED" && !unassigned,
      done: (isOwner || isInstructor) && l.status === "CONFIRMED",
      reschedule: (isOwner || isInstructor) && active && !!l.scheduledAt,
      cancel: active && (isOwner || isStudent),
      // Liquidación de la comisión academia→instructor: solo el owner la
      // marca (el pago real es por fuera - transferencia/efectivo).
      payCommission:
        isOwner &&
        !!l.instructorId &&
        (l.commissionPct ?? 0) > 0 &&
        !l.commissionPaidAt &&
        (l.status === "CONFIRMED" || l.status === "DONE"),
    };
  }

  function payCommission(l: PrivateLesson): void {
    if (!window.confirm(t.confirmPayCommission)) return;
    void act(l.id, "pay-commission");
  }

  function rescheduleSubmit(e: React.FormEvent, id: string): void {
    e.preventDefault();
    if (!reschedWhen) return;
    void act(id, "reschedule", {
      scheduledAt: new Date(reschedWhen).toISOString(),
    });
  }

  const lessonWhen = (l: PrivateLesson) =>
    l.scheduledAt ? df.format(new Date(l.scheduledAt)) : t.toSchedule;

  const lessonInstructor = (l: PrivateLesson) =>
    l.instructorId
      ? (instructorNames.get(l.instructorId) ??
        l.instructor?.name ??
        t.instructorFallback.replace("{id}", shortId(l.instructorId)))
      : t.toAssign;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label={t.title} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.title}</h2>
          {staffState === "loading" && <SkeletonList items={2} lines={1} />}
          {staffState === "error" && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-white/60">{tc("error")}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadStaff()}
              >
                <RefreshIcon /> {tc("retry")}
              </Button>
            </div>
          )}
          {staffState === "ready" &&
            (lessons.length === 0 ? (
              <p className="text-sm text-white/50">{t.empty}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {lessons.map((l) => {
                  const a = staffActions(l);
                  return (
                    <li key={l.id}>
                      <Card className="flex h-full flex-col gap-3 p-4">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <Badge variant={statusVariant(l.status)}>
                            {statusLabel(l.status)}
                          </Badge>
                          <span className="font-medium tabular-nums">
                            {lessonWhen(l)}
                          </span>
                          {l.price > 0 && <PriceTag amount={l.price} />}
                        </div>
                        <p className="text-xs text-white/60">
                          {t.student}:{" "}
                          {l.person?.name ?? shortId(l.personId)} ·{" "}
                          {t.instructor}: {lessonInstructor(l)}
                        </p>
                        {(a.assign ||
                          a.confirm ||
                          a.done ||
                          a.reschedule ||
                          a.payCommission ||
                          l.commissionPaidAt ||
                          a.cancel) && (
                          <div className="flex flex-wrap gap-2">
                            {a.assign && (
                              <Button
                                size="sm"
                                disabled={busyId === l.id}
                                aria-expanded={assignId === l.id}
                                onClick={() => {
                                  setAssignId(
                                    assignId === l.id ? null : l.id,
                                  );
                                  setAssignInstructorId("");
                                  setAssignWhen("");
                                }}
                              >
                                {t.assign}
                              </Button>
                            )}
                            {a.confirm && (
                              <Button
                                size="sm"
                                disabled={busyId === l.id}
                                onClick={() => void act(l.id, "confirm")}
                              >
                                {t.confirm}
                              </Button>
                            )}
                            {a.done && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busyId === l.id}
                                onClick={() => void act(l.id, "done")}
                              >
                                {t.done}
                              </Button>
                            )}
                            {a.reschedule && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busyId === l.id}
                                aria-expanded={reschedId === l.id}
                                onClick={() => {
                                  setReschedId(
                                    reschedId === l.id ? null : l.id,
                                  );
                                  setReschedWhen("");
                                }}
                              >
                                {t.reschedule}
                              </Button>
                            )}
                            {a.payCommission && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busyId === l.id}
                                onClick={() => payCommission(l)}
                              >
                                {t.payCommission}
                              </Button>
                            )}
                            {l.commissionPaidAt && (
                              <Badge variant="outline" className="self-center">
                                {t.commissionPaid}
                              </Badge>
                            )}
                            {a.cancel && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busyId === l.id}
                                onClick={() => cancel(l.id)}
                              >
                                {t.cancel}
                              </Button>
                            )}
                          </div>
                        )}
                        {reschedId === l.id && (
                          <form
                            onSubmit={(e) => rescheduleSubmit(e, l.id)}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-white/50">
                                {t.newDate}
                                <span aria-hidden="true" className="text-neon"> *</span>
                              </span>
                              <input
                                type="datetime-local"
                                className={inputCls}
                                value={reschedWhen}
                                onChange={(e) =>
                                  setReschedWhen(e.target.value)
                                }
                                required
                              />
                            </label>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={busyId === l.id}
                            >
                              {t.saveReschedule}
                            </Button>
                          </form>
                        )}
                        {assignId === l.id && (
                          <form
                            onSubmit={(e) => submitAssign(e, l.id)}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-white/50">
                                {t.instructor}
                                <span aria-hidden="true" className="text-neon"> *</span>
                              </span>
                              <select
                                className={inputCls}
                                value={assignInstructorId}
                                onChange={(e) =>
                                  setAssignInstructorId(e.target.value)
                                }
                                required
                              >
                                <option value="" disabled>
                                  -
                                </option>
                                {academyInstructors.map((i) => (
                                  <option key={i.personId} value={i.personId}>
                                    {i.name ??
                                      instructorNames.get(i.personId) ??
                                      t.instructorFallback.replace(
                                        "{id}",
                                        shortId(i.personId),
                                      )}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-white/50">
                                {t.scheduledAt}
                                <span aria-hidden="true" className="text-neon"> *</span>
                              </span>
                              <input
                                type="datetime-local"
                                className={inputCls}
                                value={assignWhen}
                                onChange={(e) =>
                                  setAssignWhen(e.target.value)
                                }
                                required
                              />
                            </label>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={
                                busyId === l.id ||
                                !assignInstructorId ||
                                !assignWhen
                              }
                            >
                              {t.assignSave}
                            </Button>
                          </form>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            ))}
      </section>

      {/* Sección instructor - opcional: nada mientras resuelve
          (aparece una vez si hay clases); skeleton-que-colapsa = flash. */}
      {mineInstructor !== null && mineInstructor.length > 0 && (
        <section
          aria-label={t.instructorTitle}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{t.instructorTitle}</h2>
            <p className="flex items-baseline gap-1 text-sm text-white/60">
              {t.monthNet}:
              <PriceTag
                amount={mineInstructor
                  .filter((l) => {
                    if (
                      l.status !== "CONFIRMED" &&
                      l.status !== "DONE"
                    ) {
                      return false;
                    }
                    if (!l.scheduledAt) return false;
                    const d = new Date(l.scheduledAt);
                    const now = new Date();
                    return (
                      d.getFullYear() === now.getFullYear() &&
                      d.getMonth() === now.getMonth()
                    );
                  })
                  .reduce((sum, l) => sum + l.netClp, 0)}
              />
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mineInstructor.map((l) => (
              <li key={l.id}>
                <Card className="flex h-full flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {academyNames.get(l.academyId) ?? shortId(l.academyId)}
                    </p>
                    <p className="text-xs text-white/60">
                      {lessonWhen(l)} · {t.student}:{" "}
                      {l.person?.name ?? shortId(l.personId)}
                    </p>
                    {l.price > 0 && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-white/50">
                        <PriceTag amount={l.price} />
                        <span>
                          {t.commissionLine.replace(
                            "{pct}",
                            String(l.commissionPct),
                          )}{" "}
                          (−
                          <PriceTag amount={l.commissionClp} />)
                        </span>
                        <span className="font-medium text-white/70">
                          {t.netLine}{" "}
                          <PriceTag amount={l.netClp} />
                        </span>
                        {/* Liquidación de la comisión - el instructor ve
                            si la academia ya la pagó (marca del owner). */}
                        {l.commissionPct > 0 && (
                          <Badge
                            variant={l.commissionPaidAt ? "neon" : "muted"}
                          >
                            {l.commissionPaidAt
                              ? t.commissionPaid
                              : t.commissionPending}
                          </Badge>
                        )}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusVariant(l.status)}>
                    {statusLabel(l.status)}
                  </Badge>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p role="status" aria-live="polite" className="text-sm text-neon">
        {feedback}
      </p>
    </div>
  );
}

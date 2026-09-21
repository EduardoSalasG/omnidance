"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import academyExtras from "@/i18n/parts/academyExtras.json";
import { inputCls, readError, type Academy } from "./shared";

const t = academyExtras.academyExtras.lessons;

function statusLabel(status: string): string {
  return (t.status as Record<string, string>)[status] ?? status;
}

type LoadState = "loading" | "ready" | "error";

/**
 * PrivateLesson — espejo del schema + join manual del controller.
 * GET /academies/:id/private-lessons agrega `person`/`instructor`
 * ({id, name}); GET /private-lessons/mine devuelve la fila cruda.
 * status es String libre: REQUESTED | CONFIRMED | DONE | CANCELLED.
 */
type PrivateLesson = {
  id: string;
  academyId: string;
  instructorId: string; // personId del instructor
  personId: string; // alumno
  scheduledAt: string; // ISO
  price: number;
  status: string;
  person?: { id: string; name: string | null };
  instructor?: { id: string; name: string | null };
};

type Me = { id: string; name: string | null; roles: string[] };

/** GET /academies/:id (requireManage) incluye instructors:[{personId}]. */
type AcademyDetail = Academy & { instructors?: { personId: string }[] };

/** GET /academies (directorio autenticado): incluye instructores con nombre. */
type DirectoryAcademy = {
  id: string;
  name: string;
  instructors: { id: string; personId: string; name: string | null }[];
};

type LessonAction = "confirm" | "cancel" | "done" | "reschedule";

type Props = {
  /**
   * Academia seleccionada en la página → vista staff (lista + acciones).
   * Sin academy → solo vista alumno.
   */
  academy?: Academy;
  /** Academias ya cargadas en la página — options del select de solicitud. */
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
 * Clases particulares 1:1. Dos vistas según el contexto de la página:
 * - staff (academy): GET /academies/:id/private-lessons + PATCH
 *   /private-lessons/:id {action} — confirm/done/reschedule para instructor
 *   de la clase u owner(ADMIN); cancel para alumno u owner (el instructor
 *   no cancela, igual que el controller).
 * - alumno: GET /private-lessons/mine + cancel propia (REQUESTED/CONFIRMED)
 *   + form POST /academies/:id/private-lessons {instructorId, scheduledAt,
 *   price?}. El select de academia/instructor se alimenta de GET /academies
 *   (directorio autenticado con nombres de instructor); las academias staff
 *   que no estén en el directorio resuelven instructores vía GET
 *   /academies/:id (requireManage).
 */
export function PrivateLessons({ academy, academies = [] }: Props) {
  const tc = useTranslations("common");

  const [me, setMe] = useState<Me | null>(null);

  // ─── vista staff ───
  const [lessons, setLessons] = useState<PrivateLesson[]>([]);
  const [staffState, setStaffState] = useState<LoadState>("loading");

  // ─── vista alumno ───
  const [mine, setMine] = useState<PrivateLesson[]>([]);
  const [mineState, setMineState] = useState<LoadState>("loading");

  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reschedId, setReschedId] = useState<string | null>(null);
  const [reschedWhen, setReschedWhen] = useState("");

  // ─── formulario de solicitud ───
  const [reqAcademyId, setReqAcademyId] = useState("");
  const [directory, setDirectory] = useState<DirectoryAcademy[]>([]);
  const [instructors, setInstructors] = useState<
    { personId: string; name?: string | null }[]
  >([]);
  const [instrLoading, setInstrLoading] = useState(false);
  const [reqInstructorId, setReqInstructorId] = useState("");
  const [reqWhen, setReqWhen] = useState("");
  const [reqPrice, setReqPrice] = useState("");
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/me")
      .then(async (res) => (res.ok ? ((await res.json()) as Me) : null))
      .then(setMe)
      .catch(() => {});
    apiFetch("/academies")
      .then(async (res) =>
        res.ok ? ((await res.json()) as DirectoryAcademy[]) : [],
      )
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }, []);

  const loadMine = useCallback(async () => {
    setMineState("loading");
    try {
      const res = await apiFetch("/private-lessons/mine");
      if (!res.ok) {
        setMineState("error");
        return;
      }
      setMine((await res.json()) as PrivateLesson[]);
      setMineState("ready");
    } catch {
      setMineState("error");
    }
  }, []);

  const loadStaff = useCallback(async () => {
    if (!academy) return;
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
    void loadMine();
  }, [loadMine]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  // Nombres de instructor cosechados del join de la lista staff (+ yo mismo):
  // GET /academies/:id solo devuelve personIds, sin nombres.
  const instructorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lessons) {
      if (l.instructor?.name) map.set(l.instructorId, l.instructor.name);
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

  // Academias del form: el directorio (todas las activas) cuando cargó;
  // si falla, las academias prop de la página (contexto staff).
  const formAcademies = directory.length
    ? directory
    : academies.map((a) => ({ id: a.id, name: a.name, instructors: [] }));

  // Instructores de la academia elegida: del directorio si está (ya trae
  // nombres); si no, GET /academies/:id (contexto staff — requireManage).
  useEffect(() => {
    setInstructors([]);
    setReqInstructorId("");
    if (!reqAcademyId) return;
    const dir = directory.find((a) => a.id === reqAcademyId);
    if (dir) {
      setInstructors(dir.instructors);
      return;
    }
    let cancelled = false;
    setInstrLoading(true);
    apiFetch(`/academies/${reqAcademyId}`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as AcademyDetail) : null,
      )
      .then((detail) => {
        if (cancelled) return;
        setInstructors(detail?.instructors ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setInstrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reqAcademyId, directory]);

  async function act(
    id: string,
    action: LessonAction,
    scheduledAt?: string,
  ): Promise<void> {
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await apiFetch(`/private-lessons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(scheduledAt ? { scheduledAt } : {}),
        }),
      });
      if (!res.ok) {
        setFeedback((await readError(res)) ?? tc("error"));
        return;
      }
      setFeedback(t.updated);
      setReschedId(null);
      setReschedWhen("");
      await Promise.all([loadStaff(), loadMine()]);
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

  async function submitRequest(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!reqAcademyId || !reqInstructorId || !reqWhen) return;
    setReqBusy(true);
    setReqError(null);
    setFeedback(null);
    try {
      const res = await apiFetch(
        `/academies/${reqAcademyId}/private-lessons`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instructorId: reqInstructorId,
            scheduledAt: new Date(reqWhen).toISOString(),
            ...(reqPrice.trim()
              ? { price: Number.parseInt(reqPrice, 10) || 0 }
              : {}),
          }),
        },
      );
      if (!res.ok) {
        setReqError((await readError(res)) ?? tc("error"));
        return;
      }
      setFeedback(t.requested);
      setReqInstructorId("");
      setReqWhen("");
      setReqPrice("");
      await loadMine();
    } catch {
      setReqError(tc("error"));
    } finally {
      setReqBusy(false);
    }
  }

  /**
   * Matriz de acciones del controller:
   * confirm/done/reschedule → instructor de la clase u owner(ADMIN).
   * cancel → alumno (REQUESTED/CONFIRMED) u owner (cualquier no cancelada);
   * el instructor no cancela. En UI solo se ofrece cancelar estados activos.
   */
  function staffActions(l: PrivateLesson) {
    const isOwner =
      !!me && (me.roles.includes("ADMIN") || me.id === academy?.ownerId);
    const isInstructor = !!me && l.instructorId === me.id;
    const isStudent = !!me && l.personId === me.id;
    const active = l.status === "REQUESTED" || l.status === "CONFIRMED";
    return {
      confirm: (isOwner || isInstructor) && l.status === "REQUESTED",
      done: (isOwner || isInstructor) && l.status === "CONFIRMED",
      reschedule: (isOwner || isInstructor) && active,
      cancel: active && (isOwner || isStudent),
    };
  }

  function rescheduleSubmit(e: React.FormEvent, id: string): void {
    e.preventDefault();
    if (!reschedWhen) return;
    void act(id, "reschedule", new Date(reschedWhen).toISOString());
  }

  return (
    <div className="flex flex-col gap-6">
      {academy && (
        <section aria-label={t.title} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.title}</h2>
          {staffState === "loading" && <Spinner size="sm" className="page-loading" />}
          {staffState === "error" && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-white/60">{tc("error")}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadStaff()}
              >
                ↻ {tc("retry")}
              </Button>
            </div>
          )}
          {staffState === "ready" &&
            (lessons.length === 0 ? (
              <p className="text-sm text-white/50">{t.empty}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lessons.map((l) => {
                  const a = staffActions(l);
                  return (
                    <li key={l.id}>
                      <Card className="flex flex-col gap-3 p-4">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <Badge variant={statusVariant(l.status)}>
                            {statusLabel(l.status)}
                          </Badge>
                          <span className="font-medium tabular-nums">
                            {df.format(new Date(l.scheduledAt))}
                          </span>
                          {l.price > 0 && <PriceTag amount={l.price} />}
                        </div>
                        <p className="text-xs text-white/60">
                          {t.student}:{" "}
                          {l.person?.name ?? shortId(l.personId)} ·{" "}
                          {t.instructor}:{" "}
                          {l.instructor?.name ?? shortId(l.instructorId)}
                        </p>
                        {(a.confirm || a.done || a.reschedule || a.cancel) && (
                          <div className="flex flex-wrap gap-2">
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
                      </Card>
                    </li>
                  );
                })}
              </ul>
            ))}
        </section>
      )}

      <section aria-label={t.mineTitle} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.mineTitle}</h2>
        {mineState === "loading" && <Spinner size="sm" className="page-loading" />}
        {mineState === "error" && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-white/60">{tc("error")}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadMine()}
            >
              ↻ {tc("retry")}
            </Button>
          </div>
        )}
        {mineState === "ready" &&
          (mine.length === 0 ? (
            <p className="text-sm text-white/50">{t.emptyMine}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mine.map((l) => {
                const active =
                  l.status === "REQUESTED" || l.status === "CONFIRMED";
                return (
                  <li key={l.id}>
                    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {academyNames.get(l.academyId) ??
                            shortId(l.academyId)}
                        </p>
                        <p className="text-xs text-white/60">
                          {df.format(new Date(l.scheduledAt))} ·{" "}
                          {t.instructor}:{" "}
                          {instructorNames.get(l.instructorId) ??
                            l.instructor?.name ??
                            shortId(l.instructorId)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(l.status)}>
                          {statusLabel(l.status)}
                        </Badge>
                        {l.price > 0 && <PriceTag amount={l.price} />}
                        {active && (
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
                    </Card>
                  </li>
                );
              })}
            </ul>
          ))}

        {formAcademies.length > 0 ? (
          <Card>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {t.requestTitle}
            </h3>
            <form
              onSubmit={submitRequest}
              className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/50">
                  {t.academy}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <select
                  className={inputCls}
                  value={reqAcademyId}
                  onChange={(e) => setReqAcademyId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    —
                  </option>
                  {formAcademies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/50">
                  {t.instructor}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <select
                  className={inputCls}
                  value={reqInstructorId}
                  onChange={(e) => setReqInstructorId(e.target.value)}
                  disabled={!reqAcademyId || instrLoading}
                  required
                >
                  <option value="" disabled>
                    {instrLoading ? tc("loading") : "—"}
                  </option>
                  {instructors.map((i) => (
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
                  value={reqWhen}
                  onChange={(e) => setReqWhen(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/50">
                  {t.priceOptional}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  className={inputCls}
                  value={reqPrice}
                  onChange={(e) => setReqPrice(e.target.value)}
                />
              </label>
              {reqError && (
                <p role="alert" className="text-sm text-red-400 sm:col-span-2">
                  {reqError}
                </p>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" disabled={reqBusy}>
                  {reqBusy ? tc("loading") : t.submit}
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <p className="text-xs text-white/50">{t.noAcademies}</p>
        )}
      </section>

      <p role="status" aria-live="polite" className="text-sm text-neon">
        {feedback}
      </p>
    </div>
  );
}

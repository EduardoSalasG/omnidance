"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Badge, Button, Card, Pager, PriceTag, RefreshIcon } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import academyExtras from "@/i18n/parts/academyExtras.json";
import {
  academyEntity,
  filterQuery,
  inputCls,
  readError,
  type Academy,
  type FilterOption,
} from "./shared";

const t = academyExtras.academyExtras.lessons;

// Entidad `private_lessons` del catálogo sin el scope (la página fija la
// academia) - status, instructorId y from/to con la misma semántica del
// query engine (spec analytics/query-console). La relación económica del
// profesor (acuerdo: por clase, mensual o comisión) se gestiona en equipo.
const LESSONS_ENTITY = academyEntity("private_lessons");

function statusLabel(status: string): string {
  return (t.status as Record<string, string>)[status] ?? status;
}

type LoadState = "loading" | "ready" | "error";

const PAGE_SIZE = 20;

/**
 * PrivateLesson - espejo del schema + join manual del controller.
 * GET /academies/:id/private-lessons agrega `person`/`instructor`
 * ({id, name} | null).
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
};

/** GET /academies/:id (requireManage) incluye instructors:[{personId}]. */
type AcademyDetail = Academy & { instructors?: { personId: string }[] };

/** GET /academies (directorio autenticado): incluye instructores con nombre. */
type DirectoryAcademy = {
  id: string;
  name: string;
  instructors: { id: string; personId: string; name: string | null }[];
};

type LessonAction = "confirm" | "cancel" | "done" | "reschedule" | "assign";

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
 * particulares): solo solicitudes + agendamiento. PATCH
 * /private-lessons/:id {action} - assign (owner: instructor+fecha a las
 * compradas "por asignar"), confirm/reschedule para instructor de
 * la clase u owner(ADMIN); done solo el instructor (la asistencia la
 * marca quien la dictó, no el owner); cancel para alumno u owner.
 * La vista alumno NO vive acá: sus particulares aparecen en reservadas
 * de /clases (particulares-en-reservadas).
 */
export function PrivateLessons({ academy }: Props) {
  const tc = useTranslations("common");

  // /me compartido (MeProvider) - sin fetch propio.
  const { me } = useMe();

  const [lessons, setLessons] = useState<PrivateLesson[]>([]);
  const [total, setTotal] = useState(0);
  // Conteos de la cola REQUESTED de toda la academia (el API los manda
  // en el envelope, independientes del filtro activo).
  const [pending, setPending] = useState<{
    toAssign: number;
    toConfirm: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [staffState, setStaffState] = useState<LoadState>("loading");
  const [staffFilters, setStaffFilters] = useState<QueryFilters>({});

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

  const loadStaff = useCallback(async () => {
    setStaffState("loading");
    try {
      const qs = filterQuery(staffFilters);
      const res = await apiFetch(
        `/academies/${academy.id}/private-lessons${qs}${qs ? "&" : "?"}page=${page}&pageSize=${PAGE_SIZE}`,
      );
      if (!res.ok) {
        setStaffState("error");
        return;
      }
      const data = (await res.json()) as {
        items: PrivateLesson[];
        total: number;
        pending?: { toAssign: number; toConfirm: number };
      };
      setLessons(data.items);
      setTotal(data.total);
      setPending(data.pending ?? { toAssign: 0, toConfirm: 0 });
      setStaffState("ready");
    } catch {
      setStaffState("error");
    }
  }, [academy, staffFilters, page]);

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

  // Opciones del filtro instructorId: roster de la academia (+ nombres
  // cosechados del join de la lista) - mismo origen que el select de
  // asignación, no /query/options.
  const instructorOptions = useMemo<FilterOption[]>(() => {
    const seen = new Map<string, string>();
    for (const i of academyInstructors) {
      seen.set(
        i.personId,
        i.name ?? instructorNames.get(i.personId) ?? shortId(i.personId),
      );
    }
    for (const [id, name] of instructorNames) {
      if (!seen.has(id)) seen.set(id, name);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [academyInstructors, instructorNames]);

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
      await loadStaff();
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
   * confirm/reschedule → instructor de la clase u owner(ADMIN).
   * done → solo el instructor de la clase: la asistencia/la realizada la
   * marca quien la dictó - el owner no la expone (backend: 403).
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
      done: isInstructor && l.status === "CONFIRMED",
      reschedule: (isOwner || isInstructor) && active && !!l.scheduledAt,
      cancel: active && (isOwner || isStudent),
    };
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
          {/* KPIs de la cola pendiente: REQUESTED sin instructor/fecha
              (por asignar) y asignadas esperando confirm. Mismo lenguaje
              visual que AcademyKpiCards (label uppercase + número
              grande); warn = la cola requiere acción. */}
          {staffState === "ready" && pending !== null && (
            <ul
              aria-label={t.pendingTitle}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {(
                [
                  [t.toAssign, pending.toAssign],
                  [t.pendingConfirm, pending.toConfirm],
                ] as const
              ).map(([label, value]) => (
                <li key={label}>
                  <Card className="flex h-full flex-col gap-1 p-4">
                    <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                      {label}
                    </span>
                    <span
                      className={`text-3xl font-bold leading-none tabular-nums ${
                        value > 0 ? "text-warn" : "text-ink/60"
                      }`}
                    >
                      {value}
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          <FilterBar
            entity={LESSONS_ENTITY}
            filters={staffFilters}
            onChange={(f) => {
              setStaffFilters(f);
              setPage(1);
            }}
            options={{ academyInstructors: instructorOptions }}
          />
          {staffState === "loading" && <SkeletonList items={2} lines={1} />}
          {staffState === "error" && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-ink/60">{tc("error")}</p>
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
              <p className="text-sm text-ink/50">{t.empty}</p>
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
                        <p className="text-xs text-ink/60">
                          {t.student}:{" "}
                          {l.person?.name ?? shortId(l.personId)} ·{" "}
                          {t.instructor}: {lessonInstructor(l)}
                        </p>
                        {(a.assign ||
                          a.confirm ||
                          a.done ||
                          a.reschedule ||
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
                            {a.cancel && (
                              /* Destructivo sutil en el action row:
                                 borde + texto rojo tenue (misma regla
                                 de las zonas destructivas: red-400/80
                                 → red-400 en hover). Button.ghost no
                                 aplica porque sus colores ganarían por
                                 especificidad de la variante. */
                              <button
                                type="button"
                                disabled={busyId === l.id}
                                onClick={() => cancel(l.id)}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-400/30 px-4 text-sm font-semibold text-red-400/80 transition-colors transition-transform hover:border-red-400/60 hover:text-red-400 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon disabled:pointer-events-none disabled:opacity-50"
                              >
                                {t.cancel}
                              </button>
                            )}
                          </div>
                        )}
                        {reschedId === l.id && (
                          <form
                            onSubmit={(e) => rescheduleSubmit(e, l.id)}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-ink/50">
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
                              <span className="text-xs text-ink/50">
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
                              <span className="text-xs text-ink/50">
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
          {staffState === "ready" && lessons.length > 0 && (
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={setPage}
            />
          )}
      </section>

      <p role="status" aria-live="polite" className="text-sm text-neon">
        {feedback}
      </p>
    </div>
  );
}

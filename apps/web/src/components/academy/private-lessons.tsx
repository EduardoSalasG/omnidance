"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useMessages, useTranslations } from "next-intl";
import type { QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Badge, Button, Card, ConfirmSheet, Pager, PriceTag, RefreshIcon, Spinner } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { FilterBar } from "@/components/query/FilterBar";

import {
  academyEntity,
  filterQuery,
  inputCls,
  readError,
  shortId,
  type Academy,
  type FilterOption,
} from "./shared";
import { getDateFmt, useDateFmt } from "@/lib/intl";
import { useConsolePageSize } from "@/lib/console-page-size";

const df = (locale: string) => getDateFmt(locale, {
  dateStyle: "medium",
  timeStyle: "short",
});

// Entidad `private_lessons` del catálogo sin el scope (la página fija la
// academia) - status, instructorId y from/to con la misma semántica del
// query engine (spec analytics/query-console). La relación económica del
// profesor (acuerdo: por clase, mensual o comisión) se gestiona en equipo.
type AcademyExtras = (typeof import("@/i18n/parts/academyExtras.json"))["academyExtras"];

const LESSONS_ENTITY = academyEntity("private_lessons");

function statusLabel(
  t: { status: Record<string, string> },
  status: string,
): string {
  return t.status[status] ?? status;
}

type LoadState = "loading" | "ready" | "error";

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

/** GET /academies/:id (requireManage) incluye instructors:[{personId,name}]. */
type AcademyDetail = Academy & {
  instructors?: { personId: string; name?: string | null }[];
};

type LessonAction = "confirm" | "cancel" | "done" | "reschedule" | "assign";

type Props = {
  /** Academia de la consola staff (obligatoria - la vista alumno vive
      en reservadas de /clases, particulares-en-reservadas). */
  academy: Academy;
};

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
  const locale = useLocale();
  const t = (useMessages() as { academyExtras: AcademyExtras }).academyExtras.lessons;
  const tc = useTranslations("common");
  const tq = useTranslations("query");
  // Key nueva academyExtras.lessons.instructorsError (en camino al
  // catálogo): acceso opcional para no romper el typecheck mientras.
  const tExtra = t as { instructorsError?: string };

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
  // Paginación 20 desktop / 10 mobile (regla de listas pesadas,
  // lib/console-page-size). Cambio de viewport → vuelve a página 1.
  const pageSize = useConsolePageSize();
  useEffect(() => setPage(1), [pageSize]);
  const [staffState, setStaffState] = useState<LoadState>("loading");
  const [staffFilters, setStaffFilters] = useState<QueryFilters>({});

  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Cancelar clase particular pide confirmación destructiva (sheet,
  // no window.confirm).
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);
  const [reschedId, setReschedId] = useState<string | null>(null);
  const [reschedWhen, setReschedWhen] = useState("");

  // ─── asignación (owner): lección comprada sin instructor/fecha ───
  const [assignId, setAssignId] = useState<string | null>(null);
  const [assignInstructorId, setAssignInstructorId] = useState("");
  const [assignWhen, setAssignWhen] = useState("");

  // Instructores de la academia del contexto staff - para el select de
  // asignación. GET /academies/:id ya trae los nombres - el directorio
  // completo era un request extra solo por ellos.
  const [academyInstructors, setAcademyInstructors] = useState<
    { personId: string; name?: string | null }[]
  >([]);
  // Fallo del fetch de instructores: sin él el select de asignación
  // quedaba vacío en silencio - el hint avisa bajo el select.
  const [instructorsError, setInstructorsError] = useState(false);

  useEffect(() => {
    setInstructorsError(false);
    apiFetch(`/academies/${academy.id}`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as AcademyDetail) : null,
      )
      .then((detail) => {
        if (!detail) {
          setInstructorsError(true);
          return;
        }
        setAcademyInstructors(
          (detail.instructors ?? []).map((i) => ({
            personId: i.personId,
            name: i.name ?? null,
          })),
        );
      })
      .catch(() => setInstructorsError(true));
  }, [academy]);

  const loadStaff = useCallback(async () => {
    setStaffState("loading");
    try {
      const qs = filterQuery(staffFilters);
      const res = await apiFetch(
        `/academies/${academy.id}/private-lessons${qs}${qs ? "&" : "?"}page=${page}&pageSize=${pageSize}`,
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
  }, [academy, staffFilters, page, pageSize]);

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
    setNotice(null);
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
        setNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        return;
      }
      setNotice({ text: action === "assign" ? t.assigned : t.updated });
      setReschedId(null);
      setReschedWhen("");
      setAssignId(null);
      setAssignInstructorId("");
      setAssignWhen("");
      await loadStaff();
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setBusyId(null);
    }
  }

  function cancel(id: string): void {
    void act(id, "cancel").finally(() => setPendingCancel(null));
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
    l.scheduledAt ? df(locale).format(new Date(l.scheduledAt)) : t.toSchedule;

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
              grande); warn = la cola requiere acción. Se mantienen
              montados durante el refetch (con datos previos) para que
              el cambio de filtros no parpadee la sección. */}
          {pending !== null && staffState !== "error" && (
            <ul
              aria-label={t.pendingTitle}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {(
                [
                  [t.toAssign, pending.toAssign, t.toAssignHint],
                  [t.pendingConfirm, pending.toConfirm, t.pendingConfirmHint],
                ] as const
              ).map(([label, value, hint]) => (
                <li key={label}>
                  <Card
                    className="flex h-full flex-col gap-1 p-4"
                    title={hint}
                    aria-label={`${label}: ${value}. ${hint}`}
                  >
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
                    <span className="text-[11px] leading-tight text-ink/50">
                      {hint}
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
          {/* Skeleton solo en carga inicial: en refetch la lista
              anterior sigue visible (dim + aria-busy) - un skeleton
              que reemplaza datos ya pintados se percibe como parpadeo
              (estándar de carga percibida). */}
          {staffState === "loading" && lessons.length === 0 && (
            <SkeletonList items={2} lines={1} />
          )}
          {staffState === "error" && (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-ink/60">
                {tc("error")}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadStaff()}
              >
                <RefreshIcon /> {tc("retry")}
              </Button>
            </div>
          )}
          {staffState !== "error" &&
            (lessons.length === 0 && staffState === "ready" ? (
              // Con filtros activos el vacío es de la consulta, no de
              // la academia sin particulares.
              <p className="text-sm text-ink/50">
                {filterQuery(staffFilters) !== "" ? tq("empty") : t.empty}
              </p>
            ) : lessons.length === 0 ? null : (
              <ul
                aria-busy={staffState === "loading"}
                className={`grid grid-cols-1 gap-2 transition-opacity sm:grid-cols-2 ${
                  staffState === "loading" ? "opacity-60" : ""
                }`}
              >
                {lessons.map((l) => {
                  const a = staffActions(l);
                  return (
                    <li key={l.id}>
                      <Card className="flex h-full flex-col gap-3 p-4">
                        {/* Fila de identidad: estado + alumno a la
                            izquierda; precio y cancelar a la derecha
                            (el destructivo de lectura rápida vive en
                            la esquina, no en el action row). */}
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge variant={statusVariant(l.status)}>
                              {statusLabel(t, l.status)}
                            </Badge>
                            <span className="min-w-0 truncate font-medium">
                              {l.person?.name ?? shortId(l.personId)}
                            </span>
                          </div>
                          <span className="flex shrink-0 items-center gap-2">
                            {l.price > 0 && <PriceTag amount={l.price} />}
                            {a.cancel && (
                              /* Destructivo sutil junto al precio:
                                 borde + texto rojo tenue (misma regla
                                 de las zonas destructivas: red-400/80
                                 → red-400 en hover). Button.ghost no
                                 aplica porque sus colores ganarían por
                                 especificidad de la variante. */
                              <button
                                type="button"
                                disabled={busyId === l.id}
                                onClick={() => setPendingCancel(l.id)}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-400/30 px-3 text-sm font-semibold text-red-400/80 transition-colors transition-transform hover:border-red-400/60 hover:text-red-400 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon disabled:pointer-events-none disabled:opacity-50"
                              >
                                {busyId === l.id && <Spinner size="sm" />}
                                {t.cancel}
                              </button>
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-ink/60">
                          <span className="tabular-nums">
                            {lessonWhen(l)}
                          </span>
                          {" · "}
                          {t.instructor}: {lessonInstructor(l)}
                        </p>
                        {(a.assign ||
                          a.confirm ||
                          a.done ||
                          a.reschedule) && (
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
                                {busyId === l.id && <Spinner size="sm" />}
                                {t.assign}
                              </Button>
                            )}
                            {a.confirm && (
                              <Button
                                size="sm"
                                disabled={busyId === l.id}
                                onClick={() => void act(l.id, "confirm")}
                              >
                                {busyId === l.id && <Spinner size="sm" />}
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
                                {busyId === l.id && <Spinner size="sm" />}
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
                                {busyId === l.id && <Spinner size="sm" />}
                                {t.reschedule}
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
                              {busyId === l.id && <Spinner size="sm" />}
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
                              {instructorsError && (
                                <p role="alert" className="text-xs text-red-400">
                                  {tExtra.instructorsError ?? tc("error")}
                                </p>
                              )}
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
                              {busyId === l.id && <Spinner size="sm" />}
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
          {staffState !== "error" && lessons.length > 0 && (
            <Pager
              page={page}
              pageSize={pageSize}
              total={total}
              onPage={setPage}
            />
          )}
      </section>

      <ConfirmSheet
        open={pendingCancel !== null}
        title={t.confirmCancel}
        confirmLabel={t.cancel}
        busy={busyId !== null}
        onConfirm={() => pendingCancel && cancel(pendingCancel)}
        onClose={() => setPendingCancel(null)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { inputCls, readError } from "@/components/academy/shared";

// /clases — vista alumno: "Mis reservas" (GET /classes/mine, con cancelar)
// + explorador de clases de todas las academias (GET /classes/browse con
// filtros día/estilo/nivel) con reserva de cupo (POST/DELETE
// /classes/:id/book). Contratos verificados contra
// apps/api/src/academies/infrastructure/classes.controller.ts.

type LoadState = "loading" | "ready" | "error";

type StyleOption = { id: string; name: string; genre: string };
type LevelOption = { id: string; name: string; order: number };

type BrowseClass = {
  id: string;
  date: string; // ISO — el API materializa Class.date a medianoche UTC
  startTime: string; // "19:00"
  endTime: string;
  weekday: number; // 0-6, domingo = 0
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  waitlistCount: number;
  myBooking: "BOOKED" | "WAITLIST" | null;
  academy: { id: string; name: string };
  instructor: { id: string; name: string | null } | null;
  series: {
    id: string;
    name: string;
    level: { id: string; name: string } | null;
    style: { id: string; name: string } | null;
    dropInPrice: number | null;
    // Modalidad efectiva del horario: slot.types si declara, si no los de la serie.
    types: { id: string; name: string }[];
  } | null;
};

type MyBooking = {
  bookingId: string;
  status: "BOOKED" | "WAITLIST";
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  academy: { id: string; name: string };
  series: {
    name: string;
    level: { name: string } | null;
    style: { name: string } | null;
  } | null;
};

// GET /classes/mine?scope=past — historial del alumno (spec §9):
// asistencia prevalece sobre la reserva de la misma clase.
type HistoryItem = {
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  academy: { id: string; name: string };
  series: {
    name: string;
    level: { name: string } | null;
    style: { name: string } | null;
  } | null;
  status: "attended" | "booked" | "cancelled";
};

// Card compacta del explorador (misma receta que las listas del dominio).
const cardCls =
  "rounded-xl border border-night-700 bg-night-800/60 px-4 py-3";

// Class.date llega como ISO a medianoche UTC — formatear en UTC para que
// el día calendario no se corra en zonas horarias negativas (es-CL).
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

// Agrupación por día — misma gramática que /practicas y /locales: el
// encabezado del grupo lleva la fecha (Hoy/Mañana/sáb 20 sep) y el card
// solo la hora. La fecha de clase es UTC-midnight: su día calendario es
// el prefijo ISO; "hoy/mañana" se compara contra el día LOCAL en en-CA.
const classDayKey = (iso: string) => iso.slice(0, 10);
const localDayKey = (d: Date) => d.toLocaleDateString("en-CA");

function groupByDay<T extends { date: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = classDayKey(item.date);
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, items }));
}

// Orden del filtro de día: lunes → domingo (weekday 0 = domingo al final).
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

// Cancelar en dos taps: "Cancelar" → inline "¿Seguro? Sí / No". Un
// window.confirm rompe la inmersión de la PWA; inline respeta el sistema.
function CancelBookingButton({
  busy,
  onConfirm,
}: {
  busy: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {t("cancelBooking")}
      </Button>
    );
  }
  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={t("cancelConfirm")}
    >
      <span className="text-xs text-white/60">{t("cancelShort")}</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {tc("yes")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        {tc("no")}
      </Button>
    </div>
  );
}

export default function ClasesPage() {
  const t = useTranslations("classes");
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  const te = useTranslations("events");

  // Etiqueta del grupo: Hoy/Mañana o "sáb 20 sep" (UTC, ver dayFmt).
  const dayLabel = (key: string, iso: string) => {
    if (key === localDayKey(new Date())) return te("today");
    if (key === localDayKey(new Date(Date.now() + 86_400_000)))
      return te("tomorrow");
    return dayFmt.format(new Date(iso));
  };

  const [mine, setMine] = useState<MyBooking[] | null>(null);
  const [mineState, setMineState] = useState<LoadState>("loading");
  const [classes, setClasses] = useState<BrowseClass[] | null>(null);
  const [browseState, setBrowseState] = useState<LoadState>("loading");
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyState, setHistoryState] = useState<LoadState>("loading");

  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);

  // Filtros del explorador — "" = todos.
  const [weekday, setWeekday] = useState("");
  const [styleId, setStyleId] = useState("");
  const [levelId, setLevelId] = useState("");

  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  // busyId = classId en vuelo (book o cancel) — compartido entre secciones.
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    setMineState("loading");
    try {
      const res = await apiFetch("/classes/mine");
      if (!res.ok) {
        setMineState("error");
        return;
      }
      const rows = (await res.json()) as MyBooking[];
      // El API ordena por createdAt desc; para el alumno importa la fecha.
      rows.sort((a, b) =>
        `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
      );
      setMine(rows);
      setMineState("ready");
    } catch {
      setMineState("error");
    }
  }, []);

  const loadBrowse = useCallback(async () => {
    setBrowseState("loading");
    try {
      const params = new URLSearchParams({ days: "14" });
      if (weekday) params.set("weekday", weekday);
      if (styleId) params.set("styleId", styleId);
      if (levelId) params.set("levelId", levelId);
      const res = await apiFetch(`/classes/browse?${params.toString()}`);
      if (!res.ok) {
        setBrowseState("error");
        return;
      }
      setClasses((await res.json()) as BrowseClass[]);
      setBrowseState("ready");
    } catch {
      setBrowseState("error");
    }
  }, [weekday, styleId, levelId]);

  const loadHistory = useCallback(async () => {
    setHistoryState("loading");
    try {
      const res = await apiFetch("/classes/mine?scope=past");
      if (!res.ok) {
        setHistoryState("error");
        return;
      }
      setHistory((await res.json()) as HistoryItem[]);
      setHistoryState("ready");
    } catch {
      setHistoryState("error");
    }
  }, []);

  useEffect(() => {
    void loadMine();
    void loadHistory();
  }, [loadMine, loadHistory]);

  // Refetch al cambiar cualquier filtro (loadBrowse cambia de identidad).
  useEffect(() => {
    void loadBrowse();
  }, [loadBrowse]);

  // Catálogos de los selects — una vez; fallo silencioso (selects vacíos
  // no bloquean el explorador, igual que los fetch de apoyo en el resto
  // de la app).
  useEffect(() => {
    apiFetch("/styles")
      .then(async (res) => (res.ok ? ((await res.json()) as StyleOption[]) : []))
      .then(setStyles)
      .catch(() => {});
    apiFetch("/classes/catalogs")
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as { levels?: LevelOption[] })
          : null,
      )
      .then((c) => setLevels(c?.levels ?? []))
      .catch(() => {});
  }, []);

  async function book(cls: BrowseClass): Promise<void> {
    setBusyId(cls.id);
    setNotice(null);
    try {
      const res = await apiFetch(`/classes/${cls.id}/book`, {
        method: "POST",
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      // El body es la ClassBooking: status decide el mensaje de éxito.
      const booking = (await res.json()) as { status?: string };
      setNotice({
        text: booking.status === "WAITLIST" ? t("waitlistOk") : t("bookedOk"),
        error: false,
      });
      await Promise.all([loadBrowse(), loadMine()]);
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusyId(null);
    }
  }

  // La confirmación vive en CancelBookingButton (dos taps inline) — esta
  // función solo se invoca tras confirmar.
  async function cancelBooking(classId: string): Promise<void> {
    setBusyId(classId);
    setNotice(null);
    try {
      const res = await apiFetch(`/classes/${classId}/book`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      setNotice({ text: t("cancelledOk"), error: false });
      await Promise.all([loadBrowse(), loadMine()]);
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusyId(null);
    }
  }

  // Progreso personal del mes — asistencias de los últimos 30 días.
  const attended30d = (history ?? []).filter(
    (h) =>
      h.status === "attended" &&
      Date.now() - new Date(h.date).getTime() < 30 * 86_400_000,
  ).length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 py-6 sm:px-6">
      {/* ─── Mis reservas ─── */}
      <section aria-label={t("mine")} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("mine")}</h2>
        {mineState === "loading" && <Spinner size="sm" className="page-loading" />}
        {mineState === "error" && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-white/60">
              {tc("error")}
            </p>
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
          (mine && mine.length > 0 ? (
            <div className="flex flex-col gap-5">
              {groupByDay(mine).map((g) => (
                <section key={g.key}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
                    {dayLabel(g.key, g.items[0].date)}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {g.items.map((b) => (
                      <li key={b.bookingId} className={cardCls}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium">
                            {b.series?.name ?? b.academy.name}
                          </p>
                          <p className="shrink-0 text-sm font-medium tabular-nums text-white/70">
                            {b.startTime}–{b.endTime}
                          </p>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-white/60">
                          {b.academy.name}
                          {b.series?.level?.name
                            ? ` · ${b.series.level.name}`
                            : ""}
                          {b.series?.style?.name
                            ? ` · ${b.series.style.name}`
                            : ""}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Badge
                            variant={b.status === "BOOKED" ? "neon" : "outline"}
                          >
                            {b.status === "BOOKED"
                              ? t("booked")
                              : t("waitlist")}
                          </Badge>
                          <CancelBookingButton
                            busy={busyId === b.classId}
                            onConfirm={() => void cancelBooking(b.classId)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">{t("emptyMine")}</p>
          ))}
      </section>

      {/* ─── Explorar clases ─── */}
      <section aria-label={t("explore")} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("explore")}</h2>

        <div className="grid grid-cols-3 gap-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-white/50">{t("filterDay")}</span>
            <select
              className={inputCls}
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
            >
              <option value="">{t("all")}</option>
              {WEEKDAYS.map((d) => (
                <option key={d} value={String(d)}>
                  {ta(`weekday.${d}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-white/50">{t("filterStyle")}</span>
            <select
              className={inputCls}
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
            >
              <option value="">{t("all")}</option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-white/50">{t("filterLevel")}</span>
            <select
              className={inputCls}
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
            >
              <option value="">{t("all")}</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {browseState === "loading" && <Spinner size="sm" className="page-loading" />}
        {browseState === "error" && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-white/60">
              {tc("error")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadBrowse()}
            >
              ↻ {tc("retry")}
            </Button>
          </div>
        )}
        {browseState === "ready" &&
          (classes && classes.length > 0 ? (
            <div className="flex flex-col gap-5">
              {groupByDay(classes).map((g) => (
                <section key={g.key}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
                    {dayLabel(g.key, g.items[0].date)}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {g.items.map((cls) => {
                      const full = cls.spotsLeft <= 0;
                      return (
                        <li key={cls.id} className={cardCls}>
                          {/* Nombre + horario — el día lo da el grupo */}
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="truncate font-medium">
                              {cls.series?.name ?? cls.academy.name}
                            </p>
                            <p className="shrink-0 text-sm font-medium tabular-nums text-white/70">
                              {cls.startTime}–{cls.endTime}
                            </p>
                          </div>

                          {/* Meta: academia · profesor · nivel · estilo —
                              sin etiquetas, una línea que se trunca */}
                          <p className="mt-0.5 truncate text-xs text-white/60">
                            {cls.academy.name}
                            {cls.instructor?.name
                              ? ` · ${cls.instructor.name}`
                              : ""}
                            {cls.series?.level?.name
                              ? ` · ${cls.series.level.name}`
                              : ""}
                            {cls.series?.style?.name
                              ? ` · ${cls.series.style.name}`
                              : ""}
                            {cls.series && cls.series.types.length > 0
                              ? ` · ${cls.series.types.map((x) => x.name).join(" + ")}`
                              : ""}
                          </p>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <p
                              className={`text-xs font-medium ${
                                full
                                  ? "text-white/50"
                                  : cls.spotsLeft <= 3
                                    ? "text-amber-300"
                                    : "text-neon"
                              }`}
                            >
                              {full
                                ? cls.waitlistCount > 0
                                  ? `${t("full")} · ${t("waitlist")}: ${cls.waitlistCount}`
                                  : t("full")
                                : cls.spotsLeft <= 3
                                  ? t("lastSpots", { count: cls.spotsLeft })
                                  : t("spotsLeft", { count: cls.spotsLeft })}
                            </p>

                            {cls.myBooking === "BOOKED" ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="neon">{t("booked")}</Badge>
                                <CancelBookingButton
                                  busy={busyId === cls.id}
                                  onConfirm={() => void cancelBooking(cls.id)}
                                />
                              </div>
                            ) : cls.myBooking === "WAITLIST" ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">
                                  {t("waitlist")}
                                </Badge>
                                <CancelBookingButton
                                  busy={busyId === cls.id}
                                  onConfirm={() => void cancelBooking(cls.id)}
                                />
                              </div>
                            ) : full ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busyId === cls.id}
                                onClick={() => void book(cls)}
                              >
                                {t("joinWaitlist")}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                disabled={busyId === cls.id}
                                onClick={() => void book(cls)}
                              >
                                {t("book")}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">{t("empty")}</p>
          ))}
      </section>

      {/* ─── Historial — progreso personal, no competitivo (spec §9) ─── */}
      <section aria-label={t("history")} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("history")}</h2>
          {attended30d > 0 && (
            <p className="text-xs font-medium text-neon">
              {t("monthlyAttended", { count: attended30d })}
            </p>
          )}
        </div>
        {historyState === "loading" && (
          <Spinner size="sm" className="page-loading" />
        )}
        {historyState === "error" && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-white/60">
              {tc("error")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadHistory()}
            >
              ↻ {tc("retry")}
            </Button>
          </div>
        )}
        {historyState === "ready" &&
          (history && history.length > 0 ? (
            <div className="flex flex-col gap-5">
              {groupByDay(history).map((g) => (
                <section key={g.key}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
                    {dayLabel(g.key, g.items[0].date)}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {g.items.map((h) => (
                      <li key={h.classId} className={cardCls}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium">
                            {h.series?.name ?? h.academy.name}
                          </p>
                          <p className="shrink-0 text-sm font-medium tabular-nums text-white/70">
                            {h.startTime}–{h.endTime}
                          </p>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-white/60">
                            {h.academy.name}
                            {h.series?.level?.name
                              ? ` · ${h.series.level.name}`
                              : ""}
                            {h.series?.style?.name
                              ? ` · ${h.series.style.name}`
                              : ""}
                          </p>
                          <Badge
                            variant={
                              h.status === "attended"
                                ? "neon"
                                : h.status === "booked"
                                  ? "outline"
                                  : "muted"
                            }
                          >
                            {t(`historyStatus.${h.status}`)}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">{t("historyEmpty")}</p>
          ))}
      </section>

      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`text-sm ${notice.error ? "text-red-400" : "text-neon"}`}
        >
          {notice.text}
        </p>
      )}
    </main>
  );
}

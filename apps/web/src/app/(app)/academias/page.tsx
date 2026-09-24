"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { PrivateLessons } from "@/components/academy/private-lessons";
import EventsMap, { type MapVenue } from "@/components/events/EventsMap";

// /academias — "Mi Aprendizaje" del modo Academia (spec §9). Misma
// gramática de vistas que /clases y /eventos: estado en la URL
// (deep-linkable), íconos segmentados, filtros como chips.
//
// Vistas (scope):
// - `mias`: academias donde el dancer tiene inscripción — card con
//   estado/plan/asistencias/videos + link a la ficha /academias/:id.
// - `explorar`: el resto del directorio (enrolled=false) — card con
//   estilos impartidos, dirección y profesores.
// `map=1` cambia la lista por pins de las academias del scope activo;
// `style` filtra ambas vistas; `search=1`+`q` busca por nombre (explorar).
//
// Contratos: GET /academies (directorio enriquecido: description,
// address, lat/lng, styles derivados de series activas, enrolled),
// GET /academies/enrolled, GET /academies/:id/videos (gate learner).

type DirectoryAcademy = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  styles: { id: string; name: string; genre: string | null }[];
  instructors: { id: string; personId: string; name: string | null }[];
  enrolled: boolean;
};

type Enrollment = {
  id: string;
  academy: {
    id: string;
    name: string;
    active: boolean;
    address: string | null;
    lat: number | null;
    lng: number | null;
  };
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

type Scope = "mias" | "explorar";
type LoadState = "loading" | "ready" | "error";

// Búsqueda accent-insensitive: "gozadera" encuentra "La Gozadera",
// "nuñoa" encuentra "Nuñoa".
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

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

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/** Card de una inscripción: estado, plan, progreso del mes y videos.
    El nombre navega a la ficha pública de la academia. */
function MyAcademyCard({ enrollment }: { enrollment: Enrollment }) {
  // `tl` (no `t`): el audit i18n indexa por nombre de variable y el
  // archivo ya tiene un `t` con ns "academy" — mismo motivo que `tp`/`tv`.
  const tl = useTranslations("academy.learner");
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
        <Link
          href={`/academias/${enrollment.academy.id}`}
          className="font-semibold underline-offset-4 transition-colors hover:text-neon hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          {enrollment.academy.name}
        </Link>
        <Badge variant={statusVariant}>
          {tl(`status.${enrollment.status}`)}
        </Badge>
      </div>

      {enrollment.academy.address && (
        <p className="flex items-center gap-1.5 text-sm text-white/50">
          <PinIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{enrollment.academy.address}</span>
        </p>
      )}

      {enrollment.plan && (
        <p className="text-sm text-white/60">
          {enrollment.plan.name}
          {tp.has(enrollment.plan.type) ? ` · ${tp(enrollment.plan.type)}` : ""}
        </p>
      )}

      {enrollment.attendance30d > 0 && (
        <p className="text-sm font-medium text-neon">
          {tl("attendance30d", { count: enrollment.attendance30d })}
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
        {tl("reserveCta")}
        <span aria-hidden>→</span>
      </Link>
    </Card>
  );
}

/** Card del directorio (explorar): nombre, dirección, estilos que
    imparte y profesores — el card completo navega a la ficha. */
function AcademyCard({ academy }: { academy: DirectoryAcademy }) {
  const t = useTranslations("academy");
  return (
    <Link
      href={`/academias/${academy.id}`}
      className="block rounded-2xl transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
    >
      <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-neon/40">
        <h3 className="font-semibold leading-tight">{academy.name}</h3>
        {academy.styles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {academy.styles.map((s) => (
              <Badge
                key={s.id}
                variant="muted"
                className="normal-case tracking-normal"
              >
                {s.name}
              </Badge>
            ))}
          </div>
        )}
        {academy.address && (
          <p className="flex items-center gap-1.5 text-sm text-white/50">
            <PinIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{academy.address}</span>
          </p>
        )}
        {academy.instructors.length > 0 && (
          <p className="text-sm text-white/50">
            {t("instructorsLabel")}:{" "}
            {academy.instructors
              .map((i) => i.name)
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </Card>
    </Link>
  );
}

// useSearchParams exige Suspense en el componente client-side.
export default function AcademiasPage() {
  return (
    <Suspense>
      <AcademiasInner />
    </Suspense>
  );
}

function AcademiasInner() {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── Estado en URL (mismo patrón que /clases y /eventos) ───
  const rawView = searchParams.get("v");
  const isMap = searchParams.get("map") === "1";
  const styleId = searchParams.get("style") ?? "";
  const query = searchParams.get("q") ?? "";
  const searchOpen = searchParams.get("search") === "1";

  const hrefFor = (o: {
    v?: string | null;
    map?: string | null;
    style?: string | null;
    q?: string | null;
    search?: string | null;
  }) => {
    const merged = {
      v: rawView || undefined,
      map: isMap ? "1" : undefined,
      style: styleId || undefined,
      q: query || undefined,
      search: searchOpen ? "1" : undefined,
      ...o,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/academias${qs ? `?${qs}` : ""}`;
  };

  const [academies, setAcademies] = useState<DirectoryAcademy[] | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void Promise.all([
      apiFetch("/academies").then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setAcademies((await res.json()) as DirectoryAcademy[]);
      }),
      apiFetch("/academies/enrolled").then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setEnrollments((await res.json()) as Enrollment[]);
      }),
    ])
      .then(() => setState("ready"))
      .catch(() => setState("error"));
  }, []);

  // Autofocus al abrir el buscador (la lupa explícita pide el campo).
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Scope: por defecto "mias" si hay inscripciones; sin ellas la vista
  // útil es el directorio — evita una pantalla vacía de entrada.
  const scope: Scope =
    rawView === "explorar" || rawView === "mias"
      ? rawView
      : enrollments !== null && enrollments.length === 0
        ? "explorar"
        : "mias";

  // Pool del scope: el directorio es la fuente única (enrolled flag).
  // En "mias" se cruza con /enrolled para los datos de inscripción.
  const dirPool = academies ?? [];
  const scopeAcademies =
    scope === "mias"
      ? dirPool.filter((a) => a.enrolled)
      : dirPool.filter((a) => !a.enrolled);

  // Filtro de estilo: opciones = estilos presentes en el pool del scope
  // (elegir un estilo sin academias no produce resultados).
  const styleOptions = (() => {
    const m = new Map<string, string>();
    for (const a of scopeAcademies)
      for (const s of a.styles) if (!m.has(s.id)) m.set(s.id, s.name);
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  })();

  const filtered = scopeAcademies.filter(
    (a) =>
      (!styleId || a.styles.some((s) => s.id === styleId)) &&
      (scope !== "explorar" || !query || norm(a.name).includes(norm(query))),
  );

  // Pins del mapa: academias del scope filtrado con coords publicadas.
  const mapPins: MapVenue[] = filtered
    .filter((a) => a.lat != null && a.lng != null)
    .map((a) => ({
      id: a.id,
      name: a.name,
      address: a.address,
      lat: a.lat!,
      lng: a.lng!,
      eventCount: 0,
      href: `/academias/${a.id}`,
    }));

  const chipClass = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
      active
        ? "border-neon bg-neon/15 text-neon"
        : "border-white/15 text-white/60 hover:border-white/30 hover:text-white"
    }`;
  const iconBtn = (active: boolean) =>
    `inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.97] ${
      active ? "bg-neon text-night-950" : "text-white/60 hover:text-white"
    }`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 pb-6 pt-3">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("directoryTitle")}</h1>
          <div className="flex items-center gap-2">
            {/* Toggle lista/mapa — display del scope activo, íconos
                segmentados como las vistas de /clases */}
            <div
              role="group"
              aria-label={t("viewsLabel")}
              className="flex items-center rounded-full border border-white/15 p-0.5"
            >
              <Link
                href={hrefFor({ map: null })}
                aria-label={t("viewList")}
                aria-current={!isMap ? "true" : undefined}
                className={iconBtn(!isMap)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                </svg>
              </Link>
              <Link
                href={hrefFor({ map: "1" })}
                aria-label={t("viewMap")}
                aria-current={isMap ? "true" : undefined}
                className={iconBtn(isMap)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 6v15l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
                  <path d="M8 2v15M16 6v15" />
                </svg>
              </Link>
            </div>
            {/* Explorar — scope aparte como en /clases: ON = resto del
                directorio, OFF = mis academias (vuelve al default) */}
            <Link
              href={hrefFor(
                scope === "explorar"
                  ? { v: "mias", q: null, search: null }
                  : { v: "explorar" },
              )}
              aria-label={t("viewExplore")}
              aria-current={scope === "explorar" ? "true" : undefined}
              className={`${iconBtn(scope === "explorar")} border border-white/15`}
            >
              {/* brújula — mismo ícono que "explorar" en /clases */}
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z" />
              </svg>
            </Link>
            {/* Lupa — buscar por nombre, solo en explorar */}
            {scope === "explorar" && (
              <Link
                href={hrefFor({
                  search: searchOpen ? null : "1",
                  q: searchOpen ? null : query || null,
                })}
                aria-label={t("searchName")}
                aria-current={searchOpen ? "true" : undefined}
                className={`${iconBtn(searchOpen)} border border-white/15`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {/* Filtro de estilo — aplica a ambas vistas (y a los pins del
            mapa): las academias exponen los estilos que imparten. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative shrink-0">
            <select
              aria-label={t("filterStyle")}
              value={styleId}
              onChange={(e) =>
                router.push(hrefFor({ style: e.target.value || null }))
              }
              className={`${chipClass(!!styleId)} max-w-40 cursor-pointer appearance-none truncate bg-transparent pr-8`}
            >
              <option value="">{t("filterStyle")}</option>
              {styleOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${styleId ? "text-neon" : "text-white/40"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>

        {/* Buscador por nombre — la lupa lo revela en explorar; se
            escribe en la URL (router.replace para no ensuciar history). */}
        {scope === "explorar" && searchOpen && (
          <div className="relative">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) =>
                router.replace(hrefFor({ q: e.target.value || null }))
              }
              placeholder={t("searchName")}
              aria-label={t("searchName")}
              className="min-h-11 w-full rounded-full border border-white/15 bg-night-800 pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:border-neon focus:outline-none"
            />
          </div>
        )}
      </header>

      {state === "loading" && <Spinner size="sm" className="page-loading" />}
      {state === "error" && (
        <p role="alert" className="text-sm text-white/60">
          {tc("error")}
        </p>
      )}

      {state === "ready" &&
        (isMap ? (
          /* ─── Mapa del scope activo — pins a la ficha /academias/:id ─── */
          <section aria-label={t("viewMap")}>
            {mapPins.length === 0 ? (
              <p className="text-sm text-white/50">{t("noLocation")}</p>
            ) : (
              <div className="h-[62dvh] min-h-[360px] w-full overflow-hidden rounded-2xl border border-night-700">
                <EventsMap venues={mapPins} />
              </div>
            )}
          </section>
        ) : scope === "mias" ? (
          /* ─── Mis academias — inscripciones del dancer ─── */
          <section
            aria-label={t("learner.myAcademies")}
            className="flex flex-col gap-3"
          >
            {enrollments && enrollments.length > 0 ? (
              <ul className="grid gap-3">
                {enrollments
                  .filter((e) => {
                    // El filtro de estilo lee el directorio (styles
                    // derivados de las series activas de la academia).
                    const dir = dirPool.find((a) => a.id === e.academy.id);
                    return !styleId || dir?.styles.some((s) => s.id === styleId);
                  })
                  .map((e) => (
                    <li key={e.id}>
                      <MyAcademyCard enrollment={e} />
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-white/60">
                {t("directoryEmpty")}
              </p>
            )}
            {/* Vista alumno: mis solicitudes + form de clase particular. */}
            <PrivateLessons />
          </section>
        ) : (
          /* ─── Explorar — el resto del directorio ─── */
          <section
            aria-label={t("viewExplore")}
            className="flex flex-col gap-3"
          >
            {filtered.length === 0 ? (
              <p className="text-sm text-white/60">
                {styleId || query
                  ? t("exploreEmptyFiltered")
                  : t("exploreEmpty")}
              </p>
            ) : (
              <ul className="grid gap-3">
                {filtered.map((a) => (
                  <li key={a.id}>
                    <AcademyCard academy={a} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
    </main>
  );
}

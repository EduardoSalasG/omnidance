"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  PlayIcon,
  RefreshIcon,
  Segmented,
  Skeleton,
  SkeletonList,
} from "@/components/ui";
import EventsMap, { type MapVenue } from "@/components/events/EventsMap";
import { planDateFmt } from "@/components/academy/shared";

// /academias - "Mi Aprendizaje" del modo Academia (spec §9). Misma
// gramática que /clases: dos ejes independientes en la URL
// (deep-linkable) - `s` scope (mias|explorar) como pills con texto y
// `v` display (lista|mapa) como íconos segmentados; filtros como chips.
//
// Scopes:
// - `mias`: academias donde el dancer tiene inscripción - card con
//   estado/plan/asistencias/videos + link a la ficha /academias/:id.
// - `explorar`: el resto del directorio (enrolled=false) - card con
//   estilos impartidos, dirección y profesores.
// `v=map` cambia la lista por pins de las academias del scope activo;
// `style` filtra ambos scopes; `q` busca por nombre (explorar, siempre
// visible). Legado: `v=mias|explorar` era el scope y `map=1` el mapa.
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
    /** Mora SaaS (S3): la card histórica se mantiene con badge "no
        disponible" - no se oculta al alumno. */
    billingBlocked?: boolean;
  };
  status: "ACTIVE" | "PAUSED" | "TRIAL" | "FROZEN" | "ONLINE";
  plan: { name: string; type: string } | null;
  startedAt: string;
  /** "Pagado hasta" - null = sin fecha de término registrada. */
  endsAt: string | null;
  attendance30d: number;
  /** Suscripción Flow vigente del viewer en esta academia (la más
      reciente) - alimenta el badge "Suscripción"/"Se cancela el…". */
  subscription: {
    id: string;
    planId: string;
    status: string;
    nextInvoiceAt: string | null;
    canceledAt: string | null;
  } | null;
};

type AcademyVideo = {
  id: string;
  title: string;
  url?: string;
  locked?: boolean;
};

type Scope = "mias" | "explorar";
type Display = "list" | "map";
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
    El card completo navega a la ficha pública de la academia - el nombre
    es un stretched link (after:inset-0) y los links internos (videos)
    quedan por encima con z-10. */
function MyAcademyCard({ enrollment }: { enrollment: Enrollment }) {
  // `tl` (no `t`): el audit i18n indexa por nombre de variable y el
  // archivo ya tiene un `t` con ns "academy" - mismo motivo que `tp`/`tv`.
  const tl = useTranslations("academy.learner");
  const tp = useTranslations("academy.planTypes");
  const tv = useTranslations("academyExtras.videos");
  const tsb = useTranslations("subscriptions");
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
    <Card className="relative flex flex-col gap-3 p-4 transition-all hover:border-neon/40 has-[a:active]:scale-[0.99]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/academias/${enrollment.academy.id}`}
          className="font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          {enrollment.academy.name}
        </Link>
        <Badge variant={statusVariant}>
          {tl(`status.${enrollment.status}`)}
        </Badge>
        {enrollment.academy.billingBlocked && (
          // Mora SaaS del owner - la card sigue visible (historial) con
          // indicador honesto; la ficha explica el estado.
          <Badge variant="muted">{tl("academyUnavailable")}</Badge>
        )}
        {enrollment.subscription?.status === "ACTIVE" && (
          <Badge variant="outline" className="normal-case tracking-normal">
            {tsb("badge")}
          </Badge>
        )}
      </div>

      {/* Suscripción: CANCEL_PENDING muestra la fecha de fin real
          (endsAt del enrollment - "pagado hasta" - o el próximo cobro
          que Flow reporta); ACTIVATING/PENDING_CARD son transitorios. */}
      {enrollment.subscription?.status === "CANCEL_PENDING" &&
        (() => {
          const end =
            enrollment.endsAt ?? enrollment.subscription!.nextInvoiceAt;
          return (
            <p className="text-xs text-white/50">
              {end
                ? tsb("cancelPending", {
                    date: planDateFmt.format(new Date(end)),
                  })
                : tsb("cancelPendingNoDate")}
            </p>
          );
        })()}
      {(enrollment.subscription?.status === "ACTIVATING" ||
        enrollment.subscription?.status === "PENDING_CARD") && (
        <p className="text-xs text-white/50">{tsb("activating")}</p>
      )}

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

      {/* Vigencia del plan pagado: vencido en rojo; "hasta" cuando el
          staff no registró inicio; "desde" cuando no hay término. */}
      {(() => {
        const startD = enrollment.startedAt
          ? new Date(enrollment.startedAt)
          : null;
        const endD = enrollment.endsAt ? new Date(enrollment.endsAt) : null;
        if (!startD && !endD) return null;
        // "Pagado hasta el 12" incluye el día 12 - vence al día siguiente.
        const expired = !!endD && endD.getTime() < new Date().setHours(0, 0, 0, 0);
        return (
          <p className={`text-xs ${expired ? "text-red-400" : "text-white/50"}`}>
            {expired && endD
              ? tl("planExpired", { end: planDateFmt.format(endD) })
              : startD && endD
                ? tl("planRange", {
                    start: planDateFmt.format(startD),
                    end: planDateFmt.format(endD),
                  })
                : endD
                  ? tl("planUntil", { end: planDateFmt.format(endD) })
                  : tl("planSince", { start: planDateFmt.format(startD!) })}
          </p>
        );
      })()}

      {enrollment.attendance30d > 0 && (
        <p className="text-sm font-medium text-neon">
          {tl("attendance30d", { count: enrollment.attendance30d })}
        </p>
      )}

      {/* /videos fetch por card - sección opcional: nada hasta que
          resuelva (aparece una sola vez si hay videos); un skeleton que
          colapsa al vacío sería el flash que evitamos. */}
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
                <span className="sr-only">{tv("lockedHint")}</span>
              </li>
            ) : (
              <li key={v.id}>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative z-10 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-neon underline-offset-4 hover:underline"
                >
                  <PlayIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{v.title}</span>
                </a>
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  );
}

/** Card del directorio (explorar): nombre, dirección, estilos que
    imparte y profesores - el card completo navega a la ficha. */
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
  const tsb = useTranslations("subscriptions");
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── Estado en URL (mismo patrón que /clases y /eventos) ───
  // `s` = scope (mias|explorar), `v` = display (lista|mapa). Legado:
  // `v` llevaba el scope y `map=1` el mapa - se leen como fallback.
  const rawS = searchParams.get("s");
  const rawV = searchParams.get("v");
  const legacyMap = searchParams.get("map") === "1";
  const styleId = searchParams.get("style") ?? "";
  const query = searchParams.get("q") ?? "";

  const [academies, setAcademies] = useState<DirectoryAcademy[] | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  // Boot: directorio + inscripciones en paralelo - el retry del estado
  // de error vuelve a disparar el mismo Promise.all.
  const load = useCallback(async () => {
    setState("loading");
    try {
      await Promise.all([
        apiFetch("/academies").then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          setAcademies((await res.json()) as DirectoryAcademy[]);
        }),
        apiFetch("/academies/enrolled").then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          setEnrollments((await res.json()) as Enrollment[]);
        }),
      ]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Scope: por defecto "mias" si hay inscripciones; sin ellas la vista
  // útil es el directorio - evita una pantalla vacía de entrada.
  const scopeExplicit =
    rawS === "explorar" ||
    rawS === "mias" ||
    rawV === "explorar" ||
    rawV === "mias";
  const scope: Scope = scopeExplicit
    ? ((rawS ?? rawV) as Scope)
    : enrollments !== null && enrollments.length === 0
      ? "explorar"
      : "mias";
  // Sin scope explícito el default depende de /enrolled: hasta resolver
  // no sabemos cuál pill va activa - mostrar "mias" provisional y
  // voltearla a "explorar" era el flash reportado.
  const scopeKnown = scopeExplicit || enrollments !== null;

  // Display: lista o mapa - independiente del scope activo.
  const view: Display = rawV === "map" || legacyMap ? "map" : "list";

  const hrefFor = (o: {
    s?: string | null;
    v?: string | null;
    style?: string | null;
    q?: string | null;
  }) => {
    // Scope/vista destino: override explícito (null/undefined = default)
    // o el actual. La búsqueda solo existe en explorar - se cae sola
    // al volver a mis academias para no quedar de filtro invisible.
    const targetScope = "s" in o ? (o.s ?? "mias") : scope;
    const targetView = "v" in o ? (o.v ?? "list") : view;
    const { s: _s, v: _v, ...rest } = o;
    const merged = {
      s: targetScope !== "mias" ? targetScope : undefined,
      v: targetView !== "list" ? targetView : undefined,
      style: styleId || undefined,
      q: targetScope === "explorar" ? query || undefined : undefined,
      ...rest,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/academias${qs ? `?${qs}` : ""}`;
  };

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 pb-6 pt-3">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("directoryTitle")}</h1>
          {/* Toggle lista/mapa - display del scope activo, íconos
              segmentados como las vistas de /clases */}
          <Segmented
            ariaLabel={t("viewsLabel")}
            active={view}
            tone="solid"
            items={[
              {
                key: "list",
                href: hrefFor({ v: null }),
                icon: true,
                ariaLabel: t("viewList"),
                children: (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                  </svg>
                ),
              },
              {
                key: "map",
                href: hrefFor({ v: "map" }),
                icon: true,
                ariaLabel: t("viewMap"),
                children: (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 6v15l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
                    <path d="M8 2v15M16 6v15" />
                  </svg>
                ),
              },
            ]}
          />
        </div>

        {/* Scope: qué se muestra - pills con texto (mismo patrón que
            /clases: el display va como íconos, el scope con nombre).
            Skeleton mientras el default depende de /enrolled - el
            control siempre existe, el placeholder se llena (nunca un
            pill "mias" provisional que voltea a "explorar"). */}
        {scopeKnown ? (
          <Segmented
            ariaLabel={t("scopesLabel")}
            active={scope}
            className="w-full"
            innerClassName="grid w-full grid-cols-2"
            items={[
              {
                key: "mias",
                href: hrefFor({ s: "mias" }),
                children: t("learner.myAcademies"),
              },
              {
                key: "explorar",
                href: hrefFor({ s: "explorar" }),
                children: t("viewExplore"),
              },
            ]}
          />
        ) : (
          <Skeleton className="page-loading h-12 w-full rounded-full" />
        )}

        {/* Filtro de estilo + buscador por nombre en la misma fila -
            el buscador ocupa el espacio restante (basis-36 + select
            max-w-36 = caben en una fila hasta ~350px; bajo eso el
            buscador envuelve a ancho completo). El estilo aplica a
            ambos scopes (y a los pins del mapa); el buscador es solo
            explorar y se escribe en la URL con router.replace para no
            ensuciar history al teclear. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative shrink-0">
            <select
              aria-label={t("filterStyle")}
              value={styleId}
              onChange={(e) =>
                router.push(hrefFor({ style: e.target.value || null }))
              }
              className={`${chipClass(!!styleId)} max-w-36 cursor-pointer appearance-none truncate bg-transparent pr-8`}
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
          {scope === "explorar" && (
            <div className="relative min-w-0 flex-1 basis-36">
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
        </div>
      </header>

      {/* customer-return de Flow redirige acá (?sub=error) cuando no
          pudo resolver la academia del registro de tarjeta. */}
      {searchParams.get("sub") === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {tsb("subError")}
        </p>
      )}

      {state === "loading" && <SkeletonList />}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-white/60">
            {tc("error")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load()}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {state === "ready" &&
        (view === "map" ? (
          /* ─── Mapa del scope activo - pins a la ficha /academias/:id ─── */
          <section aria-label={t("viewMap")}>
            {mapPins.length === 0 ? (
              <p className="text-sm text-white/50">{t("noLocation")}</p>
            ) : (
              <div className="h-[58dvh] min-h-[340px] w-full overflow-hidden rounded-2xl border border-night-700">
                <EventsMap venues={mapPins} />
              </div>
            )}
          </section>
        ) : scope === "mias" ? (
          /* ─── Mis academias - inscripciones del dancer ─── */
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
              /* Vacío honesto del scope "mias": no es que el directorio
                 esté vacío - la persona no tiene inscripciones. El CTA
                 lleva a explorar (patrón emptyMine de /clases). */
              <Card className="flex flex-col items-center gap-4 py-10 text-center">
                <p role="status" className="text-white/70">
                  {t("myAcademiesEmpty")}
                </p>
                <Button href={hrefFor({ s: "explorar" })}>
                  {t("viewExplore")}
                </Button>
              </Card>
            )}
          </section>
        ) : (
          /* ─── Explorar - el resto del directorio ─── */
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

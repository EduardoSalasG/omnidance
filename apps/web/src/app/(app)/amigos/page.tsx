"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  Badge,
  Button,
  Card,
  ChevronDownIcon,
  EventDate,
  RefreshIcon,
  Skeleton,
  SkeletonList,
} from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";
import { OnboardingRunner, type TourStep } from "@/components/onboarding/OnboardingRunner";

type FriendshipStatus = "none" | "sent" | "received" | "friends";

type PersonLite = {
  id: string;
  name: string;
  photoUrl: string | null;
};

/** Fila de GET /friends - el id es el friendshipId, no el personId. */
type FriendEdge = {
  id: string;
  status: string;
  createdAt: string;
  person: PersonLite;
};

type FriendsData = {
  friends: FriendEdge[];
  pendingReceived: FriendEdge[];
  pendingSent: FriendEdge[];
};

/** GET /friends/upcoming-events - evento + amigos con ticket activo. */
type FriendEvent = {
  event: {
    id: string;
    name: string;
    startsAt: string;
    venue: { name: string } | null;
  };
  friends: PersonLite[];
};

type SearchResult = PersonLite & {
  friendship: { id: string | null; status: FriendshipStatus } | null;
};

type PageState = "loading" | "ready" | "unauth" | "error";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
// "Tus amigos van a" - la agenda puede ser larga y tapa la lista de
// amigos (contenido principal): preview de 2, el resto tras "ver más".
const GOING_PREVIEW = 2;

const EMPTY_DATA: FriendsData = {
  friends: [],
  pendingReceived: [],
  pendingSent: [],
};

export default function AmigosPage() {
  const t = useTranslations("friends");
  const tc = useTranslations("common");
  const tt = useTranslations("tours.amigos");

  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<FriendsData>(EMPTY_DATA);
  // /me compartido (MeProvider del layout): meId construye el link de
  // invitación; meFailed muestra retry en el slot en vez de desaparecer
  // el CTA en silencio.
  const { me, loading: meLoading, error: meError, refresh: refreshMe } =
    useMe();
  const meId = me?.id ?? null;
  const meFailed = !meLoading && meError;
  const [inviteCopied, setInviteCopied] = useState(false);
  // Fallo real de copia al portapapeles - visible (el catch antes era
  // silencioso y el botón parecía no hacer nada).
  const [inviteErr, setInviteErr] = useState(false);
  // "Tus amigos van a" - agenda social de amigos (tickets activos).
  // null = fetch en vuelo → skeleton en el slot (la sección va arriba
  // de solicitudes/amigos; sin slot los empujaba al resolver).
  const [friendEvents, setFriendEvents] = useState<FriendEvent[] | null>(
    null,
  );
  // Expande la sección más allá del preview de GOING_PREVIEW eventos.
  const [goingExpanded, setGoingExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState(false);
  // Descarta respuestas de búsqueda que llegan fuera de orden.
  const searchSeq = useRef(0);
  // Ref del buscador - el CTA del empty state lo enfoca.
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      // En paralelo y dentro del mismo gate: la sección "Tus amigos van
      // a" se decide ANTES de pintar - nada de skeleton que aparece y
      // colapsa, ni pop-in tardío sobre la lista ya pintada.
      const [res, eventsRes] = await Promise.allSettled([
        apiFetch("/friends"),
        apiFetch("/friends/upcoming-events"),
      ]);
      if (res.status === "rejected") {
        setState("error");
        return;
      }
      const friendsRes = res.value;
      if (friendsRes.status === 401) {
        setState("unauth");
        return;
      }
      if (!friendsRes.ok) {
        setState("error");
        return;
      }
      setData((await friendsRes.json()) as FriendsData);
      // Feed "van a" - mejor esfuerzo: si falla queda vacío.
      if (eventsRes.status === "fulfilled" && eventsRes.value.ok) {
        setFriendEvents((await eventsRes.value.json()) as FriendEvent[]);
      } else {
        setFriendEvents([]);
      }
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = useCallback(async (q: string) => {
    const seq = ++searchSeq.current;
    try {
      const res = await apiFetch(
        `/people/search?q=${encodeURIComponent(q)}`,
      );
      if (seq !== searchSeq.current) return;
      setResults(res.ok ? ((await res.json()) as SearchResult[]) : []);
    } catch {
      if (seq === searchSeq.current) setResults([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  // Debounce: busca en cada cambio tras 300ms; <2 chars limpia y muestra hint.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      searchSeq.current++;
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => void runSearch(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  // Tras cada acción se refetchea todo: lista de amigos + resultados de
  // búsqueda visibles (los friendship.status cambian con la acción).
  async function act(key: string, fn: () => Promise<Response>) {
    setBusyKey(key);
    setActionErr(false);
    try {
      const res = await fn();
      // 409 = solicitud duplicada: el estado ya cambió, solo refrescamos.
      if (!res.ok && res.status !== 409) {
        setActionErr(true);
        return;
      }
      const q = query.trim();
      await Promise.all([
        load(),
        q.length >= MIN_CHARS ? runSearch(q) : Promise.resolve(),
      ]);
    } catch {
      setActionErr(true);
    } finally {
      setBusyKey(null);
    }
  }

  const sendRequest = (personId: string) =>
    act(`add:${personId}`, () =>
      apiFetch("/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      }),
    );
  const acceptReq = (fid: string) =>
    act(`acc:${fid}`, () =>
      apiFetch(`/friends/${fid}/accept`, { method: "POST" }),
    );
  const declineReq = (fid: string) =>
    act(`dec:${fid}`, () =>
      apiFetch(`/friends/${fid}/decline`, { method: "POST" }),
    );
  const removeRel = (fid: string) =>
    act(`del:${fid}`, () =>
      apiFetch(`/friends/${fid}`, { method: "DELETE" }),
    );

  function Row({
    person,
    children,
  }: {
    person: PersonLite;
    children?: ReactNode;
  }) {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-night-700 bg-night-800/60 p-3">
        <Link
          href={`/amigos/${person.id}`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          <PartnerAvatar name={person.name} photoUrl={person.photoUrl} />
          <span className="truncate font-medium text-white">
            {person.name}
          </span>
        </Link>
        {children && (
          <div className="flex shrink-0 items-center gap-2">{children}</div>
        )}
      </li>
    );
  }

  /** Botón contextual según friendship.status en resultados de búsqueda. */
  function SearchActions({ r }: { r: SearchResult }) {
    const status = r.friendship?.status ?? "none";
    const fid = r.friendship?.id ?? null;
    switch (status) {
      case "friends":
        return <Badge variant="neon">{t("friendBadge")}</Badge>;
      case "sent":
        return (
          <>
            <Badge variant="muted">{t("sentBadge")}</Badge>
            {fid && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busyKey === `del:${fid}`}
                onClick={() => removeRel(fid)}
              >
                {t("cancelRequest")}
              </Button>
            )}
          </>
        );
      case "received":
        return fid ? (
          <>
            <Button
              size="sm"
              disabled={busyKey === `acc:${fid}`}
              onClick={() => acceptReq(fid)}
            >
              {t("accept")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busyKey === `dec:${fid}`}
              onClick={() => declineReq(fid)}
            >
              {t("decline")}
            </Button>
          </>
        ) : null;
      default:
        return (
          <Button
            size="sm"
            disabled={busyKey === `add:${r.id}`}
            onClick={() => sendRequest(r.id)}
          >
            {t("add")}
          </Button>
        );
    }
  }

  if (state === "unauth") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  const trimmed = query.trim();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      {/* Agregar amigos: buscador por nombre + link de invitación.
          El link apunta a mi propio perfil - quien lo abre sin sesión
          cae a login/registro y aterriza aquí con el botón Agregar. */}
      <section
        aria-labelledby="add-friends-title"
        data-tour="amigos-add"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="add-friends-title"
            className="text-sm font-semibold uppercase tracking-wide text-white/50"
          >
            {t("addTitle")}
          </h2>
          {meId ? (
            <button
              type="button"
              onClick={async () => {
                const url = `${window.location.origin}/amigos/${meId}`;
                try {
                  if (navigator.share) {
                    await navigator.share({ url, text: t("inviteText") });
                    return;
                  }
                  await navigator.clipboard.writeText(url);
                  setInviteCopied(true);
                  setTimeout(() => setInviteCopied(false), 2500);
                } catch (err) {
                  // Cancelar el share nativo (AbortError) no es error -
                  // el aviso es solo para cuando la copia falla de verdad.
                  if (err instanceof DOMException && err.name === "AbortError") {
                    return;
                  }
                  setInviteErr(true);
                  setTimeout(() => setInviteErr(false), 3000);
                }
              }}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-night-700 bg-night-800 px-4 text-sm font-medium text-neon transition-colors hover:border-neon/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {inviteCopied ? t("inviteCopied") : t("invite")}
            </button>
          ) : meFailed ? (
            /* /me falló: sin meId no hay link - feedback + retry en el
               mismo slot en vez de desaparecer el CTA en silencio. */
            <button
              type="button"
              onClick={() => void refreshMe()}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-night-700 px-4 text-sm font-medium text-white/60 transition-colors hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <RefreshIcon />
              {tc("retry")}
            </button>
          ) : meLoading ? (
            /* Slot reservado del botón Invitar mientras /me resuelve -
               el CTA deja de aparecer de golpe junto al título. */
            <Skeleton className="page-loading h-11 w-28 shrink-0 rounded-full" />
          ) : null}
        </div>
        {inviteErr && (
          <p role="alert" className="text-sm text-red-400">
            {t("inviteError")}
          </p>
        )}
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          className="min-h-11 w-full rounded-xl border border-night-700 bg-night-900 px-4 text-white placeholder:text-white/40 focus:border-neon focus:outline-none"
        />
        {trimmed.length > 0 && trimmed.length < MIN_CHARS && (
          <p className="text-sm text-white/50">{t("minChars")}</p>
        )}
        {searching && <Spinner size="sm" className="page-loading" />}
        {!searching && results !== null && results.length === 0 && (
          <p role="status" className="text-sm text-white/50">
            {t("noResults")}
          </p>
        )}
        {results !== null && results.length > 0 && (
          <ul className="flex flex-col gap-2">
            {results.map((r) => (
              <Row key={r.id} person={r}>
                <SearchActions r={r} />
              </Row>
            ))}
          </ul>
        )}
      </section>

      {actionErr && (
        <p role="alert" className="text-sm text-red-400">
          {t("actionError")}
        </p>
      )}

      {state === "loading" && <SkeletonList />}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-white/50">
            {tc("error")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setState("loading");
              void load();
            }}
          >
            {tc("retry")}
          </Button>
        </div>
      )}

      {state === "ready" && (
        <>
          {/* Tus amigos van a - eventos con ticket activo de ≥1 amigo.
              El fetch va en paralelo dentro del gate: al llegar a
              `ready` ya está resuelto - la sección pinta con contenido
              o no pinta nunca; no hay skeleton que aparezca y colapse. */}
          {friendEvents !== null && friendEvents.length > 0 && (
            <section data-tour="amigos-going" className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("goingTitle")}
              </h2>
              <ul className="flex flex-col gap-2">
                {/* Preview de 2 - el resto queda tras "ver más" (la
                    agenda semanal puede ser larga y tapar la lista
                    de amigos, que es el contenido principal). */}
                {(goingExpanded
                  ? friendEvents
                  : friendEvents.slice(0, GOING_PREVIEW)
                ).map(({ event, friends }) => (
                  <li key={event.id}>
                    <Link href={`/eventos/${event.id}`} className="block">
                      <Card className="flex items-center justify-between gap-3 transition-colors hover:border-neon/50">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {event.name}
                          </p>
                          <p className="truncate text-sm text-white/60">
                            <EventDate start={event.startsAt} />
                            {event.venue ? ` · ${event.venue.name}` : ""}
                          </p>
                        </div>
                        {/* Stack de avatares/iniciales de los amigos que van */}
                        <ul
                          aria-label={t("goingFriends", {
                            count: friends.length,
                          })}
                          className="flex shrink-0 -space-x-2"
                        >
                          {friends.slice(0, 4).map((f) => (
                            <li
                              key={f.id}
                              className="rounded-full ring-2 ring-night-800"
                            >
                              <PartnerAvatar
                                name={f.name}
                                photoUrl={f.photoUrl}
                                size="sm"
                              />
                            </li>
                          ))}
                          {friends.length > 4 && (
                            <li className="flex h-8 w-8 items-center justify-center rounded-full bg-night-700 text-[10px] font-semibold text-white/70 ring-2 ring-night-800">
                              +{friends.length - 4}
                            </li>
                          )}
                        </ul>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
              {friendEvents.length > GOING_PREVIEW && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={goingExpanded}
                  onClick={() => setGoingExpanded((v) => !v)}
                  className="self-start"
                >
                  {goingExpanded
                    ? t("goingLess")
                    : t("goingMore", {
                        count: friendEvents.length - GOING_PREVIEW,
                      })}
                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform motion-reduce:transition-none ${goingExpanded ? "rotate-180" : ""}`}
                  />
                </Button>
              )}
            </section>
          )}

          {/* Solicitudes recibidas */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {t("requests")}
            </h2>
            {data.pendingReceived.length === 0 ? (
              <p className="text-sm text-white/40">{t("emptyRequests")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.pendingReceived.map((f) => (
                  <Row key={f.id} person={f.person}>
                    <Button
                      size="sm"
                      disabled={busyKey === `acc:${f.id}`}
                      onClick={() => acceptReq(f.id)}
                    >
                      {t("accept")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyKey === `dec:${f.id}`}
                      onClick={() => declineReq(f.id)}
                    >
                      {t("decline")}
                    </Button>
                  </Row>
                ))}
              </ul>
            )}
          </section>

          {/* Solicitudes enviadas */}
          {data.pendingSent.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("sentSection")}
              </h2>
              <ul className="flex flex-col gap-2">
                {data.pendingSent.map((f) => (
                  <Row key={f.id} person={f.person}>
                    <Badge variant="muted">{t("sentBadge")}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyKey === `del:${f.id}`}
                      onClick={() => removeRel(f.id)}
                    >
                      {t("cancelRequest")}
                    </Button>
                  </Row>
                ))}
              </ul>
            </section>
          )}

          {/* Amigos */}
          <section data-tour="amigos-list" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {t("list")}
            </h2>
            {data.friends.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 py-10 text-center">
                <p role="status" className="text-white/60">
                  {t("empty")}
                </p>
                {/* Sin dead-end: el buscador de arriba es la acción -
                    el CTA lo enfoca en vez de duplicarlo. */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => searchRef.current?.focus()}
                >
                  {t("emptyCta")}
                </Button>
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.friends.map((f) => (
                  <Row key={f.id} person={f.person} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Tour de primera visita - monta solo con la data lista para
          que las secciones target existan en el DOM. */}
      {state === "ready" && (
        <OnboardingRunner
          tour="amigos"
          steps={
            [
              {
                element: "[data-tour='amigos-add']",
                title: tt("s1.title"),
                description: tt("s1.desc"),
              },
              {
                element: "[data-tour='amigos-going']",
                title: tt("s2.title"),
                description: tt("s2.desc"),
              },
              {
                element: "[data-tour='amigos-list']",
                title: tt("s3.title"),
                description: tt("s3.desc"),
              },
            ] satisfies TourStep[]
          }
        />
      )}
    </main>
  );
}

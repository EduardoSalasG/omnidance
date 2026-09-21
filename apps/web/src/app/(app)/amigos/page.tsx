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
import { Badge, Button, Card, EventDate } from "@/components/ui";
import { PageLoading, Spinner } from "@/components/ui/spinner";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";

type FriendshipStatus = "none" | "sent" | "received" | "friends";

type PersonLite = {
  id: string;
  name: string;
  photoUrl: string | null;
};

/** Fila de GET /friends — el id es el friendshipId, no el personId. */
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

/** GET /friends/upcoming-events — evento + amigos con ticket activo. */
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

const EMPTY_DATA: FriendsData = {
  friends: [],
  pendingReceived: [],
  pendingSent: [],
};

export default function AmigosPage() {
  const t = useTranslations("friends");
  const tc = useTranslations("common");

  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<FriendsData>(EMPTY_DATA);
  // "Tus amigos van a" — agenda social de amigos (tickets activos).
  const [friendEvents, setFriendEvents] = useState<FriendEvent[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState(false);
  // Descarta respuestas de búsqueda que llegan fuera de orden.
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/friends");
      if (res.status === 401) {
        setState("unauth");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setData((await res.json()) as FriendsData);
      // Feed "van a" — mejor esfuerzo: si falla queda vacío, no bloquea.
      apiFetch("/friends/upcoming-events")
        .then(async (r) => {
          if (r.ok) setFriendEvents((await r.json()) as FriendEvent[]);
        })
        .catch(() => {});
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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      {/* Buscador */}
      <section aria-label={t("search")} className="flex flex-col gap-3">
        <input
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

      {state === "loading" && <PageLoading />}
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
          {/* Tus amigos van a — eventos con ticket activo de ≥1 amigo */}
          {friendEvents.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("goingTitle")}
              </h2>
              <ul className="flex flex-col gap-2">
                {friendEvents.map(({ event, friends }) => (
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
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {t("list")}
            </h2>
            {data.friends.length === 0 ? (
              <Card className="py-10 text-center">
                <p role="status" className="text-white/60">
                  {t("empty")}
                </p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.friends.map((f) => (
                  <Row key={f.id} person={f.person}>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyKey === `del:${f.id}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            t("removeConfirm", { name: f.person.name }),
                          )
                        ) {
                          void removeRel(f.id);
                        }
                      }}
                    >
                      {t("remove")}
                    </Button>
                  </Row>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

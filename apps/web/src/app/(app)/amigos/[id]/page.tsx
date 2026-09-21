"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";
import { ConsoleHeader } from "@/components/console/console-header";

type FriendshipStatus = "none" | "sent" | "received" | "friends";

type StyleRole = {
  role: "LEADER" | "FOLLOWER" | "SWITCH";
  level: string | null;
  style: { id: string; name: string; genre: string | null };
};

type UpcomingEvent = {
  id: string;
  name: string;
  startsAt: string;
  venue: { name: string } | null;
};

type PersonProfile = {
  id: string;
  name: string;
  photoUrl: string | null;
  styleRoles: StyleRole[];
  badgeCount: number;
  friendship: { id: string | null; status: FriendshipStatus } | null;
  isMe: boolean;
  /** Solo presente si el viewer es amigo confirmado (agenda privada). */
  upcomingEvents?: UpcomingEvent[];
};

type PageState = "loading" | "ready" | "unauth" | "error";

export default function AmigoPerfilPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const t = useTranslations("friends");
  const tc = useTranslations("common");
  // Etiquetas de rol de baile ya existen en el namespace de partner requests.
  const tp = useTranslations("partnerRequests");

  const [state, setState] = useState<PageState>("loading");
  const [person, setPerson] = useState<PersonProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/people/${id}`);
      if (res.status === 401) {
        setState("unauth");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setPerson((await res.json()) as PersonProfile);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch del perfil tras cada acción — el friendship cambia en servidor.
  async function act(fn: () => Promise<Response>) {
    setBusy(true);
    setActionErr(false);
    try {
      const res = await fn();
      // 409 = solicitud duplicada: el estado ya cambió, solo refrescamos.
      if (!res.ok && res.status !== 409) {
        setActionErr(true);
        return;
      }
      await load();
    } catch {
      setActionErr(true);
    } finally {
      setBusy(false);
    }
  }

  const sendRequest = () =>
    act(() =>
      apiFetch("/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: id }),
      }),
    );
  const acceptReq = (fid: string) =>
    act(() => apiFetch(`/friends/${fid}/accept`, { method: "POST" }));
  const declineReq = (fid: string) =>
    act(() => apiFetch(`/friends/${fid}/decline`, { method: "POST" }));
  const removeRel = (fid: string) =>
    act(() => apiFetch(`/friends/${fid}`, { method: "DELETE" }));

  const roleLabels: Record<StyleRole["role"], string> = {
    LEADER: tp("roleLeader"),
    FOLLOWER: tp("roleFollower"),
    SWITCH: tp("roleSwitch"),
  };

  if (state === "unauth") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/amigos" backLabel={t("title")} />

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

      {state === "ready" && person && (
        <>
          {/* Identidad */}
          <Card className="flex items-center gap-4">
            <PartnerAvatar
              name={person.name}
              photoUrl={person.photoUrl}
              size="lg"
            />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{person.name}</p>
              {person.badgeCount > 0 && (
                <Badge variant="neon" className="mt-2">
                  {t("badges", { count: person.badgeCount })}
                </Badge>
              )}
            </div>
          </Card>

          {actionErr && (
            <p role="alert" className="text-sm text-red-400">
              {t("actionError")}
            </p>
          )}

          {/* Acción de amistad — no aplica al propio perfil */}
          {!person.isMe &&
            (() => {
              const status = person.friendship?.status ?? "none";
              const fid = person.friendship?.id ?? null;
              return (
                <div className="flex flex-wrap items-center gap-2">
                  {status === "none" && (
                    <Button disabled={busy} onClick={sendRequest}>
                      {t("add")}
                    </Button>
                  )}
                  {status === "sent" && (
                    <>
                      <Badge variant="muted">{t("sentBadge")}</Badge>
                      {fid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => removeRel(fid)}
                        >
                          {t("cancelRequest")}
                        </Button>
                      )}
                    </>
                  )}
                  {status === "received" && fid && (
                    <>
                      <Button disabled={busy} onClick={() => acceptReq(fid)}>
                        {t("accept")}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => declineReq(fid)}
                      >
                        {t("decline")}
                      </Button>
                    </>
                  )}
                  {status === "friends" && (
                    <>
                      <Badge variant="neon">{t("friendBadge")}</Badge>
                      {fid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                t("removeConfirm", { name: person.name }),
                              )
                            ) {
                              void removeRel(fid);
                            }
                          }}
                        >
                          {t("remove")}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

          {/* Próximos eventos — solo llega en la respuesta si somos
              amigos (el server decide; ausente = sin acceso a agenda) */}
          {person.upcomingEvents && person.upcomingEvents.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("upcomingTitle")}
              </h2>
              <ul className="flex flex-col gap-2">
                {person.upcomingEvents.map((e) => (
                  <li key={e.id}>
                    <Link href={`/eventos/${e.id}`} className="block">
                      <Card className="transition-colors hover:border-neon/50">
                        <p className="font-semibold">{e.name}</p>
                        <p className="text-sm text-white/60">
                          <EventDate start={e.startsAt} />
                          {e.venue ? ` · ${e.venue.name}` : ""}
                        </p>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Estilos */}
          {person.styleRoles.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("stylesTitle")}
              </h2>
              <div className="flex flex-wrap gap-2">
                {person.styleRoles.map((sr) => (
                  <Badge
                    key={`${sr.style.id}:${sr.role}`}
                    variant="outline"
                  >
                    {sr.style.name} · {roleLabels[sr.role]}
                    {sr.level ? ` · ${t("level")}: ${sr.level}` : ""}
                  </Badge>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

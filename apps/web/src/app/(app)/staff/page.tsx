"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";

// Roles que habilitan la consola de puerta (espejo de StaffGuard en la API).
const DOOR_ROLES = new Set(["STAFF", "ADMIN"]);

// Tipos de evento con traducción en el catálogo (events.type.*).
const KNOWN_EVENT_TYPES = new Set([
  "SOCIAL",
  "PRACTICA",
  "GALA",
  "CONGRESS",
  "COMPETITION",
]);

type StaffEvent = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  series: { name: string } | null;
  venue: { name: string; address: string | null };
};

type Gate = "loading" | "unauth" | "notStaff" | "error" | "ready";

export default function StaffPage() {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const te = useTranslations("events");

  const [gate, setGate] = useState<Gate>("loading");
  const [events, setEvents] = useState<StaffEvent[]>([]);

  const boot = useCallback(async () => {
    setGate("loading");
    try {
      const me = await apiFetch("/me");
      if (me.status === 401) {
        setGate("unauth");
        return;
      }
      if (!me.ok) {
        setGate("error");
        return;
      }
      const data = (await me.json()) as { id: string; roles: string[] };
      if (!data.roles.some((r) => DOOR_ROLES.has(r))) {
        setGate("notStaff");
        return;
      }
      // v1: staff ve todos los eventos PUBLISHED/LIVE del endpoint público.
      // TODO: filtrar por StaffAssignment cuando la API exponga "mis turnos".
      const res = await apiFetch("/events");
      if (!res.ok) {
        setGate("error");
        return;
      }
      setEvents((await res.json()) as StaffEvent[]);
      setGate("ready");
    } catch {
      // Fetch rechazado = red caída o API apagada.
      // TODO(offline-first): cachear último listado en IndexedDB.
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {gate === "loading" && <p className="text-white/60">{tc("loading")}</p>}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notStaff" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{t("notStaff")}</p>
          <Button href="/inicio" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{tc("error")}</p>
          <Button variant="secondary" onClick={() => void boot()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" &&
        (events.length === 0 ? (
          <p className="text-white/60">{te("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/staff/${e.id}`} className="block">
                  <Card className="transition-colors hover:border-neon/50">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {e.status === "LIVE" && (
                          <Badge variant="live">{te("live")}</Badge>
                        )}
                        {e.series && (
                          <Badge variant="neon">{e.series.name}</Badge>
                        )}
                        {KNOWN_EVENT_TYPES.has(e.type) && (
                          <Badge variant="outline">
                            {te(`type.${e.type}`)}
                          </Badge>
                        )}
                      </div>
                      <h2 className="text-lg font-semibold">{e.name}</h2>
                      <p className="text-sm text-white/60">
                        <EventDate start={e.startsAt} end={e.endsAt} /> ·{" "}
                        {e.venue.name}
                      </p>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </main>
  );
}

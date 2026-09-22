"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { AvailabilitySection } from "@/components/social/AvailabilitySection";
import { PartnerRequests } from "@/components/social/PartnerRequests";
import type { Me } from "@/components/social/types";

// GET /practices — shape público de evento + host resuelto.
type Practice = {
  id: string;
  name: string;
  type: string;
  status: string;
  hostId: string | null;
  host: { id: string; name: string | null } | null;
  capacity: number | null;
  startsAt: string;
  endsAt: string;
  presalePrice: number | null;
  doorPrice: number | null;
  series: { name: string } | null;
  venue: { name: string; address: string | null } | null;
  venueText: string | null;
  womenOnly: boolean;
  rsvpCount: number;
  style: { id: string; name: string } | null;
};

type ListState = "loading" | "ready" | "error";

/**
 * Prácticas (spec §8): el listado es solo descubrimiento — crear vive en
 * /practicas/nueva. Debajo, la coordinación social: quién está disponible
 * para bailar y quién busca pareja de práctica.
 */
export default function PracticasPage() {
  const t = useTranslations("practices");
  const te = useTranslations("events");
  const tc = useTranslations("common");

  const [state, setState] = useState<ListState>("loading");
  const [practices, setPractices] = useState<Practice[]>([]);
  // undefined = cargando; null = sin sesión. Alimenta el badge "Tu práctica"
  // y las secciones sociales (disponibles / busco pareja).
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/practices");
      if (!res.ok) {
        setState("error");
        return;
      }
      setPractices((await res.json()) as Practice[]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    apiFetch("/me")
      .then(async (res) => setMe(res.ok ? ((await res.json()) as Me) : null))
      .catch(() => setMe(null));
  }, [load]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>
      {/* Próximas prácticas — heading + crear (navega a /practicas/nueva) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("upcoming")}
          </h2>
          <Button href="/practicas/nueva" size="sm">
            {t("create")}
          </Button>
        </div>

        {state === "loading" && <PageLoading />}
        {state === "error" && (
          <p role="alert" className="text-white/60">
            {tc("error")}
          </p>
        )}
        {state === "ready" &&
          (practices.length === 0 ? (
            <Card className="flex flex-col items-start gap-3">
              <p role="status" className="text-white/60">
                {t("empty")}
              </p>
              {/* Sin dead-end: organizar la primera práctica es la acción
                  que la spec gamifica (badge "organizador de prácticas") */}
              <Button href="/practicas/nueva" size="sm">
                {t("create")}
              </Button>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {practices.map((p) => {
                const mine = me != null && p.hostId === me.id;
                return (
                  <li key={p.id}>
                    <Link href={`/eventos/${p.id}`} className="block">
                      <Card className="transition-colors hover:border-neon/50">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.status === "LIVE" && (
                            <Badge variant="live">{te("live")}</Badge>
                          )}
                          {p.style && (
                            <Badge variant="neon">{p.style.name}</Badge>
                          )}
                          {mine && (
                            <Badge variant="neon">{t("yours")}</Badge>
                          )}
                          {p.womenOnly && (
                            <Badge variant="muted">{t("womenOnly")}</Badge>
                          )}
                          {p.capacity != null && (
                            <Badge variant="outline">
                              {t("capacity", { count: p.capacity })}
                            </Badge>
                          )}
                          {p.rsvpCount > 0 && (
                            <Badge variant="muted">
                              {t("goingCount", { count: p.rsvpCount })}
                            </Badge>
                          )}
                        </div>
                        <h3 className="mt-2 text-lg font-semibold">{p.name}</h3>
                        <p className="text-sm text-white/60">
                          <EventDate start={p.startsAt} end={p.endsAt} />
                          {p.venue
                            ? ` · ${p.venue.name}`
                            : p.venueText
                              ? ` · ${p.venueText}`
                              : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-white/50">
                          {[
                            p.venue?.address,
                            p.host?.name && !mine
                              ? t("hostedBy", { name: p.host.name })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
      </section>

      {/* Encontrar con quién — disponibilidad y búsqueda de pareja */}
      <section className="flex flex-col gap-5 border-t border-night-800 pt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("findPartner")}
        </h2>
        <AvailabilitySection me={me} />
        <PartnerRequests me={me} />
      </section>
    </main>
  );
}

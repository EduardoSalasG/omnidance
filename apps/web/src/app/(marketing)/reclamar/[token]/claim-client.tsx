"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, EventDate } from "@/components/ui";
import type { ClaimInfo } from "./page";

type State =
  | { kind: "idle" }
  | { kind: "claiming" }
  | { kind: "claimed" }
  | { kind: "error"; self?: boolean };

/**
 * Landing de invitación a entrada (claim link por WhatsApp).
 * - Sin sesión: CTA "crea tu cuenta" → /login?mode=register&next=/reclamar/<t>
 *   (tras registrarse vuelve acá y reclama).
 * - Con sesión: botón "Reclamar" → POST /tickets/claim/:token.
 */
export function ClaimClient({
  token,
  info,
  hasSession,
}: {
  token: string;
  info: ClaimInfo;
  hasSession: boolean;
}) {
  const t = useTranslations("claim");
  const [state, setState] = useState<State>({ kind: "idle" });

  const next = `/reclamar/${token}`;

  async function claim() {
    setState({ kind: "claiming" });
    try {
      const res = await apiFetch(`/tickets/claim/${token}`, {
        method: "POST",
      });
      if (res.ok) {
        setState({ kind: "claimed" });
      } else if (res.status === 409) {
        // "ya es tuya" vs "ya no disponible" — el mensaje del server
        // distingue; el self-case merece copy propio.
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setState({
          kind: "error",
          self: body?.message?.includes("tuya") ?? false,
        });
      } else {
        setState({ kind: "error" });
      }
    } catch {
      setState({ kind: "error" });
    }
  }

  if (state.kind === "claimed") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">{t("claimedTitle")}</h1>
        <p className="max-w-sm text-sm text-white/60">{t("claimedDesc")}</p>
        <Button href="/eventos?view=mios" size="lg">
          {t("goToTickets")}
        </Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-center text-2xl font-bold">{t("title")}</h1>

      <Card className="flex w-full max-w-sm flex-col gap-3 text-center">
        <p className="text-base text-white/80">
          {t("giftLine", { name: info.buyerName })}
        </p>
        {info.event && (
          <div className="border-t border-night-700 pt-3">
            <p className="text-lg font-semibold">{info.event.name}</p>
            <EventDate
              variant="full"
              start={info.event.startsAt}
              className="mt-1 text-sm text-white/60"
            />
            {info.event.venue && (
              <p className="text-sm text-white/50">{info.event.venue.name}</p>
            )}
          </div>
        )}
      </Card>

      {state.kind === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {state.self ? t("selfError") : t("claimError")}
        </p>
      )}

      <div className="flex w-full max-w-sm flex-col gap-3">
        {hasSession ? (
          <Button
            size="lg"
            disabled={state.kind === "claiming"}
            onClick={() => void claim()}
          >
            {state.kind === "claiming" ? t("claiming") : t("claimCta")}
          </Button>
        ) : (
          <>
            <Button
              href={`/login?mode=register&next=${encodeURIComponent(next)}`}
              size="lg"
            >
              {t("createCta")}
            </Button>
            <Button
              href={`/login?next=${encodeURIComponent(next)}`}
              variant="secondary"
            >
              {t("loginCta")}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

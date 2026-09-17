"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EventDate } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { PartnerAvatar } from "./PartnerAvatar";
import { StarRating } from "./StarRating";
import { isInvitee } from "./types";
import type { DanceSession, SessionAction } from "./types";

const STATUS_META: Record<
  string,
  { key: "pending" | "confirmed" | "expired" | "decline" | "discard"; variant: BadgeVariant }
> = {
  INVITED: { key: "pending", variant: "outline" },
  CONFIRMED: { key: "confirmed", variant: "neon" },
  EXPIRED: { key: "expired", variant: "muted" },
  DECLINED: { key: "decline", variant: "muted" },
  DISCARDED: { key: "discard", variant: "muted" },
};

export type SessionCardProps = {
  session: DanceSession;
  busy?: boolean;
  onAct?: (action: SessionAction) => void;
  onRate?: (score: number) => void;
};

/** Card de una sesión: invitación entrante destacada, saliente, historial y puntuación. */
export function SessionCard({
  session,
  busy = false,
  onAct,
  onRate,
}: SessionCardProps) {
  const t = useTranslations("sessions");
  const [ratingOpen, setRatingOpen] = useState(false);

  const invitee = isInvitee(session);
  const name = session.partner?.name ?? "?";
  const meta = STATUS_META[session.status];
  const incoming = session.status === "INVITED" && invitee;

  return (
    <Card
      className={
        incoming
          ? "border-neon/70 shadow-[0_0_24px_rgba(224,64,251,0.15)]"
          : ""
      }
    >
      <div className="flex items-center gap-3">
        <PartnerAvatar
          name={name}
          photoUrl={session.partner?.photoUrl ?? null}
          size={incoming ? "lg" : "md"}
        />
        <div className="min-w-0 flex-1">
          {session.status === "INVITED" ? (
            <p className={incoming ? "text-lg" : ""}>
              {invitee ? (
                <>
                  <span className="font-bold">{name}</span>{" "}
                  <span className="text-white/70">{t("invitedYou")}</span>
                </>
              ) : (
                <>
                  <span className="text-white/70">{t("youInvited")}</span>{" "}
                  <span className="font-semibold">{name}</span>
                </>
              )}
            </p>
          ) : (
            <p className="font-semibold">{name}</p>
          )}
          <EventDate
            variant="time"
            start={session.scannedAt}
            className="block text-xs text-white/50"
          />
        </div>
        {meta && <Badge variant={meta.variant}>{t(meta.key)}</Badge>}
      </div>

      {/* Invitación entrante: acción principal de la noche */}
      {incoming && (
        <div className="mt-4 flex gap-3">
          <Button
            size="lg"
            className="flex-1"
            disabled={busy}
            onClick={() => onAct?.("confirm")}
          >
            {t("confirm")}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled={busy}
            onClick={() => onAct?.("decline")}
          >
            {t("decline")}
          </Button>
        </div>
      )}

      {/* Invitación saliente: descartar si no hubo baile */}
      {session.status === "INVITED" && !invitee && (
        <div className="mt-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onAct?.("discard")}
          >
            {t("discard")}
          </Button>
        </div>
      )}

      {/* Confirmada: puntuar inline o mostrar el puntaje ya dado */}
      {session.status === "CONFIRMED" &&
        (session.myRating ? (
          <div className="mt-2">
            <StarRating value={session.myRating.global} />
          </div>
        ) : ratingOpen ? (
          <div className="mt-3">
            <p className="text-sm text-white/60">{t("ratePrompt")}</p>
            <StarRating busy={busy} onSelect={(score) => onRate?.(score)} />
          </div>
        ) : (
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRatingOpen(true)}
            >
              {t("rate")}
            </Button>
          </div>
        ))}
    </Card>
  );
}

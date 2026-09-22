// Tipos del feature de sesiones de baile (GET /api/sessions/mine).

export type SessionAction = "confirm" | "decline" | "discard";

export type SessionPartner = {
  name: string;
  photoUrl: string | null;
} | null;

export type SessionRating = {
  global: number;
  connection: number | null;
  comfort: number | null;
  musicality: number | null;
};

export type DanceSession = {
  id: string;
  eventId: string;
  /** La API expone "inviter" | "invitee" en minúsculas. */
  role: string;
  status: string;
  scannedAt: string;
  confirmedAt: string | null;
  inviterId: string;
  inviteeId: string;
  styleId: string | null;
  /** Ficha mínima del evento — permite agrupar el historial por noche.
      null si el evento ya no existe. */
  event: {
    id: string;
    name: string;
    startsAt: string;
    venue: { name: string } | null;
  } | null;
  partner: SessionPartner;
  myRating: SessionRating | null;
};

export function isInvitee(session: DanceSession): boolean {
  return session.role.toLowerCase() === "invitee";
}

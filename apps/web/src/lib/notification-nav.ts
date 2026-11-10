"use client";

import { apiFetch } from "@/lib/api";
import { safeInternalPath } from "@/lib/safe-next";
import { setViewMode } from "@/lib/view-mode";

/**
 * Navegación por tipo de notificación - fuente única (spec
 * notifications/deep-links) para las dos superficies in-app que la
 * muestran: la card del centro `/notificaciones` y el toast en tiempo
 * real. `NotificationItem` (REST) y `RealtimeNotification` (socket)
 * comparten `type` + `data` libre; los campos se estrechan por typeof.
 */
export type NavNotification = { type: string; data?: unknown };

function dataOf(n: NavNotification): Record<string, unknown> | null {
  return n.data && typeof n.data === "object"
    ? (n.data as Record<string, unknown>)
    : null;
}

const str = (v: unknown): string | null =>
  typeof v === "string" ? v : null;

/** Deep link por tipo: null cuando el tipo no tiene destino propio
    (el caller cae a `/notificaciones` o no navega). */
export function notificationHref(n: NavNotification): string | null {
  const data = dataOf(n);
  const eventId = str(data?.eventId);
  const classId = str(data?.classId);
  switch (n.type) {
    case "payment.paid":
      return "/eventos?view=mios";
    case "ticket.gifted":
    case "ticket.claimed":
    case "waitlist.promoted":
      return eventId ? `/eventos/${eventId}` : "/eventos";
    case "payment.failed":
      return eventId ? `/eventos/${eventId}` : null;
    case "event.survey":
      return eventId ? `/eventos/${eventId}/evaluar` : null;
    case "session.invite":
    case "session.confirmed":
    case "session.declined":
      return "/bailes";
    case "friend.request":
      return "/amigos";
    // Particular del alumno (asignada, cancelada pagada, comprada) -
    // vive dentro de reservadas de /clases (sin bandeja separada).
    case "academy.private_lesson.assigned":
    case "academy.private_lesson.cancelled_paid":
    case "academy.private_lesson.purchased":
      return "/clases?scope=reservadas";
    case "class.waitlist.promoted":
      return classId ? `/clases/${classId}` : "/clases";
    case "class.series.resumed":
      return "/clases";
    // Push "te invitó" de la cuenta existente (spec academies/
    // student-invites): mismo destino que el `next` del magic link.
    case "academy.invite": {
      const academyId = str(data?.academyId);
      return academyId ? `/academias/${academyId}` : null;
    }
    default: {
      // Fallback genérico: la API puede mandar el destino resuelto en
      // data.path (p.ej. account.complete_profile → /perfil/completar).
      return safeInternalPath(str(data?.path));
    }
  }
}

/**
 * Efectos del tap por tipo (además de navegar). Hoy solo
 * `academy.invite` (change academy-invite-push-consume): consume la
 * invitación pendiente (best-effort - el retry natural es el magic
 * link del correo) y entra con lente academy, equivalente a la cookie
 * `omnidance_lens` del verify.
 */
export function notificationTapEffects(n: NavNotification): void {
  if (n.type !== "academy.invite") return;
  const inviteId = str(dataOf(n)?.inviteId);
  if (inviteId) {
    void apiFetch(`/academies/invites/${inviteId}/consume`, {
      method: "POST",
    }).catch(() => {});
  }
  setViewMode("academy");
}

"use client";

import { apiFetch } from "@/lib/api";
import { safeInternalPath } from "@/lib/safe-next";
import { setViewMode } from "@/lib/view-mode";

/**
 * Navegación por tipo de notificación - fuente única (spec
 * notifications/deep-links) para las dos superficies in-app que la
 * muestran: la card del centro `/notificaciones` y el toast en tiempo
 * real. `NotificationItem` (REST) y `RealtimeNotification` (socket)
 * comparten `type` + `data` libre + `category`; los campos se
 * estrechan por typeof. `category` discrimina audiencia cuando el
 * mismo type va a consolas distintas (OPERATIONAL = gestión).
 */
export type NavNotification = {
  type: string;
  data?: unknown;
  category?: string;
};

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
  const academyId = str(data?.academyId);
  const operational = n.category === "OPERATIONAL";
  switch (n.type) {
    // payment.paid es polimórfico (4 shapes, mismo type): ticket →
    // mis entradas; clase suelta → ficha de la clase; particular →
    // reservadas; cobro de plataforma → pagos del perfil.
    case "payment.paid":
      if (classId) return `/clases/${classId}`;
      if (str(data?.lessonId)) return "/clases?scope=reservadas";
      if (str(data?.orderType)) return "/perfil/pagos";
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
    // Particular del alumno (asignada, comprada) vive en reservadas
    // de /clases; las variantes de gestión (instructor/owner) van a la
    // consola de particulares.
    case "academy.private_lesson.assigned":
      return operational
        ? "/academia/particulares"
        : "/clases?scope=reservadas";
    case "academy.private_lesson.cancelled_paid":
    case "academy.private_lesson.sold":
    case "private_lesson.commission_paid":
      return "/academia/particulares";
    case "class.waitlist.promoted":
      return classId ? `/clases/${classId}` : "/clases";
    case "class.series.resumed":
      return "/clases";
    case "class.instructor_assigned": {
      const seriesId = str(data?.seriesId);
      return seriesId ? `/academia/series/${seriesId}` : "/academia/clases";
    }
    // Push "te invitó" de la cuenta existente (spec academies/
    // student-invites): mismo destino que el `next` del magic link.
    case "academy.invite": {
      return academyId ? `/academias/${academyId}` : null;
    }
    // Suscripción de la persona (membership del alumno).
    case "membership.subscription_started":
    case "membership.subscription_canceled":
    case "membership.subscription_migration":
    case "membership.renewal_reminder":
    case "membership.renewal_failed":
      return "/perfil/pagos";
    case "membership.transfer_renewal":
      return academyId ? `/academias/${academyId}` : "/perfil/pagos";
    case "payment.series_pass":
      return "/clases";
    case "payment.membership":
      return "/perfil/pagos";
    case "payment.membership.received":
      return "/academia/cobros";
    // Suscripción de plataforma del actor (consolas).
    case "academy.subscription_started":
    case "academy.subscription_changed":
    case "academy.subscription_change_scheduled":
    case "academy.subscription_canceled":
    case "academy.transfer_renewal":
    case "academy.billing_grace":
    case "academy.billing_reminder":
    case "academy.billing_settled":
    case "academy.billing_blocked":
      return "/academia/configuracion/suscripcion";
    case "academy.legacy_subs_migrated":
      return "/academia/configuracion/metodos-de-pago";
    case "producer.pro_settled":
    case "producer.pro_started":
    case "producer.pro_changed":
    case "producer.pro_change_scheduled":
    case "producer.pro_canceled":
    case "producer.pro_transfer_renewal":
    case "producer.pro_renewal_failed":
    case "producer.pro_renewal_reminder":
    case "producer.pro_upgrade_required":
      return "/productor/suscripcion";
    case "academy.collections_statement": {
      const period = str(data?.period);
      return period
        ? `/academia/cobros/liquidaciones/${period}`
        : "/academia/cobros";
    }
    case "academy.collections_blocked":
      return "/academia/cobros";
    case "academy.plan_expiring":
    case "academy.plan_grace":
      return academyId ? `/academias/${academyId}` : "/clases";
    case "academy.sale_deal.invited": {
      const agreementId = str(data?.agreementId);
      return agreementId
        ? `/academia/preventas/${agreementId}`
        : "/academia/preventas";
    }
    case "table.confirmed":
    case "table.cancelled":
      return eventId ? `/eventos/${eventId}` : "/eventos";
    // CRM del owner (OPERATIONAL) vs el actor notificado (MARKETING).
    case "crm.digest":
      return "/crm";
    case "crm.segment.enter":
    case "crm.segment.exit": {
      if (!operational) return null;
      const segmentId = str(data?.segmentId);
      return segmentId ? `/crm/segmentos/${segmentId}` : "/crm";
    }
    case "crm.winback":
    case "crm.attendance_drop": {
      return str(data?.actorType) === "ACADEMY" && str(data?.actorId)
        ? `/academias/${str(data?.actorId)}`
        : null;
    }
    case "user.registered": {
      const personId = str(data?.personId);
      return personId ? `/admin/usuarios/${personId}` : null;
    }
    case "payment.confirmed":
    case "payment.amount_mismatch":
      return "/admin/facturacion/transacciones";
    default: {
      // Fallback genérico: el emisor puede mandar el destino resuelto
      // en data.path (tap in-app) o data.url (push de dispositivo) -
      // un solo campo sirve a los dos canales (spec deep-links).
      return safeInternalPath(str(data?.path) ?? str(data?.url));
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

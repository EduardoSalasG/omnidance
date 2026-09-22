// Lente de una notificación según su `type` namespaced. La `category`
// (SOCIAL/TRANSACTIONAL/…) no mapea a la lente — TRANSACTIONAL mezcla
// tickets de eventos (social) con pases de serie (academia). Los tipos
// sin dominio de lente (account.*, crm.*, lead.*) se muestran en ambas.
export type NotificationLens = "social" | "academy" | "any";

export function notificationLens(type: string): NotificationLens {
  if (type.startsWith("class.") || type === "payment.series_pass") {
    return "academy";
  }
  if (
    type.startsWith("session.") ||
    type.startsWith("friend.") ||
    type.startsWith("ticket.") ||
    type.startsWith("waitlist.") ||
    type === "payment.paid" ||
    type === "payment.failed"
  ) {
    return "social";
  }
  return "any";
}

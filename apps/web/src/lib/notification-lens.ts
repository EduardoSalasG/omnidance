// El mapeo type→lente vive en @omnidance/shared (fuente única): la API
// acota el unreadCount con `?lens=` y este front filtra /notificaciones
// con la misma regla. Re-export para no romper imports existentes.
export { notificationLens } from "@omnidance/shared";
export type { NotificationLens, NotificationLensFilter } from "@omnidance/shared";

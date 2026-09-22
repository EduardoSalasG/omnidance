# social-modules-scope

## REMOVED Requirements

### Requirement: Viajes sin cambios funcionales

**Reason**: el módulo Viajes se elimina completo por decisión de producto — vertical completa (UI, endpoints, modelo) para una función marginal fuera del foco de conversión a eventos y prácticas locales.
**Migration**: `/viajes` deja de existir; `POST /trips`, `GET /trips/mine` y `GET /trips/matches` responden 404; la tabla `Trip` se dropea. No hay datos de usuario que migrar (solo seed/demo). El sheet del "+" del bailarín queda con Mi QR + Bailes + Prácticas + Notificaciones.

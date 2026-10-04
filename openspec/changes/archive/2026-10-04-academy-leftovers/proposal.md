# academy-leftovers — pendientes de la ola academia

Cierra los tres pendientes detectados al verificar series de clases.

## Alcance

1. **Reactivar serie notifica** — al pasar `active: true` en una serie
   inactiva, además de rematerializar se crea una notificación
   `class.series.resumed` para los alumnos con enrollment activo en la
   academia.
2. **Agregar slots a serie existente** — PATCH acepta `addSlots` (dow,
   startMin, endMin, capacity, instructorId) y materializa las fechas
   restantes del mes sin duplicar.
3. **Clases sueltas en explorar** — /classes/browse incluye ClassSlots
   sin seriesId (legacy) activos con fechas futuras, marcados sin serie.

## Fuera de scope

- Restaurar bookings cancelados al reactivar (no hay flag que distinga
  cancelación por desactivación vs. por el alumno).

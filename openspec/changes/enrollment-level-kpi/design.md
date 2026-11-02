# Design: enrollment-level-kpi

Ver docs/design-expansion-academia-2026-11.md (sección 1) — modelo
EnrollmentLevel, endpoint insights/levels, KPI card Extendido, sección
"sin nivel" para completar. Principio rector Don't Make Me Think:
lenguaje llano y acción directa.

## Matching alumno→horario

Un slot "cuenta" a un alumno cuando el alumno tiene EnrollmentLevel
(type ∈ slot.types, level = slot.series.levelId) o (sin nivel por ese
tipo) queda en "sin nivel asignado" dentro del agrupado del tipo.
Capacity: slot.capacity → series.quorum → academy.defaultQuorum.

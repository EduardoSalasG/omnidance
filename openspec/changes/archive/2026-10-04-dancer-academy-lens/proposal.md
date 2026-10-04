# dancer-academy-lens — Mi Aprendizaje del bailarín + seed de gamificación

## Why

El toggle Academia del dancer muestra una superficie incompleta respecto de la spec §9 ("Módulo Aprendizaje del bailarín"):

- `/inicio` (academia): el hero con próxima clase apunta a `/academia` — la consola del owner — y el CTA dice "Ir al panel". Un dancer termina en el AcademyGate.
- `/academias`: directorio estático sin "mis academias" (Enrollment existe pero no hay endpoint learner), sin estado presencial/online/pausado, sin videos (el gate learner de `/academies/:id/videos` ya existe pero no se expone).
- `/clases`: solo reservas futuras — falta historial de clases (spec: "historial de clases y talleres") y progreso personal no competitivo.

Además el seed social no siembra gamificación: `Badge`/`Season`/`PointLedger`/`Streak`/`PersonBadge` quedan vacíos y los KPIs del home (racha, puntos, insignias) y el badge destacado del QR salen siempre en cero.

## What Changes

- **API**: `GET /academies/enrolled` — inscripciones del autenticado (academia, estado, plan, asistencias 30d). `GET /classes/mine?scope=past` — historial de clases (reservas pasadas + asistencias, dedup por clase con la asistencia ganando).
- **Web `/inicio` (academia)**: hero apunta a `/clases` con CTA learner; secundario "Explorar academias".
- **Web `/academias`**: sección "Mis academias" (estado, plan, progreso suave, videos desbloqueados/bloqueados) + directorio con badge "Inscrita" + PrivateLessons intacto.
- **Web `/clases`**: sección "Historial" (asistí / reservé / cancelé) + urgencia honesta "¡Últimos N cupos!" cuando quedan ≤3.
- **Seed**: ediciones pasadas de Bachatamanía con sesiones CONFIRMED/RATED del clique (rachas y badges computan de verdad), `Season` activa, `PointLedger` anclado a ids reales, `PersonBadge` con featured para el QR, `Streak` WEEKLY_OUT para el KPI del home, y Enrollment del dancer demo si falta.

## Capabilities

### Modified Capabilities
- `academy-learner`: la lente academia del dancer expone inscripciones, historial, videos restringidos y progreso personal no competitivo.
- `gamification-seed`: el dataset demo demuestra badges, puntos de temporada y rachas coherentes con la actividad sembrada.

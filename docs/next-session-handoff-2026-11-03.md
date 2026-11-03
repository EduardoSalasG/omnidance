# Handoff 2026-11-03 - Inicio academia (dashboard owner)

## Estado

Branch `dev`. API :4000 y web :3000 corriendo (`pnpm dev` por lado). Login demo: `gabriel@omnidance.dev` / `omnidance123`; lente academy owner via `localStorage["omnidance:active-role"]="ACADEMY_OWNER"`.

## Hecho esta sesión

- **Card del agenda "Niveles y cupos"**: alto por contenido (`height:auto`, posicionada por hora de inicio) - aire interno eliminado de raíz tras ~6 iteraciones de flex. Padding compacto (`pb-0`, footer `pt-1.5 pb-1.5`, separador métricas `mt-1.5 pt-1.5 pb-1.5`), "de N" del footer a `text-xs`.
- **Home Extendido**: fila de KPIs del mes (alumnos activos / clases·sem / asistencia·clase→`/academia/asistencia` / Reservas hoy=ΣbookedCount de todayClasses) con hint visible bajo el valor y delta MTD; `AcademyKpiCards` ganó slot `extra`. Sección Facturación propia (facturado + ticket/alumno). Alumnos-activos y facturado describen "con plan vigente este mes" / "cobrado este mes a la fecha".
- **Operación del día** (ambos modos): colas accionables en fila de 4 desktop (cobros por revisar, particulares, planes que vencen, sin nivel) + Clases de hoy | Cumpleaños (3 filas + ver todos).
- **Home Simplificado**: 2 KPI cards (alumnos, facturado) + sección Operación del día completa.
- **`/academia/niveles`**: página funcionando tras mover los endpoints `class-levels` de `EnrollmentsController` a `AcademiesController` (era 404 real, no auth); skeleton infinito→error con retry; `levelsConfig` i18n a nivel raíz del namespace academy.
- **Seed (`enrich-academy-seed.cjs`)**: un nivel por (enrollment,tipo) y el owner de cada academia excluido de rosters de asistencia/reserva (no es alumno).
- **Docs**: `openapi.json` + postman regenerados (366 paths); inventario QA actualizado con la estructura nueva del home.

## Gaps / próximos

- `docs/openapi.json` regen OK pero `classSlotId` del roster no se verificó dentro de los 4 hits.
- E2E Playwright del home nuevo no corrido esta sesión.
- La fila KPI Extendido queda con 4 cards solo si `dashboard` cargó (el extra `Reservas hoy` depende de todayClasses).
- Insight "one level per type" se cumple en editor+seed; la API `PATCH /enrollments/:id/levels` aún acepta levelIds[] multi por tipo (el editor ya no los manda).
- Pendiente si se quiere: botón "Volver a la línea global" en `/academia/niveles` (hoy se sale borrando customs libres).

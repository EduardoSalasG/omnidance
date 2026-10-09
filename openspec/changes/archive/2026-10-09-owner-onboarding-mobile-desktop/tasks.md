# Tasks

- [x] DANCER sin drawer móvil: `drawerGroups` vacío para `activeRole === "DANCER"` (sin `accountGroup`) y `hasDrawerItems` exige `me` resuelto en `BottomNav.tsx`.
- [x] API: `methodsCount` (AcademyPaymentMethod activos) en `GET /academies/:id/dashboard` (Promise.all + respuesta) y en el tipo `AcademyDashboard` de `apps/web/src/components/academy/shared.ts`.
- [x] Checklist persistente en `academy-dashboard.tsx`: visible hasta completar 5 pasos (series → plan → método de pago → equipo → alumno), progreso "N de M", keys i18n (`academy.onboarding.method`, `academy.onboarding.progress`).
- [x] Anchors `data-tour` en dashboard (`academy-kpis`, `academy-checklist`, `academy-today`, `academy-alerts`) y `app-sidebar` en el `<nav>` de `AppSidebar`.
- [x] Tour `academia-owner` en `HomeHub` montado dentro de `AcademyGate`: pasos por sección + navegación por viewport + campana; keys `tours.academiaOwner.*`.
- [x] `OnboardingRunner` sondea targets hasta estabilidad (~1.5s, máx 8s) en vez de resolver una vez — las secciones detrás de fetch entran al tour.
- [x] `SIDEBAR_TOUR` += `/academia` → `nav-academy`, `/academia/clases` → `nav-classes` (tour staff resuelve en desktop); toggle de sidebar renombrado a `sidebar-toggle` para no colisionar con `appbar-menu`.
- [x] Verificación: `tsc` web+api, specs academies 181/181, `i18n-audit` ALL_KEYS_OK, `impeccable detect` limpio, smoke CDP real (dancer sin hamburguesa/drawer en 390px; tour owner 6 pasos en mobile y desktop; checklist "4 de 5" en academia incompleta).

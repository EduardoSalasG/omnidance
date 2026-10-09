## Why

Dos brechas de UX en la navegación y el primer contacto del owner:

1. El rol DANCER sigue viendo la hamburguesa del appbar en mobile: el
   drawer se monta con solo la sección "Cuenta → Perfil" (índice
   residual que `accountGroup` agrega siempre), incumpliendo la spec
   `dancer-navigation` que exige navegación exclusiva por tab bar + sheet.
2. El onboarding del dueño de academia es casi nulo: el tour de primera
   visita (`academia`) queda reducido a **un solo paso** en desktop — su
   único target válido es una card de KPI, porque el segundo (la
   hamburguesa) no existe en `≥lg` — y la checklist de activación se
   oculta apenas llega el primer alumno aunque falten pasos (p. ej. sin
   método de pago configurado la academia no puede cobrar).

## What Changes

- **DANCER sin drawer en mobile (fix de compliance)**: el drawer móvil
  del bailarín deja de renderizarse — `drawerGroups` no recibe el grupo
  Cuenta residual → sin hamburguesa, sin `SideDrawer` navegable. Perfil
  ya es tab del bottom bar.
- **Checklist de activación persistente**: se muestra mientras falte
  algún paso (no hasta el primer alumno). Nuevo paso "método de pago"
  (`methodsCount` en el dashboard) entre plan y equipo; header con
  progreso "N de M".
- **Tour del owner mobile + desktop**: tour propio
  (`onboarding["academia-owner"]`) sobre el dashboard en `/inicio` con
  targets por sección (KPIs, checklist, clases de hoy, alertas) y un
  paso de navegación por chrome: hamburguesa en `<lg`, sidebar en `≥lg`
  (nuevo `data-tour="app-sidebar"`).
- Anchors `data-tour` nuevos en `AcademyDashboard` (`academy-kpis`,
  `academy-checklist`, `academy-today`, `academy-alerts`) y en
  `AppSidebar` (`app-sidebar`); `SIDEBAR_TOUR` gana `/academia` y
  `/academia/clases` para que el tour de staff también resuelva en
  desktop.
- API: `GET /academies/:id/dashboard` incluye `methodsCount`
  (AcademyPaymentMethod activos).

## Capabilities

### New Capabilities

### Modified Capabilities

- `academies/owner-insights`: la checklist persiste hasta completarse
  (antes MUST NOT renderizarse con ≥1 alumno), gana el paso método de
  pago y el dashboard expone `methodsCount`. Nuevo requirement: tour
  guiado del owner con targets por viewport.
- `responsive-app-shell`: los tours de consola MUST incluir un target
  del chrome de cada viewport (no basta con omitir pasos sin target).

## Impact

- `apps/web/src/components/layout/BottomNav.tsx` (drawerGroups, SIDEBAR_TOUR)
- `apps/web/src/components/layout/AppSidebar.tsx` (data-tour sidebar)
- `apps/web/src/components/academy/academy-dashboard.tsx` (checklist + anchors)
- `apps/web/src/components/academy/shared.ts` (methodsCount en tipo)
- `apps/web/src/components/home/HomeHub.tsx` (tour owner)
- `apps/api/src/academies/infrastructure/academies.controller.ts` (methodsCount)
- i18n: `tours.academiaOwner.*`, `academy.onboarding.*`
- Sin migraciones ni cambios de contrato incompatibles (campo aditivo).

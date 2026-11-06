# Tasks: academy-sidebar-switcher

- [x] Exportar `ACADEMY_CHANGED_EVENT` en
  `apps/web/src/components/academy/shared.ts`.
- [x] Crear `apps/web/src/components/academy/academy-switcher.tsx`
  (fetch /academies/mine, dedup, regla de visibilidad owned>1 ||
  canAddAcademy, select con opción __new, dispatch del evento,
  listener para reflejar cambios externos).
- [x] `academy-gate.tsx`: suscribirse al evento y actualizar
  `selectedId` cuando el id pertenece a la lista.
- [x] `entitlements-context.tsx`: `selectionVersion` en el provider,
  bump al evento, exponer en el context value para que
  `useActorEntitlements` re-resuelva la selección.
- [x] `AppSidebar.tsx`: prop opcional `header` (ReactNode) renderizado
  sobre el `<nav>` solo en modo expandido.
- [x] `SideDrawer.tsx`: prop opcional `header` renderizado entre el
  header de marca y el `<nav>`; el switcher cierra el drawer al
  cambiar (callback `onNavigate`-like).
- [x] `BottomNav.tsx`: montar `<AcademySwitcher/>` en ambas superficies
  cuando `activeRole === "ACADEMY_OWNER"` (con `meChecked`).
- [x] Actualizar `docs/qa-flows-inventory.md` (flujo: cambiar de
  academia desde drawer/sidebar).
- [x] Sync `omni-dance.md` (selector en la nav del owner) y
  `docs/architecture.md` si aplica.
- [x] Verificar: `pnpm --filter @omnidance/web typecheck` (o el
  typecheck del repo), lint del archivo tocado.

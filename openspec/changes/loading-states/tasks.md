# Tasks — loading-states

- [x] 1. Inventario: clasificar las 65 páginas + componentes fetchers
     (audit) → tabla FLASH / POP-IN / SPINNER-CRUDO / OK
- [x] 2. Fix `/perfil`: streak/badges/kpis con skeleton en vez de `?? 0`
     y empty-state prematuro; gatear el pop-in de secciones
- [x] 3. Fix páginas FLASH: gate de carga con skeleton (layout conocido)
     o PageLoading antes de contenido/empty-state
- [x] 4. Fix POP-IN: secciones secundarias → skeleton o null hasta data
- [x] 5. Fix lente/modo: secciones dependientes de localStorage
     consistentes SSR↔hydration (todo contenido de lente queda detrás
     del gate de /me del contexto — SSR y primer render pintan loading)
- [x] 6. Reemplazar Spinner crudo de página/sección por skeleton donde
     el layout sea conocido (staff/[eventId], HomeHub → PageLoading)
- [x] 7. Verificar: tsc web limpio, i18n ALL_KEYS_OK, impeccable detect
     en el diff ([])
- [x] 8. Handoff + regen docs si se tocaron contratos (no se tocaron
     contratos de API — nada que regenerar)

# Design: academy-sidebar-switcher

## Decisiones

**Componente único `AcademySwitcher`.** Nuevo client component en
`apps/web/src/components/academy/academy-switcher.tsx`. Encapsula:

- `useMe()` para `me.id`, `me.roles` (admin) y `me.roleStates`
  (ACADEMY_OWNER APPROVED/PENDING → `canCreate`, misma derivación que
  `AcademyGate`).
- Un solo fetch `GET /academies/mine` al montar (el componente solo se
  monta en lente ACADEMY_OWNER con sesión). Dedup por id + nombre
  normalizado, igual que el gate.
- `owned = academies.filter(a => a.ownerId === me.id)`.
- `canAddAcademy = canCreate && (isPlatformAdmin || owned.length === 0
  || owned.some(a => academyTierHas(a.tier, "multiAcademy")))`.
- Visibilidad: `owned.length > 1 || canAddAcademy`. Si no aplica, el
  componente renderiza `null` (sin fetch visible ni layout shift: el
  fetch corre en efecto, nada se pinta hasta tener la lista).
- `<select>` con `inputCls` (mismo control que el hub): opciones =
  academias deduplicadas + `__new` cuando `canAddAcademy`. `__new` →
  `router.push("/academia/nueva")`.

**Propagación por evento, sin reload.** Nuevo evento
`ACADEMY_CHANGED_EVENT = "omnidance:academy-changed"` exportado desde
`components/academy/shared.ts` junto a `ACADEMY_STORAGE_KEY`. El
switcher escribe localStorage y dispara
`window.dispatchEvent(new CustomEvent(ACADEMY_CHANGED_EVENT,
{ detail: { id } }))`. Consumidores:

- `AcademyGate`: `useEffect` suscrito al evento → `setSelectedId(id)`
  si el id está en su lista (re-render del children con la academia
  nueva → cada página de consola refetchea sola).
- `EntitlementsProvider`: guarda `selectionVersion` en estado, lo
  incrementa al recibir el evento y lo expone en el context value →
  `useActorEntitlements` re-lee `localStorage` en el re-render
  subsiguiente (su lectura es lazy por render) → `BottomNav`
  re-filtra los ítems gateados por feature.
- El propio `AcademySwitcher` escucha el evento para reflejar cambios
  hechos desde el hub (misma key, dirección inversa).

**Montaje en el chrome.** `BottomNav` renderiza `<AcademySwitcher/>`
cuando `meChecked && activeRole === "ACADEMY_OWNER"`:

- Desktop: dentro de `AppSidebar`, sobre el `<nav>` de grupos, solo en
  modo expandido (en riel colapsado w-16 un select no cabe; se omite:
  el riel ya es "modo compacto" y el cambio de academia sigue
  disponible expandiendo o en el hub). Se pasa como prop `header` /
  `children` para no acoplar AppSidebar al dominio academia.
- Móvil: dentro de `SideDrawer`, entre el header de marca y el `<nav>`.
  Al elegir otra academia el drawer se cierra vía `onClose` (la
  navegación de página ocurre por el re-render del gate, no por Link).

**Sin keys i18n nuevas**: reusa `academy.title` (aria-label del select)
y `academy.newAcademy` (opción `__new`).

## Riesgos

- Doble fetch de `/academies/mine` (gate + switcher): aceptable, el
  switcher solo existe en lente owner y el endpoint es liviano. Si se
  vuelve ruido, promover a contexto después.
- Selección persistida apuntando a academia donde el viewer no es
  owner (membresía instructor): el gate ya lo soporta; los
  entitlements marcan `resolved=false` y el drawer no recorta
  (fail-open vigente).

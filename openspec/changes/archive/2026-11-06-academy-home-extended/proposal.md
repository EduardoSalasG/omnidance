# Proposal; academy-home-extended

## Why

La revisión UX de la consola del owner (2026-11-05,
`docs/academy-console-ux-review-2026-11-05.md`, slice "Inicio owner")
detectó tres problemas en el inicio de `/inicio` con lente
ACADEMY_OWNER:

- El toggle Simplificado/Extendido añade una decisión que el owner no
  pidió: el modo Simplificado muestra menos información sin ventaja
  clara y el modo Extendido ya es la consola real. Se elimina el modo
  simple y el inicio muestra siempre la vista extendida.
- En desktop la sección "Facturación del mes" (facturado + ticket por
  alumno) queda como una fila propia semivacía bajo el resumen,
  desperdiciando el ancho.
- Los títulos de las cards de colas ("Cobros por revisar", "Planes que
  vencen esta semana") se cortan con elipsis en mobile y desktop.

## What Changes

- **Web** `AcademyDashboard` (`apps/web/src/components/academy/
  academy-dashboard.tsx`):
  - Se elimina el segmented control Simplificado/Extendido, el estado
    `homeMode`, el componente `SimpleHomeCards` y la persistencia en
    localStorage (`apps/web/src/lib/academy-home-mode.ts` se borra; no
    tiene otros consumidores).
  - El inicio renderiza siempre la vista extendida: strip de KPIs del
    mes, operación del día y niveles y cupos.
  - Los KPIs de facturación (`billedMonth`, `avgTicket`) pasan a la
    misma grilla del resumen en desktop, eliminando la sección aparte;
    en mobile el orden queda igual (apilado).
  - Los títulos de las MiniKpi dejan de truncarse: el texto envuelve
    en vez de cortarse con elipsis.
  - El tour del owner (`HomeHub`) pierde el paso del selector de modo
    (anchor muerto) y el paso de facturación apunta al card
    `billedMonth`.
- **i18n**: se eliminan las keys huérfanas de `academy.homeMode`
  (`label`, `simple`, `extended` y las keys del grupo sin uso) y el
  paso `tours.academiaOwner.s10`.

## Out of scope

- Mover el selector de academia al sidebar: decisión de diseño a
  confirmar, lo implementa otro change (BottomNav pertenece a otro
  frente de trabajo).
- Truncate de títulos en `cobros-expiring.tsx` si apareciera: ese
  archivo lo modifica otro change ("Ver todos" de cobros).

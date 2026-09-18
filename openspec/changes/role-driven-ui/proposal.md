# role-driven-ui — IA completa por rol activo

Los módulos principales (tabs, hoja Más, HomeHub) se adaptan al rol
activo del usuario. Multi-rol: el usuario elige su lente en Perfil.

## Matriz de funciones por rol (análisis)

| Módulo | DANCER | STAFF | PRODUCER | ACADEMY/INSTR | DJ | VENUE | ADMIN |
|---|---|---|---|---|---|---|---|
| Inicio | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Eventos | público | — | /productor | — | ✓ | ✓ | ✓ |
| QR hub | ✓ | ✓ | — | — | — | — | — |
| Puerta /staff | — | ✓ | — | — | — | — | — |
| Productor+pagos | — | — | ✓ | — | — | — | — |
| Academia | — | — | — | ✓ | — | — | — |
| CRM | — | — | ✓ | — | — | — | ✓ |
| Admin | — | — | — | — | — | — | ✓ |
| Bailes/Entradas/Prácticas/Viajes | ✓ | — | — | — | — | — | — |
| Perfil + Alertas | común a todos |

## Alcance

1. **`lib/active-role`** — rol activo en localStorage + CustomEvent;
   resolución: stored válido → prioridad (ADMIN>PRODUCER>ACADEMY>
   INSTRUCTOR>VENUE>STAFF>DJ>DANCER) → DANCER siempre disponible.
2. **BottomNav por rol** — tab bars:
   - DANCER: Inicio·Eventos·QR●·Alertas·Más{Bailes,Entradas,Prácticas,Viajes,Perfil}
   - STAFF: Inicio·Puerta·QR●·Alertas·Más{Perfil}
   - PRODUCER: Inicio·Eventos·Crear●·Alertas·Más{Pagos,CRM,Explorar,Perfil}
   - ACADEMY/INSTRUCTOR: Inicio·Academia●·Alertas·Más{Perfil}
   - DJ/VENUE: Inicio·Eventos·Alertas·Más{Perfil}
   - ADMIN: Inicio·Admin·CRM·Alertas·Más{Eventos,Perfil}
3. **HomeHub por rol activo** — hero = módulo del rol activo; tiles
   solo de ese rol; hint "cambia de vista en Perfil" si multi-rol.
4. **Switcher en Perfil** — "Interactuar como": lista de roles del
   usuario + DANCER, radio-group con el activo marcado → actualiza UI.
5. i18n: labels de roles, nav.* nuevas, perfil.actAs.

## Fuera de scope

- Gating server-side (el rol activo es una lente de UI; la API sigue
  autorizando por roles reales).
- Nueva consola para DJ/VENUE_MANAGER (no existe superficie hoy).

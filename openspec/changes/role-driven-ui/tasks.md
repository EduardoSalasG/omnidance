# role-driven-ui — tareas

## 1. Rol activo

- [x] `src/lib/active-role.ts`: getStoredActiveRole / resolveActiveRole
  (prioridad ADMIN>PRODUCER>ACADEMY_OWNER>INSTRUCTOR>VENUE_MANAGER>STAFF>
  DJ>DANCER; DANCER siempre válido) / setActiveRole + CustomEvent /
  useActiveRole hook reactivo

## 2. Nav por rol

- [x] `TABS_BY_ROLE`: DANCER(Inicio·Eventos·QR·Alertas) ·
  STAFF(Inicio·Puerta·QR·Alertas) · PRODUCER(Inicio·Eventos·Crear●·Alertas)
  · ACADEMY/INSTRUCTOR(Inicio·Academia●·Alertas) · DJ/VENUE(Inicio·Eventos·
  Alertas) · ADMIN(Inicio·Admin·CRM·Alertas) — +botón Más siempre
- [x] `MORE_ITEMS_BY_ROLE`: solo funciones del rol activo + Perfil
- [x] Tab "Crear" productor → /productor/eventos?crear=1 (abre form)
- [x] MoreSheet: sin cambio de contrato (secciones por heurística)

## 3. HomeHub + Perfil

- [x] Hero = rol ACTIVO (no prioridad); tiles solo del rol activo
- [x] Card "cambia tu vista desde Perfil" cuando multi-rol
- [x] Perfil: radiogroup "Interactuar como" (roles + DANCER siempre),
  setActiveRole → UI se actualiza sin recarga
- [x] i18n: roles labels, home.switchRoleHint, perfil.actAs

## 4. Cierre

- [x] tsc limpio · build verde (28 rutas) · smoke /inicio /perfil /qr
  /productor/eventos?crear=1 → 200
- [x] Commit

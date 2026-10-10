# Proposal — console-onboarding-tours

## Why

Los tours de primera visita cubren al bailarín (`home`,
`home-academy`, `eventos`, `qr`, `clases`, `bailes`, `amigos`,
`practicas`, `perfil`, `profile-setup`) y al dueño de academia
(`academia-owner`, `academia`), pero dos consolas completas quedaron
sin onboarding:

- **Productor**: la consola v2 (`producer-console-v2`) nunca montó su
  tour — el copy `tours.productor` aún describe la consola anterior
  ("Liquidaciones", listas como módulo separado).
- **Instructor**: su home (KPIs + próximas clases que dicta) y sus
  tabs (Mis clases, Alumnos) no tienen ningún recorrido.

## What Changes

- **Tour del productor** (`onboarding["productor"]`): montado en
  `/inicio` con lente PRODUCER sobre el `ProducerDashboard` — KPIs del
  mes, cobros por revisar y tops (nuevos anchors `data-tour`), más el
  destino Eventos y el chrome (hamburguesa `<lg` / sidebar `≥lg`) y la
  campana. El sidebar replica `nav-events` para `/productor/eventos`
  (mismo mecanismo `SIDEBAR_TOUR` del owner/staff).
- **Tour del instructor** (`onboarding["instructor"]`): montado en
  `/inicio` con lente INSTRUCTOR — semana (KPIs), próximas clases que
  dicta (nuevo anchor `home-classes`), Mis clases (roster/ventana de
  asistencia), Alumnos, campana y perfil.
- **i18n**: `tours.productor` reescrito para la consola v2 y namespace
  `tours.instructor` nuevo.
- Pasos con target condicional (cola de cobros vacía, sin tops, sin
  clases) se omiten sin bloquear el tour — comportamiento ya dado por
  `OnboardingRunner`.

## Out of scope

- Tours por página interna del productor/instructor (fichas, cola de
  comprobantes) — el recorrido cubre el home y la navegación.
- Cambios al runner ni al endpoint `POST /me/onboarding`.

# trial-lifecycle-15d

## Why

Los trials de plataforma operan a medias: la academia recibe 30 días
automáticos pero nadie corta el acceso al vencer ni avisa por correo,
el productor nuevo no recibe trial (el de lanzamiento fue backfill
único) y ningún trial genera contacto de Customer Experience ni
visibilidad operativa en admin. Se quiere un trial de 15 días con
ciclo de vida completo: bienvenida, corte real al vencer, oferta de
conversión el último día y panel de trials en admin, para convertirlo
en un funnel de ventas.

## What Changes

- Trial de academia pasa de 30 a 15 días (`academy_billing.trial_days`).
- Productores nuevos reciben trial de 15 días
  (`producer_pro.trial_days`) al aprobarse `PersonRole(PRODUCER)`
  (cola de validación y grant directo de admin). Nivel PRO_STARTER,
  igual que el trial de lanzamiento.
- Correo transaccional de bienvenida al iniciar el trial: nombre y rol
  del registrado, features clave de TODOS los tiers del dominio con el
  plan en prueba marcado, fecha de término y presentación del contacto
  de Customer Experience. Copia con la ficha completa (nombre, mail,
  teléfono, rol, tier del trial, fecha fin) a `cx.notify_email`.
- Vencimiento con corte real: academia con `trialEndsAt` vencido y sin
  suscripción viva queda con features vacías. La consola muestra solo
  Inicio, Suscripción y Perfil; en Inicio un aviso indica que el trial
  terminó y dirige a Suscripción. La academia se deslista de las
  superficies del dancer (explorar, directorio, clases), sus clases
  dejan de ser reservables y su checkout rechaza compras. La vuelta es
  automática al suscribirse. El productor ya corta solo
  (`isProActive` vencido).
- Barrido diario dentro del job `subscriptions.reconcile`: trials que
  vencen en las próximas 24h reciben correo de último día con oferta
  del 50% del primer mes válida solo ese día, materializada como
  `PlatformPromo` del sistema (`percentOff: 50`, `maxCycles: 1`,
  whitelist por actor, vigente hasta fin del día del envío).
- Card "Customer Experience" en Perfil de ACADEMY_OWNER y PRODUCER:
  nombre, mail y teléfono desde params `cx.contact.*` (seed con los
  datos de Eduardo Salas; editable sin deploy).
- Panel en el inicio de `/admin`: KPIs de trials (activos, por vencer
  en ≤7 días, vencidos sin suscripción) y lista con nombre, rol,
  email, tier del trial, fecha fin y días restantes. "Vencidos sin
  suscripción" es la señal de no-renovación.
- Ajuste admin del fin de trial: `PATCH` sobre `Academy.trialEndsAt`
  y `Person.proTrialEndsAt` desde la consola admin (ficha de
  suscripción y ficha de usuario). Extender reabre acceso si el
  trial estaba vencido; acortar a fecha pasada corta de inmediato.
  Auditado (`AuditLog`) y emitido como `ActivityEvent`.
- Corte unificado al terminar la suscripción: cuando la
  PlatformSubscription queda CANCELED al fin del período pagado (sin
  swap de plan pendiente) se limpia `Academy.tier` y `Person.proTier`,
  y el actor cae a la misma postura que el trial vencido. Hoy el tier
  nunca se limpia y el churned conserva acceso para siempre (bug
  latente: la spec de cancelación pedía bloqueo post-período).
- Trazabilidad en la ficha admin del usuario: línea de vida
  cronológica con registro, solicitudes y aprobación de roles, inicio
  y fin de trial, aviso de último día, suscripción, pagos y
  renovaciones, cancelación, corte y reactivación, para
  ACADEMY_OWNER, PRODUCER y DANCER. Los eventos se persisten en una
  tabla `ActivityEvent` append-only (type, actor, ref, payload) que
  queda como sustrato de observabilidad de actores.
- Schema: `ActivityEvent` nuevo + `Academy.trialEndNotifiedAt`,
  `Person.proTrialEndNotifiedAt` (dedup del correo de último día).
- **BREAKING**: al desplegar el enforcement, academias con trial ya
  vencido o con suscripción caída y sin suscripción pierden acceso a
  las features de la consola y quedan deslistadas hasta suscribirse.

## Capabilities

### New Capabilities

- `platform-trials`: ciclo de vida del trial de actores de plataforma
  (otorgamiento, correos de bienvenida y último día, oferta de
  conversión, enforcement al vencer, contacto Customer Experience).

### Modified Capabilities

- `academy-billing`: el requisito "Trial de onboarding" cambia la
  duración de 30 a 15 días vía param y deja de ser un estado sin
  consecuencia al vencer; el requisito "Cancelación" pasa de la
  lógica de bloqueo por mora a la postura unificada de sin-acceso.
- `admin/home-insights`: el inicio del admin suma KPIs y lista de
  trials de plataforma.
- `admin`: la ficha de usuario suma la línea de vida del actor.

## Impact

- `apps/api` (backend): seteo de `proTrialEndsAt` en la aprobación de
  rol PRODUCER (`admin.controller` y grant directo), resolución de
  features de academia con trial vencido o suscripción caída
  (`academies/domain/academy-tiers.ts` y callers), limpieza de
  `Academy.tier`/`Person.proTier` al CANCELED definitivo en
  `reconcileSubscription`, filtros dancer-facing de academias sin
  acceso (explorar, directorio, reserva de clases, checkout), nuevo
  barrido de último día en `subscriptions.reconcile`, plantillas de
  correo transaccional (bienvenida, último día, ficha al admin),
  endpoint `GET /admin/trials` y `GET /admin/users/:id/timeline`,
  params nuevos.
- `apps/web` (frontend): consola de academia con features vacías (nav
  e hub filtrados a Inicio/Suscripción/Perfil, aviso en Inicio), card
  de Customer Experience en `/perfil`, sección de trials en el inicio
  de `/admin`, i18n es-CL.
- `apps/api/prisma`: migración con tabla `ActivityEvent`, dos
  columnas de dedup (`trialEndNotifiedAt`, `proTrialEndNotifiedAt`)
  y params seed; script de backfill que siembra la línea de vida de
  usuarios existentes.
- Documentación: `omni-dance.md` (Trial 30d), `docs/qa-flows-inventory.md`
  (flujos nuevos), exports de API docs por los endpoints admin nuevos.
- Datos existentes: academias con `trialEndsAt` vencido hoy pasan al
  corte al desplegar; academias/productores con suscripción CANCELED y
  tier persistente se cortan en el primer reconcile posterior al
  deploy (el CANCELED ya consumado no vuelve a transicionar: ver
  design.md, estrategia de backfill de entitlements).

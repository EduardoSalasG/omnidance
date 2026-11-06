# Diseño: tests e2e por flujo (Playwright)

> Diseño para convertir `docs/qa-flows-inventory.md` en una suite Playwright por flujo,
> con una regla simple para saber qué correr tras tocar un archivo. Estado: propuesta,
> no implementado. Al implementarse, crear el change OpenSpec correspondiente (G2).

## 1. Objetivo y alcance

- Que cada flujo de usuario del inventario tenga un spec identificable y corrible en
  aislamiento (`--grep` por tag o por archivo).
- Que tras modificar código exista una forma mecánica de saber qué specs gatillar.
- No es objetivo: cobertura exhaustiva de API (la cubren los tests de Nest), ni
  assertions visuales pixel-perfect (queda `polish-visual` como herramienta manual).

Precondición de todo run: stack vivo (`pnpm db:up` + `pnpm dev`), seed dev
(`pnpm db:seed`) y, para los flujos de academia marcados abajo, `pnpm db:enrich`.

## 2. Estado actual

| Pieza | Rol |
|---|---|
| `playwright.config.ts` | `testDir: ./e2e`, `baseURL` por `QA_BASE_URL`, proyectos `setup` (serial) → `chromium` + `mobile`, `trace: retain-on-failure` |
| `e2e/auth.setup.ts` | Login password por rol → `e2e/.auth/<rol>.json`; retry de throttle (`THROTTLE_AUTH_LIMIT`) y dismiss del ConsentBanner |
| `e2e/helpers.ts` | `USERS` (6 storageStates), `PASSWORD`, `statePath(rol)` |
| `e2e/smoke.spec.ts` | 3 golden paths: dancer eventos, admin `/admin/datos` pills, productor crear→publicar |
| `e2e/notice-smoke.spec.ts` | Estándar ActionNotice: local (perfil) y global tras redirect (crear taller) |
| `e2e/polish-visual.spec.ts` | Recorrido screenshot + console errors de consola academia; serial 300s, a pedido |
| `pnpm test:e2e` | `playwright test` |

Gaps: no hay organización por dominio, no hay tags, no hay mapa archivo→spec, y la
cobertura es 3 flujos. `e2e/.auth/` y `e2e/polish-shots/` son artefactos (verificar
`.gitignore` al implementar; `polish-shots` hoy está commiteado como evidencia).

## 3. Convenciones de specs

### Layout propuesto

```
e2e/
  auth.setup.ts               # proyecto setup, sin cambios
  helpers.ts                  # USERS, PASSWORD, statePath + helpers nuevos
  flow-map.json               # mapa path→tags (§6)
  smoke.spec.ts               # tier 0, tag @smoke
  flows/
    public-login.spec.ts
    dancer-eventos.spec.ts
    academia-alumnos.spec.ts
    ...
  visual/
    polish-visual.spec.ts     # tag @visual, fuera del run default
```

### Nombres y tags

- Archivo: `e2e/flows/<dominio>-<flujo>.spec.ts`. El dominio es el del inventario
  (§4). El flujo es el slug de la superficie.
- Tags: cada spec lleva **dos tags** en el título del `describe`: `@<dominio>` +
  `@<flujo>`. El tag de flujo se repite entre dominios a propósito: `--grep @eventos`
  corre tanto el lado bailarín como el consola productor.

```ts
test.describe("@academia @alumnos lista y ficha", () => {
  test.use({ storageState: statePath("academy") });
  ...
});
```

- Tags especiales: `@smoke` (tier 0), `@visual` (excluido por default),
  `@destructive` (acciones de blast radius admin: grants, params, jobs, campañas,
  payouts, billing void; excluido por default), `@offline` (variantes puerta sin red).

### Proyectos y ejecución

- `chromium` es el proyecto de iteración; `mobile` corre la misma suite. Para
  iteración por flujo usar siempre `--project=chromium` (el spec no decide el
  viewport; la matriz completa es decisión del run, no del autor del spec).
- Propuesta de config (una línea): `grepInvert: process.env.PW_ALL ? undefined :
  /@visual|@destructive/`. Así `pnpm test:e2e` corre smoke + flows; `PW_ALL=1` habilita
  visual y destructivos. Ojo: `--grep` no anula `grepInvert`; para correr un
  destructivo aislado va `PW_ALL=1 pnpm test:e2e --grep @destructive`.

### Selectores y aserciones

- No existe `data-testid` (inventario §0 y Anexo A.2). Selectores estables:
  `getByRole` + nombre accesible, `role="alert"` (errores de acción vía
  ActionNotice), `role="status"` (éxito), `role="dialog"`/sheet, `aria-pressed`,
  `data-tour`. Scope a `main` cuando el nav puede pisar matches (ver smoke admin).
- Esperas: `waitForURL` junto al click, nunca `expect(URL)` suelto tras click (RSC
  pending traga el click). Timers de producto (redirect ~1200ms, overlays 2.5s,
  re-mint QR 50s) se esperan por condición, no con `waitForTimeout`.
- Tours: `OnboardingRunner` puede tapar CTAs en primera visita; el spec descarta el
  tour (botón omitir/cerrar) o pre-siembra `me.onboarding`. Helper propuesto:
  `dismissTours(page)` en `helpers.ts`.
- ConsentBanner: ya lo acepta `auth.setup.ts`; specs con contexto nuevo (segundo
  usuario en un test multi-actor) deben repetir el dismiss. Helper:
  `acceptConsent(page)`.

### Datos y mutaciones

- Personas: las de `helpers.ts` (dancer, carlos/producer, muvet/academy, admin,
  staff, soporte). Para instructor falta `profe@omnidance.dev`: agregar a `USERS`
  cuando un spec de roster lo necesite.
- Datos creados por tests: nombres únicos `QA <cosa> <Date.now()>` (patrón ya usado
  en smoke). `pnpm db:enrich` limpia los fixtures `* Test`/`QA`-like; conviene
  alinear el prefijo con lo que enrich borra para no acumular basura.
- Pagos: `stub://` + `POST /payments/webhook {refId, PAID|FAILED}` cubre el ciclo
  completo; el driver dispara el webhook por `request` fixture, no por UI.
- Estados de error sin backend cómplice: `page.route()` que cumple 500 sobre el
  endpoint del panel → asertar `role="alert"` + retry → quitar la ruta → éxito.
  Patrón determinístico recomendado para todos los estados `error-retry`.
- Multi-actor (amigos, deal productor↔academia, claim dancer→academia):
  `browser.newContext({ storageState: statePath(otroRol) })` dentro del mismo test.

## 4. Inventario → dominios y specs

Mapeo de las secciones de `qa-flows-inventory.md` a dominio de spec. Cada sección
`### Ruta` del inventario produce un spec o un `test` dentro del spec de su módulo.

| Inventario | Dominio (tag) | Specs en `e2e/flows/` |
|---|---|---|
| §1 Público/auth/onboarding | `@public` | `public-landing`, `public-login`, `public-registro`, `public-evento` (`/e/[id]`), `public-reclamar` |
| §2 Dancer descubrimiento | `@dancer` | `dancer-eventos`, `dancer-checkout`, `dancer-clases`, `dancer-directorio` (`/academias`, `/locales`, `/dj`), `dancer-membresia`, `dancer-notificaciones` |
| §3 Dancer social | `@dancer` | `dancer-qr`, `dancer-amigos`, `dancer-practicas`, `dancer-perfil` |
| §4-5 Productor | `@productor` | `productor-eventos`, `productor-ficha-evento`, `productor-deals`, `productor-staff`, `productor-listas`, `productor-codigos`, `productor-backoffice` (colaboradores/comprobantes/medios-pago/parametros), `productor-suscripcion` |
| §6 CRM | `@crm` | `crm-personas`, `crm-campanas`, `crm-segmentos`, `crm-triggers` |
| §7 Analítica | `@analitica` | `analitica-query`, `analitica-usuarios` (admin) |
| §8 Academia | `@academia` | `academia-alumnos`, `academia-series`, `academia-clases` (roster), `academia-particulares`, `academia-equipo`, `academia-cobros`, `academia-planes`, `academia-promos`, `academia-preventas`, `academia-suscripcion`, `academia-config`, `academia-videos`, `academia-hub` (tier gate) |
| §9 Admin | `@admin` | `admin-usuarios`, `admin-perfiles`, `admin-datos`, `admin-finanzas` (`@destructive`), `admin-facturacion`, `admin-parametros` (`@destructive`), `admin-jobs` (`@destructive`), `admin-campanas` (`@destructive`), `admin-catalogos` |
| §10 Soporte | `@soporte` | `soporte-buscar` |
| §11 Staff puerta | `@staff` | `staff-puerta` (+ variante `@offline`) |
| §12 Venue | `@venue` | `venue-dashboard` |
| §13 Multipaís/flags | `@flags` | `flags-ciudades`, `flags-viaje`, `flags-pase` (flag OFF → 404) |

Transversales que no calzan en un dominio: `transversal-notices` (hoy
`notice-smoke.spec.ts`) y `transversal-gates` (forbidden/bounce por rol, §0).

## 5. Mapa flujo → test

Comando patrón: `pnpm test:e2e --grep <tag> --project=chromium`, o por archivo
`pnpm test:e2e e2e/flows/<archivo> --project=chromium`.

| Superficie | Spec | Correr solo ese flujo |
|---|---|---|
| `/login`, `/bienvenida`, `/perfil/completar` | `public-login` | `--grep @login` |
| `/`, `/pro`, `/para-*`, `/e/[id]`, `/reclamar` | `public-landing`, `public-evento` | `--grep @public` |
| `/eventos*`, `/checkout/*` | `dancer-eventos`, `dancer-checkout` | `--grep "@eventos\|@checkout"` |
| `/clases*`, `/academias*`, `/locales/[id]` | `dancer-clases`, `dancer-directorio`, `dancer-membresia` | `--grep "@clases\|@membresia"` |
| `/qr`, `/escanear`, `/bailes` | `dancer-qr` | `--grep @qr` |
| `/amigos*`, `/practicas*`, `/perfil*`, `/notificaciones` | `dancer-amigos`, `dancer-practicas`, `dancer-perfil` | `--grep "@amigos\|@practicas\|@perfil"` |
| `/productor/*` | `productor-*` | `--grep @productor` (o tag fino: `@codigos`, `@listas`, `@deals`) |
| `/crm/*` | `crm-*` | `--grep @crm` |
| `/analitica*` | `analitica-*` | `--grep @analitica` |
| `/academia/alumnos*` | `academia-alumnos` | `--grep @alumnos` |
| `/academia/series*`, `/academia/clases*`, `/academia/asistencia` | `academia-series`, `academia-clases` | `--grep "@series\|@roster"` |
| `/academia/cobros*` | `academia-cobros` | `--grep @cobros` |
| `/academia/planes*`, `/academia/promos*` | `academia-planes`, `academia-promos` | `--grep "@planes\|@promos"` |
| `/academia/{equipo,particulares,preventas,videos}*`, `/academia/configuracion*` | `academia-{equipo,particulares,preventas,videos,config,suscripcion}` | `--grep @academia` o tag fino |
| `/admin/*` | `admin-*` | `--grep @admin` (destructivos: `PW_ALL=1 --grep @destructive`) |
| `/soporte` | `soporte-buscar` | `--grep @soporte` |
| `/staff*` | `staff-puerta` | `--grep @staff` |
| `/venue` | `venue-dashboard` | `--grep @venue` |
| `/ciudades*`, `/mi-viaje`, `/pase` | `flags-*` | `--grep @flags` |

## 6. Regla "qué correr tras tocar X"

Decisión: **`e2e/flow-map.json` como fuente única + script liviano**, no tabla en doc.
Justificación: una tabla en markdown se pudre igual que cualquier doc; el JSON es a la
vez legible por humanos (es una tabla de prefijos), consumible por script, y
revisable en el mismo PR que toca la ruta. El script es azúcar: sin él se puede leer
el JSON a ojo.

`e2e/flow-map.json` (forma; reglas en orden, gana la primera que matchea; matching =
prefijo de path, sin glob complejo):

```jsonc
{
  "comment": "docs/e2e-flow-tests-design.md. Al tocar una ruta o módulo listado, correr los tags. Al agregar superficie, agregar regla.",
  "rules": [
    { "paths": ["apps/web/src/app/[locale]/(app)/eventos", "apps/web/src/app/[locale]/(app)/checkout", "apps/api/src/events", "apps/api/src/payments"], "tags": ["@eventos", "@checkout"] },
    { "paths": ["apps/web/src/app/[locale]/(app)/qr", "apps/web/src/app/[locale]/(app)/escanear", "apps/api/src/qr", "apps/api/src/sessions"], "tags": ["@qr"] },
    { "paths": ["apps/web/src/app/[locale]/(app)/academia/alumnos", "apps/api/src/academies"], "tags": ["@alumnos"] },
    { "paths": ["apps/web/src/app/[locale]/(app)/academia/cobros"], "tags": ["@cobros"] },
    { "paths": ["apps/web/src/app/[locale]/(app)/academia"], "tags": ["@academia"] },
    { "paths": ["apps/web/src/app/[locale]/(app)/productor"], "tags": ["@productor"] },
    { "paths": ["apps/web/src/app/[locale]/(app)/admin"], "tags": ["@admin"] },
    { "paths": ["apps/web/src/app/[locale]/(app)/staff", "apps/api/src/checkins"], "tags": ["@staff"] },
    { "paths": ["apps/api/src/auth", "apps/web/src/app/[locale]/(marketing)/login"], "tags": ["@login", "@smoke"] },
    { "paths": ["packages/shared", "apps/api/src/prisma", "apps/web/src/components/ui"], "tags": ["@smoke"] }
  ],
  "defaultTags": ["@smoke"]
}
```

Script propuesto `scripts/e2e-which.mjs` (~50 líneas, cero dependencias): lee
`git diff --name-only <base>` (default: `HEAD` incluyendo unstaged; acepta
`origin/dev...HEAD`), matchea prefijos contra `rules`, e imprime los tags y el
comando sugerido. Script npm: `"test:e2e:which": "node scripts/e2e-which.mjs"`.

Uso: `pnpm test:e2e:which` → `pnpm test:e2e --grep "@alumnos|@cobros" --project=chromium`.

Casos: archivo sin match → `defaultTags` (`@smoke`). Cambio puro de estilos/i18n en
una superficie → matchea la regla de su path igual (prefiere falsos positivos a
falsos negativos; los specs son la red, no el mapa).

## 7. Specs existentes: cómo encajan

- `smoke.spec.ts`: queda en raíz como tier 0 con tag `@smoke`. Sus 3 describes se
  absorben gradualmente: el de productor migrará a `productor-eventos` cuando ese
  spec exista; el de admin a `admin-datos`; el de dancer a `dancer-eventos`. Hasta
  entonces no se toca: sigue siendo la red mínima.
- `notice-smoke.spec.ts`: se mueve a `flows/transversal-notices.spec.ts` con tags
  `@transversal @notices` (corre en el default; es barato y protege el estándar
  ActionNotice).
- `polish-visual.spec.ts`: se mueve a `e2e/visual/` + tag `@visual` (excluido por
  `grepInvert`). Su output `polish-shots/` sigue igual.
- `auth.setup.ts` y `helpers.ts`: sin cambio estructural; `helpers.ts` crece con
  `dismissTours`, `acceptConsent`, `apiRequest` (wrapper del webhook de pagos),
  `profe` en `USERS` cuando haga falta.

## 8. Backlog priorizado (primeros specs)

Criterio: golden path de dinero o asistencia primero; cada spec cubre happy path +
los estados clave que el inventario documenta (forbidden, empty, error-retry vía
`page.route`). Seed: `db:seed` siempre; `(enrich)` = requiere `pnpm db:enrich`.

| # | Spec | Qué cubre | Rol / seed |
|---|---|---|---|
| 1 | `public-login` | password login → `/inicio`; `?next=` round-trip; 401 credenciales; logout | cualquier `*@omnidance.dev` |
| 2 | `dancer-eventos` | cartelera → detalle; `?view=mios`; deep-link `?a=` atribución; empty por filtro sin match | dancer; eventos PUBLISHED seed |
| 3 | `dancer-checkout` | checkout `stub://` → webhook PAID → ticket en `?view=mios`; FAILED → estado error con retry | dancer; evento con preventa |
| 4 | `academia-cobros` | cola claims → detalle → approve (enrollment ACTIVE); reject sin nota → 400/notice; error de fetch → `role="alert"`+retry | academy (muvet) (enrich: claims PENDING) |
| 5 | `academia-alumnos` | lista + KPIs → ficha; alta enrollment → 409 DUPLICATE; levels editor PATCH | academy (enrich: enrollments) |
| 6 | `academia-series` | crear taller `QA *` → materializa clase → ficha horario → cancel instancia (zona roja) → reserva liberada | academy; catálogo styles/levels |
| 7 | `academia-clases` (roster) | lista `classes/teaching` → roster → marcar presente ventana ±30min; fuera de ventana → 400 | `profe` (agregar a USERS) (enrich: clases) |
| 8 | `dancer-membresia` | checkout membresía TRANSFER → PENDING_PAYMENT → upload comprobante → academia aprueba en `academia-cobros` → sub ACTIVE | dancer + academy (dos contextos) (enrich: métodos TRANSFER) |
| 9 | `productor-eventos` | absorbe smoke crear→publicar + ficha: copiar link público, cancel 2-pasos | producer (carlos); venue catálogo |
| 10 | `productor-colaboradores` | add por búsqueda; tercero sobre cupo free → 403 `tier.required` visible | producer; `free_staff_max=2`, personas seed |
| 11 | `staff-puerta` | boot manifest → check-in manual → dup → 409 rojo; badge conflict en sync | staff; evento PUBLISHED + tickets ACTIVE |
| 12 | `transversal-gates` | dancer → `/academia` = sin-acceso; anon → `/eventos` bounce login `?next=`; instructor → `/academia/particulares` | dancer, profe, anon |
| 13 | `soporte-buscar` | búsqueda ≥2c → detalle read-only; superficie más segura, buen spec de calibración | soporte |
| 14 | `dancer-qr` | `/qr?modo=mio` canvas visible; fallo de mint (`page.route` 500) → error+retry conservando QR | dancer |
| 15 | `academia-planes` | crear plan → desactivar/reactivar sin confirm → reflejado en lista | academy |

Estados clave distribuidos: forbidden (12), empty (2, 5), error-retry (3, 4, 14),
409/duplicado (5, 10, 11), irreversible sin confirm (9 cancel-reserva queda para
`productor-ficha-evento`, fuera de este primer batch).

## 9. Riesgos y decisiones abiertas

- **Sin `data-testid`**: los selectores por rol/i18n son la fragilidad conocida. Si la
  suite empieza a romperse por copy, evaluar `data-testid` solo en CTAs de
  checkout/confirmaciones (recomendación Anexo A.2), no masivamente.
- **Throttle de auth**: 6 logins del setup ya rozan el límite; más storageStates
  (profe, segundo dancer para amigos) exigen `THROTTLE_AUTH_LIMIT=120` en dev
  (documentado en AGENTS.md). El retry de 65s del setup ya cubre el borde.
- **`@destructive` admin**: specs de grants/params/jobs/campañas corren solo con
  `PW_ALL`; diseñarlos sobre un rol/param de prueba y restaurar estado al final.
- **Puerta offline**: la variante `@offline` (IndexedDB queue + sync) es el flujo
  más complejo de automatizar (context offline + cámara). Dejar para segundo batch;
  el spec 11 cubre el camino online manual.
- **Fixture de imagen**: claims con comprobante exigen un upload multipart; agregar
  `e2e/fixtures/receipt.png` (imagen mínima generada) cuando se implemente el spec 8.
- **Limpieza**: decidir si `db:enrich` absorbe el prefijo `QA *` de los tests o si
  los specs borran lo que crean (preferible: cada spec que crea entidad la cancela/
  desactiva al final; delete real solo donde existe UI para ello).

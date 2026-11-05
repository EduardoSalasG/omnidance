# Design: academy-explore-flag

## Context

El sistema de flags ya existe de punta a punta (spec admin "Modelo de
flags de funcionalidad"): `FeatureFlagsService` con cache 30s +
auditoría, `/admin/feature-flags`, `GET /features` público,
`/admin/funcionalidades` y `useFeatures()` en el front montado en el
layout de `(app)`. Precedentes: `academy_line`/`social_line` gatean
solo superficies front (tabs/drawer); `trip_planner`/`city_guides`
gatean front + API 404. Ver proposal.md para la motivación comercial.

"Explorar" no es una página sino un scope dentro de dos páginas
duales: `/academias` (`s=mias|explorar`, fuente única `GET /academies`
con flag `enrolled` por item) y `/clases` (`s=mias|explorar|historial`,
`GET /classes/browse` con o sin `scope=enrolled`). Los estados en URL
usan parámetros `s`, `v`, `q`, `academy`, `view` (legado).

## Goals / Non-Goals

**Goals:**
- Un flag `academy_explore` (default ON) en `FEATURE_FLAG_SEED` que
  apaga solo los listados de descubrimiento, operable desde
  `/admin/funcionalidades` sin deploy.
- Deep links a explorar se degradan con gracia (normalizan a `mias`),
  nunca rompen.
- Fichas `/academias/[id]` y `/clases/[id]` intactas por link directo.

**Non-Goals:**
- Gate server-side de `/academies` o `/classes/browse` (endpoint dual:
  también alimenta `mias`; gatearlo rompería "mis academias" y la ficha
  es parte de la vía de reclutamiento - decisión de producto).
- Muro por academia ("tus alumnos no ven explorar") - evaluación
  comercial diferida; el flag global es el kill-switch mientras tanto.
- Landing de marketing (`/` y `/para-*` sirven catálogo JSON
  commiteado, sin fetch en render - spec marketing-content).

## Decisions

- **Gate solo front, fail-closed** (`flags.academy_explore === true`).
  Coherente con `academy_line` (la otra flag de la misma familia) y
  suficiente para el uso real: el riesgo es un bailarín con URL manual
  viendo listados, no una fuga de datos - `/academies` ya es endpoint
  de sesión con datos no sensibles. Alternativa descartada: gate de API
  404 estilo `trip_planner`, rechazada porque `/academies` es dual-use
  (mias) y exigiría partir el endpoint o filtrar por enrollment en
  servidor para un beneficio marginal.
- **Normalización en la derivación de scope, no redirect**: el parsing
  de `s`/`v`/`view` queda igual y luego `if (!exploreOn && scope === "explorar") scope = "mias"`.
  Un `router.replace` limpiaría la URL pero añade un ciclo de render y
  complejidad por parámetros huérfanos (`q`, `academy`) que ya se
  ignoran fuera de explorar por construcción de `hrefFor`.
- **Scope default sin inscripciones**: hoy `enrollments === []` →
  `explorar`; con flag OFF cae a `mias` por la misma normalización.
  El empty state de `mias` deja de invitar a explorar (copy nuevo o
  CTA condicional, según lo que ya exista).
- **Sin componente/guard nuevo**: el gate vive en las dos páginas con
  `useFeatures()` (patrón `admin/ciudades`), no wrapper - el gate es
  de sub-sección dentro de páginas que siguen siendo válidas, no de
  página entera. En `/academias/[id]` solo se oculta el link
  "Explorar más clases".
- **Loading de flags = explorar oculto** (fail-closed): `flags` parte
  `{}` hasta el primer fetch; la pill explorar aparece ~un frame
  después cuando el flag está ON. Es aditivo (aparece, no desaparece)
  y respeta la regla de fail-closed de la spec admin.

## Risks / Trade-offs

- [URL compartida `?s=explorar` con flag OFF muestra `mias` sin aviso]
  → Aceptado: es el comportamiento fail-closed estándar del repo
  (city_guides igual); el usuario entiende "explorar no existe".
- [Empty state de `mias` sin inscripciones queda sin salida comercial]
  → Con flag OFF el copy no puede invitar a explorar; se usa el empty
  state genérico. Aceptable: el flag es un estado operativo temporal,
  no la experiencia por defecto.
- [`/academies` sigue devolviendo el directorio completo aunque el
  flag esté OFF] → Aceptado por decisión de alcance (front-only); se
  documenta en el spec ("gate de superficie"). Si una filtración del
  dato se vuelve problema, el follow-up es gatear `browse` sin scope
  y partir `/academies` en enrolled/directory.
- [Tours onboarding referencian el elemento `cl-explore`/`academias`
  explorar] → El tour ya renderiza con los pills visibles; con flag
  OFF el data-tour del paso explorar no existe. Verificar en
  implementación que el tour salte ese paso o degrade sin romper
  (mecanismo actual: elemento ausente = paso omitido - revisar).

## Migration Plan

Sin migración de datos: upsert por key en `FEATURE_FLAG_SEED` crea el
flag ON. Rollback = `PATCH /admin/feature-flags/academy_explore`
o deploy reverso; no hay writes destructivos.

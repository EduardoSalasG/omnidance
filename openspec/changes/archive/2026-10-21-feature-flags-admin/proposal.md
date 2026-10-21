# Change: feature-flags-admin

## Por qué

Multipaís despliega features grandes en `dev` que no deben encenderse
en prod hasta validar (Pase Social es el primer caso: se implementa
pero nace **apagado**). Hoy el único mecanismo de toggle es
`/admin/parametros` (key-value JSON genérico, sin semántica de
funcionalidad, sin labels, sin UI dedicada). Se necesita un modelo de
flags de funcionalidad con sección propia en `/admin` para activar y
desactivar por toggle, auditable, consumible tanto por la API como
por el front (ocultar nav/CTAs).

## Qué cambia

- **`FeatureFlag`** (nuevo modelo): `{key @id, label, description?,
  enabled Boolean, updatedById?, updatedAt}`. Seed del catálogo:
  `social_pass` (Pase Social, **default OFF**), `trip_planner` ("Mi
  viaje", ON), `city_guides` (guías de ciudad, ON), `city_landing`
  (landings por ciudad, ON).
- **`FeatureFlagsService`** (módulo `admin` o `common`): `list()`,
  `isEnabled(key)` con cache corta (30s) para uso server-side, y
  `setEnabled(key, enabled, actor)` que audita `FEATURE_FLAG_TOGGLE`.
- **Endpoints**: `GET /admin/feature-flags` (lista con label/desc,
  `admin.access`), `PATCH /admin/feature-flags/:key {enabled}`
  (audita), y `GET /features` **público** → mapa `{key: enabled}` de
  los flags para gating de front (cacheado, sin datos sensibles —
  flags son booleanos públicos por diseño).
- **Front**: página `/admin/funcionalidades` (console-patterns):
  cards de flag con label + descripción + toggle + `updatedAt/By`;
  toggle sin confirm (reversible), `Spinner` inline mientras aplica,
  toast/inline de éxito. Entrada "Funcionalidades" en la navegación
  de admin donde corresponda según el agrupamiento existente.
- **Gating**: helper `useFeatures()`/`features` en el front (fetch
  del mapa público una vez por sesión, context en layout (app)) para
  ocultar/mostrar superficies; server-side `isEnabled` para gates
  de endpoints.
- Migración versionada (orquestador) + seed.

## Fuera de scope

- Flags por región/segmento/rollout % (todo flag es global booleano).
- UI para crear/borrar flags (el catálogo lo define código+seed —
  un flag sin consumer no sirve; solo toggle).
- Expiración/horarios de activación.

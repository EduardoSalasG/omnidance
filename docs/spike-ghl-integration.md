# Spike: integración GoHighLevel (GHL) para academias PRO

Exploración solamente (slice 4 de docs/design-expansion-academia-2026-11.md).
Objetivo: enviar a GHL los KPIs de alumnos por horario y nivel (el nuevo
`GET /academies/:id/insights/levels`) para que la academia automatice
su marketing (captación, retención) desde su propia cuenta de GHL.

## Superficie API de GHL (verificado en docs oficiales)

- Base URL: `https://services.leadconnectorhq.com` (API v2; la v1 está
  en deprecación y ya no emite API keys nuevas en cuentas nuevas).
- Auth: **Private Integration Token (PIT) de Sub-Account** o OAuth
  2.0 (token tipo Sub-Account). Header `Authorization: Bearer` +
  `Version: 2021-07-28`.
- La cuenta de GHL del cliente = un **Sub-Account (location)**: cada
  academia tiene su `locationId`.
- **Custom Values** (`/locations/{locationId}/customValues`,
  scope `locations/customValues.write`): pares clave-valor por
  location, utilizables en campañas email/SMS como
  `{{ custom_values.alumnos_iniciacion_pareja }}`. Es la superficie
  correcta para KPIs agregados.
- **Custom Fields** (`/locations/{locationId}/customFields`): campos
  por contacto (no aplica: no enviamos data individual de alumnos).
- **Workflow inbound webhook**: los workflows de GHL aceptan trigger
  por webhook entrante si en algún momento se quiere disparar
  automatización en vez de solo llenar datos.
- Agency Pro ($497) solo exige endpoints de creación de sub-accounts
  /SaaS; no aplica a este uso (la academia crea su cuenta sola).

## Arquitectura recomendada

1. La academia (tier PRO) configura en su consola: `locationId` +
  PIT (campo nuevo en config de academia, ej. sección Integraciones).
2. Job nocturno (o al materializar métricas): para cada academy con
  GHL configurado, `insights/levels` → `PUT/POST
  /locations/{id}/customValues` upsert por clave estable:
  `alumnos_{tipo}_{nivel}`, `cupos_{slot}` etc. (normalizar nombres
  snake_case).
3. Los custom values quedan disponibles en las campañas/workflows de
  la academia en GHL sin más trabajo nuestro.

## Alcance y límites decididos

- Solo academias con feature `insights` (gate PRO existente) ven la
  sección de configuración.
- One-way push: Omnidance → GHL. No hay webhook de retorno ni sync
  de contactos en este diseño (los datos de alumnos son privados;
  los KPIs agregados no llevan PII).
- GHL no es multi-tenant nuestro: cada academia trae su propia
  cuenta/sub-account; no usamos OAuth marketplace app en v1 (PIT
  basta para integración por cliente). Si se productiza a escala,
  evaluar OAuth app en marketplace de GHL.
- Manejo de errores: si el push falla (401 token inválido, red),
  registrar y seguir; no bloquear nada del producto.

## Estimación de trabajo cuando se implemente

- Schema: campos `ghlLocationId`/`ghlToken` (encriptado) en Academy
  o params `academy.ghl.*`.
- API: endpoints de config (owner-gated) + servicio de push con
  upsert de custom values + job scheduler.
- Front: sección "Integraciones" en consola academia (PRO).
- Testing: fake server GHL en specs; smoke con una location sandbox
  de GHL (crear trial account en gohighlevel.com).
- Costo para el cliente: necesita una subscripción GHL propia
  (~$97/mes sub-account standalone) — fuera de nuestro pricing.

## Decisión pendiente de producto

- ¿Push de KPIs (custom values) alcanza, o el cliente también quiere
  que GHL dispare campañas basadas en esos valores? Con custom
  values ya puede armar segmentación en GHL; webhooks inbound solo
  harían falta si quieren triggers en tiempo real (ej. "alumno
  venció ayer" → workflow). Fase 1 = custom values; fase 2 =
  inbound webhooks por evento si aparece el caso de uso.

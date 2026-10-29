# Proposal: producer-score-refine

## Why

El `RelationshipScore` para `actorType=PRODUCER` usa la fórmula legado
`attendance*10 + spend/1000 + referrals*15`; el spend domina la escala
y no distingue los patrones que el productor quiere premiar: asistir
seguido, comprar preventa temprana, no faltar a los últimos eventos.
Es la fase 2 anunciada del mismo trabajo ("las personas que compran
entradas y asisten a sus eventos").

## What Changes

- Fórmula PRODUCER por componentes (0-100, params `crm.score.*`
  compartidos + `crm.score.early_*` nuevos): eventos recientes, racha de
  eventos consecutivos, meses continuos (checkin o compra), compras
  (TICKET por `eventId` + SERIES_PASS por `seriesId`), compras
  anticipadas, antigüedad, referrals.
- Segmentos: `NEW`/`BRINGS_PEOPLE` igual; `AT_RISK` gana caída a nivel
  evento (0 de los últimos 2 eventos tras ≥2 de los 5 anteriores);
  `CORE` unifica a umbral de score (`crm.score.core_min`).
- Sin cambios de schema ni endpoints (breakdown Json ya existe).
- Specs vitest nuevos + actualización de expectativas en
  `gap-crm.e2e.spec.ts` (los números del fixture cambian por diseño).

## Out of scope

- Ratings como señal (los ratings individuales nunca se exponen).
- Nuevos actores (VENUE/DJ/INSTRUCTOR); siguen sin universo.
- Cambios en superficies web (ya renderizan breakdown genérico).

# Proposal: academia-hub-instructor

## Why

Un instructor puro (sin staff/owner/admin) que llega a `/academia` ve
"Algo salió mal + Reintentar" permanente: `AcademyDashboard` llama
`GET /academies/:id/dashboard` (gate `requireStaff`) que responde 403
determinístico y el retry nunca resuelve. Lo detectó el spec e2e
`transversal-gates`.

## What Changes

- `/academia` no monta `AcademyDashboard` para instructor puro (ni
  mientras `/access` resuelve): la consola queda en la grilla de
  módulos operativos. Owner/staff/admin ven el dashboard como antes.

## Capabilities

- **Modified Capabilities**: `academies/staff-roles` - define qué ve
  el instructor puro al abrir `/academia`.

## Impact

- Web: `apps/web/.../(app)/academia/page.tsx` (condición de render).
- e2e: `flows/transversal-gates.spec.ts` cubre la regresión.

# Proposal: crm-sidebar-section

## Why

El CRM creció a 4 superficies (personas, segmentos, campañas,
triggers) pero en el drawer/sidebar seguía siendo un solo ítem
`/crm` - navegar entre sub-secciones exigía entrar a personas y usar
las tabs internas.

## What Changes

- Nuevo grupo `CRM` en el drawer de PRODUCER, ACADEMY_OWNER y ADMIN
  con 4 destinos: Personas (`/crm`, exact), Segmentos
  (`/crm/segmentos`), Campañas (`/crm/campanas`), Triggers
  (`/crm/triggers`) - labels `crm.nav.*`, íconos nuevos
  (embudo/megáfono/rayo).
- El ítem suelto `/crm` se retira de los grupos producer/academy; en
  ADMIN el tab `/crm` se deduplica automáticamente de la sidebar ≥lg
  porque el grupo ya renderiza su href.

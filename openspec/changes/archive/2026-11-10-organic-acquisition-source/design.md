# Design: organic-acquisition-source

## Decisiones

1. **Dos columnas, no una**: `acquisitionSource` (string normalizado,
   indexable, GROUP BY directo para el reporte CAC) +
   `acquisitionDetail` (Json crudo: UTM completo + referrer +
   landingPath para drill-down). Reportar solo el crudo obliga a
   parsear JSON en cada query; reportar solo el canal pierde el
   medium/campaign.
2. **Normalización en servidor**: el cliente solo reporta lo que
   capturó; el servidor deriva el canal con precedencia
   `utm_source > referrer externo > landingPath > direct`. Un cliente
   no puede forjar una etiqueta arbitraria — solo los insumos.
   `referrer` se normaliza a host (sin path/query) y solo cuenta si
   el host no es propio (omnidance.* / localhost).
3. **Viaje en claims existentes**: `acquisition` se adjunta al magic
   token (claim `acquisition`) y a la fila `AuthOtp` (columna
   `acquisition Json?`), mismo patrón que `role`/`consent`/`next` —
   los dos caminos de verify lo recuperan sin estado extra.
4. **Solo en el alta**: `upsertByEmail(email, acquisition?)` lo
   aplica únicamente cuando crea la Person (rama `registerPerson`);
   cuenta existente → update de verifiedAt igual que hoy, fuente
   intacta. `createWithPassword` igual. Invites: el token de invite
   no lleva claim → `acquisitionSource` queda null y la atribución
   sigue siendo `Referral` INVITE (los dos mundos no se pisan).
5. **Captura first-touch en localStorage**: `omnidance:acq` se
   escribe solo si no existe (la primera landing gana; coherente con
   CAC = canal que trajo a la persona). No cookie: no viaja al
   servidor en cada request y no necesita consent extra (es dato de
   navegación propio). El capture corre en el layout `(marketing)` —
   cubre `/`, `/pro`, `/para-*`, `/login`, `/claim`, legales.
6. **`login-form` envía `acquisition` solo en register y magic**:
   en password-login es ruido ignorado por la whitelist del pipe.
7. **`AuthOtpRecord.acquisition`**: el port gana la columna igual
   que ganó `next` en student-invites.

## Riesgos

- Bots/forja de UTM: aceptable — es analítica interna, no
  facturación. La normalización en servidor limita el daño (la
  etiqueta sale de insumos validados, no del string libre).
- UTM en el alta post-invite: invite consume ya atribuye INVITE vía
  Referral; `acquisitionSource` además queda registrado (coexisten —
  el invite token no lo borra porque no lo lleva).

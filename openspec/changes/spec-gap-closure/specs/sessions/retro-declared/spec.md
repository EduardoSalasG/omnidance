# retro-declared

## Purpose

Permitir declarar un baile sin escaneo QR (elegir a la persona manualmente) con confirmación mutua — cuenta para perfil e historial pero nunca para Prime Time, porque solo el escaneo en vivo alimenta el reveal (spec §4).

## ADDED Requirements

### Requirement: Declarar un baile retroactivamente

El sistema SHALL permitir a una persona autenticada declarar una sesión de baile con otra persona del mismo evento sin escaneo QR. La sesión se crea como invitación pendiente (`retroDeclared = true`) y requiere confirmación de la contraparte igual que una invitación por escaneo.

#### Scenario: declaración exitosa

- **WHEN** una persona autenticada envía `POST /sessions/declare` con `eventId` y `personId` de otra persona
- **THEN** el sistema crea la sesión con `retroDeclared = true`, status INVITED, y notifica a la contraparte

#### Scenario: confirmación mutua requerida

- **WHEN** la contraparte confirma la declaración
- **THEN** la sesión pasa a CONFIRMED y es rateable igual que una escaneada

#### Scenario: bloqueos aplican igual

- **WHEN** la contraparte tiene bloqueado al declarante
- **THEN** la declaración se rechaza silenciosamente igual que una invitación por QR

### Requirement: Exclusión de Prime Time

Las sesiones `retroDeclared` SHALL contar para perfil, historial, streaks y badges, pero MUST NOT contar para el contador ni el reveal de Prime Time.

#### Scenario: contador excluye declaradas

- **WHEN** un evento tiene 10 sesiones confirmadas de las cuales 3 son `retroDeclared`
- **THEN** el contador Prime Time muestra 7

#### Scenario: leaderboard/reveal excluye declaradas

- **WHEN** se computan los ganadores del reveal
- **THEN** solo sesiones con `retroDeclared = false` aportan evaluaciones al cálculo

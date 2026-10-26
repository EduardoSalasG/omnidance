# Design — multipais-phone

## Contexto

`Person.phoneCountryCode String?` existe sin consumidores. Los write
paths de `phone` hoy: `updateMe` (regex `/^\+?[0-9]{8,15}$/`),
`completeProfile` (sin validación de formato), `door-sale` (campo
`phone` plano → `createLightPerson`), `POST /leads` (`Lead.phone` →
`Person.phone` en convertLead), import CSV (`telefono`). `Person.phone`
es `@unique` y las búsquedas (`findPersonByPhone`) son match exacto —
sin normalización el mismo número en dos formatos es otra Person.

## Decisiones

### P1. libphonenumber-js vía shared

`@omnidance/shared` exporta `normalizePhone(raw, defaultCountry)`:

```
normalizePhone("9 1234 5678", "CL") → { e164:"+56912345678", countryCode:"CL" }
normalizePhone("+1 415 555 2671", "CL") → { e164:"+14155552671", countryCode:"US" }
normalizePhone("123", "CL") → throws InvalidPhone
normalizePhone("", "CL") → null
```

Reglas:
- `raw` vacío → `null` (limpiar teléfono).
- `raw` con `+` inicial → `parsePhoneNumber(raw)` E.164; el país sale
  del número (`defaultCountry` se ignora).
- Sin `+` → `parsePhoneNumber(raw, defaultCountry)`; formato nacional.
- Inválido → error tipado que los controllers traducen a
  `400 telefono_invalido` (mismo contrato de hoy, mensaje i18n).
- Resultado siempre incluye `country` del número parseado → se persiste
  en `phoneCountryCode`.

`isPossiblePhoneNumber` para validación temprana en front; el API
siempre re-valida.

### P2. Storage: `phone` = E.164 con `+`, `phoneCountryCode` = ISO-2

- `@unique` se mantiene sobre `phone` — E.164 hace el dedup real.
- `phoneCountryCode` se deriva del parseo, nunca se confía en el del
  body (el body `phoneCountryCode` es solo el hint de país nacional).

### P3. Write paths

| Path | defaultCountry | Notas |
|---|---|---|
| `PATCH /me` | `dto.phoneCountryCode` ?? "CL" | 409 `phone_exists` sobre E.164 |
| `POST /me/complete-profile` | `dto.phoneCountryCode` ?? "CL" | idem |
| `POST /checkins/door-sale` | país del venue del evento | dto gana `phoneCountryCode?`; findByPhone con E.164 |
| `POST /leads` | `body.phoneCountryCode` ?? "CL" | lead.phone normalizado; convertLead hereda |
| import CSV `telefono` | país de la academia | fila inválida → error de fila como hoy |

### P4. Backfill (migración de datos)

SQL en la migración: `phoneCountryCode='CL'` a toda fila con phone y
sin código; normalizar `phone`: si empieza con `+` se deja; si son
9 dígitos o `56…` sin `+`, anteponer `+56`/`+`. Riesgo de colisión del
`@unique`: pre-validar con un SELECT de duplicados post-normalización;
si existen, la migración deja la fila duplicada intacta (normaliza solo
si no colisiona) y se reporta en el handoff.

### P5. Front — `PhoneInput`

Componente en `components/people/phone-input.tsx` (o `ui/` si encaja
atómico): props `{ value, defaultCountry, onChange({e164,countryCode}) }`.
Selector de país = dropdown con dial code (lista de países soportados
de libphonenumber, sin catálogo propio). Regla de UX:

- `/perfil/datos`, `/perfil/completar`, `/bienvenida`: selector visible.
- Door-sale staff y `ProLeadForm`: sin selector — el input asume el país
  de contexto (venue del evento; CL para el lead) y tipear `+` cambia a
  modo internacional. Texto de ayuda muestra el país asumido.

El front manda `{phone, phoneCountryCode}`; el API decide.

## Riesgos

- **Bundle**: libphonenumber-js completo ~140KB min; aceptable (se usa
  en varias superficies). Si pesa, `max` → `min` metadata custom en una
  iteración posterior — no bloquea.
- **Backfill con duplicados reales**: cubierto en P4.
- **`Academy.whatsapp`** ya documenta E.164 sin `+` — no se toca (fuera
  de scope).

## Verificación

- Specs del helper (CL nacional, E.164, inválidos, override `+`).
- Specs de cada write path (409 sobre E.164, país derivado, default
  por contexto).
- Migración aplicada + SELECT de sanity (phones con `+`, codes CL).

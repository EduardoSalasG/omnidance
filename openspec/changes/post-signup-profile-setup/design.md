# Design - post-signup-profile-setup

## Decisiones

- **Página dedicada, no modal/sheet**: `/bienvenida` vive en el grupo
  `(app)` (requiere sesión, hereda chrome). Misma estética que
  `/perfil/completar` (Card + form + inputCls). Skippable en todo
  momento: "Ahora no" es un flujo de primera clase, no un dismiss.
- **`me.onboarding` como storage del "ya pasó"**: reusa el JSON de
  tours existente (`POST /me/onboarding` con slug `[a-z0-9-]+`). Claves
  nuevas: `profile-setup` (página ya vista) y `profile-reminder`
  (card de /perfil descartada). Sin columnas nuevas ni migración.
- **`?next=` se propaga**: register guarda el next en la query de
  `/bienvenida`; al terminar u omitir, se consume con la misma
  validación anti open-redirect del login (`startsWith("/") &&
  !startsWith("//")`).
- **`GenderGroup` se extrae** de `/perfil/datos` a
  `apps/web/src/components/profile/GenderGroup.tsx` para reusarlo sin
  duplicar (segmented control con roving tabindex).
- **Estilos de baile en welcome**: versión compacta del editor de
  `/perfil/datos` - chips multi-select de estilos (`GET /styles`), y
  por estilo elegido pills de rol (LEADER/FOLLOWER/SWITCH) + select de
  nivel opcional. Persiste con `PUT /me/style-roles` solo si hay al
  menos un estilo.
- **409 en PATCH /me**: check explícito de `Person.phone` (unique)
  antes del update, devolviendo `ConflictException("phone_exists")` -
  mismo contrato que `completeProfile`. El front mapea 409 a copy
  dedicada en el welcome.
- **Card recordatorio en `/perfil`**: condición = sesión resuelta +
  alguno de {phone, instagram, gender} ausente o `styleRoles` vacío +
  `!onboarding["profile-reminder"]`. Dismiss → `POST /me/onboarding`.
  Vive solo en `/perfil`, no en el chrome global (sutil por diseño).

## Fuera de scope

- Foto de perfil (`photoUrl` no tiene upload; la spec lo menciona pero
  no hay infraestructura todavía).
- Pedir estos datos a cuentas creadas por staff en puerta
  (`isLightAccount`) ni leads demo (`pendingProfile` tiene su propio
  flujo `/perfil/completar` que queda intacto).
- Obligatoriedad: ningún campo se vuelve requerido.

## Errores

- `PATCH /me` 409 → copy "ese teléfono ya está en otra cuenta".
- Fallos de red/save → error inline + retry; "ahora no" siempre
  disponible aunque falle el guardado.
- `/styles` falla → el welcome sigue usable sin la sección de baile.

# Propuesta: cuota semanal de clases visible en Inicio (home-weekly-quota)

## Why

El alumno no sabe cuántas clases le quedan de su plan semanal — la cuota
solo aparece dentro de la ficha de cada clase (`myCredits`). El mensaje
de agotamiento del API además llega con minúscula inicial y mal plural
("agotaste tus 1 clases"). La home debe mostrar el consumo del plan con
CTA directo a agendar.

## What Changes

- `GET /classes/my-quota` (sesión): por cada inscripción reservable del
  viewer devuelve `{ academyId, academyName, kind: WEEKLY|PACK|UNLIMITED,
  used, limit }` — WEEKLY cuenta la semana ISO actual (misma lógica que
  `resolveQuota`: BOOKED + CANCELLED sin refund, sin seats pagados);
  PACK cuenta desde startedAt; UNLIMITED sin números.
- Home (`HomeHub`, vista bailarín): `WeeklyQuotaCard` — una fila por
  inscripción: "Has agendado X de tus N clases semanales en <academia>"
  + CTA "Agendar" → `/clases?scope=mias`. Estados: 0/N ("Aún no has
  agendado — te quedan N"), X/N, N/N (agotado — copy distinto, sin CTA
  o CTA a la próxima semana), N=1 singular ("tu clase semanal"), PACK
  ("Te quedan X clases de tu pack en <academia>"), UNLIMITED ("Plan
  ilimitado"). Sin inscripción → la card no se monta.
- Fix de copy: el mensaje de cuota agotada del API con mayúscula
  inicial y plural correcto.

# Expansión academia: niveles de alumno, cupos, GHL, sociales internos y link público

Brainstorming → diseño (2026-11-02). Decisiones tomadas con el owner en
sesión; cada bloque se implementa como su propio change OpenSpec.

## 1. Nivel del alumno por tipo de clase + KPI nivel×horario

### Decisión del modelo

El nivel NO es único por academia: es **por tipo de clase**
(`ClassType`: En Pareja | Shines | Corporalidad) y **multinivel**
(un iniciación va a Iniciación+Básico, un básico a Básico+Intermedio,
un intermedio a Intermedio+Avanzado, un avanzado puede bajar a
Intermedio). Solo el owner lo gestiona (el alumno no se auto-nivela).

### Modelo propuesto

```
EnrollmentLevel {
  enrollmentId  → Enrollment (alumno × academia)
  classTypeId   → ClassType  (pareja | shines | corporalidad)
  levelId       → ClassLevel (iniciación | básico | intermedio | avanzado)
  @@id([enrollmentId, classTypeId, levelId])
}
```

Un enrollment puede tener varias filas (multinivel × multi-tipo).
Default al crear enrollment: nivel `iniciación` en los tipos que el
plan/clases de la academia ofrecen, editable por el owner en la ficha
del alumno (roster).

### KPI card en `/academia` (solo owner)

Grid **tipo × nivel** con alumnos activos, y por cada horario
(`ClassSlot`): alumnos asignables (los que matchean types del slot +
level de la serie), `capacity` del slot, cupos vacíos, promedio de
asistencia y asistencia de la última instancia (`Attendance`/`Class`
ya existen). Uso: el owner ve qué horario tiene cupo por nivel cuando
llega un alumno nuevo de publicidad, sin saturar.

Endpoint sugerido: `GET /academies/:id/insights/levels` →
`{byType: [{typeId, typeName, levels: [{levelId, levelName, count}]}],
bySlot: [{slotId, label, types, level, capacity, assigned, empty,
avgAttendance, lastClassAttendance}]}`.

### Pendientes de decisión

- ¿Un alumno sin `EnrollmentLevel` cargado cuenta como "iniciación" en
  todo, o queda fuera del grid (badge "sin nivel" para completar)?
  Propuesta: sección "sin nivel asignado" en la card para forzar el
  completamiento por parte del owner.

## 2. Integración GoHighLevel (PRO, exploración)

Spike únicamente: entregar a GHL los KPIs nivel×horario (alumnos por
horario y nivel). Evaluar: GHL API v2 (custom values en sub-account vs
workflow webhook), auth por academia (API key en su config) vs OAuth,
feature gate PRO. Output: doc de spike con recomendación de
arquitectura; sin código de integración aún.

## 3. Sociales internos (academia produce para sus alumnos)

### Decisión

Los crea **el owner con rol PRODUCER** (doble rol existente), y el
evento queda ligado a su academia: `Event.visibility =
INTERNAL_ACADEMY` + `event.academyId`.

### Reglas

- Sociales internos NO salen en feed público/búsquedas; visibles y
  comprables solo para enrollments ACTIVE de esa academia (gate en
  checkout: "evento exclusivo de la academia" para el resto).
- La asistencia a esos sociales alimenta el **score del alumno para
  esa academia** (misma dimensión de asistencia que ya pondera el
  score-academia). Score-producer de la persona queda independiente:
  si el actor es solo productor, nada cambia; si es academia+productor,
  el score-academia incluye los sociales propios.
- Idea anotada (sección congresos): más adelante evaluar que la
  asistencia a congresos gestionados por la academia también sume al
  score-academia.

## 4. Link público del evento (captación → user normal)

Landing pública del evento compartible por el productor (solo venta de
tickets). La landing es **de captación**: muestra el evento completo;
al "Comprar entrada" sin sesión → registro/login → redirect al **link
normal de la app** (`/eventos/:id`), donde el user ya opera el flujo
estándar (ticket, mesa, etc.). No es un checkout especial: la landing
solo captura; tras login todo es el flujo normal.

Pendiente de verificación: qué de la ficha pública ya existe hoy y el
patrón `returnTo` post-auth que ya usan otros flujos.

## Orden sugerido de implementación

1. `EnrollmentLevel` + gestión por owner + KPI card (valor inmediato
   para el caso de uso real: asignar horario a alumnos nuevos).
2. Link público (trabajo chico si la ficha pública ya existe).
3. Sociales internos + score cruzado.
4. Spike GHL (exploración, puede correr en paralelo).

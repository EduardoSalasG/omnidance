# Change: academy-tier-v2

## Why

El gating por tier cubre secciones completas pero hay **leak de
features en superficies compartidas**: una academia COBROS ve score y
clasificación CRM en cards/detalle de alumnos, info de asistencia,
insight de audiencia y clases de hoy en el home de academia. Además
"Consultas rápidas" debe ser exclusiva PRO y "Agregar academia" solo
en el tier más alto. COBROS carece de su propia analítica de cobranza
(facturación mensual, quién pagó, plan top). Y las academias necesitan
promos sobre sus planes (becas/descuentos por alumno, incluida
preventa sin inscripción).

## What Changes

- **Feature gating fino en superficies compartidas**: score/clasificación
  CRM solo con `crm`; asistencia en detalle solo con `attendance`;
  insights de audiencia en home solo con `insights`; lista "clases de
  hoy" solo con `classes`; KPIs operacionales (ocupación/asistencia)
  con `attendance`+`classes` (STUDIO los conserva).
- `analytics` (PRO) gatea /analitica/consultas. `multiAcademy` (PRO)
  gatea "Agregar academia" (CTA + ruta + POST /academies server-side).
- **Card de alumno**: chip de plan actual con color.
- **Reporte de cobranza** (todos los tiers - es el piso de COBROS):
  facturación mensual, alumnos que pagaron, plan más vendido, filtros.
- **AcademyPromo**: promo creada por la academia sobre planes de
  membresía - % o CLP fijo, ventana, maxCycles, whitelist de personas
  (vacía=todos; permite preventa a no inscritos), habilitable. Aplica
  en el cobro del plan con planId propio y audita en el Payment.

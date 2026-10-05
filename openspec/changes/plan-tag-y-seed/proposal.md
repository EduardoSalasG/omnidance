# Change: plan-tag-y-seed

## Por qué

En la ficha pública de la academia, el tipo de plan (Mensual / Trimestral /
Semestral) se muestra como texto gris junto al nombre, mientras el seed
rellena el nombre del plan con esa misma información
("Mensual — 1 clase semanal", "Trimestral ilimitado") — duplicación de
jerarquía visual: el nombre hace de tag y el tag de metadata. Además solo
las academias demo ofrecen clase de prueba / clase suelta.

## Qué cambia

- El tipo de plan se renderiza como **tag verde** (`Badge variant="neon"`)
  junto al nombre; la línea gris queda solo para cuotas (N clases, N/semana).
- Nombres de plan = nombres de categoría propios de cada academia (Básico,
  Plata, Oro, Premium, VIP, Diamante…), sin periodo ni conteo semanal.
- El seed siembra en **todas** las academias una `TRIAL` ("Clase de prueba",
  $0) y una `SINGLE` ("Clase suelta").
- Renombres idempotentes: `plan()` acepta `aliases` — si existe el plan con
  el nombre viejo se renombra in-place; restos huérfanos se desactivan
  (no se borran — pueden tener enrollments).

## Out of scope

Sin migración ni cambio de schema. La consola de planes del owner ya muestra
el tipo como badge. Plans existentes creados por owners quedan intactos.

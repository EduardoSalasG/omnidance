# Design: academia-hub-instructor

Una condición de render: `AcademyDashboard` se monta solo cuando
`access !== null && !pureInstructor`. Mientras `/access` carga (null)
tampoco se monta, porque para el instructor el fetch saldría igual a
403 (evita el flash skeleton→error). El efecto colateral: owner/staff
ven el dashboard ~un fetch más tarde que antes (el de `/access`, que
ya es paralelo y rápido); no hay skeleton extra porque el ModuleGrid
ya cubre el primer paint con `access !== null`.

Alternativa descartada: abrir `/dashboard` a instructores. Los KPIs de
cobranza/colas son privados del equipo administrador; exponerlos al
instructor rompe la regla de visibilidad por caps.

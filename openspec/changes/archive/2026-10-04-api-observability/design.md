# Design — api-observability

## Decisiones

- **`nest-winston` como bridge**, no reescribir servicios: los `new
  Logger(X.name)` existentes y los logs internos de Nest fluyen por
  winston sin tocar los ~10 servicios. El contexto (nombre de la clase)
  sigue llegando como `context`.
- **Middleware, no interceptor**: un interceptor global no ve 404s de
  express ni errores fuera del pipeline Nest. El middleware corre antes
  de todo y loguea en `res.finish` — cubre el 100% de requests HTTP.
- **`AsyncLocalStorage` para `requestId`** (Node nativo, cero deps
  extra): cualquier `logger.log()` dentro del request — en servicios,
  schedulers disparados por request, guards — lleva el id sin pasar el
  objeto por parámetros.
- **Redacción defensiva por nombre de clave**: formato winston que
  recorre objetos meta (profundidad acotada) y enmascara valores cuyo
  key matchee `/authorization|cookie|password|secret|token|jwt|session|
  qr(_|-)?(token|payload)?/i`. Es cinto y tirantes con la regla del repo
  de no loggear QR/secrets — aunque el código de negocio ya no lo haga.
- **Sin transporte de archivos ni externos** (decisión del usuario):
  stdout pretty en dev, JSON en prod; el collector lo toma del stdout
  del proceso.
- **Sin métricas/tracing distribuido**: este change es logging
  estructurado; métricas (Prometheus) y tracing (OTel) son changes
  futuros si se necesitan.

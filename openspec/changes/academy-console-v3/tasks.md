# Tasks — academy-console-v3

## 1. UI fixes
- [x] 1.1 `ExpiringList`: `flex-1` en la celda nombre (mobile colapsaba).
- [x] 1.2 Token `--warn` (amber-700 claro / amber-300 oscuro) + `warn`
      en tailwind; swap de amber-* en consola owner, billing y HomeHub.

## 2. Nav y estructura
- [x] 2.1 Sidebar owner: Inicio solo; Planes→Administración; sin
      Analítica duplicada ni Asistencia/Horarios; Series→"Clases".
- [x] 2.2 ConsoleHeader: back solo en subpáginas (no-raíz del sidebar).
- [ ] 2.3 Perfil owner: sin semanas/pagos/academias; Apariencia→Config.
- [ ] 2.4 Configuración como sección de páginas (incl. medios de pago).

## 3. Clases
- [x] 3.1 Page "Clases": filtros modalidad/nivel, default activas,
      cards sin acciones → detalle; botón Importar clases (CSV).
- [x] 3.2 Detalle de serie: editar, slots, desactivar/reactivar,
      eliminar lógico, próximas + reservas, historial + asistencia.
- [x] 3.3 POST /classes/:id/attendance (instructor efectivo o admin;
      alumno con reserva BOOKED); roster gana canMark + Presente;
      /academia/asistencia y /academia/horarios → redirect a Clases;
      POST /academies/:id/attendance legacy restringido a instructor.
- [x] 3.4 Schema: `ClassSeries.deletedAt` + migración; GET /series la
      excluye; PATCH active:true restaura.

## 4. Planes / Cobros / Equipo / Particulares
- [ ] 4.1 Planes: KPIs top3 + sort + detalle con alumnos vigentes.
- [ ] 4.2 Cobros: detalle de pago, historial unificado, medios de pago
      →configuración, KPIs facturación/ticket/top3 métodos.
- [ ] 4.3 Equipo: alta única con tipo; detalle miembro (profe: stats +
      encuestas; colaborador: permisos editables).
- [ ] 4.4 Particulares: sin comisión — solo solicitudes + agendar.

## 5. Analítica + alumno + encuestas + paginación
- [ ] 5.1 /analitica = consultas única; sin chips rol/vista.
- [ ] 5.2 Detalle alumno: score.
- [ ] 5.3 Encuestas mensuales curso/profe end-to-end.
- [ ] 5.4 Paginación en endpoints y vistas de listado.

## 6. Cierre
- [ ] 6.1 build/tests/tsc/i18n/impeccable/openspec validate; docs API;
      commits por slice; archivar.

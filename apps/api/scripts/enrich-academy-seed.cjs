// ═══════════════════════════════════════════════════════════════════
// enrich-academy-seed.cjs — enriquecimiento demo de academias.
//
//   cd apps/api && node scripts/enrich-academy-seed.cjs
//
// Pensado para correr DESPUÉS de `pnpm db:seed` (SEED_ENV=dev) contra
// la DB del docker-compose (DATABASE_URL de apps/api/.env). Es
// idempotente: re-correrlo no duplica nada — cada escritura va
// protegida por clave natural (findFirst/upsert/createMany
// skipDuplicates) o por refId determinista.
//
// Lo que hace:
//   1. LIMPIEZA: borra entidades claramente de prueba (Event/Venue/
//      EventSeries/Academy/Style/Person fixture: "QA Evento *", "GP *",
//      "Gamif *", "* Test", "smoke*", "Producer Ajeno/Payout/Serie",
//      "Comprador E2E", "Buyer *", "CRM T*", "Academia SmokeSub",
//      "Venue Gamif", etc.). NO toca personas @omnidance.dev ni data
//      seed real. Las personas con grafo que no se puede borrar por FK
//      quedan con deletedAt (soft-delete) en vez de romper el script.
//   2. NIVELES: asigna EnrollmentLevel a todo Enrollment ACTIVE sin
//      niveles (~40% Ini, ~30% Ini+Bás, ~20% Bás+Int, ~10% Int+Avan),
//      con classType ponderado por lo que la academia ofrece.
//   3. CLASES: materializa instancias Class del mes vigente y el
//      siguiente para slots sin ellas (misma regla que el seed:
//      Class.date a medianoche UTC por weekday). Crea parrilla mínima
//      a academias con alumnos pero sin series (Academia Tumbao).
//   4. ASISTENCIA: rellena Attendance en clases ya dictadas sin
//      asistencia (60–85% de los BOOKED, determinista por clase+alumno;
//      fallback roster ACTIVE). Clases de hoy ya iniciadas reciben
//      asistencia parcial.
//   5. SUSCRIPCIONES: PlatformSubscription ACTIVE (tier/ciclo variado)
//      + invoice PLATFORM_SUB PAID para academias sin suscripción;
//      MembershipSubscription por academia mezclando CARD/TRANSFER en
//      ACTIVE/CANCEL_PENDING/PENDING_PAYMENT — estas últimas con su
//      Payment MANUAL PENDING + TicketClaim domain=ACADEMY PENDING
//      (colas de revisión pobladas).
//   6. COBROS: top-up de PaymentClaim PENDING (~3 por academia) y
//      APPROVED del mes + MTD anterior para academias sin cobranza
//      (alimenta Facturado/Ticket-alumno/comparativas).
//   7. KPIs de inicio: cumpleaños próximos (Person.birthDate en 2-3
//      alumnos por academia), PrivateLesson REQUESTED donde hay
//      privateLessonPrice, y check-ins en 1-2 eventos pasados +
//      un par de eventos nuevos de noviembre para productores sin
//      cartelera en la 2ª quincena.
//
// NO reproduce: ratings/evaluaciones, CRM scores, payouts (fuera del
// pedido). Los claims PENDING no llevan receiptKey real (quedan como
// comprobantes declarados; los TicketClaim de subs sí llevan
// receiptKey sintético claims/academies/<id>/enrich-*.png).
// ═══════════════════════════════════════════════════════════════════
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

// ── determinismo: misma corrida → mismas elecciones ──
const h = (s) =>
  parseInt(crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 8), 16);
const pctOf = (s) => h(s) % 100; // 0-99

const now = new Date();
const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const afterNextStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
const prevMtdEnd = new Date(prevMonthStart.getTime() + (todayUTC.getTime() - monthStart.getTime()));
// Santiago en noviembre = UTC-3: la hora local de una clase a las HH:MM
// del slot ocurre a las (HH+3) UTC del mismo Class.date.
const LOCAL_OFFSET_H = 3;

const report = [];
const say = (s) => { console.log(s); report.push(s); };

async function main() {
  // ═══════════ 1. LIMPIEZA ═══════════
  console.log("\n═══ 1. Limpieza de fixtures de prueba ═══");

  // Personas fixture ANTES que eventos/academias (libera FKs de producer/owner).
  const JUNK_PERSON_RE =
    /test|gamif|smoke|^GP |^GE |^Producer |^Buyer |^CRM T|^Comprador|^Ajeno|Payout|SeriesPass|e2e|leads/i;
  // OJO: NOT endsWith en Prisma excluye también los email NULL - el
  // filtro de dominio se hace en JS para cubrir fixtures sin correo.
  const junkPersons = await prisma.person.findMany({
    where: { isDemoAccount: false, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  const personIds = junkPersons
    .filter(
      (p) =>
        JUNK_PERSON_RE.test(p.name) &&
        p.name !== "Jorge Camacho" &&
        (!p.email || !p.email.endsWith("@omnidance.dev")),
    )
    .map((p) => p.id);
  // Si una persona fixture es dueña de una academia real, no la tocamos
  // (soft-delete sería peor que dejarla) - reportamos para revisión.
  const ownedAcademies = await prisma.academy.findMany({
    where: { ownerId: { in: personIds } },
    select: { ownerId: true, name: true },
  });
  const ownerIds = new Set(ownedAcademies.map((a) => a.ownerId));
  for (const a of ownedAcademies) say(`  · SKIP persona fixture (owner de "${a.name}")`);
  const deletablePersons = personIds.filter((id) => !ownerIds.has(id));

  // Eventos de productores fixture: aunque el nombre no delate el
  // fixture, su productor sí - entran al barrido de eventos.
  const fixtureProducerEvents = await prisma.event.findMany({
    where: { producerId: { in: deletablePersons } },
    select: { id: true },
  });
  const extraEventIds = fixtureProducerEvents.map((e) => e.id);
  let hardDeleted = 0, softDeleted = 0;
  for (const pid of deletablePersons) {
    try {
      await deletePersonGraph(pid);
      hardDeleted++;
    } catch (e) {
      // Grafo con FK no cubierto (p.ej. BillingDocument.receiverId) →
      // baja lógica: fuera de superficies públicas, reversible.
      await prisma.person.update({ where: { id: pid }, data: { deletedAt: now } });
      softDeleted++;
    }
  }
  say(`Personas fixture: ${hardDeleted} borradas, ${softDeleted} soft-deleted (deletedAt)`);

  // Eventos basura (QA/GP/Gamif/smoke) con todo su grafo hijo.
  const junkEvents = await prisma.event.findMany({
    where: { name: { contains: "" } },
    select: { id: true, name: true },
  });
  const junkEventIds = [
    ...new Set([
      ...junkEvents
        .filter((e) => /^(QA Evento|GP )|gamif|smoke|delete me/i.test(e.name))
        .map((e) => e.id),
      ...extraEventIds,
    ]),
  ];
  const junkEventNames = junkEvents
    .filter((e) => junkEventIds.includes(e.id))
    .map((e) => e.name);
  if (junkEventIds.length) {
    // Hijos directos del evento (FK restrict) + tablas con FK plana.
    await prisma.showPerformer.deleteMany({ where: { show: { eventId: { in: junkEventIds } } } });
    await prisma.show.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.tripItem.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.scheduleBlock.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.eventDj.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.rsvp.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.waitlist.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.staffAssignment.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.guestListEntry.deleteMany({ where: { guestList: { eventId: { in: junkEventIds } } } });
    await prisma.guestList.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.tableReservation.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.songSuggestion.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.happyHourWindow.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.prizeDraw.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.nightSummary.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.eventDay.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.missionProgress.deleteMany({ where: { mission: { eventId: { in: junkEventIds } } } });
    await prisma.mission.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.entryPass.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.checkin.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.ticket.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.academySaleSettlement.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.academySaleAgreement.deleteMany({ where: { eventId: { in: junkEventIds } } });
    const junkPayments = await prisma.payment.findMany({
      where: { eventId: { in: junkEventIds } },
      select: { id: true },
    });
    const junkPayIds = junkPayments.map((p) => p.id);
    await prisma.ticketClaim.deleteMany({ where: { paymentId: { in: junkPayIds } } });
    await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: junkPayIds } } });
    await prisma.payoutLine.deleteMany({ where: { paymentId: { in: junkPayIds } } });
    await prisma.discountRedemption.deleteMany({ where: { paymentId: { in: junkPayIds } } });
    await prisma.payment.deleteMany({ where: { eventId: { in: junkEventIds } } });
    const junkSessions = await prisma.danceSession.findMany({
      where: { eventId: { in: junkEventIds } },
      select: { id: true },
    });
    await prisma.sessionRating.deleteMany({ where: { sessionId: { in: junkSessions.map((s) => s.id) } } });
    await prisma.danceSession.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.eventRating.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.discountRedemption.deleteMany({ where: { code: { eventId: { in: junkEventIds } } } });
    await prisma.discountCode.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.venueRental.deleteMany({ where: { eventId: { in: junkEventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: junkEventIds } } });
  }
  say(`Eventos borrados (${junkEventIds.length}): ${junkEventNames.slice(0, 6).join(", ")}${junkEventNames.length > 6 ? ` …+${junkEventNames.length - 6}` : ""}`);

  // Series de eventos fixture.
  const junkSeries = await prisma.eventSeries.findMany({
    where: { name: { contains: "" } },
    select: { id: true, name: true },
  });
  const junkSeriesIds = junkSeries
    .filter((s) => /^(GP |Gamif)|smoke|delete me| test$/i.test(s.name))
    .map((s) => s.id);
  if (junkSeriesIds.length) {
    await prisma.seriesPass.deleteMany({ where: { seriesId: { in: junkSeriesIds } } });
    await prisma.seriesReview.deleteMany({ where: { seriesId: { in: junkSeriesIds } } });
    await prisma.academySaleAgreement.deleteMany({ where: { seriesId: { in: junkSeriesIds } } });
    await prisma.eventSeries.deleteMany({ where: { id: { in: junkSeriesIds } } });
  }
  say(`EventSeries borradas (${junkSeriesIds.length}): ${junkSeries.filter((s) => junkSeriesIds.includes(s.id)).map((s) => s.name).join(", ") || "—"}`);

  // Venues fixture.
  const junkVenues = await prisma.venue.findMany({ select: { id: true, name: true } });
  const junkVenueIds = junkVenues
    .filter((v) => /^(GP |Gamif)|gamif|smoke|delete me| test$/i.test(v.name))
    .map((v) => v.id);
  if (junkVenueIds.length) {
    // Si algún evento/serie no-basura quedó colgado del venue, se
    // desacopla antes de borrar (venueId opcional en Event).
    await prisma.event.updateMany({ where: { venueId: { in: junkVenueIds } }, data: { venueId: null } });
    await prisma.venueMenu.deleteMany({ where: { venueId: { in: junkVenueIds } } });
    await prisma.venueRental.deleteMany({ where: { venueId: { in: junkVenueIds } } });
    try {
      await prisma.venue.deleteMany({ where: { id: { in: junkVenueIds } } });
    } catch (e) {
      say(`  ! no se pudo borrar algún venue fixture (FK): ${e.message?.split("\n")[0]}`);
    }
  }
  say(`Venues borrados (${junkVenueIds.length}): ${junkVenues.filter((v) => junkVenueIds.includes(v.id)).map((v) => v.name).join(", ") || "—"}`);

  // Estilos fixture del catálogo (mismos cuid-suffix que los fixtures GP/Gamif).
  const junkStyles = await prisma.style.findMany({ select: { id: true, name: true } });
  const junkStyleIds = junkStyles
    .filter((s) => /test|gamif|^(GP |casino-|sensual-)mv/i.test(s.name))
    .map((s) => s.id);
  if (junkStyleIds.length) {
    await prisma.personStyleRole.deleteMany({ where: { styleId: { in: junkStyleIds } } });
    await prisma.scheduleBlock.deleteMany({ where: { styleId: { in: junkStyleIds } } });
    await prisma.classSeries.updateMany({ where: { styleId: { in: junkStyleIds } }, data: { styleId: null } });
    await prisma.style.deleteMany({ where: { id: { in: junkStyleIds } } });
  }
  say(`Styles fixture borrados (${junkStyleIds.length}): ${junkStyles.filter((s) => junkStyleIds.includes(s.id)).map((s) => s.name).join(", ") || "—"}`);

  // Academias fixture (SmokeSub y afines) - con su grafo completo.
  const junkAcademies = await prisma.academy.findMany({ select: { id: true, name: true } });
  const junkAcademyIds = junkAcademies
    .filter((a) => /smoke|delete me|gamif|^test | test$/i.test(a.name))
    .map((a) => a.id);
  for (const aid of junkAcademyIds) {
    try {
    const classIds = (await prisma.class.findMany({ where: { slot: { academyId: aid } }, select: { id: true } })).map((c) => c.id);
    await prisma.attendance.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.classBooking.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.classInstructor.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    const slotIds = (await prisma.classSlot.findMany({ where: { academyId: aid }, select: { id: true } })).map((s) => s.id);
    await prisma.classSlotInstructor.deleteMany({ where: { slotId: { in: slotIds } } });
    await prisma.classSlotType.deleteMany({ where: { slotId: { in: slotIds } } });
    await prisma.classSlot.deleteMany({ where: { academyId: aid } });
    const seriesIds = (await prisma.classSeries.findMany({ where: { academyId: aid }, select: { id: true } })).map((s) => s.id);
    await prisma.classSeriesInstructor.deleteMany({ where: { seriesId: { in: seriesIds } } });
    await prisma.classSeriesType.deleteMany({ where: { seriesId: { in: seriesIds } } });
    await prisma.classSeries.deleteMany({ where: { academyId: aid } });
    const enrollIds = (await prisma.enrollment.findMany({ where: { academyId: aid }, select: { id: true } })).map((e) => e.id);
    await prisma.enrollmentLevel.deleteMany({ where: { enrollmentId: { in: enrollIds } } });
    await prisma.enrollment.deleteMany({ where: { academyId: aid } });
    await prisma.membershipSubscription.deleteMany({ where: { academyId: aid } });
    // PaymentClaim.planId es FK → antes que los planes.
    await prisma.paymentClaim.deleteMany({ where: { academyId: aid } });
    await prisma.ticketClaim.deleteMany({ where: { academyId: aid } });
    await prisma.academyPromo.deleteMany({ where: { academyId: aid } });
    await prisma.membershipPlan.deleteMany({ where: { academyId: aid } });
    await prisma.platformSubscription.deleteMany({ where: { academyId: aid } });
    await prisma.academyPaymentMethod.deleteMany({ where: { academyId: aid } });
    await prisma.academyInstructor.deleteMany({ where: { academyId: aid } });
    await prisma.academyStaff.deleteMany({ where: { academyId: aid } });
    await prisma.academySegmentSnapshot.deleteMany({ where: { academyId: aid } });
    await prisma.privateLesson.deleteMany({ where: { academyId: aid } });
    await prisma.video.deleteMany({ where: { academyId: aid } });
    await prisma.academySubscription.deleteMany({ where: { academyId: aid } });
    await prisma.academySaleAgreement.deleteMany({ where: { academyId: aid } });
    await prisma.courseSurvey.deleteMany({ where: { academyId: aid } });
    // actorId plano en el CRM transversal + atribución de preventa.
    await prisma.campaign.deleteMany({ where: { actorType: "ACADEMY", actorId: aid } });
    await prisma.crmTrigger.deleteMany({ where: { actorType: "ACADEMY", actorId: aid } });
    await prisma.actorSegmentMembership.deleteMany({ where: { segment: { actorType: "ACADEMY", actorId: aid } } });
    await prisma.actorSegment.deleteMany({ where: { actorType: "ACADEMY", actorId: aid } });
    await prisma.relationshipScore.deleteMany({ where: { actorType: "ACADEMY", actorId: aid } });
    await prisma.actorTag.deleteMany({ where: { actorType: "ACADEMY", actorId: aid } });
    await prisma.payoutDestination.deleteMany({ where: { actorType: "ACADEMY", actorId: aid } });
    await prisma.payment.updateMany({ where: { soldByAcademyId: aid }, data: { soldByAcademyId: null } });
    await prisma.event.updateMany({ where: { academyId: aid }, data: { academyId: null } });
    await prisma.academy.deleteMany({ where: { id: aid } });
    } catch (e) {
      say(`  ! academia fixture ${aid} no se pudo borrar entera (FK): ${e.message?.split("\n")[0]}`);
    }
  }
  say(`Academias fixture borradas (${junkAcademyIds.length}): ${junkAcademies.filter((a) => junkAcademyIds.includes(a.id)).map((a) => a.name).join(", ") || "—"}`);

  // Barrido informativo: planes/series con nombre de prueba (no se
  // espera ninguno tras el seed; se listan para revisión manual).
  const suspectPlans = await prisma.membershipPlan.findMany({ select: { id: true, name: true, academy: { select: { name: true } } } });
  const suspectSeries = await prisma.classSeries.findMany({ select: { id: true, name: true, academy: { select: { name: true } } } });
  const flagged = [
    ...suspectPlans.filter((p) => /test|gamif|smoke|delete me|QA /i.test(p.name)).map((p) => `plan "${p.name}" (${p.academy.name})`),
    ...suspectSeries.filter((s) => /test|gamif|smoke|delete me|QA /i.test(s.name)).map((s) => `serie "${s.name}" (${s.academy.name})`),
  ];
  say(`Planes/series con nombre de prueba: ${flagged.length ? flagged.join("; ") : "ninguno"}`);

  // ═══════════ Datos base compartidos ═══════════
  const [levels, types, academies] = await Promise.all([
    prisma.classLevel.findMany(),
    prisma.classType.findMany(),
    prisma.academy.findMany({ where: { active: true }, select: { id: true, name: true, ownerId: true, privateLessonPrice: true } }),
  ]);
  const levelId = Object.fromEntries(levels.map((l) => [l.name, l.id]));
  const typeId = Object.fromEntries(types.map((t) => [t.name, t.id]));
  const academyById = new Map(academies.map((a) => [a.id, a]));

  // ═══════════ 2. EnrollmentLevel ═══════════
  console.log("\n═══ 2. Niveles de alumnos (EnrollmentLevel) ═══");
  // Tipos ofrecidos por academia (ClassSeriesType de series vivas).
  const seriesTypes = await prisma.classSeriesType.findMany({
    where: { series: { academyId: { in: academies.map((a) => a.id) }, deletedAt: null, active: true } },
    select: { typeId: true, series: { select: { academyId: true } } },
  });
  const typesByAcademy = new Map();
  for (const st of seriesTypes) {
    const aid = st.series.academyId;
    if (!typesByAcademy.has(aid)) typesByAcademy.set(aid, []);
    typesByAcademy.get(aid).push(st.typeId); // repetido = más peso
  }
  const defaultType = typeId["Pareja"] ?? types[0].id;

  const enrolls = await prisma.enrollment.findMany({
    where: { academyId: { in: academies.map((a) => a.id) }, status: "ACTIVE" },
    select: { id: true, academyId: true, levels: { select: { enrollmentId: true }, take: 1 } },
  });
  const levelRows = [];
  for (const e of enrolls) {
    if (e.levels.length) continue; // ya tiene niveles (Mambo Madness, etc.)
    const offered = typesByAcademy.get(e.academyId);
    const tId = offered?.length ? offered[h(e.id) % offered.length] : defaultType;
    const r = pctOf(e.id);
    // ~40% Ini · ~30% Ini+Bás · ~20% Bás+Int · ~7% Int · ~3% Int+Avan
    const sets =
      r < 40 ? ["Iniciación"] :
      r < 70 ? ["Iniciación", "Básico"] :
      r < 90 ? ["Básico", "Intermedio"] :
      r < 97 ? ["Intermedio"] : ["Intermedio", "Avanzado"];
    for (const ln of sets) {
      if (levelId[ln]) levelRows.push({ enrollmentId: e.id, classTypeId: tId, levelId: levelId[ln] });
    }
  }
  const levelRes = await prisma.enrollmentLevel.createMany({ data: levelRows, skipDuplicates: true });
  say(`EnrollmentLevel creados: ${levelRes.count} filas (enrollments ACTIVE sin niveles: ${enrolls.filter((e) => !e.levels.length).length})`);

  // ═══════════ 3. Parrilla mínima para academias sin series ═══════════
  console.log("\n═══ 3. Series/slots/clases faltantes ═══");
  const styleId = async (name) =>
    (await prisma.style.findFirst({ where: { name: { equals: name, mode: "insensitive" } } }))?.id ?? null;
  const ensureSeries = async (academyId, name, { styleName, levelName, typeNames, instructorId, slots }) => {
    let series = await prisma.classSeries.findFirst({ where: { academyId, name, levelId: levelName ? levelId[levelName] : null } });
    if (!series) {
      series = await prisma.classSeries.create({
        data: {
          academyId, name,
          styleId: styleName ? await styleId(styleName) : null,
          levelId: levelName ? levelId[levelName] : null,
          instructorId: instructorId ?? null,
          month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
        },
      });
    }
    for (const tn of typeNames ?? []) {
      await prisma.classSeriesType.upsert({
        where: { seriesId_typeId: { seriesId: series.id, typeId: typeId[tn] } },
        update: {},
        create: { seriesId: series.id, typeId: typeId[tn] },
      });
    }
    const slotIds = [];
    for (const s of slots) {
      let slot = await prisma.classSlot.findFirst({
        where: { academyId, seriesId: series.id, weekday: s.weekday, startTime: s.startTime },
      });
      if (!slot) {
        slot = await prisma.classSlot.create({
          data: { academyId, seriesId: series.id, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, instructorId: instructorId ?? null },
        });
      }
      slotIds.push(slot.id);
      for (const tn of s.typeNames ?? typeNames ?? []) {
        await prisma.classSlotType.upsert({
          where: { slotId_typeId: { slotId: slot.id, typeId: typeId[tn] } },
          update: {},
          create: { slotId: slot.id, typeId: typeId[tn] },
        });
      }
    }
    return slotIds;
  };

  // Academia Tumbao: 32 alumnos y cero estructura → parrilla mínima real.
  const tumbao = academies.find((a) => a.name === "Academia Tumbao");
  if (tumbao) {
    const hasSeries = await prisma.classSeries.count({ where: { academyId: tumbao.id, deletedAt: null } });
    if (!hasSeries) {
      await ensureSeries(tumbao.id, "Salsa Cubana", {
        styleName: "Salsa cubana (casino)", levelName: "Iniciación", typeNames: ["Pareja"],
        instructorId: tumbao.ownerId,
        slots: [
          { weekday: 1, startTime: "19:00", endTime: "20:00" },
          { weekday: 3, startTime: "19:00", endTime: "20:00" },
        ],
      });
      await ensureSeries(tumbao.id, "Bachata Sensual", {
        styleName: "Bachata sensual", levelName: "Básico", typeNames: ["Pareja"],
        instructorId: tumbao.ownerId,
        slots: [
          { weekday: 2, startTime: "20:00", endTime: "21:00" },
          { weekday: 4, startTime: "20:00", endTime: "21:00", typeNames: ["Shines"] },
        ],
      });
      say(`Academia Tumbao: 2 series + 4 slots creados`);
    } else say(`Academia Tumbao ya tiene series (${hasSeries}) - skip`);
  }

  // Materializa clases del mes vigente + siguiente para slots sin ellas
  // (misma regla que mkClassSeries del seed: medianoche UTC por weekday).
  const monthDates = (y, m0) => {
    const days = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
    return Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m0, i + 1)));
  };
  const materializeMonths = [prevMonthStart, monthStart, nextMonthStart];
  const liveSlots = await prisma.classSlot.findMany({
    where: { deletedAt: null, series: { deletedAt: null, active: true } },
    select: { id: true, weekday: true, oneOffDate: true, classes: { select: { date: true } } },
  });
  const classCreates = [];
  for (const slot of liveSlots) {
    const have = new Set(slot.classes.map((c) => +c.date));
    if (slot.oneOffDate) {
      if (!have.has(+slot.oneOffDate)) classCreates.push({ classSlotId: slot.id, date: slot.oneOffDate });
      continue;
    }
    for (const ms of materializeMonths) {
      for (const d of monthDates(ms.getUTCFullYear(), ms.getUTCMonth())) {
        if (d.getUTCDay() === slot.weekday && !have.has(+d)) classCreates.push({ classSlotId: slot.id, date: d });
      }
    }
  }
  const classRes = await prisma.class.createMany({ data: classCreates, skipDuplicates: true });
  say(`Class materializadas: ${classRes.count} nuevas (slots vivos: ${liveSlots.length})`);

  // ═══════════ 4. Asistencia en clases pasadas ═══════════
  console.log("\n═══ 4. Asistencias en clases ya dictadas ═══");
  // Clases con fecha <= hoy, no canceladas, sin asistencia registrada.
  const emptyClasses = await prisma.class.findMany({
    where: {
      cancelled: false,
      date: { lte: todayUTC },
      attendances: { none: {} },
      slot: { deletedAt: null, series: { deletedAt: null, active: true } },
    },
    select: {
      id: true, date: true,
      slot: { select: { startTime: true, academyId: true } },
      bookings: { where: { status: "BOOKED" }, select: { personId: true } },
    },
  });
  // Rosters ACTIVE por academia para clases sin reservas.
  const rosterByAcademy = new Map();
  const attCreates = [];
  let todayFilled = 0;
  for (const cls of emptyClasses) {
    const startH = parseInt(cls.slot.startTime.slice(0, 2), 10);
    const isToday = +cls.date === +todayUTC;
    // Clase de hoy: solo si ya debería haber empezado (hora local pasada).
    if (isToday && startH + LOCAL_OFFSET_H > now.getUTCHours()) continue;
    const rate = 60 + (h(cls.id) % 26); // 60-85% de los reservados
    const effective = isToday ? rate * 0.5 : rate; // hoy va a la mitad
    const checkedAt = new Date(+cls.date + (startH + LOCAL_OFFSET_H) * 3600e3);
    let candidates = cls.bookings.map((b) => b.personId);
    if (!candidates.length) {
      if (!rosterByAcademy.has(cls.slot.academyId)) {
        const rs = await prisma.enrollment.findMany({
          where: { academyId: cls.slot.academyId, status: "ACTIVE" },
          select: { personId: true }, orderBy: { personId: "asc" },
        });
        rosterByAcademy.set(cls.slot.academyId, rs.map((r) => r.personId));
      }
      const roster = rosterByAcademy.get(cls.slot.academyId);
      if (!roster.length) continue;
      const off = h(cls.id) % roster.length;
      const n = Math.min(roster.length, 8 + (h(cls.id + "n") % 7));
      candidates = Array.from({ length: n }, (_, k) => roster[(off + k) % roster.length]);
    }
    for (const pid of candidates) {
      if (pctOf(cls.id + pid) < effective) {
        attCreates.push({
          classId: cls.id, personId: pid,
          checkedAt: new Date(+checkedAt + (h(cls.id + pid + "m") % 40) * 60e3),
        });
        if (isToday) todayFilled++;
      }
    }
  }
  // createMany por lotes (la tabla es grande; skipDuplicates por la PK compuesta).
  let attTotal = 0;
  for (let i = 0; i < attCreates.length; i += 5000) {
    attTotal += (await prisma.attendance.createMany({ data: attCreates.slice(i, i + 5000), skipDuplicates: true })).count;
  }
  say(`Attendance creadas: ${attTotal} (clases vacías procesadas: ${emptyClasses.length}, de hoy: ${todayFilled})`);

  // Reservas también para las clases nuevas de Tumbao (roster sin bookings).
  const tumbaoClassIds = tumbao
    ? (await prisma.class.findMany({ where: { slot: { academyId: tumbao.id }, date: { gte: prevMonthStart, lt: afterNextStart } }, select: { id: true } })).map((c) => c.id)
    : [];
  if (tumbaoClassIds.length) {
    const roster = (await prisma.enrollment.findMany({ where: { academyId: tumbao.id, status: "ACTIVE" }, select: { personId: true } })).map((e) => e.personId).filter((p) => p !== tumbao.ownerId);
    const bk = [];
    for (const cid of tumbaoClassIds) {
      const off = h(cid) % roster.length;
      const n = Math.min(roster.length, 10 + (h(cid + "b") % 6));
      for (let k = 0; k < n; k++) bk.push({ classId: cid, personId: roster[(off + k) % roster.length] });
    }
    const bkRes = await prisma.classBooking.createMany({ data: bk, skipDuplicates: true });
    say(`ClassBooking Tumbao: ${bkRes.count} nuevas`);
  }

  // ═══════════ 5. Suscripciones ═══════════
  console.log("\n═══ 5. Suscripciones (plataforma + membresía) ═══");
  const BILLED_MONTHS = { MONTHLY: 1, SEMIANNUAL: 5.52, ANNUAL: 10.2 };
  const paramNum = async (key) => Number((await prisma.platformParam.findUnique({ where: { key }, select: { value: true } }))?.value ?? 0);
  // Academias que se quedan en trial a propósito (escena pre-launch).
  const TRIAL_KEEP = new Set(["Adrian y Leo", "Mi mambo", "Utopia", "Pasion Latina"]);
  const tierCycle = [
    ["COBROS", "MONTHLY"], ["STUDIO", "MONTHLY"], ["STUDIO", "SEMIANNUAL"],
    ["PRO", "ANNUAL"], ["STUDIO", "ANNUAL"], ["COBROS", "SEMIANNUAL"], ["PRO", "MONTHLY"],
  ];
  let platSubs = 0;
  const activeAcademies = academies.filter((a) => !TRIAL_KEEP.has(a.name)).sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < activeAcademies.length; i++) {
    const a = activeAcademies[i];
    const existing = await prisma.platformSubscription.findFirst({ where: { kind: "ACADEMY", academyId: a.id } });
    if (existing) continue; // ya tiene (Mambo/Tumbao/Muévete/LaCasa/MiMambo-cancelled→skip)
    const [tier, cycle] = tierCycle[h(a.id) % tierCycle.length];
    const monthly = await paramNum(`academy_tier.${tier.toLowerCase()}_monthly_clp`);
    const amount = Math.round(monthly * BILLED_MONTHS[cycle]);
    const cycleMonths = { MONTHLY: 1, SEMIANNUAL: 6, ANNUAL: 12 }[cycle];
    const startedAt = new Date(Date.now() - (20 + (h(a.id) % 60)) * 86_400_000);
    const nextInvoiceAt = new Date(Date.now() + Math.max(7, cycleMonths * 30 - 40) * 86_400_000);
    const oneCancelPending = i === 3; // una sub en CANCEL_PENDING para variedad
    const sub = await prisma.platformSubscription.create({
      data: {
        kind: "ACADEMY", academyId: a.id, personId: a.ownerId,
        tierCode: tier, billingCycle: cycle, paymentMethod: "CARD",
        status: oneCancelPending ? "CANCEL_PENDING" : "ACTIVE",
        nextInvoiceAt, createdAt: startedAt,
        canceledAt: oneCancelPending ? new Date(Date.now() - 2 * 86_400_000) : null,
      },
    });
    await prisma.academy.update({
      where: { id: a.id },
      data: { tier, billingCycle: cycle, billingBlockedAt: null, billingGraceUntil: null },
    });
    await prisma.payment.upsert({
      where: { refId: `platsub_${sub.id}_enrich-1` },
      update: {},
      create: {
        orderType: "PLATFORM_SUB", refId: `platsub_${sub.id}_enrich-1`,
        personId: a.ownerId, amount, fee: 0, net: amount,
        gateway: "FLOW", gatewayMedia: "credit_card", status: "PAID",
        createdAt: startedAt, gatewayPaidAt: startedAt,
      },
    });
    platSubs++;
  }
  say(`PlatformSubscription nuevas: ${platSubs} (trial se conserva en: ${[...TRIAL_KEEP].join(", ")})`);

  // MembershipSubscription por academia: alumnos con plan pagado sin sub viva.
  let memSubs = 0, pendingClaimsFromSubs = 0;
  for (const a of academies) {
    const enrolled = await prisma.enrollment.findMany({
      where: { academyId: a.id, status: "ACTIVE", plan: { is: { price: { gt: 0 } } } },
      select: { personId: true, planId: true, plan: { select: { price: true } } },
      orderBy: { personId: "asc" },
    });
    if (!enrolled.length) continue;
    const liveSubs = await prisma.membershipSubscription.findMany({
      where: { academyId: a.id, status: { notIn: ["CANCELED", "FAILED_CARD"] } },
      select: { personId: true, status: true },
    });
    const busy = new Set(liveSubs.map((s) => s.personId));
    const free = enrolled.filter((e) => !busy.has(e.personId));
    // Tope por academia (idempotente: descuenta subs ya vivas) y al
    // menos una TRANSFER PENDING_PAYMENT para poblar la cola de claims.
    const want = Math.min(enrolled.length, Math.min(5, Math.max(1, Math.round(enrolled.length / 15))));
    // Una PENDING_PAYMENT extra aunque la academia ya esté en el tope:
    // la cola de revisión por transferencia necesita data en todas.
    const hasPending = liveSubs.some((s) => s.status === "PENDING_PAYMENT");
    const create = Math.min(free.length, Math.max(0, want - liveSubs.length) + (hasPending ? 0 : 1));
    const pendingWanted = hasPending ? 0 : Math.min(create >= 3 ? 2 : 1, create);
    for (let k = 0; k < create; k++) {
      const e = free[(h(a.id) + k * 7) % free.length];
      const isPending = pendingWanted > 0 && k >= create - pendingWanted;
      const mode = isPending ? 9 : k % 4; // 0-1 CARD · 2 TRANSFER · 3 CANCEL_PENDING · 9 PENDING_PAYMENT
      const base = {
        personId: e.personId, planId: e.planId, academyId: a.id,
        planChargeClp: e.plan.price,
        createdAt: new Date(Date.now() - (3 + (h(e.personId) % 25)) * 86_400_000),
      };
      if (mode <= 2) {
        // CARD ACTIVE ×2 o TRANSFER ACTIVE ×1
        const isCard = mode < 2;
        await prisma.membershipSubscription.create({
          data: {
            ...base, paymentMethod: isCard ? "CARD" : "TRANSFER", status: "ACTIVE",
            flowSubscriptionId: isCard ? `sus_enrich_${h(e.personId + a.id).toString(16)}` : null,
            nextInvoiceAt: new Date(Date.now() + (15 + (h(e.personId) % 15)) * 86_400_000),
            currentPeriodEnd: isCard ? null : new Date(Date.now() + (15 + (h(e.personId) % 15)) * 86_400_000),
            lastInvoiceId: isCard ? `enrich-inv-${h(e.personId) % 99999}` : null,
          },
        }).then(async (sub) => {
          if (isCard) {
            await prisma.payment.upsert({
              where: { refId: `mem_${e.planId}_enrich-${sub.id}` },
              update: {},
              create: {
                orderType: "MEMBERSHIP", refId: `mem_${e.planId}_enrich-${sub.id}`,
                personId: e.personId, amount: e.plan.price, fee: 0, net: e.plan.price,
                gateway: "FLOW", gatewayMedia: "credit_card", status: "PAID", feeMode: "ACADEMY",
                createdAt: base.createdAt, gatewayPaidAt: base.createdAt,
              },
            });
          }
        });
        memSubs++;
      } else if (mode === 3) {
        await prisma.membershipSubscription.create({
          data: {
            ...base, paymentMethod: "CARD", status: "CANCEL_PENDING",
            flowSubscriptionId: `sus_enrich_${h(e.personId + a.id).toString(16)}`,
            nextInvoiceAt: new Date(Date.now() + 18 * 86_400_000),
            canceledAt: new Date(Date.now() - 2 * 86_400_000),
          },
        });
        memSubs++;
      } else {
        // TRANSFER PENDING_PAYMENT: orden MANUAL pendiente + claim en la
        // cola ACADEMY - mismo shape que el alta manual real.
        const sub = await prisma.membershipSubscription.create({
          data: { ...base, paymentMethod: "TRANSFER", status: "PENDING_PAYMENT" },
        });
        const refId = `mem_${e.planId}_${e.personId}_enrich_1`;
        const pay = await prisma.payment.upsert({
          where: { refId },
          update: {},
          create: {
            orderType: "MEMBERSHIP", refId, personId: e.personId,
            amount: e.plan.price, fee: 0, net: e.plan.price,
            gateway: "MANUAL", status: "PENDING", feeMode: "ACADEMY",
            methodLabel: "Transferencia", createdAt: base.createdAt,
          },
        });
        const hasClaim = await prisma.ticketClaim.findFirst({ where: { paymentId: pay.id } });
        if (!hasClaim) {
          await prisma.ticketClaim.create({
            data: {
              paymentId: pay.id, personId: e.personId,
              domain: "ACADEMY", academyId: a.id,
              receiptKey: `claims/academies/${a.id}/enrich-${h(pay.id).toString(16)}.png`,
              methodType: "TRANSFER", methodLabel: "Transferencia",
              status: "PENDING", note: "Primera cuota por transferencia",
              createdAt: new Date(Date.now() - (h(e.personId) % 3) * 86_400_000),
            },
          });
          pendingClaimsFromSubs++;
        }
        memSubs++;
        void sub;
      }
    }
  }
  say(`MembershipSubscription nuevas: ${memSubs} (con claim ACADEMY pendiente: ${pendingClaimsFromSubs})`);

  // ═══════════ 6. Cobros declarados (PaymentClaim) ═══════════
  console.log("\n═══ 6. Cobros por revisar + facturado ═══");
  let claimsPending = 0, claimsApproved = 0;
  for (const a of academies) {
    const enrolled = await prisma.enrollment.findMany({
      where: { academyId: a.id, status: "ACTIVE", plan: { is: { price: { gt: 0 } } } },
      select: { personId: true, planId: true, plan: { select: { price: true } } },
      orderBy: { personId: "asc" },
    });
    if (!enrolled.length) continue;
    const mkClaim = async (e, status, createdAt, methodType = "TRANSFER", methodLabel = "Transferencia") => {
      const mStart = new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), 1));
      const mEnd = new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth() + 1, 1));
      const found = await prisma.paymentClaim.findFirst({
        where: { academyId: a.id, personId: e.personId, planId: e.planId, status, createdAt: { gte: mStart, lt: mEnd } },
      });
      if (found) return found;
      const c = await prisma.paymentClaim.create({
        data: {
          academyId: a.id, personId: e.personId, planId: e.planId,
          amount: e.plan.price, methodType, methodLabel, status,
          receiptKey: status === "PENDING" ? `claims/${a.id}/enrich-${h(a.id + e.personId + status).toString(16)}.png` : null,
          reviewedById: status === "APPROVED" ? a.ownerId : null,
          reviewedAt: status === "APPROVED" ? createdAt : null,
          createdAt,
        },
      });
      if (status === "APPROVED") {
        const pay = await prisma.payment.create({
          data: {
            orderType: "MEMBERSHIP", refId: `claim-${c.id}`, personId: e.personId,
            amount: e.plan.price, fee: 0, net: e.plan.price, gateway: "MANUAL", status: "PAID",
            feeMode: "ACADEMY", platformFeeNetClp: 0, platformFeeVatClp: 0, gatewayFeeExpected: 0,
            producerNetClp: e.plan.price, createdAt,
          },
        });
        await prisma.paymentClaim.update({ where: { id: c.id }, data: { paymentId: pay.id } });
      }
      return c;
    };
    // Top-up de pendientes hasta 3 por academia.
    const pendingNow = await prisma.paymentClaim.count({ where: { academyId: a.id, status: "PENDING" } });
    for (let k = pendingNow; k < 3; k++) {
      const e = enrolled[(h(a.id + "p") + k * 11) % enrolled.length];
      const created = new Date(Date.now() - (k % 3) * 86_400_000 - 3 * 3600e3);
      await mkClaim(e, "PENDING", created, k % 3 === 2 ? "CASH" : "TRANSFER", k % 3 === 2 ? "Efectivo en clase" : "Transferencia");
      claimsPending++;
    }
    // Aprobados del mes + MTD anterior si la academia no tiene cobranza.
    const approvedNow = await prisma.paymentClaim.count({
      where: { academyId: a.id, status: "APPROVED", createdAt: { gte: monthStart } },
    });
    if (approvedNow < 3) {
      for (let k = approvedNow; k < 5; k++) {
        const e = enrolled[(h(a.id + "a") + k * 13) % enrolled.length];
        const day = 1 + ((k * 2) % Math.max(1, now.getUTCDate()));
        await mkClaim(e, "APPROVED", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 12)));
        claimsApproved++;
      }
      for (let k = 0; k < 3; k++) {
        const e = enrolled[(h(a.id + "v") + k * 17) % enrolled.length];
        await mkClaim(e, "APPROVED", new Date(+prevMonthStart + (2 + k * 3) * 86_400_000 + 12 * 3600e3));
        claimsApproved++;
      }
    }
  }
  say(`PaymentClaim: +${claimsPending} PENDING, +${claimsApproved} APPROVED`);

  // ═══════════ 7. KPIs de inicio ═══════════
  console.log("\n═══ 7. Cumpleaños, particulares y check-ins de eventos ═══");
  // Cumpleaños: 3 alumnos por academia con birthDate dentro de 30 días.
  let birthdays = 0;
  for (const a of academies) {
    const students = await prisma.enrollment.findMany({
      where: { academyId: a.id, status: "ACTIVE" },
      select: { personId: true }, orderBy: { personId: "asc" },
    });
    if (!students.length) continue;
    // Idempotente por academia: tope 3 alumnos con cumpleaños próximo.
    const withBd = await prisma.person.count({
      where: { id: { in: students.map((s) => s.personId) }, birthDate: { not: null } },
    });
    if (withBd >= 3) continue;
    const noBd = await prisma.person.findMany({
      where: { id: { in: students.map((s) => s.personId) }, birthDate: null },
      select: { id: true }, orderBy: { id: "asc" },
    });
    const offsets = [3, 11, 24]; // días hasta el cumpleaños
    for (let k = 0; k < Math.min(3 - withBd, noBd.length); k++) {
      const p = noBd[(h(a.id) + k * 5) % noBd.length];
      const d = new Date(Date.now() + offsets[k] * 86_400_000);
      await prisma.person.update({
        where: { id: p.id },
        data: { birthDate: new Date(Date.UTC(1988 + (h(p.id) % 15), d.getUTCMonth(), d.getUTCDate())) },
      });
      birthdays++;
    }
  }
  say(`birthDate asignados: ${birthdays} alumnos (ventana 3-24 días)`);

  // Clases particulares pendientes donde la academia las vende.
  let lessons = 0;
  for (const a of academies.filter((x) => x.privateLessonPrice)) {
    const has = await prisma.privateLesson.count({ where: { academyId: a.id, status: "REQUESTED" } });
    if (has) continue;
    const st = await prisma.enrollment.findFirst({ where: { academyId: a.id, status: "ACTIVE" }, select: { personId: true } });
    if (!st) continue;
    await prisma.privateLesson.create({
      data: { academyId: a.id, personId: st.personId, price: a.privateLessonPrice, status: "REQUESTED" },
    });
    lessons++;
  }
  say(`PrivateLesson REQUESTED: +${lessons}`);

  // Check-ins en eventos pasados recientes con tickets vendidos.
  const checkinEvents = await prisma.event.findMany({
    where: {
      status: "PUBLISHED", startsAt: { lt: new Date(+todayUTC) },
      name: { in: ["Trilogía", "La Gozadera"] },
      producerId: { not: null },
    },
    select: { id: true, name: true, startsAt: true },
    orderBy: { startsAt: "desc" }, take: 2,
  });
  let checkins = 0;
  for (const ev of checkinEvents) {
    const tickets = await prisma.ticket.findMany({
      where: { eventId: ev.id, status: "ACTIVE" },
      select: { id: true, ownerId: true },
    });
    for (const t of tickets) {
      if (pctOf(ev.id + t.ownerId) >= 62) continue; // ~62% asistió
      const already = await prisma.checkin.findFirst({ where: { eventId: ev.id, personId: t.ownerId } });
      if (already) continue;
      await prisma.checkin.create({
        data: {
          eventId: ev.id, personId: t.ownerId, method: "SCAN",
          inAt: new Date(+ev.startsAt + (20 + (h(t.id) % 80)) * 60e3),
        },
      });
      await prisma.ticket.update({ where: { id: t.id }, data: { status: "USED" } });
      checkins++;
    }
  }
  say(`Checkins de eventos pasados: +${checkins} (${checkinEvents.map((e) => e.name).join(", ") || "ninguno elegible"})`);

  // Un par de eventos nuevos de noviembre para productores sin cartelera
  // en la 2ª quincena (cartelera completa hasta el 25).
  const orixas = await prisma.venue.findFirst({ where: { name: "Orixas" } });
  const stgo = await prisma.city.findFirst({ where: { slug: "santiago-cl" } });
  const producers = await prisma.personRole.findMany({
    where: { role: "PRODUCER", status: "APPROVED", person: { email: { endsWith: "@omnidance.dev" } } },
    select: { personId: true, person: { select: { name: true } } },
  });
  let newEvents = 0;
  const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const secondHalfStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 9));
  for (const pr of producers) {
    const upcoming = await prisma.event.count({
      where: { producerId: pr.personId, startsAt: { gte: secondHalfStart } },
    });
    if (upcoming > 0) continue;
    const day = 14 + (h(pr.personId) % 11); // 14-24 del mes vigente
    const starts = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 22));
    const name = `${pr.person.name.split(" ")[0]} presenta: Social de ${MONTHS_ES[now.getUTCMonth()]}`;
    const dup = await prisma.event.findFirst({ where: { producerId: pr.personId, name, startsAt: starts } });
    if (dup) continue;
    const ev = await prisma.event.create({
      data: {
        name, producerId: pr.personId, venueId: orixas?.id ?? null, cityId: stgo?.id ?? null,
        type: "SOCIAL", status: "PUBLISHED", genres: ["SALSA", "BACHATA"],
        startsAt: starts, endsAt: new Date(+starts + 5 * 3600e3),
        presalePrice: 8000, doorPrice: 10000, capacity: 250, currency: "CLP",
      },
    });
    // Preventa vendida: tickets ACTIVE + una orden PAID agregada.
    const buyers = await prisma.person.findMany({
      where: { email: { startsWith: "mval" } }, select: { id: true }, take: 40,
    });
    const sold = 8 + (h(ev.id) % 8);
    const order = await prisma.payment.create({
      data: {
        orderType: "TICKET", refId: `enrich-evt-${ev.id}`, personId: buyers[0]?.id ?? pr.personId,
        eventId: ev.id, amount: sold * 8500, fee: 0, net: sold * 8000,
        quantity: sold, channel: "PRESALE", unitListPrice: 8000, unitServiceFee: 500,
        gateway: "FLOW", status: "PAID", createdAt: new Date(Date.now() - 2 * 86_400_000),
      },
    });
    for (let k = 0; k < Math.min(sold, buyers.length); k++) {
      await prisma.ticket.create({
        data: {
          eventId: ev.id, ownerId: buyers[k].id, buyerId: buyers[0]?.id ?? pr.personId,
          listPrice: 8000, serviceFee: 500, status: "ACTIVE", paymentId: order.id,
        },
      });
    }
    newEvents++;
  }
  say(`Eventos nuevos de noviembre: +${newEvents}`);

  // ═══════════ Resumen ═══════════
  console.log("\n═══ RESUMEN ═══");
  for (const line of report) console.log(" ", line);
}

// Borra el grafo completo de una persona fixture. Las FKs planas se
// limpian con deleteMany/updateMany por tabla; las m-n implícitas van
// por SQL. Cualquier FK no cubierto hace fallar la tx → el caller
// cae a soft-delete.
async function deletePersonGraph(pid) {
  await prisma.$transaction(async (tx) => {
    // m-n implícitas de promos: _AcademyPromoPersons.B = personId,
    // _PlatformPromoProducers.A = personId (verificado con \d en DB).
    await tx.$executeRawUnsafe(`DELETE FROM "_AcademyPromoPersons" WHERE "B" = $1`, pid);
    await tx.$executeRawUnsafe(`DELETE FROM "_PlatformPromoProducers" WHERE "A" = $1`, pid);
    // Revisores/creadores quedan null (o la fila se borra).
    await tx.paymentClaim.updateMany({ where: { reviewedById: pid }, data: { reviewedById: null } });
    await tx.ticketClaim.updateMany({ where: { reviewedById: pid }, data: { reviewedById: null } });
    await tx.academyPromo.updateMany({ where: { createdById: pid }, data: { createdById: null } });
    await tx.platformPromo.updateMany({ where: { createdById: pid }, data: { createdById: null } });
    // Grafo propio.
    const payIds = (await tx.payment.findMany({ where: { personId: pid }, select: { id: true } })).map((p) => p.id);
    await tx.paymentEvent.deleteMany({ where: { paymentId: { in: payIds } } });
    await tx.gatewayTransaction.deleteMany({ where: { paymentId: { in: payIds } } });
    await tx.ticketClaim.deleteMany({ where: { OR: [{ personId: pid }, { producerId: pid }, { paymentId: { in: payIds } }] } });
    await tx.payoutLine.deleteMany({ where: { paymentId: { in: payIds } } });
    await tx.ticket.updateMany({ where: { paymentId: { in: payIds } }, data: { paymentId: null } });
    await tx.privateLesson.updateMany({ where: { paymentId: { in: payIds } }, data: { paymentId: null } });
    await tx.classBooking.updateMany({ where: { paymentId: { in: payIds } }, data: { paymentId: null } });
    await tx.discountRedemption.deleteMany({ where: { OR: [{ personId: pid }, { paymentId: { in: payIds } }] } });
    await tx.discountRedemption.deleteMany({ where: { code: { createdById: pid } } });
    await tx.privateLesson.deleteMany({ where: { OR: [{ personId: pid }, { instructorId: pid }] } });
    await tx.classBooking.deleteMany({ where: { personId: pid } });
    await tx.attendance.deleteMany({ where: { personId: pid } });
    const enrIds = (await tx.enrollment.findMany({ where: { personId: pid }, select: { id: true } })).map((e) => e.id);
    await tx.enrollmentLevel.deleteMany({ where: { enrollmentId: { in: enrIds } } });
    await tx.enrollment.deleteMany({ where: { personId: pid } });
    await tx.paymentClaim.deleteMany({ where: { personId: pid } });
    await tx.membershipSubscription.deleteMany({ where: { personId: pid } });
    await tx.platformSubscription.deleteMany({ where: { OR: [{ personId: pid }, { producerId: pid }] } });
    await tx.ticket.deleteMany({ where: { OR: [{ ownerId: pid }, { buyerId: pid }, { giftedFromId: pid }] } });
    await tx.checkin.deleteMany({ where: { OR: [{ personId: pid }, { staffId: pid }] } });
    await tx.payment.deleteMany({ where: { personId: pid } });
    const sessIds = (await tx.danceSession.findMany({ where: { OR: [{ inviterId: pid }, { inviteeId: pid }] }, select: { id: true } })).map((s) => s.id);
    await tx.sessionRating.deleteMany({ where: { OR: [{ raterId: pid }, { sessionId: { in: sessIds } }] } });
    await tx.danceSession.deleteMany({ where: { id: { in: sessIds } } });
    await tx.eventRating.deleteMany({ where: { raterId: pid } });
    await tx.missionProgress.deleteMany({ where: { personId: pid } });
    await tx.personBadge.deleteMany({ where: { personId: pid } });
    await tx.streak.deleteMany({ where: { personId: pid } });
    await tx.streakFreeze.deleteMany({ where: { personId: pid } });
    await tx.pointLedger.deleteMany({ where: { personId: pid } });
    await tx.friendChallenge.deleteMany({ where: { OR: [{ fromId: pid }, { toId: pid }] } });
    await tx.friendship.deleteMany({ where: { OR: [{ aId: pid }, { bId: pid }] } });
    await tx.nightSummary.deleteMany({ where: { personId: pid } });
    await tx.staffAssignment.deleteMany({ where: { personId: pid } });
    await tx.producerStaff.deleteMany({ where: { OR: [{ producerId: pid }, { personId: pid }] } });
    await tx.guestListEntry.deleteMany({ where: { OR: [{ personId: pid }, { guestList: { ownerId: pid } }] } });
    await tx.guestList.deleteMany({ where: { ownerId: pid } });
    await tx.waitlist.deleteMany({ where: { personId: pid } });
    await tx.tableReservation.deleteMany({ where: { personId: pid } });
    await tx.seriesPass.deleteMany({ where: { personId: pid } });
    await tx.entryPass.deleteMany({ where: { personId: pid } });
    await tx.showPerformer.deleteMany({ where: { personId: pid } });
    await tx.academySubscription.deleteMany({ where: { personId: pid } });
    await tx.userVerification.deleteMany({ where: { personId: pid } });
    await tx.report.deleteMany({ where: { reporterId: pid } });
    await tx.referral.deleteMany({ where: { OR: [{ referrerId: pid }, { referredId: pid }] } });
    await tx.relationshipScore.deleteMany({ where: { personId: pid } });
    await tx.actorTag.deleteMany({ where: { personId: pid } });
    await tx.actorSegmentMembership.deleteMany({ where: { personId: pid } });
    await tx.savedReport.deleteMany({ where: { personId: pid } });
    await tx.mailCampaignRecipient.deleteMany({ where: { personId: pid } });
    await tx.mailCampaignSent.deleteMany({ where: { personId: pid } });
    await tx.analyticsEvent.deleteMany({ where: { personId: pid } });
    await tx.academyInstructor.deleteMany({ where: { personId: pid } });
    await tx.academyStaff.deleteMany({ where: { personId: pid } });
    await tx.classSlotInstructor.deleteMany({ where: { personId: pid } });
    await tx.classSeriesInstructor.deleteMany({ where: { personId: pid } });
    await tx.classInstructor.deleteMany({ where: { personId: pid } });
    await tx.personStyleRole.deleteMany({ where: { personId: pid } });
    await tx.seriesReview.deleteMany({ where: { personId: pid } });
    await tx.adminRegion.deleteMany({ where: { personId: pid } });
    await tx.consentRecord.deleteMany({ where: { personId: pid } });
    await tx.tripItem.deleteMany({ where: { personId: pid } });
    await tx.eventDj.deleteMany({ where: { personId: pid } });
    await tx.rsvp.deleteMany({ where: { personId: pid } });
    await tx.notification.deleteMany({ where: { personId: pid } });
    await tx.pushToken.deleteMany({ where: { personId: pid } });
    await tx.personRole.deleteMany({ where: { personId: pid } });
    await tx.fiscalProfile.deleteMany({ where: { personId: pid } });
    // SocialPassLedger.personId es FK restrict - se borra por ambas vías.
    await tx.socialPassLedger.deleteMany({ where: { personId: pid } });
    const pass = await tx.socialPass.findUnique({ where: { personId: pid } });
    if (pass) {
      await tx.socialPassLedger.deleteMany({ where: { passId: pass.id } });
      await tx.socialPass.delete({ where: { id: pass.id } });
    }
    await tx.producerPaymentMethod.deleteMany({ where: { producerId: pid } });
    await tx.producerGatewayAccount.deleteMany({ where: { producerId: pid } });
    await tx.producerParams.deleteMany({ where: { producerId: pid } });
    await tx.lead.updateMany({ where: { personId: pid }, data: { personId: null } });
    await tx.discountCode.deleteMany({ where: { createdById: pid } });
    await tx.mailCampaign.deleteMany({ where: { createdById: pid } });
    // Actor-side (productores): params/segmentos/triggers con actorId plano.
    await tx.campaign.deleteMany({ where: { actorId: pid } });
    await tx.crmTrigger.deleteMany({ where: { actorId: pid } });
    await tx.actorSegmentMembership.deleteMany({ where: { segment: { actorId: pid } } });
    await tx.actorSegment.deleteMany({ where: { actorId: pid } });
    await tx.relationshipScore.deleteMany({ where: { actorId: pid } });
    await tx.payoutDestination.deleteMany({ where: { actorId: pid } });
    await tx.person.delete({ where: { id: pid } });
  });
}

main()
  .catch((e) => { console.error("ERROR:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

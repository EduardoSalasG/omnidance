// Dataset demo de la escena SBK Santiago (spec: omni-dance.md §2).
// Idempotente: personas/venues/series/eventos se resuelven por clave natural
// y las fechas se refrescan en cada corrida para que la demo no envejezca.
import { randomBytes, scryptSync } from "node:crypto";
import { Genre, PrismaClient } from "@prisma/client";
import { ensurePerson, seedCommon } from "./seed-common";

const DEV_DOMAIN = "omnidance.dev";

// Password dev para todas las cuentas @omnidance.dev — permite probar el
// login por contraseña además del magic link. Nunca en seed-prod.
export const DEV_PASSWORD = "omnidance123";

const nextDay = (weekday: number, hour = 22, weeksAhead = 0) => {
  // próximo <weekday> (0=dom … 6=sáb) a las <hour>h (+N semanas)
  const d = new Date();
  d.setDate(
    d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7) + weeksAhead * 7,
  );
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** find-or-create por `where`; si existe, aplica `update` si se entrega. */
async function ensure<T extends { id: string }>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
  update?: (row: T) => Promise<unknown>,
): Promise<T> {
  const existing = await find();
  if (existing) {
    if (update) await update(existing);
    return existing;
  }
  return create();
}

export async function seedDev(prisma: PrismaClient) {
  await seedCommon(prisma);

  // ─── Admin de plataforma (login real por magic link en dev) ───
  const admin = await ensurePerson(
    prisma,
    "admin@omnidance.dev",
    "Admin Omnidance",
    [{ role: "ADMIN" }],
  );

  // ─── Personas multi-rol — emails dev permiten login por magic link ───
  const person = (slug: string, name: string, roles: { role: string }[]) =>
    ensurePerson(prisma, `${slug}@${DEV_DOMAIN}`, name, roles);

  const carlos = await person("carlos", "Carlos Andrés", [{ role: "PRODUCER" }]);
  const ardilla = await person("ardilla", "Ardilla", [
    { role: "PRODUCER" },
    { role: "DJ" },
  ]);
  const steban = await person("steban", "DJ Steban", [{ role: "DJ" }]);
  const matias = await person("matias", "Matías Herrera", [{ role: "DJ" }]);
  const fabian = await person("fabian", "Fabián Valladares", [{ role: "DJ" }]);
  const cesar = await person("cesar", "César Moreno", [
    { role: "PRODUCER" },
    { role: "DJ" },
  ]);
  const jesus = await person("jesus", "DJ Jesús", [{ role: "DJ" }]);
  const muvetOwner = await person("muvet", "Dueño MuéveteOnTour", [
    { role: "ACADEMY_OWNER" },
    { role: "PRODUCER" },
  ]);
  // Cuenta consumidora — flujo completo: RSVP, compra, QR, sesiones, ratings.
  const dancer = await person("dancer", "Bailarín Demo", [{ role: "DANCER" }]);
  // Staff de puerta aprobado — consola /staff operable sin pasar por /admin.
  const staff = await person("staff", "Staff Puerta", [{ role: "STAFF" }]);
  // Instructor de academia — consola /academia/clases con sus clases asignadas.
  const vale = await person("profe", "Valeska Torres", [
    { role: "INSTRUCTOR" },
    { role: "DANCER" },
  ]);
  const rodrigo = await person("rodrigo", "Rodrigo Fuentes", [
    { role: "INSTRUCTOR" },
    { role: "DANCER" },
  ]);
  // Segundo dueño de academia — Valeska también enseña ahí (lista cross-academia).
  const tumbaoOwner = await person("tumbao", "Dueño Academia Tumbao", [
    { role: "ACADEMY_OWNER" },
  ]);
  // Consola /venue — queda como ownerId de Orixas.
  const venueMgr = await person("venue", "Manager Orixas", [
    { role: "VENUE_MANAGER" },
  ]);
  // Consola /soporte — buscador de usuarios y fichas read-only.
  await person("soporte", "Soporte Omnidance", [{ role: "SUPPORT" }]);

  // Alumnos de la academia — enrollments, reservas, asistencias, historial.
  const alumno = (slug: string, name: string) =>
    person(slug, name, [{ role: "DANCER" }]);
  const camila = await alumno("camila", "Camila Rojas");
  const josefa = await alumno("josefa", "Josefa Martínez");
  const diego = await alumno("diego", "Diego Sanhueza");
  const francisca = await alumno("francisca", "Francisca León");
  const sebastian = await alumno("sebastian", "Sebastián Pino");
  const antonia = await alumno("antonia", "Antonia Reyes");
  const felipe = await alumno("felipe", "Felipe Contreras");
  const daniela = await alumno("daniela", "Daniela Fuentes");

  // ─── Venues ───
  const venue = (name: string, capacity: number, lat: number, lng: number) =>
    ensure(
      () => prisma.venue.findFirst({ where: { name } }),
      () =>
        prisma.venue.create({
          data: { name, address: "Santiago", capacity, lat, lng },
        }),
      (v) =>
        prisma.venue.update({ where: { id: v.id }, data: { capacity, lat, lng } }),
    );

  const orixas = await venue("Orixas", 300, -33.4208, -70.646);
  // Rebrand: "Tierra Dura" → "Tierra" — renombra la fila (mismo id,
  // eventos intactos) y sus noches standalone.
  const tdLegacy = await prisma.venue.findFirst({
    where: { name: "Tierra Dura" },
  });
  if (tdLegacy) {
    await prisma.venue.update({
      where: { id: tdLegacy.id },
      data: { name: "Tierra" },
    });
    await prisma.event.updateMany({
      where: { venueId: tdLegacy.id, seriesId: null, name: "Tierra Dura" },
      data: { name: "Tierra" },
    });
  }
  const tierraDura = await venue("Tierra", 250, -33.4489, -70.6185);
  const havana = await venue("Havana", 200, -33.4339, -70.6343);

  // Consola /venue — el manager ve KPIs y arriendos de Orixas.
  await prisma.venue.update({
    where: { id: orixas.id },
    data: { ownerId: venueMgr.id },
  });

  // ─── MuéveteOnTour — academia Y productor ───
  const muvet = await ensure(
    () => prisma.academy.findFirst({ where: { name: "MuéveteOnTour" } }),
    () =>
      prisma.academy.create({
        data: { name: "MuéveteOnTour", ownerId: muvetOwner.id },
      }),
    (a) =>
      prisma.academy.update({
        where: { id: a.id },
        data: { ownerId: muvetOwner.id },
      }),
  );
  // Quórum default de la academia — slots/clases sin override heredan 15.
  await prisma.academy.update({
    where: { id: muvet.id },
    data: { defaultQuorum: 15 },
  });

  // Segunda academia — Valeska enseña en ambas (/classes/teaching es
  // cross-academia) y el owner tiene gate multi-academia propio.
  const tumbao = await ensure(
    () => prisma.academy.findFirst({ where: { name: "Academia Tumbao" } }),
    () =>
      prisma.academy.create({
        data: {
          name: "Academia Tumbao",
          ownerId: tumbaoOwner.id,
          defaultQuorum: 12,
        },
      }),
    (a) =>
      prisma.academy.update({
        where: { id: a.id },
        data: { ownerId: tumbaoOwner.id, defaultQuorum: 12 },
      }),
  );

  // Equipo de instructores — AcademyInstructor habilita requireManage.
  for (const [academyId, personId] of [
    [muvet.id, vale.id],
    [muvet.id, rodrigo.id],
    [tumbao.id, vale.id],
  ] as const) {
    await prisma.academyInstructor.upsert({
      where: { academyId_personId: { academyId, personId } },
      update: {},
      create: { academyId, personId },
    });
  }

  // ─── Planes de membresía ───
  const plan = (
    academyId: string,
    name: string,
    type: "MONTHLY" | "CLASS_PACK" | "PERIOD" | "TRIAL",
    price: number,
    extra: { classCount?: number; periodDays?: number } = {},
  ) =>
    ensure(
      () => prisma.membershipPlan.findFirst({ where: { academyId, name } }),
      () =>
        prisma.membershipPlan.create({
          data: { academyId, name, type, price, ...extra },
        }),
      (p) =>
        prisma.membershipPlan.update({
          where: { id: p.id },
          data: { type, price, ...extra },
        }),
    );

  const muvetMensual = await plan(muvet.id, "Mensual ilimitado", "MONTHLY", 45000);
  const muvetPack = await plan(muvet.id, "Pack 8 clases", "CLASS_PACK", 38000, {
    classCount: 8,
  });
  const muvetTrial = await plan(muvet.id, "Clase de prueba", "TRIAL", 0);
  const tumbaoMensual = await plan(tumbao.id, "Mensual Tumbao", "MONTHLY", 40000);

  // ─── Enrollments — mezcla de planes y estados para el listado ───
  const enroll = (
    academyId: string,
    personId: string,
    planId: string,
    status: "ACTIVE" | "PAUSED" | "TRIAL" | "FROZEN" | "ONLINE",
    startedDaysAgo = 45,
  ) =>
    ensure(
      () => prisma.enrollment.findFirst({ where: { academyId, personId } }),
      () =>
        prisma.enrollment.create({
          data: {
            academyId,
            personId,
            planId,
            status,
            startedAt: new Date(Date.now() - startedDaysAgo * 86_400_000),
            pausedAt:
              status === "PAUSED" || status === "FROZEN" ? new Date() : null,
          },
        }),
      (e) =>
        prisma.enrollment.update({
          where: { id: e.id },
          data: { planId, status },
        }),
    );

  await enroll(muvet.id, camila.id, muvetMensual.id, "ACTIVE", 90);
  await enroll(muvet.id, josefa.id, muvetPack.id, "ACTIVE", 30);
  await enroll(muvet.id, diego.id, muvetMensual.id, "ACTIVE", 120);
  await enroll(muvet.id, francisca.id, muvetTrial.id, "TRIAL", 5);
  await enroll(muvet.id, sebastian.id, muvetMensual.id, "PAUSED", 75);
  await enroll(muvet.id, antonia.id, muvetMensual.id, "ACTIVE", 20);
  await enroll(muvet.id, felipe.id, muvetPack.id, "FROZEN", 150);
  await enroll(muvet.id, daniela.id, muvetPack.id, "ACTIVE", 12);
  await enroll(muvet.id, dancer.id, muvetMensual.id, "ACTIVE", 60);
  await enroll(tumbao.id, camila.id, tumbaoMensual.id, "ACTIVE", 40);
  await enroll(tumbao.id, antonia.id, tumbaoMensual.id, "TRIAL", 8);

  // ─── Series + slots + clases materializadas ───
  const styleId = async (name: string) =>
    (await prisma.style.findFirst({ where: { name } }))!.id;
  const levelId = async (name: string) =>
    (await prisma.classLevel.findUnique({ where: { name } }))!.id;
  const typeId = async (name: string) =>
    (await prisma.classType.findUnique({ where: { name } }))!.id;

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonth = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // Misma regla que ClassSeriesController.monthDates: días a medianoche UTC.
  const monthDatesUTC = (month: string): Date[] => {
    const [y, m] = month.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, i + 1)));
  };

  type SlotSeed = {
    weekday: number;
    startTime: string;
    endTime: string;
    capacity?: number; // omitido = hereda serie/academia
  };

  /**
   * Serie + tipos + slots + clases materializadas del mes vigente y el
   * anterior (el mes pasado alimenta el historial de asistencias).
   * Idempotente por claves naturales.
   */
  const mkClassSeries = async (opts: {
    academyId: string;
    name: string;
    styleName?: string;
    levelName?: string;
    typeNames?: string[];
    instructorId?: string;
    quorum?: number; // override de serie; omitido = hereda academia
    slots: SlotSeed[];
    active?: boolean;
    /** también materializa el mes anterior (historial). Default true. */
    withHistory?: boolean;
  }) => {
    const sId = opts.styleName ? await styleId(opts.styleName) : null;
    const lId = opts.levelName ? await levelId(opts.levelName) : null;
    const series = await ensure(
      () =>
        prisma.classSeries.findFirst({
          where: { academyId: opts.academyId, name: opts.name },
        }),
      () =>
        prisma.classSeries.create({
          data: {
            academyId: opts.academyId,
            name: opts.name,
            styleId: sId,
            levelId: lId,
            instructorId: opts.instructorId ?? null,
            quorum: opts.quorum ?? null,
            month: currentMonth,
            active: opts.active ?? true,
          },
        }),
      (s) =>
        prisma.classSeries.update({
          where: { id: s.id },
          data: {
            styleId: sId,
            levelId: lId,
            instructorId: opts.instructorId ?? null,
            quorum: opts.quorum ?? null,
            month: currentMonth,
            active: opts.active ?? true,
          },
        }),
    );

    for (const tName of opts.typeNames ?? []) {
      await prisma.classSeriesType.upsert({
        where: {
          seriesId_typeId: { seriesId: series.id, typeId: await typeId(tName) },
        },
        update: {},
        create: { seriesId: series.id, typeId: await typeId(tName) },
      });
    }

    const months = [currentMonth, ...(opts.withHistory === false ? [] : [prevMonth])];
    const slots: { slot: { id: string }; classes: { id: string; date: Date }[] }[] = [];
    for (const s of opts.slots) {
      const slot = await ensure(
        () =>
          prisma.classSlot.findFirst({
            where: {
              academyId: opts.academyId,
              seriesId: series.id,
              weekday: s.weekday,
              startTime: s.startTime,
            },
          }),
        () =>
          prisma.classSlot.create({
            data: {
              academyId: opts.academyId,
              seriesId: series.id,
              weekday: s.weekday,
              startTime: s.startTime,
              endTime: s.endTime,
              capacity: s.capacity ?? null,
              styleId: sId,
              instructorId: opts.instructorId ?? null,
            },
          }),
        (sl) =>
          prisma.classSlot.update({
            where: { id: sl.id },
            data: {
              endTime: s.endTime,
              capacity: s.capacity ?? null,
              instructorId: opts.instructorId ?? null,
            },
          }),
      );

      const classes: { id: string; date: Date }[] = [];
      for (const month of months) {
        for (const date of monthDatesUTC(month)) {
          if (date.getUTCDay() !== s.weekday) continue;
          const cls = await ensure(
            () =>
              prisma.class.findFirst({
                where: { classSlotId: slot.id, date },
              }),
            () =>
              prisma.class.create({
                data: { classSlotId: slot.id, date },
              }),
          );
          classes.push(cls);
        }
      }
      slots.push({ slot, classes });
    }
    return { series, slots };
  };

  // Serie 1: quórum override 8 (la academia tiene 15) — llena + waitlist.
  const bachataBasico = await mkClassSeries({
    academyId: muvet.id,
    name: "Bachata Sensual — Básico",
    styleName: "Bachata sensual",
    levelName: "Básico",
    typeNames: ["Pareja"],
    instructorId: vale.id,
    quorum: 8,
    slots: [
      { weekday: 1, startTime: "19:00", endTime: "20:30" },
      { weekday: 3, startTime: "19:00", endTime: "20:30" },
    ],
  });

  // Serie 2: sin quorum propio → hereda 15 de la academia; un slot con
  // capacity explícito (10) gana sobre la herencia.
  const salsaInter = await mkClassSeries({
    academyId: muvet.id,
    name: "Salsa Cubana — Intermedio",
    styleName: "Salsa cubana (casino)",
    levelName: "Intermedio",
    typeNames: ["Pareja", "Shines"],
    instructorId: rodrigo.id,
    slots: [
      { weekday: 2, startTime: "20:00", endTime: "21:30" },
      { weekday: 4, startTime: "20:00", endTime: "21:30", capacity: 10 },
    ],
  });

  // Serie 3: ni serie ni slots declaran cupo → todo hereda academy (15).
  const rueda = await mkClassSeries({
    academyId: muvet.id,
    name: "Rueda de Casino — Open",
    styleName: "Rueda de casino",
    levelName: "Iniciación",
    typeNames: ["Pareja"],
    instructorId: vale.id,
    slots: [{ weekday: 6, startTime: "12:00", endTime: "13:30" }],
  });

  // Serie inactiva — probar desactivar/reactivar sin romper la demo.
  await mkClassSeries({
    academyId: muvet.id,
    name: "Bachata Dominicana — Intensivo",
    styleName: "Bachata dominicana",
    levelName: "Básico",
    instructorId: rodrigo.id,
    quorum: 10,
    slots: [{ weekday: 5, startTime: "21:00", endTime: "22:30" }],
    active: false,
    withHistory: false,
  });

  // Serie de la segunda academia (sin defaultQuorum propio en serie → 12
  // de Tumbao; si Tumbao no declarara, caería al fallback 20).
  await mkClassSeries({
    academyId: tumbao.id,
    name: "Timba — Open",
    styleName: "Timba",
    levelName: "Intermedio",
    typeNames: ["Shines"],
    instructorId: vale.id,
    slots: [{ weekday: 3, startTime: "21:00", endTime: "22:30" }],
  });

  // Overrides puntuales a nivel de instancia Class: capacidad y profesor.
  // (segunda clase futura de salsa martes → cupo 6; tercera → la dicta Vale)
  const salsaMartes = salsaInter.slots[0].classes.filter(
    (c) => c.date >= todayUTC,
  );
  if (salsaMartes[1]) {
    await prisma.class.update({
      where: { id: salsaMartes[1].id },
      data: { capacity: 6 },
    });
  }
  if (salsaMartes[2]) {
    await prisma.class.update({
      where: { id: salsaMartes[2].id },
      data: { instructorId: vale.id },
    });
  }

  // ─── Reservas + asistencias ───
  const book = (classId: string, personId: string, status = "BOOKED") =>
    prisma.classBooking.upsert({
      where: { classId_personId: { classId, personId } },
      update: { status },
      create: { classId, personId, status },
    });
  const attend = (classId: string, personId: string, at: Date) =>
    prisma.attendance.upsert({
      where: { classId_personId: { classId, personId } },
      update: {},
      create: { classId, personId, checkedAt: at },
    });

  const alumnosMuvet = [
    camila,
    josefa,
    diego,
    francisca,
    sebastian,
    antonia,
    felipe,
    daniela,
    dancer,
  ];

  // Historial: asistencias en clases pasadas de bachata (las primeras N
  // pasadas por slot) + reservas históricas para que el dedup muestre
  // "attended" ganando sobre "booked".
  for (const { classes } of bachataBasico.slots) {
    for (const cls of classes.filter((c) => c.date < todayUTC)) {
      for (const p of alumnosMuvet.slice(0, 6)) {
        await book(cls.id, p.id);
        await attend(cls.id, p.id, cls.date);
      }
      // Algunos reservaron pero no asistieron → quedan "booked" en historial.
      for (const p of alumnosMuvet.slice(6, 8)) {
        await book(cls.id, p.id);
      }
    }
  }
  for (const { classes } of salsaInter.slots) {
    for (const cls of classes.filter((c) => c.date < todayUTC)) {
      for (const p of [camila, diego, antonia, dancer]) {
        await book(cls.id, p.id);
        await attend(cls.id, p.id, cls.date);
      }
    }
  }

  // Futuras: la próxima de bachata llena (8/8) + waitlist; la siguiente
  // queda 5/8 para la tarjeta de quórum.
  const bachataFuturas = bachataBasico.slots
    .flatMap((s) => s.classes)
    .filter((c) => c.date >= todayUTC)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (bachataFuturas[0]) {
    for (const p of alumnosMuvet.slice(0, 8)) {
      await book(bachataFuturas[0].id, p.id);
    }
    await book(bachataFuturas[0].id, dancer.id, "WAITLIST");
    await book(bachataFuturas[0].id, antonia.id, "WAITLIST");
  }
  if (bachataFuturas[1]) {
    for (const p of [camila, josefa, diego, antonia, dancer]) {
      await book(bachataFuturas[1].id, p.id);
    }
  }
  for (const cls of bachataFuturas.slice(2)) {
    for (const p of [camila, diego, daniela]) {
      await book(cls.id, p.id);
    }
  }
  const salsaFuturas = salsaInter.slots
    .flatMap((s) => s.classes)
    .filter((c) => c.date >= todayUTC)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const cls of salsaFuturas) {
    for (const p of [camila, diego, antonia, josefa]) {
      await book(cls.id, p.id);
    }
  }
  const ruedaFuturas = rueda.slots
    .flatMap((s) => s.classes)
    .filter((c) => c.date >= todayUTC);
  for (const cls of ruedaFuturas) {
    for (const p of alumnosMuvet.slice(0, 6)) {
      await book(cls.id, p.id);
    }
  }

  // Clases particulares — bandeja del instructor y del alumno.
  const lesson = (
    personId: string,
    instructorId: string,
    daysFromNow: number,
    status: string,
    price = 35000,
  ) =>
    ensure(
      () =>
        prisma.privateLesson.findFirst({
          where: { academyId: muvet.id, personId, instructorId, status },
        }),
      () =>
        prisma.privateLesson.create({
          data: {
            academyId: muvet.id,
            personId,
            instructorId,
            scheduledAt: new Date(Date.now() + daysFromNow * 86_400_000),
            price,
            commissionPct: 15,
            status,
          },
        }),
    );
  await lesson(daniela.id, vale.id, 4, "REQUESTED");
  await lesson(camila.id, vale.id, 7, "CONFIRMED");
  await lesson(josefa.id, rodrigo.id, -14, "DONE");
  await lesson(dancer.id, vale.id, -7, "DONE", 30000);


  // ─── Series + eventos ───
  const mkSeries = async (
    name: string,
    producerId: string,
    venueId: string,
    recurrence: string,
    presale: number,
    door: number,
    weekday: number,
    djIds: string[],
    genres: Genre[] = [],
    aliases: string[] = [],
  ) => {
    const series = await ensure(
      () =>
        prisma.eventSeries.findFirst({
          where: { producerId, name: { in: [name, ...aliases] } },
        }),
      () =>
        prisma.eventSeries.create({
          data: { name, producerId, venueId, recurrence, genres },
        }),
      (s) =>
        prisma.eventSeries.update({
          where: { id: s.id },
          data: { name, venueId, recurrence, genres },
        }),
    );

    // El evento lleva el nombre de la marca ("Bachatamanía"), sin
    // sufijos — en la vida real el flyer dice solo eso.
    const eventName = name;
    const event = await ensure(
      () =>
        prisma.event.findFirst({
          // PUBLISHED: la serie también tiene ediciones CLOSED
          // (historial) que no deben absorber este upsert.
          where: { seriesId: series.id, status: "PUBLISHED" },
        }),
      () =>
        prisma.event.create({
          data: {
            seriesId: series.id,
            venueId,
            producerId,
            name: eventName,
            status: "PUBLISHED",
            startsAt: nextDay(weekday),
            endsAt: nextDay(weekday, 22 + 6),
            presalePrice: presale,
            doorPrice: door,
            capacity: 300,
          },
        }),
      // refrescar fechas/precios — la demo apunta siempre a "la próxima semana"
      (e) =>
        prisma.event.update({
          where: { id: e.id },
          data: {
            name: eventName,
            startsAt: nextDay(weekday),
            endsAt: nextDay(weekday, 22 + 6),
            presalePrice: presale,
            doorPrice: door,
            status: "PUBLISHED",
          },
        }),
    );

    for (const personId of djIds) {
      await prisma.eventDj.upsert({
        where: { eventId_personId: { eventId: event.id, personId } },
        update: {},
        create: { eventId: event.id, personId },
      });
    }
    return event;
  };

  // Casi todos los eventos mezclan salsa + bachata + timba; las
  // excepciones son la identidad de marca (Bachatamanía = salsa,
  // Baila Cubano con Bachata = timba + bachata).
  const ALL3 = [Genre.SALSA, Genre.BACHATA, Genre.CUBANO];

  // Orixas
  const bachatamania = await mkSeries("Bachatamanía", carlos.id, orixas.id, "weekly:wed", 5000, 6000, 3, [matias.id], [Genre.SALSA]);
  const juevesCubano = await mkSeries("Baila Cubano con Bachata", ardilla.id, orixas.id, "weekly:thu", 5000, 7000, 4, [steban.id], [Genre.CUBANO, Genre.BACHATA], ["Baila Cubano con Bachata (Jueves Cubano)"]);
  await mkSeries("La Gozadera", ardilla.id, orixas.id, "3x/month:fri", 5000, 7000, 5, [steban.id], ALL3);
  await mkSeries("Desafío de Tronos", muvetOwner.id, orixas.id, "1x/month:fri", 6000, 8000, 5, [], ALL3);
  await mkSeries("Social con Estilo", carlos.id, orixas.id, "2x/month", 6000, 8000, 6, [fabian.id], ALL3);
  await mkSeries("Ashe", cesar.id, orixas.id, "1x/month", 6000, 8000, 6, [cesar.id], ALL3);

  // Noches standalone (sin serie) — nombre = marca de la noche. Las
  // homónimas ("Tierra" ×5) se distinguen por el weekday de su
  // startsAt, que persiste entre reseeds.
  const mkNight = async (
    venueId: string,
    name: string,
    weekday: number,
    presale: number,
    door: number,
    capacity: number,
    djIds: string[] = [],
    genres: Genre[] = [],
    weeksAhead = 0,
  ) => {
    const findNight = async () => {
      const candidates = await prisma.event.findMany({
        where: { venueId, seriesId: null, name },
      });
      return (
        candidates.find(
          (e) => new Date(e.startsAt).getDay() === weekday,
        ) ?? null
      );
    };
    // clave natural: nombre + venue + weekday implícito en la fecha
    const event = await ensure(
      findNight,
      () =>
        prisma.event.create({
          data: {
            venueId,
            name,
            status: "PUBLISHED",
            genres,
            startsAt: nextDay(weekday, 22, weeksAhead),
            endsAt: nextDay(weekday, 22 + 6, weeksAhead),
            presalePrice: presale,
            doorPrice: door,
            capacity,
          },
        }),
      (e) =>
        prisma.event.update({
          where: { id: e.id },
          data: {
            name,
            genres,
            startsAt: nextDay(weekday, 22, weeksAhead),
            endsAt: nextDay(weekday, 22 + 6, weeksAhead),
            presalePrice: presale,
            doorPrice: door,
            status: "PUBLISHED",
          },
        }),
    );
    for (const personId of djIds) {
      await prisma.eventDj.upsert({
        where: { eventId_personId: { eventId: event.id, personId } },
        update: {},
        create: { eventId: event.id, personId },
      });
    }
  };

  // Tierra — mar–sáb; mar/mié liberada hasta 23:30 luego $4.000 en puerta.
  for (const wd of [2, 3, 4, 5, 6]) {
    await mkNight(
      tierraDura.id,
      "Tierra",
      wd,
      5000,
      wd === 2 || wd === 3 ? 4000 : 7000,
      250,
      [],
      ALL3,
    );
  }

  // Havana — programación mensual: cada viernes y sábado tiene su
  // propia marca (como en la vida real, el flyer anuncia el nombre
  // de la noche, no el local).
  const havanaNights: [string, number, number][] = [
    // [nombre, weekday, weeksAhead]
    ["Viernes Sabroso", 5, 0],
    ["Zona Salsera", 5, 1],
    ["Estrellas de la rumba", 5, 2],
    ["Reyes de la Gozadera", 5, 3],
    ["Sábado con Sabrosura", 6, 0],
    ["Salseo Night", 6, 1],
    ["Salsa City", 6, 2],
    ["Salsa con Clase", 6, 3],
  ];

  // Limpieza de noches standalone obsoletas o duplicadas ANTES del
  // find-or-create: nombres fuera del set actual ("Havana — noche sáb",
  // "Havana") y duplicados nombre+weekday. Clave nombre+weekday para
  // no borrar las 5 "Tierra" legítimas (una por weekday).
  const nightNames = new Set([
    "Tierra",
    ...havanaNights.map(([n]) => n),
  ]);
  const standalone = await prisma.event.findMany({
    where: {
      seriesId: null,
      venueId: { in: [tierraDura.id, havana.id] },
    },
    select: { id: true, name: true, startsAt: true },
  });
  const seenNight = new Set<string>();
  const staleIds = standalone
    .filter((e) => {
      const key = `${e.name}|${new Date(e.startsAt).getDay()}`;
      if (!nightNames.has(e.name) || seenNight.has(key)) return true;
      seenNight.add(key);
      return false;
    })
    .map((e) => e.id);
  if (staleIds.length > 0) {
    await prisma.eventDj.deleteMany({ where: { eventId: { in: staleIds } } });
    await prisma.eventDay.deleteMany({ where: { eventId: { in: staleIds } } });
    await prisma.scheduleBlock.deleteMany({
      where: { eventId: { in: staleIds } },
    });
    await prisma.show.deleteMany({ where: { eventId: { in: staleIds } } });
    await prisma.event.deleteMany({ where: { id: { in: staleIds } } });
  }

  for (const [name, wd, wk] of havanaNights) {
    await mkNight(
      havana.id,
      name,
      wd,
      5000,
      7000,
      200,
      [jesus.id],
      ALL3,
      wk,
    );
  }

  // ─── Fees por productor + override por evento ───
  // Defaults del productor: el admin los edita en /admin/parametros;
  // el productor los ve read-only en /productor/parametros.
  await prisma.producerParams.upsert({
    where: { producerId: carlos.id },
    update: {},
    create: {
      producerId: carlos.id,
      serviceFeeClp: 400,
      doorAppFeeClp: 500,
      platformFeePct: 5,
    },
  });
  await prisma.producerParams.upsert({
    where: { producerId: muvetOwner.id },
    update: {},
    create: { producerId: muvetOwner.id, platformFeePct: 8 },
  });
  // Override puntual en un evento → badge "Valor propio" en la ficha.
  await prisma.event.update({
    where: { id: bachatamania.id },
    data: { serviceFeeClp: 300, platformFeePct: 10 },
  });

  // ─── Edición pasada — alimenta analytics (GMV, check-ins) e historial ───
  const lastWeek = new Date(Date.now() - 7 * 86_400_000);
  const prevEdition = await ensure(
    () =>
      prisma.event.findFirst({
        where: { name: "Bachatamanía — edición anterior" },
      }),
    () =>
      prisma.event.create({
        data: {
          seriesId: bachatamania.seriesId,
          venueId: orixas.id,
          producerId: carlos.id,
          name: "Bachatamanía — edición anterior",
          status: "CLOSED",
          startsAt: lastWeek,
          endsAt: new Date(lastWeek.getTime() + 6 * 3_600_000),
          presalePrice: 5000,
          doorPrice: 6000,
          capacity: 300,
        },
      }),
  );

  // Tickets + pagos + check-ins de la edición pasada.
  const asistentes = [camila, josefa, diego, antonia, daniela, dancer];
  for (const [i, p] of asistentes.entries()) {
    await ensure(
      () =>
        prisma.ticket.findFirst({
          where: { eventId: prevEdition.id, ownerId: p.id },
        }),
      () =>
        prisma.ticket.create({
          data: {
            eventId: prevEdition.id,
            ownerId: p.id,
            buyerId: p.id,
            listPrice: 5000,
            serviceFee: 500,
            status: "USED",
          },
        }),
    );
    await prisma.payment.upsert({
      where: { refId: `seed-prev-${prevEdition.id.slice(-6)}-${i}` },
      update: {},
      create: {
        orderType: "TICKET",
        refId: `seed-prev-${prevEdition.id.slice(-6)}-${i}`,
        personId: p.id,
        eventId: prevEdition.id,
        amount: 5500,
        fee: 200,
        net: 5300,
        status: "PAID",
        createdAt: new Date(lastWeek.getTime() - 3 * 86_400_000),
      },
    });
    await ensure(
      () =>
        prisma.checkin.findFirst({
          where: { eventId: prevEdition.id, personId: p.id },
        }),
      () =>
        prisma.checkin.create({
          data: {
            eventId: prevEdition.id,
            personId: p.id,
            staffId: staff.id,
            method: "SCAN",
            inAt: new Date(lastWeek.getTime() + 90 * 60_000),
          },
        }),
    );
  }

  // ─── Data social / operativa sobre eventos próximos ───
  // Ticket vigente en la billetera del bailarín + pago PAID.
  await ensure(
    () =>
      prisma.ticket.findFirst({
        where: { eventId: bachatamania.id, ownerId: dancer.id, status: "ACTIVE" },
      }),
    () =>
      prisma.ticket.create({
        data: {
          eventId: bachatamania.id,
          ownerId: dancer.id,
          buyerId: dancer.id,
          listPrice: 5000,
          serviceFee: 300, // override del evento (serviceFeeClp:300)
        },
      }),
  );
  await prisma.payment.upsert({
    where: { refId: `seed-ticket-${bachatamania.id.slice(-6)}` },
    update: {},
    create: {
      orderType: "TICKET",
      refId: `seed-ticket-${bachatamania.id.slice(-6)}`,
      personId: dancer.id,
      eventId: bachatamania.id,
      amount: 5300,
      fee: 190,
      net: 5110,
      status: "PAID",
    },
  });

  // Amistades: una aceptada (lista de amigos), una entrante y una enviada.
  await prisma.friendship.upsert({
    where: { aId_bId: { aId: dancer.id, bId: camila.id } },
    update: { status: "ACCEPTED" },
    create: { aId: dancer.id, bId: camila.id, status: "ACCEPTED" },
  });
  await prisma.friendship.upsert({
    where: { aId_bId: { aId: antonia.id, bId: dancer.id } },
    update: {},
    create: { aId: antonia.id, bId: dancer.id, status: "PENDING" },
  });
  await prisma.friendship.upsert({
    where: { aId_bId: { aId: dancer.id, bId: josefa.id } },
    update: {},
    create: { aId: dancer.id, bId: josefa.id, status: "PENDING" },
  });

  // Staff asignado a la puerta de Bachatamanía (consola /staff).
  await prisma.staffAssignment.upsert({
    where: {
      eventId_personId: { eventId: bachatamania.id, personId: staff.id },
    },
    update: {},
    create: {
      eventId: bachatamania.id,
      personId: staff.id,
      role: "DOOR",
    },
  });

  // Lista de invitados + mesa — operación social del evento.
  const guestList = await ensure(
    () =>
      prisma.guestList.findFirst({
        where: { eventId: bachatamania.id, ownerId: camila.id },
      }),
    () =>
      prisma.guestList.create({
        data: {
          eventId: bachatamania.id,
          ownerId: camila.id,
          label: "Cumpleaños de Camila",
          specialPrice: 4000,
        },
      }),
  );
  for (const p of [antonia, daniela, felipe]) {
    await prisma.guestListEntry.upsert({
      where: {
        guestListId_personId: {
          guestListId: guestList.id,
          personId: p.id,
        },
      },
      update: {},
      create: { guestListId: guestList.id, personId: p.id },
    });
  }
  await ensure(
    () =>
      prisma.tableReservation.findFirst({
        where: { eventId: bachatamania.id, personId: diego.id },
      }),
    () =>
      prisma.tableReservation.create({
        data: {
          eventId: bachatamania.id,
          personId: diego.id,
          partySize: 6,
          status: "REQUESTED",
        },
      }),
  );

  // Sugerencias de canciones — ranking en la consola /dj de Steban.
  const songs: [string, string, string][] = [
    [juevesCubano.id, "La Vida Es Un Carnaval", "Celia Cruz"],
    [juevesCubano.id, "La Vida Es Un Carnaval", "Celia Cruz"],
    [juevesCubano.id, "Obsesión", "Aventura"],
    [juevesCubano.id, "Llorarás", "Oscar D'León"],
    [juevesCubano.id, "Llorarás", "Oscar D'León"],
    [juevesCubano.id, "Llorarás", "Oscar D'León"],
  ];
  const suggesters = [camila, josefa, diego, antonia, daniela, dancer];
  for (const [i, [eventId, title, artist]] of songs.entries()) {
    await ensure(
      () =>
        prisma.songSuggestion.findFirst({
          where: { eventId, personId: suggesters[i].id, title },
        }),
      () =>
        prisma.songSuggestion.create({
          data: { eventId, personId: suggesters[i].id, title, artist },
        }),
    );
  }

  // Código de descuento del productor (módulo discounts).
  await prisma.discountCode.upsert({
    where: { code: "OMNI10" },
    update: {},
    create: {
      code: "OMNI10",
      type: "CAMPAIGN",
      seriesId: bachatamania.seriesId,
      percentOff: 10,
      createdById: carlos.id,
    },
  });

  // Pase de serie del mes vigente — badge de "pase activo" en checkout.
  await prisma.seriesPass.upsert({
    where: {
      seriesId_personId_month: {
        seriesId: bachatamania.seriesId!,
        personId: camila.id,
        month: currentMonth,
      },
    },
    update: {},
    create: {
      seriesId: bachatamania.seriesId!,
      personId: camila.id,
      month: currentMonth,
      price: 25000,
    },
  });

  // Arriendos del venue — consola /venue los confirma/cancela.
  const rental = (status: string, daysFromNow: number, academyId?: string, eventId?: string) =>
    ensure(
      () =>
        prisma.venueRental.findFirst({
          where: { venueId: orixas.id, status, ...(eventId ? { eventId } : { academyId }) },
        }),
      () =>
        prisma.venueRental.create({
          data: {
            venueId: orixas.id,
            academyId,
            eventId,
            date: new Date(Date.now() + daysFromNow * 86_400_000),
            price: 150000,
            status,
          },
        }),
    );
  await rental("REQUESTED", 14, muvet.id);
  await rental("CONFIRMED", 7, undefined, juevesCubano.id);
  await rental("CANCELLED", -7, tumbao.id);

  // Notificaciones in-app — el badge de la campana muestra pendientes.
  const notif = (personId: string, type: string, title: string, body?: string) =>
    ensure(
      () => prisma.notification.findFirst({ where: { personId, type } }),
      () =>
        prisma.notification.create({
          data: {
            personId,
            type,
            title,
            body,
            category: "OPERATIONAL",
          },
        }),
    );
  await notif(
    dancer.id,
    "class.waitlist.promoted",
    "¡Entraste a la clase!",
    "Se liberó un cupo en Bachata Sensual — Básico",
  );
  await notif(
    dancer.id,
    "friend.request",
    "Nueva solicitud de amistad",
    "Antonia Reyes quiere agregarte",
  );

  // Búsqueda de pareja de práctica — tab Prácticas del modo Academia.
  const bachataSensualId = await styleId("Bachata sensual");
  await ensure(
    () =>
      prisma.practicePartnerRequest.findFirst({
        where: { personId: dancer.id, status: "OPEN" },
      }),
    () =>
      prisma.practicePartnerRequest.create({
        data: {
          personId: dancer.id,
          styleId: bachataSensualId,
          role: "FOLLOWER",
          level: "Intermedio",
          location: "Ñuñoa",
          note: "Busco partner para practicar los martes",
        },
      }),
  );

  // Password dev: mismo formato scrypt$N$r$p$salt$hash que AuthService.
  const salt = randomBytes(16);
  const key = scryptSync(DEV_PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 });
  const passwordHash = `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
  await prisma.person.updateMany({
    where: { email: { endsWith: `@${DEV_DOMAIN}` } },
    data: { passwordHash },
  });

  console.log("Seed dev listo:", {
    admin: admin.email,
    academias: [muvet.name],
    loginDemo: `cualquier *@${DEV_DOMAIN} por magic link`,
    password: `${DEV_PASSWORD} (todas las cuentas @${DEV_DOMAIN})`,
  });
}

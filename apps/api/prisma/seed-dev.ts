// Dataset demo de la escena SBK Santiago (spec: omni-dance.md §2).
// Idempotente: personas/venues/series/eventos se resuelven por clave natural
// y las fechas se refrescan en cada corrida para que la demo no envejezca.
import { randomBytes, scryptSync } from "node:crypto";
import { Genre, Prisma, PrismaClient } from "@prisma/client";
import {
  BadgeAwarder,
  buildBadgeStats,
  buildStreakWeeks,
  computeStreak,
  CROWN_TTL_DAYS,
  isEarlyCheckinAt,
  POINT_VALUES,
  type PointReason,
} from "../src/gamification/domain/rules";
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
  const venue = (
    name: string,
    capacity: number,
    lat: number,
    lng: number,
    address: string,
    hours: string,
  ) =>
    ensure(
      () => prisma.venue.findFirst({ where: { name } }),
      () =>
        prisma.venue.create({
          data: { name, address, capacity, lat, lng, hours },
        }),
      (v) =>
        prisma.venue.update({
          where: { id: v.id },
          data: { capacity, lat, lng, address, hours },
        }),
    );

  const orixas = await venue(
    "Orixas",
    300,
    -33.4477,
    -70.6527,
    "Tarapacá 755, Santiago Centro",
    "Mié–Sáb · 21:00–04:00",
  );
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
  const tierraDura = await venue(
    "Tierra",
    250,
    -33.4558,
    -70.6342,
    "Av. Vicuña Mackenna 1459, Santiago",
    "Mar–Sáb · 22:00–04:00",
  );
  const havana = await venue(
    "Havana",
    200,
    -33.4286429,
    -70.6391064,
    "Domínica 142, Recoleta",
    "Vie–Sáb · 22:00–04:00",
  );

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
  const nextMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
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
    /** Modalidad propia del horario; omitido = hereda typeNames de la serie. */
    typeNames?: string[];
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
    dropInPrice?: number; // CLP — precio de clase suelta
    slots: SlotSeed[];
    active?: boolean;
    /** también materializa el mes anterior (historial). Default true. */
    withHistory?: boolean;
    /** también materializa el mes siguiente (explorar cruza el borde de mes). */
    withNext?: boolean;
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
            dropInPrice: opts.dropInPrice ?? null,
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
            dropInPrice: opts.dropInPrice ?? null,
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

    const months = [
      currentMonth,
      ...(opts.withHistory === false ? [] : [prevMonth]),
      ...(opts.withNext ? [nextMonth] : []),
    ];
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
              instructorId: opts.instructorId ?? null,
            },
          }),
        (sl) =>
          // styleId: null — el slot de serie hereda series.styleId; el campo
          // es solo para slots legacy sin serie.
          prisma.classSlot.update({
            where: { id: sl.id },
            data: {
              endTime: s.endTime,
              capacity: s.capacity ?? null,
              instructorId: opts.instructorId ?? null,
              styleId: null,
            },
          }),
      );

      // Modalidad propia del horario (declarativa): si el slot declara
      // typeNames se sincroniza el set; si no, hereda los de la serie.
      if (s.typeNames !== undefined) {
        await prisma.classSlotType.deleteMany({ where: { slotId: slot.id } });
        for (const tName of s.typeNames) {
          await prisma.classSlotType.create({
            data: { slotId: slot.id, typeId: await typeId(tName) },
          });
        }
      }

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
    typeNames: ["En Pareja"],
    instructorId: vale.id,
    quorum: 8,
    dropInPrice: 9000,
    slots: [
      { weekday: 1, startTime: "19:00", endTime: "20:00" },
      { weekday: 3, startTime: "19:00", endTime: "20:00" },
    ],
  });

  // Serie 2: sin quorum propio → hereda 15 de la academia; un slot con
  // capacity explícito (10) gana sobre la herencia.
  const salsaInter = await mkClassSeries({
    academyId: muvet.id,
    name: "Salsa Cubana — Intermedio",
    styleName: "Salsa cubana (casino)",
    levelName: "Intermedio",
    typeNames: ["En Pareja", "Shines"],
    instructorId: rodrigo.id,
    slots: [
      { weekday: 2, startTime: "20:00", endTime: "21:00" },
      { weekday: 4, startTime: "20:00", endTime: "21:00", capacity: 10 },
    ],
  });

  // Serie 3: ni serie ni slots declaran cupo → todo hereda academy (15).
  const rueda = await mkClassSeries({
    academyId: muvet.id,
    name: "Rueda de Casino — Open",
    styleName: "Rueda de casino",
    levelName: "Iniciación",
    typeNames: ["En Pareja"],
    instructorId: vale.id,
    slots: [{ weekday: 6, startTime: "12:00", endTime: "13:00" }],
  });

  // Serie inactiva — probar desactivar/reactivar sin romper la demo.
  await mkClassSeries({
    academyId: muvet.id,
    name: "Bachata Dominicana — Intensivo",
    styleName: "Bachata dominicana",
    levelName: "Básico",
    instructorId: rodrigo.id,
    quorum: 10,
    slots: [{ weekday: 5, startTime: "21:00", endTime: "22:00" }],
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
    dropInPrice: 8000,
    slots: [{ weekday: 3, startTime: "21:00", endTime: "22:00" }],
  });

  // ─── Academias de la escena — catálogo Santiago ───
  // Una serie por estilo que dicta cada academia. Los números del spec
  // del usuario son índices 1-based de ACADEMY_STYLE_MAP (el orden en
  // que listó los estilos).
  const academiasOwner = await person("academias", "Dirección Académica", [
    { role: "ACADEMY_OWNER" },
  ]);

  const ACADEMY_STYLE_MAP = [
    { label: "Mambo", styleName: "Mambo on2" }, // 1
    { label: "Bachata Sensual", styleName: "Bachata sensual" }, // 2
    { label: "Bachata Tradicional", styleName: "Bachata tradicional" }, // 3
    { label: "Bachata Moderna", styleName: "Bachata moderna" }, // 4
    { label: "Cubano", styleName: "Cubano" }, // 5
    { label: "Rueda de Casino", styleName: "Rueda de casino" }, // 6
    { label: "Casino", styleName: "Salsa cubana (casino)" }, // 7
    { label: "Afrocubano", styleName: "Afrocubano" }, // 8
    { label: "Fusión", styleName: "Fusión" }, // 9
  ] as const;

  const ACADEMY_SEED: { name: string; styles: number[] }[] = [
    { name: "Mambo Madness", styles: [1, 4] },
    { name: "Danson Academy", styles: [1, 2, 5] },
    { name: "La Gozadera", styles: [5, 6, 7, 8] },
    { name: "Clave Timba", styles: [2, 5, 6, 7] },
    { name: "Baila con Romitza", styles: [2, 5, 6, 7] },
    { name: "Santiago Baila Salsa", styles: [2, 5, 6, 7] },
    { name: "Habana Dance Company", styles: [5, 6, 7] },
    { name: "As you wish", styles: [1, 2, 5, 6, 7] },
    { name: "Acrodance Training", styles: [1] },
    { name: "Femme", styles: [1, 3] },
    { name: "La Casa del Mambo", styles: [1] },
    { name: "Factoria Mambo", styles: [1] },
    // "Muevete On Tour" del spec = muvet (ya tiene series curadas arriba).
    { name: "Erick Baez", styles: [1] },
    { name: "BSoul", styles: [2] },
    { name: "Utopia", styles: [3] },
    { name: "Pasion Latina", styles: [2] },
    { name: "Ritmo y Guaperia", styles: [2, 5, 6, 7] },
  ];

  // Clases de 1h entre 18 y 22 (última parte a las 21). Los horarios se
  // reparten rotando días/hora/modalidad/nivel para que el explorador
  // muestre una parrilla realista, no un bloque idéntico por academia.
  const DAY_PAIRS = [
    [1, 3],
    [2, 4],
    [5, 6],
    [1, 4],
    [2, 5],
  ];
  const CLASS_HOURS = ["18:00", "19:00", "20:00", "21:00"];
  const MODALITIES = [
    ["En Pareja"],
    ["Shines"],
    ["En Pareja", "Shines"],
    ["Corporalidad"],
  ];
  const LEVEL_ROT = ["Iniciación", "Básico", "Intermedio"];

  for (const [aIdx, a] of ACADEMY_SEED.entries()) {
    const academy = await ensure(
      () => prisma.academy.findFirst({ where: { name: a.name } }),
      () =>
        prisma.academy.create({
          data: {
            name: a.name,
            ownerId: academiasOwner.id,
            defaultQuorum: 15,
          },
        }),
    );
    // Vale y Rodrigo se reparten las academias como profesores de la casa.
    const profe = aIdx % 2 === 0 ? vale : rodrigo;
    await prisma.academyInstructor.upsert({
      where: {
        academyId_personId: { academyId: academy.id, personId: profe.id },
      },
      update: {},
      create: { academyId: academy.id, personId: profe.id },
    });
    for (const [sIdx, styleNum] of a.styles.entries()) {
      const style = ACADEMY_STYLE_MAP[styleNum - 1];
      const weekdays = DAY_PAIRS[(aIdx + sIdx) % DAY_PAIRS.length];
      const startTime = CLASS_HOURS[(aIdx * 2 + sIdx) % CLASS_HOURS.length];
      const endTime = `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`;
      const levelName = LEVEL_ROT[(aIdx + sIdx) % LEVEL_ROT.length];
      const modality = MODALITIES[(aIdx + sIdx) % MODALITIES.length];
      // "Ambos" se resuelve por slot: cada día del par lleva una modalidad
      // (lunes En Pareja / miércoles Shines) en una misma serie.
      const mixed = modality.length > 1;
      await mkClassSeries({
        academyId: academy.id,
        name: `${style.label} — ${levelName}`,
        styleName: style.styleName,
        levelName,
        typeNames: modality,
        instructorId: profe.id,
        dropInPrice: 8000,
        slots: weekdays.map((weekday, i) => ({
          weekday,
          startTime,
          endTime,
          typeNames: mixed ? [modality[i % modality.length]] : undefined,
        })),
        withHistory: false,
        withNext: true,
      });
    }
  }

  // "Muevete On Tour" del spec lleva estilos 2·5·6·7 — muvet ya tiene
  // Bachata Sensual (2), Rueda (6) y Casino (7); le falta Cubano (5).
  await mkClassSeries({
    academyId: muvet.id,
    name: "Cubano — Básico",
    styleName: "Cubano",
    levelName: "Básico",
    typeNames: ["En Pareja", "Shines"],
    instructorId: rodrigo.id,
    dropInPrice: 9000,
    slots: [
      {
        weekday: 2,
        startTime: "18:00",
        endTime: "19:00",
        typeNames: ["En Pareja"],
      },
      {
        weekday: 5,
        startTime: "18:00",
        endTime: "19:00",
        typeNames: ["Shines"],
      },
    ],
    withHistory: false,
    withNext: true,
  });

  // Invariante: styleId del slot es solo para slots legacy sin serie —
  // limpia el duplicado en cualquier slot de serie sembrado antes del fix.
  await prisma.classSlot.updateMany({
    where: { seriesId: { not: null }, styleId: { not: null } },
    data: { styleId: null },
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
    weeksAhead = 0,
    genreMix: MixBlock[] | null = null,
    // Cronograma de la noche — null deriva de genres (programFor).
    program: ProgramItem[] | null = null,
  ) => {
    const series = await ensure(
      () =>
        prisma.eventSeries.findFirst({
          where: { producerId, name: { in: [name, ...aliases] } },
        }),
      () =>
        prisma.eventSeries.create({
          data: { name, producerId, venueId, recurrence, genres, genreMix: genreMix ?? undefined, program: program ?? programFor(genres) },
        }),
      (s) =>
        prisma.eventSeries.update({
          where: { id: s.id },
          data: { name, venueId, recurrence, genres, genreMix: genreMix ?? Prisma.DbNull, program: program ?? programFor(genres) },
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
            startsAt: nextDay(weekday, 22, weeksAhead),
            endsAt: nextDay(weekday, 22 + 6, weeksAhead),
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
    return event;
  };

  // Casi todos los eventos mezclan salsa + bachata + timba; las
  // excepciones son la identidad de marca (Bachatamanía = bachata,
  // Baila Cubano con Bachata = timba + bachata).
  const ALL3 = [Genre.SALSA, Genre.BACHATA, Genre.CUBANO];

  // Ciclo de mezcla tal como suena la noche: bloques de canciones por
  // género que se repiten. El card muestra la proporción agregada
  // (ej. B15·S2·B15·T2 → 88% bachata). null = sin barra de mezcla.
  type MixBlock = { genre: Genre; songs: number };
  const mix = (...blocks: [Genre, number][]): MixBlock[] =>
    blocks.map(([genre, songs]) => ({ genre, songs }));
  // Ciclo parejo de a 2: 2 bachatas, 2 salsas, 2 bachatas, 2 timbas →
  // 50/25/25. Lo usan Havana, La Gozadera y Desafío de Tronos.
  const MIX_2X2 = mix(
    [Genre.BACHATA, 2],
    [Genre.SALSA, 2],
    [Genre.BACHATA, 2],
    [Genre.CUBANO, 2],
  );

  // Cronograma de la noche — filas {t: "HH:MM" (o "Hasta HH:MM"),
  // end?: "HH:MM", label}. Se renderiza en el orden del array: las
  // horas post-medianoche van al final (00:00 va después de 22:00).
  type ProgramItem = { t: string; end?: string; label: string };

  // Regla general: con salsa+bachata hay clase de bachata 20–21 y de
  // salsa 21–22; con un solo estilo, su clase va 21–22; sin clases,
  // se abre al social. Siempre: shows 00:00, cumpleaños 00:30 y
  // cierre 03:45.
  const programFor = (genres: Genre[]): ProgramItem[] => {
    const items: ProgramItem[] = [];
    const b = genres.includes(Genre.BACHATA);
    const s = genres.includes(Genre.SALSA);
    if (b && s) {
      items.push({ t: "20:00", end: "21:00", label: "Clase de bachata" });
      items.push({ t: "21:00", end: "22:00", label: "Clase de salsa" });
    } else if (b || s) {
      items.push({
        t: "21:00",
        end: "22:00",
        label: b ? "Clase de bachata" : "Clase de salsa",
      });
    }
    items.push(
      { t: "22:00", label: "Inicio del social" },
      { t: "00:00", label: "Shows" },
      { t: "00:30", label: "Cumpleaños" },
      { t: "03:45", label: "Cierre del social" },
    );
    return items;
  };

  // Cronograma Maníaco — Bachatamanía corre con formato propio
  // (happy hour, karaoke y reserva de mesas antes del social).
  const PROG_MANIACO: ProgramItem[] = [
    { t: "20:30", label: "Apertura de puertas" },
    { t: "20:30", end: "22:00", label: "Happy Hour 2x1" },
    { t: "20:30", end: "21:15", label: "Karaoke Maníaco" },
    { t: "21:15", label: "Clase de Bachata Parejas" },
    { t: "Hasta 22:30", label: "Reserva de mesas" },
    { t: "22:15", label: "¡Inicio del social!" },
    { t: "00:30", label: "Shows + Cumpleaños" },
    { t: "02:45", label: "Término del social" },
  ];

  // Orixas — una noche por día: las marcas del mismo weekday alternan
  // semanas (weeksAhead), como en la programación real del local.
  // El último arg es el ciclo de mezcla (genreMix de la serie).
  const bachatamania = await mkSeries("Bachatamanía", carlos.id, orixas.id, "weekly:wed", 5000, 6000, 3, [matias.id], [Genre.BACHATA], [], 0,
    // ~15 bachatas, 2 salsas, 15 bachatas, 2 timbas → 88/6/6
    mix([Genre.BACHATA, 15], [Genre.SALSA, 2], [Genre.BACHATA, 15], [Genre.CUBANO, 2]),
    PROG_MANIACO);
  const juevesCubano = await mkSeries("Baila Cubano con Bachata", ardilla.id, orixas.id, "weekly:thu", 5000, 7000, 4, [steban.id], [Genre.CUBANO, Genre.BACHATA], ["Baila Cubano con Bachata (Jueves Cubano)"], 0,
    // 4 timbas, 2 bachatas → 67/33
    mix([Genre.CUBANO, 4], [Genre.BACHATA, 2]));
  await mkSeries("La Gozadera", ardilla.id, orixas.id, "3x/month:fri", 5000, 7000, 5, [steban.id], ALL3, [], 0, MIX_2X2);
  await mkSeries("Desafío de Tronos", muvetOwner.id, orixas.id, "1x/month:fri", 6000, 8000, 5, [], ALL3, [], 1, MIX_2X2);
  await mkSeries("Social con Estilo", carlos.id, orixas.id, "2x/month:sat", 6000, 8000, 6, [fabian.id], ALL3, [], 0,
    // 4 salsas, 2 bachatas, 2 salsas, 2 timbas, 2 bachatas → 50/33/17
    mix([Genre.SALSA, 4], [Genre.BACHATA, 2], [Genre.SALSA, 2], [Genre.CUBANO, 2], [Genre.BACHATA, 2]));
  await mkSeries("Ashe", cesar.id, orixas.id, "1x/month:sat", 6000, 8000, 6, [cesar.id], [Genre.CUBANO], [], 1,
    // Pura timba
    mix([Genre.CUBANO, 1]));

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
    // N-ésima ocurrencia del nombre+weekday (noches fijas que se
    // repiten cada semana, p.ej. "Bachata Club" todos los martes).
    slot = 0,
    // Ciclo de mezcla de la noche → event.genreMix (standalone no
    // tiene serie de la que heredar).
    genreMix: MixBlock[] | null = null,
    // Cronograma → event.program (null deriva de genres).
    program: ProgramItem[] | null = null,
  ) => {
    const findNight = async () => {
      const candidates = await prisma.event.findMany({
        where: { venueId, seriesId: null, name },
        orderBy: { startsAt: "asc" },
      });
      const sameWd = candidates.filter(
        (e) => new Date(e.startsAt).getDay() === weekday,
      );
      return sameWd[slot] ?? null;
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
            genreMix: genreMix ?? undefined,
            program: program ?? programFor(genres),
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
            genreMix: genreMix ?? Prisma.DbNull,
            program: program ?? programFor(genres),
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

  // Tierra — programación mensual con la rotación real: martes fijo
  // Bachata Club, miércoles fijo Miércoles Salseros, jueves alterna
  // Switch/AbraZouk, vie+sáb rotan Exóticas/Bachatazo/Galaxy/BC/Lovers.
  // Puerta siempre > preventa: mar/mié $6.000, jue a sáb $7.000.
  const PURE_B = mix([Genre.BACHATA, 1]);
  const PURE_S = mix([Genre.SALSA, 1]);
  const GALAXY_MIX = mix([Genre.BACHATA, 5], [Genre.SALSA, 2]); // 5×2
  const tierraNights: [string, number, number, Genre[], MixBlock[] | null][] = [
    // [nombre, weekday, weeksAhead, genres, ciclo de mezcla]
    ["Bachata Club", 2, 0, [Genre.BACHATA], PURE_B],
    ["Bachata Club", 2, 1, [Genre.BACHATA], PURE_B],
    ["Bachata Club", 2, 2, [Genre.BACHATA], PURE_B],
    ["Bachata Club", 2, 3, [Genre.BACHATA], PURE_B],
    ["Miércoles Salseros", 3, 0, [Genre.SALSA], PURE_S],
    ["Miércoles Salseros", 3, 1, [Genre.SALSA], PURE_S],
    ["Miércoles Salseros", 3, 2, [Genre.SALSA], PURE_S],
    ["Miércoles Salseros", 3, 3, [Genre.SALSA], PURE_S],
    ["Switch", 4, 0, [Genre.BACHATA], PURE_B],
    ["AbraZouk", 4, 1, [], null], // zouk — sin género en el catálogo
    ["Switch", 4, 2, [Genre.BACHATA], PURE_B],
    ["AbraZouk", 4, 3, [], null],
    ["Exóticas", 5, 0, [Genre.BACHATA], PURE_B],
    ["Galaxy", 5, 1, [Genre.BACHATA, Genre.SALSA], GALAXY_MIX],
    ["Bachata Club", 5, 2, [Genre.BACHATA], PURE_B],
    ["Bachatazo", 5, 3, [Genre.BACHATA], PURE_B],
    ["Bachatazo", 6, 0, [Genre.BACHATA], PURE_B],
    ["Lovers", 6, 1, [Genre.BACHATA], PURE_B], // pura bachata
    ["Exóticas", 6, 2, [Genre.BACHATA], PURE_B],
    ["Galaxy", 6, 3, [Genre.BACHATA, Genre.SALSA], GALAXY_MIX],
  ];

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
  // find-or-create: nombres fuera del set actual ("Tierra", "Havana
  // — noche sáb") y duplicados nombre+fecha (misma noche, mismo día).
  const nightNames = new Set([
    ...tierraNights.map(([n]) => n),
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
      const key = `${e.name}|${e.startsAt.toISOString().slice(0, 10)}`;
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

  // slot = n-ésima ocurrencia del nombre+weekday (noches fijas que se
  // repiten semana a semana con el mismo nombre).
  const tierraSlots = new Map<string, number>();
  for (const [name, wd, wk, g, m] of tierraNights) {
    const k = `${name}|${wd}`;
    const slot = tierraSlots.get(k) ?? 0;
    tierraSlots.set(k, slot + 1);
    await mkNight(
      tierraDura.id,
      name,
      wd,
      5000,
      wd <= 3 ? 6000 : 7000,
      250,
      [],
      g,
      wk,
      slot,
      m,
    );
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
      0,
      // Todas las noches Havana: 2 bachatas, 2 salsas, 2 bachatas,
      // 2 timbas en ciclo.
      MIX_2X2,
    );
  }

  // ─── Shows de la noche ───
  // Formato real: academia (texto libre — puede no estar registrada),
  // tipo de team (BOOTCAMP | ALUMNOS | OPEN | PRO | AMATEUR) y nombre de
  // la coreografía. TODOS los eventos tienen shows; el volumen crece con
  // el día: vie/sáb son las noches grandes (6), jueves medio (4), el
  // resto base (2–3). Determinista por evento — el reseed no varía.
  type ShowSeed = { academy: string; teamType: string; name: string };
  const showRosters: Record<string, ShowSeed[]> = {
    "Social con Estilo": [
      { academy: "Mambo Madness", teamType: "ALUMNOS", name: "La Peleona" },
      { academy: "Mambo Madness", teamType: "OPEN", name: "Rey del Timbal" },
      { academy: "MuéveteOnTour", teamType: "PRO", name: "Descarga Total" },
      { academy: "Academia Tumbao", teamType: "AMATEUR", name: "Mi Tumbao" },
    ],
    "La Gozadera": [
      { academy: "Academia Tumbao", teamType: "ALUMNOS", name: "Candela Pura" },
      { academy: "Mambo Madness", teamType: "BOOTCAMP", name: "Bootcamp On2" },
      { academy: "MuéveteOnTour", teamType: "OPEN", name: "Rumba Buena" },
    ],
    "Desafío de Tronos": [
      { academy: "MuéveteOnTour", teamType: "PRO", name: "Guaguancó Royal" },
      { academy: "MuéveteOnTour", teamType: "ALUMNOS", name: "Los Novatos" },
      { academy: "Academia Tumbao", teamType: "OPEN", name: "Sabor Compartido" },
    ],
    "Bachatamanía": [
      { academy: "Academia Tumbao", teamType: "ALUMNOS", name: "Sensual Night" },
      { academy: "Mambo Madness", teamType: "OPEN", name: "Bachata Flow" },
      { academy: "MuéveteOnTour", teamType: "BOOTCAMP", name: "Dominican Power" },
    ],
    "Baila Cubano con Bachata": [
      { academy: "MuéveteOnTour", teamType: "ALUMNOS", name: "Timba y Sandunga" },
      { academy: "Academia Tumbao", teamType: "AMATEUR", name: "Son de Prueba" },
    ],
    "Miércoles Salseros": [
      { academy: "Mambo Madness", teamType: "PRO", name: "Mambo Clásico" },
      { academy: "Academia Tumbao", teamType: "BOOTCAMP", name: "Shine On2" },
    ],
  };
  // Pool genérico: eventos sin roster nombrado rotan de acá (offset
  // determinista por evento); los rosters cortos también se rellenan
  // desde acá hasta el cupo del día.
  const genericShows: ShowSeed[] = [
    { academy: "Mambo Madness", teamType: "ALUMNOS", name: "Furia Salsera" },
    { academy: "Academia Tumbao", teamType: "OPEN", name: "Tumbao Urbano" },
    { academy: "MuéveteOnTour", teamType: "PRO", name: "Proyecto Élite" },
    { academy: "Son de Cuba", teamType: "AMATEUR", name: "Casino Real" },
    { academy: "Bachata Studio", teamType: "ALUMNOS", name: "Ola Sensual" },
    { academy: "Mambo Madness", teamType: "BOOTCAMP", name: "Intensivo On2" },
    { academy: "Academia Tumbao", teamType: "AMATEUR", name: "Primeras Vueltas" },
    { academy: "Timba Power", teamType: "OPEN", name: "Despelote Total" },
    { academy: "MuéveteOnTour", teamType: "ALUMNOS", name: "Generación M" },
    { academy: "Danza Viva", teamType: "PRO", name: "Acento Caribe" },
    { academy: "Son de Cuba", teamType: "BOOTCAMP", name: "Rueda Flash" },
    { academy: "Bachata Studio", teamType: "OPEN", name: "Dominicana" },
  ];
  // Cupo por día de semana: vie/sáb son las noches grandes.
  const showTarget = (weekday: number): number =>
    weekday === 5 || weekday === 6 ? 6 : weekday === 4 ? 4 : 2;
  // Academias registradas → el show queda vinculado (academyId) para que
  // el perfil de la academia pueda listar sus presentaciones; el resto
  // solo lleva el nombre de texto.
  const academyIds: Record<string, string> = {
    MuéveteOnTour: muvet.id,
    "Academia Tumbao": tumbao.id,
  };
  const pubEvents = await prisma.event.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, name: true, startsAt: true, presalePrice: true },
    orderBy: { startsAt: "asc" },
  });
  // Reseed determinista: se recrea el roster completo en cada corrida.
  await prisma.show.deleteMany({
    where: { eventId: { in: pubEvents.map((e) => e.id) } },
  });
  for (const ev of pubEvents) {
    // Hash estable del id → offset del pool genérico, así cada evento
    // rota el pool sin depender del orden de las corridas.
    let hash = 0;
    for (const ch of ev.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const wd = ev.startsAt.getDay();
    const target = showTarget(wd) + (hash % 2); // vie/sáb 6–7, jue 4–5
    const named = showRosters[ev.name] ?? [];
    const roster: ShowSeed[] = [...named];
    for (let i = 0; roster.length < target; i++) {
      const candidate = genericShows[(hash + i) % genericShows.length];
      // no repetir academia+coreo dentro de la misma noche
      if (
        roster.some(
          (s) => s.academy === candidate.academy && s.name === candidate.name,
        )
      ) {
        continue;
      }
      roster.push(candidate);
    }
    await prisma.show.createMany({
      data: roster.map((s, i) => ({
        ...s,
        academyId: academyIds[s.academy] ?? null,
        eventId: ev.id,
        order: i,
      })),
    });
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
      // Defaults de mesas del productor: sus eventos nuevos los heredan
      // salvo override. El cupo sentable (40) es menor que el aforo del
      // evento — es el total real contra el que valida el checkout.
      tablesTotal: 8,
      tableSeatMax: 6,
      tableSeatsTotal: 40,
    },
  });
  // muvetOwner sin defaults de mesas → sus eventos no ofrecen el servicio.
  await prisma.producerParams.upsert({
    where: { producerId: muvetOwner.id },
    update: {},
    create: { producerId: muvetOwner.id, platformFeePct: 8 },
  });
  // Backfill de defaults de mesas: solo si el productor jamás configuró
  // ninguno (los tres en null) — no pisa ediciones hechas en /productor/
  // parametros sobre una DB existente.
  await prisma.producerParams.updateMany({
    where: {
      producerId: carlos.id,
      tablesTotal: null,
      tableSeatMax: null,
      tableSeatsTotal: null,
    },
    data: { tablesTotal: 8, tableSeatMax: 6, tableSeatsTotal: 40 },
  });
  // Override puntual en un evento → badge "Valor propio" en la ficha.
  // Bachatamanía configura su propio inventario de mesas (10 mesas, hasta
  // 8 por mesa, 60 personas sentables — menos que su aforo).
  await prisma.event.update({
    where: { id: bachatamania.id },
    data: {
      serviceFeeClp: 300,
      platformFeePct: 10,
      tablesTotal: 10,
      tableSeatMax: 8,
      tableSeatsTotal: 60,
    },
  });
  // Las noches grandes de fin de semana también ofrecen mesa — hace la
  // sección de checkout descubrible en la demo sin depender de un solo
  // evento. 8 mesas × máx. 6 personas = 48 asientos (aforo es mayor).
  await prisma.event.updateMany({
    where: {
      status: "PUBLISHED",
      name: { in: ["Viernes Sabroso", "Sábado con Sabrosura", "Bachatazo", "La Gozadera"] },
    },
    data: { tablesTotal: 8, tableSeatMax: 6, tableSeatsTotal: 48 },
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

  // Amistades: clique ACCEPTED entre los bailarines demo — cualquier
  // cuenta demo ve amigos en /amigos y "amigos que van" en los eventos.
  // Respeta la dirección de filas existentes (una PENDING previa entre
  // dos del clique se promueve a ACCEPTED sin duplicar el par).
  const clique = [dancer, camila, josefa, diego, antonia, daniela];
  for (let i = 0; i < clique.length; i++) {
    for (let j = i + 1; j < clique.length; j++) {
      const a = clique[i];
      const b = clique[j];
      const existing = await prisma.friendship.findFirst({
        where: {
          OR: [
            { aId: a.id, bId: b.id },
            { aId: b.id, bId: a.id },
          ],
        },
      });
      if (existing) {
        await prisma.friendship.update({
          where: { id: existing.id },
          data: { status: "ACCEPTED" },
        });
      } else {
        await prisma.friendship.create({
          data: { aId: a.id, bId: b.id, status: "ACCEPTED" },
        });
      }
    }
  }
  // Solicitudes pendientes con gente fuera del clique — mantienen el
  // demo de la bandeja: una entrante (felipe→dancer) y una enviada.
  await prisma.friendship.upsert({
    where: { aId_bId: { aId: felipe.id, bId: dancer.id } },
    update: {},
    create: { aId: felipe.id, bId: dancer.id, status: "PENDING" },
  });
  await prisma.friendship.upsert({
    where: { aId_bId: { aId: dancer.id, bId: sebastian.id } },
    update: {},
    create: { aId: dancer.id, bId: sebastian.id, status: "PENDING" },
  });

  // Entradas ACTIVE del clique en los próximos eventos — alimentan la
  // sección "amigos que van" del detalle y el feed "Tus amigos van a" de
  // /amigos. Distribución fija sobre los 3 próximos publicados.
  const goingPlan: [number, { id: string }[]][] = [
    [0, [camila, josefa, diego, antonia]],
    [1, [camila, daniela]],
    [2, [josefa, diego]],
  ];
  for (const [evIdx, people] of goingPlan) {
    const ev = pubEvents[evIdx];
    if (!ev) continue;
    for (const p of people) {
      await ensure(
        () =>
          prisma.ticket.findFirst({
            where: { eventId: ev.id, ownerId: p.id, status: "ACTIVE" },
          }),
        () =>
          prisma.ticket.create({
            data: {
              eventId: ev.id,
              ownerId: p.id,
              buyerId: p.id,
              listPrice: ev.presalePrice ?? 5000,
              serviceFee: 0,
            },
          }),
      );
    }
  }

  // Roles de baile autodeclarados (PersonStyleRole) — alimentan la sección
  // "Estilos" del perfil del amigo (estilo · leader/follower · nivel).
  const stylesByName = new Map(
    (await prisma.style.findMany()).map((s) => [s.name, s.id]),
  );
  const styleRole = (
    p: { id: string },
    styleName: string,
    role: "LEADER" | "FOLLOWER" | "SWITCH",
    level?: string,
  ) => {
    const styleId = stylesByName.get(styleName);
    if (!styleId) return Promise.resolve(null);
    return prisma.personStyleRole.upsert({
      where: { personId_styleId_role: { personId: p.id, styleId, role } },
      update: { level: level ?? null },
      create: { personId: p.id, styleId, role, level },
    });
  };
  await Promise.all([
    styleRole(dancer, "Salsa cubana (casino)", "LEADER", "intermedio"),
    styleRole(dancer, "Bachata tradicional", "LEADER", "principiante"),
    styleRole(camila, "Bachata sensual", "FOLLOWER", "intermedio"),
    styleRole(camila, "Salsa cubana (casino)", "FOLLOWER", "intermedio"),
    styleRole(josefa, "Salsa cubana (casino)", "FOLLOWER", "avanzado"),
    styleRole(josefa, "Timba", "FOLLOWER", "intermedio"),
    styleRole(diego, "Salsa cubana (casino)", "LEADER", "intermedio"),
    styleRole(diego, "Rueda de casino", "LEADER", "principiante"),
    styleRole(antonia, "Bachata sensual", "FOLLOWER", "avanzado"),
    styleRole(antonia, "Salsa cubana (casino)", "FOLLOWER", "intermedio"),
    styleRole(sebastian, "Salsa on2", "LEADER", "avanzado"),
    styleRole(sebastian, "Mambo on2", "LEADER", "intermedio"),
    styleRole(francisca, "Bachata sensual", "FOLLOWER", "principiante"),
    styleRole(felipe, "Timba", "LEADER", "intermedio"),
    styleRole(felipe, "Salsa cubana (casino)", "SWITCH", "principiante"),
    styleRole(daniela, "Bachata dominicana", "FOLLOWER", "intermedio"),
    styleRole(daniela, "Bachata sensual", "FOLLOWER", "principiante"),
    // Instructores y DJs también bailan social — sus perfiles lo reflejan.
    styleRole(vale, "Salsa cubana (casino)", "SWITCH", "avanzado"),
    styleRole(vale, "Bachata sensual", "FOLLOWER", "avanzado"),
    styleRole(rodrigo, "Salsa cubana (casino)", "LEADER", "avanzado"),
    styleRole(rodrigo, "Rueda de casino", "LEADER", "avanzado"),
    styleRole(jesus, "Timba", "LEADER", "avanzado"),
    styleRole(steban, "Salsa on1", "LEADER", "intermedio"),
    styleRole(matias, "Salsa cubana (casino)", "LEADER", "intermedio"),
    styleRole(fabian, "Bachata sensual", "SWITCH", "intermedio"),
    styleRole(cesar, "Salsa cubana (casino)", "LEADER", "avanzado"),
    styleRole(ardilla, "Bachata tradicional", "LEADER", "intermedio"),
  ]);

  // Handles de Instagram — alimentan la fila "@handle" del perfil del
  // amigo. update directo: el seed es dueño de estas cuentas demo.
  const ig = (p: { id: string }, handle: string) =>
    prisma.person.update({ where: { id: p.id }, data: { instagram: handle } });
  await Promise.all([
    ig(dancer, "bailarin.demo"),
    ig(camila, "camila.dance"),
    ig(josefa, "josefa.martinez"),
    ig(antonia, "anto.reyes"),
    ig(diego, "diegosanhueza"),
    ig(daniela, "dani.fuentes"),
    ig(francisca, "fran.leon"),
    ig(sebastian, "seba.pino"),
    ig(felipe, "felipe.contreras"),
    ig(vale, "valeska.dance"),
    ig(rodrigo, "rodrigo.timba"),
    ig(jesus, "jesus.salsa"),
    ig(steban, "dj.steban"),
    ig(matias, "matias.dj"),
    ig(fabian, "fabian.baila"),
    ig(cesar, "cesar.casino"),
    ig(ardilla, "ardilla.dance"),
  ]);

  // ─── Prácticas — Event type=PRACTICA, hostId=creador bailarín ───
  // Alimentan /practicas: una por cada escenario de card (propia, de
  // otro, sin venue=parque, con aforo). Idempotente por nombre+tipo; las
  // fechas se refrescan en cada corrida como el resto del seed.
  const practice = (
    name: string,
    host: { id: string },
    weekday: number,
    hour: number,
    capacity: number | null,
    opts: {
      venueText?: string;
      venueNotes?: string;
      description?: string;
    } = {},
  ) =>
    ensure(
      () =>
        prisma.event.findFirst({ where: { type: "PRACTICA", name } }),
      () =>
        prisma.event.create({
          data: {
            type: "PRACTICA",
            status: "PUBLISHED",
            name,
            hostId: host.id,
            // Las prácticas nunca se vinculan a un Venue del catálogo —
            // el lugar es texto libre (parque, plaza, sala).
            venueId: null,
            venueText: opts.venueText ?? null,
            venueNotes: opts.venueNotes ?? null,
            description: opts.description ?? null,
            capacity,
            startsAt: nextDay(weekday, hour),
            endsAt: nextDay(weekday, hour + 3),
          },
        }),
      (e) =>
        prisma.event.update({
          where: { id: e.id },
          data: {
            hostId: host.id,
            venueId: null, // limpia filas legadas que sí tenían venueId
            venueText: opts.venueText ?? null,
            venueNotes: opts.venueNotes ?? null,
            description: opts.description ?? null,
            capacity,
            startsAt: nextDay(weekday, hour),
            endsAt: nextDay(weekday, hour + 3),
            status: "PUBLISHED",
          },
        }),
    );

  // La del demo bailarín → badge "Tu práctica". Sábado a la tarde.
  await practice("Práctica de casino — rueda abierta", dancer, 6, 16, 15, {
    venueText: "Parque de los Reyes",
    venueNotes: "Anfiteatro, junto al puente peatonal",
    description:
      "Rueda de casino abierta: rotamos parejas cada tema. Trae agua y parlante chico si tienes.",
  });
  // En parque → venueText nombra el lugar + venueNotes el punto exacto.
  const parkPractice = await practice(
    "Bachata sensual en Parque Balmaceda",
    camila,
    0,
    17,
    10,
    {
      venueText: "Parque Balmaceda",
      venueNotes: "Canchas junto al skatepark",
      description:
        "Practicamos shines y pareja por turnos. Trae agua y zapatillas cómodas.",
    },
  );
  // De un instructor que también baila → badge "Anfitrión: Valeska".
  await practice("Práctica de salsa on1 — línea y tiempo", vale, 2, 19, 20, {
    venueText: "Studio Rame",
    venueNotes: "Sala 1 — Metro Salvador",
    description:
      "Trabajamos línea, tiempo y marcas básicas. Nivel abierto: si sabes el básico, alcanzas. Consultas por interno.",
  });
  // Sin aforo declarado → card sin badge de cupos.
  const timbaPractice = await practice("Timba para todos — práctica libre", jesus, 4, 18, null, {
    venueText: "Plaza Ñuñoa",
    venueNotes: "Junto a la pila central",
    description:
      "Timba libre con parlante propio. Todos los niveles — si vienes a mirar, terminas bailando.",
  });

  // RSVPs "voy" — alimentan el badge "N van" y el estado del PracticeBar.
  // Idempotente por (eventId, personId).
  for (const [evt, person] of [
    [timbaPractice, dancer],
    [timbaPractice, camila],
    [timbaPractice, felipe],
    [parkPractice, josefa],
    [parkPractice, vale],
  ] as const) {
    await prisma.rsvp.upsert({
      where: { eventId_personId: { eventId: evt.id, personId: person.id } },
      create: { eventId: evt.id, personId: person.id },
      update: {},
    });
  }

  // ─── Sesiones de baile (DanceSession + SessionRating) ───
  // Historial sobre la edición pasada de Bachatamanía (evento CLOSED) +
  // invitaciones vivas sobre la próxima — cubre todas las ramas de
  // /bailes: entrantes, salientes, confirmadas, puntuadas y declinadas.
  const styleIdOf = (name: string) => stylesByName.get(name) ?? null;
  const session = async (
    eventId: string,
    inviter: { id: string },
    invitee: { id: string },
    status: "INVITED" | "CONFIRMED" | "DECLINED" | "RATED",
    scannedAt: Date,
    styleName?: string,
    // [rater, global, connection, comfort, musicality]
    ratings: [
      { id: string },
      number,
      number?,
      number?,
      number?,
    ][] = [],
  ) => {
    const s = await ensure(
      () =>
        prisma.danceSession.findFirst({
          where: { eventId, inviterId: inviter.id, inviteeId: invitee.id },
        }),
      () =>
        prisma.danceSession.create({
          data: {
            eventId,
            inviterId: inviter.id,
            inviteeId: invitee.id,
            status,
            scannedAt,
            confirmedAt:
              status === "INVITED" || status === "DECLINED"
                ? null
                : new Date(scannedAt.getTime() + 30_000),
            styleId: styleName ? styleIdOf(styleName) : null,
          },
        }),
      // Re-anclar scannedAt/confirmedAt en cada reseed: los callers pasan
      // anchors relativos al presente (at(), liveAt(), scannedNow) — sin
      // refresh, los bailes del evento LIVE quedan antes de su startsAt
      // cuando el evento se mueve a now−2h en corridas posteriores.
      (row) =>
        prisma.danceSession.update({
          where: { id: row.id },
          data: {
            scannedAt,
            confirmedAt:
              status === "INVITED" || status === "DECLINED"
                ? null
                : new Date(scannedAt.getTime() + 30_000),
          },
        }),
    );
    for (const [rater, global, connection, comfort, musicality] of ratings) {
      await prisma.sessionRating.upsert({
        where: { sessionId_raterId: { sessionId: s.id, raterId: rater.id } },
        update: { global, connection, comfort, musicality },
        create: {
          sessionId: s.id,
          raterId: rater.id,
          global,
          connection,
          comfort,
          musicality,
        },
      });
    }
    return s;
  };

  const night = lastWeek; // ventana de la edición pasada
  const at = (min: number) => new Date(night.getTime() + min * 60_000);

  // Historial del demo bailarín (vista /bailes de dancer@omnidance.dev):
  await session(prevEdition.id, dancer, camila, "RATED", at(60), "Bachata sensual", [
    [dancer, 5, 5, 5, 4],
    [camila, 5],
  ]);
  await session(prevEdition.id, josefa, dancer, "CONFIRMED", at(95), "Salsa cubana (casino)", [
    [josefa, 4],
  ]); // sin rating del dancer → aparece "Puntuar"
  await session(prevEdition.id, dancer, antonia, "CONFIRMED", at(130), "Bachata sensual", [
    [dancer, 4, 4, 5, 4],
    [antonia, 5],
  ]);
  await session(prevEdition.id, diego, dancer, "CONFIRMED", at(160)); // nadie ha puntuado
  await session(prevEdition.id, dancer, daniela, "DECLINED", at(200)); // ella declinó
  // Historial entre otros del clique — visible al entrar con sus cuentas.
  await session(prevEdition.id, diego, camila, "RATED", at(70), "Bachata sensual", [
    [diego, 5],
    [camila, 4],
  ]);
  await session(prevEdition.id, antonia, daniela, "CONFIRMED", at(110), "Salsa cubana (casino)", [
    [antonia, 5],
  ]);
  await session(prevEdition.id, josefa, diego, "CONFIRMED", at(145), "Timba");

  // Invitaciones vivas — solo existen dentro de una noche en curso:
  // nacen del escaneo en pista y expiran ~24h después (spec §4). El seed
  // crea un evento LIVE esta noche para anclarlas; reseed refresca la
  // ventana y el scannedAt para que la demo no envejezca.
  const liveEvent = await ensure(
    () => prisma.event.findFirst({ where: { name: "Social en vivo — demo" } }),
    () =>
      prisma.event.create({
        data: {
          name: "Social en vivo — demo",
          status: "LIVE",
          venueId: orixas.id,
          producerId: carlos.id,
          genres: ALL3,
          startsAt: new Date(Date.now() - 2 * 3_600_000),
          endsAt: new Date(Date.now() + 4 * 3_600_000),
          doorPrice: 7000,
          capacity: 200,
        },
      }),
    (e) =>
      prisma.event.update({
        where: { id: e.id },
        data: {
          status: "LIVE",
          startsAt: new Date(Date.now() - 2 * 3_600_000),
          endsAt: new Date(Date.now() + 4 * 3_600_000),
        },
      }),
  );
  // Invitaciones sobre eventos futuros son un estado imposible (nadie
  // ha escaneado en un evento que no ocurre) — limpia residuos de seeds
  // anteriores antes de crear las del evento LIVE. DanceSession.eventId
  // es escalar → resolver ids de eventos futuros primero.
  const futureEventIds = (
    await prisma.event.findMany({
      where: { startsAt: { gt: new Date() } },
      select: { id: true },
    })
  ).map((e) => e.id);
  await prisma.danceSession.deleteMany({
    where: { status: "INVITED", eventId: { in: futureEventIds } },
  });
  // Escaneadas hace ~30 min en la pista: una entrante (Camila → dancer)
  // y una saliente (dancer → Antonia) → sección "Por confirmar" de /bailes.
  const scannedNow = new Date(Date.now() - 30 * 60_000);
  await session(liveEvent.id, camila, dancer, "INVITED", scannedNow);
  await session(liveEvent.id, dancer, antonia, "INVITED", scannedNow);

  // Bailes ya resueltos de esta misma noche — alimentan el card
  // "Tu último social" de /bailes (el evento LIVE es el más reciente).
  // liveAt(m): minutos desde el inicio del evento (hace 2h); las
  // invitaciones vivas quedan al final (+90 ≈ hace 30 min).
  const liveAt = (min: number) =>
    new Date(liveEvent.startsAt.getTime() + min * 60_000);
  // Dancer: 6 parejas distintas, estilos variados, dos con rating mutuo.
  await session(liveEvent.id, dancer, josefa, "CONFIRMED", liveAt(10), "Salsa cubana (casino)");
  await session(liveEvent.id, felipe, dancer, "RATED", liveAt(30), "Bachata sensual", [
    [dancer, 4, 4, 5, 4],
    [felipe, 5],
  ]);
  await session(liveEvent.id, dancer, sebastian, "CONFIRMED", liveAt(50), "Timba");
  await session(liveEvent.id, vale, dancer, "RATED", liveAt(70), "Salsa cubana (casino)", [
    [dancer, 5, 5, 4, 5],
    [vale, 4],
  ]);
  await session(liveEvent.id, dancer, daniela, "CONFIRMED", liveAt(80), "Bachata sensual");
  await session(liveEvent.id, francisca, dancer, "CONFIRMED", liveAt(105), "Timba");
  // Camila: su propia noche — el card también debe verse rico en su cuenta.
  await session(liveEvent.id, camila, diego, "RATED", liveAt(20), "Timba", [
    [camila, 5, 5, 5, 4],
    [diego, 4],
  ]);
  await session(liveEvent.id, sebastian, camila, "CONFIRMED", liveAt(40), "Salsa cubana (casino)");
  await session(liveEvent.id, camila, josefa, "CONFIRMED", liveAt(60), "Bachata sensual");
  await session(liveEvent.id, daniela, camila, "RATED", liveAt(85), "Bachata sensual", [
    [camila, 4],
    [daniela, 5],
  ]);
  // Ambiente: pares ajenos bailando la misma noche.
  await session(liveEvent.id, antonia, felipe, "CONFIRMED", liveAt(35), "Bachata sensual");
  await session(liveEvent.id, diego, vale, "CONFIRMED", liveAt(75), "Salsa cubana (casino)");

  // ─── Gamificación — actividad real que produce badges/puntos/rachas ───
  // Dos ediciones más de Bachatamanía (hace 2 y 3 semanas) con sesiones
  // resueltas del clique. Las rachas semanales, los puntos de temporada y
  // los badges por conducta se derivan de esta actividad con las mismas
  // reglas del dominio — no se fabrican números de exhibición.
  const weeksAgo = (n: number) => new Date(Date.now() - n * 7 * 86_400_000);
  const pastEdition = (name: string, start: Date) =>
    ensure(
      () => prisma.event.findFirst({ where: { name } }),
      () =>
        prisma.event.create({
          data: {
            seriesId: bachatamania.seriesId,
            venueId: orixas.id,
            producerId: carlos.id,
            name,
            status: "CLOSED",
            startsAt: start,
            endsAt: new Date(start.getTime() + 6 * 3_600_000),
            presalePrice: 5000,
            doorPrice: 6000,
            capacity: 300,
          },
        }),
    );
  const edition2 = await pastEdition(
    "Bachatamanía — hace 2 semanas",
    weeksAgo(2),
  );
  const edition3 = await pastEdition(
    "Bachatamanía — hace 3 semanas",
    weeksAgo(3),
  );
  const atEdition = (ev: { startsAt: Date }, min: number) =>
    new Date(ev.startsAt.getTime() + min * 60_000);

  // Check-ins tempranos (21:30 — antes del cutoff madrugador) en las
  // ediciones pasadas: alimentan puntos early_checkin y el badge
  // madrugador. La hora es fija — no depende de cuándo corre el seed.
  const earlyIn = (start: Date) => {
    const d = new Date(start);
    d.setHours(21, 30, 0, 0);
    return d;
  };
  for (const [ev, people] of [
    [
      edition2,
      [
        dancer,
        camila,
        josefa,
        diego,
        antonia,
        daniela,
        francisca,
        sebastian,
        felipe,
        vale,
      ],
    ],
    [edition3, [dancer, camila, josefa, diego, antonia, daniela]],
  ] as const) {
    for (const p of people) {
      await ensure(
        () =>
          prisma.checkin.findFirst({
            where: { eventId: ev.id, personId: p.id },
          }),
        () =>
          prisma.checkin.create({
            data: {
              eventId: ev.id,
              personId: p.id,
              staffId: staff.id,
              method: "SCAN",
              inAt: earlyIn(ev.startsAt),
            },
          }),
      );
    }
  }

  // La gran noche del demo bailarín (edición -2): 8 parejas distintas →
  // mariposa_social; con las de las otras ediciones suma 13 confirmadas
  // → bailarin_constante. El resto del clique queda con totales variados.
  await session(edition2.id, dancer, camila, "RATED", atEdition(edition2, 60), "Bachata sensual", [
    [dancer, 5],
    [camila, 5],
  ]);
  await session(edition2.id, josefa, dancer, "CONFIRMED", atEdition(edition2, 90), "Salsa cubana (casino)", [
    [josefa, 5],
  ]);
  await session(edition2.id, dancer, diego, "CONFIRMED", atEdition(edition2, 120), "Timba");
  await session(edition2.id, daniela, dancer, "CONFIRMED", atEdition(edition2, 150), "Bachata sensual");
  await session(edition2.id, dancer, francisca, "CONFIRMED", atEdition(edition2, 180), "Salsa cubana (casino)");
  await session(edition2.id, sebastian, dancer, "CONFIRMED", atEdition(edition2, 210), "Bachata sensual");
  await session(edition2.id, dancer, felipe, "RATED", atEdition(edition2, 240), "Timba", [
    [felipe, 4],
  ]);
  await session(edition2.id, vale, dancer, "RATED", atEdition(edition2, 270), "Salsa cubana (casino)", [
    [vale, 5],
    [dancer, 5],
  ]);
  await session(edition2.id, diego, antonia, "CONFIRMED", atEdition(edition2, 75), "Bachata sensual");
  await session(edition2.id, camila, felipe, "CONFIRMED", atEdition(edition2, 195), "Salsa cubana (casino)");

  // Edición -3 — sostiene la tercera semana de las rachas del clique.
  await session(edition3.id, dancer, antonia, "CONFIRMED", atEdition(edition3, 70), "Bachata sensual", [
    [antonia, 5],
  ]);
  await session(edition3.id, josefa, diego, "RATED", atEdition(edition3, 100), "Timba", [
    [josefa, 4],
    [diego, 4],
  ]);
  await session(edition3.id, camila, daniela, "CONFIRMED", atEdition(edition3, 130), "Salsa cubana (casino)");
  await session(edition3.id, sebastian, josefa, "CONFIRMED", atEdition(edition3, 160), "Bachata sensual");

  // Temporada activa del año — los puntos del ledger se posicionan por
  // temporada (spec §7: no gastables, resetean por Season).
  const seasonYear = now.getUTCFullYear();
  const season = await ensure(
    () =>
      prisma.season.findFirst({ where: { name: `Temporada ${seasonYear}` } }),
    () =>
      prisma.season.create({
        data: {
          name: `Temporada ${seasonYear}`,
          startsAt: new Date(Date.UTC(seasonYear, 0, 1)),
          endsAt: new Date(Date.UTC(seasonYear, 11, 31, 23, 59, 59)),
        },
      }),
  );

  // Puntos de temporada — mismo accrual del dominio: session_confirmed a
  // ambos bailarines, rating_closed al evaluador, early_checkin al que
  // entró temprano. Idempotente por (persona, reason, refType, refId).
  const accrue = (
    personId: string,
    reason: PointReason,
    refType: string,
    refId: string,
  ) =>
    prisma.pointLedger.upsert({
      where: {
        personId_reason_refType_refId: { personId, reason, refType, refId },
      },
      update: {},
      create: {
        personId,
        seasonId: season.id,
        points: POINT_VALUES[reason],
        reason,
        refType,
        refId,
      },
    });

  const pastEventIds = [prevEdition.id, edition2.id, edition3.id];
  const doneSessions = await prisma.danceSession.findMany({
    where: {
      eventId: { in: pastEventIds },
      status: { in: ["CONFIRMED", "RATED"] },
    },
    include: { ratings: true },
  });
  for (const s of doneSessions) {
    await accrue(s.inviterId, "session_confirmed", "session", s.id);
    await accrue(s.inviteeId, "session_confirmed", "session", s.id);
    for (const r of s.ratings) {
      await accrue(r.raterId, "rating_closed", "session", s.id);
    }
  }
  const pastCheckins = await prisma.checkin.findMany({
    where: { eventId: { in: pastEventIds }, voidedAt: null },
  });
  for (const c of pastCheckins) {
    if (isEarlyCheckinAt(c.inAt)) {
      await accrue(c.personId, "early_checkin", "checkin", c.id);
    }
  }

  // ─── Data de consolas — productor / DJ / venue ───

  // Salidas de pista (outAt) en los check-ins pasados: alimentan la
  // permanencia media del dashboard del venue. Determinista por índice.
  for (const [i, c] of pastCheckins.entries()) {
    if (c.outAt) continue;
    await prisma.checkin.update({
      where: { id: c.id },
      data: { outAt: new Date(c.inAt.getTime() + (150 + (i % 4) * 30) * 60_000) },
    });
  }

  // DJ asignado a las ediciones pasadas de Bachatamanía (matias es su
  // residente) — sin EventDj el gig no aparece en /dj/gigs ni puede ver
  // su evaluación de música.
  for (const ev of [prevEdition, edition2, edition3]) {
    await prisma.eventDj.upsert({
      where: { eventId_personId: { eventId: ev.id, personId: matias.id } },
      update: {},
      create: { eventId: ev.id, personId: matias.id },
    });
  }

  // Evaluaciones post-evento (spec §5): agregados por actor — música →
  // DJ, ocupación/organización → productor, piso/temperatura/sonido →
  // venue. ≥3 evaluaciones por edición para que los promedios superen
  // la k-anonymity del resumen. Sin texto libre, rater privado.
  type EventDims = {
    music?: number;
    occupation?: number;
    organization?: number;
    floorComfort?: number;
    temperature?: number;
    lightingSound?: number;
  };
  const rateEvent = (eventId: string, raterId: string, dims: EventDims) =>
    prisma.eventRating.upsert({
      where: { eventId_raterId: { eventId, raterId } },
      update: {},
      create: { eventId, raterId, ...dims },
    });
  const eventRaters = [dancer, camila, josefa, diego, antonia, daniela];
  const prevDims: EventDims[] = [
    { music: 5, occupation: 4, organization: 5, floorComfort: 4, temperature: 3, lightingSound: 4 },
    { music: 4, occupation: 5, organization: 4, floorComfort: 5, temperature: 4, lightingSound: 5 },
    { music: 5, occupation: 4, organization: 5, floorComfort: 4, temperature: 4, lightingSound: 4 },
    { music: 4, occupation: 4, organization: 4, floorComfort: 4, temperature: 2, lightingSound: 4 },
    { music: 5, occupation: 5, organization: 5, floorComfort: 5, temperature: 3, lightingSound: 5 },
    { music: 4, occupation: 4, organization: 4, floorComfort: 3, temperature: 3, lightingSound: 4 },
  ];
  const ed2Dims: EventDims[] = [
    { music: 5, occupation: 5, organization: 5, floorComfort: 5, temperature: 4, lightingSound: 5 },
    { music: 5, occupation: 4, organization: 5, floorComfort: 4, temperature: 3, lightingSound: 4 },
    { music: 4, occupation: 5, organization: 4, floorComfort: 5, temperature: 4, lightingSound: 5 },
    { music: 5, occupation: 4, organization: 4, floorComfort: 4, temperature: 3, lightingSound: 4 },
  ];
  for (const [i, p] of eventRaters.entries()) {
    await rateEvent(prevEdition.id, p.id, prevDims[i]);
    if (i < ed2Dims.length) await rateEvent(edition2.id, p.id, ed2Dims[i]);
  }
  // Edición -3 queda bajo el umbral (2 evaluaciones) — demuestra el
  // estado "insuficientes evaluaciones" de la consola del DJ.
  await rateEvent(edition3.id, dancer.id, {
    music: 4,
    organization: 4,
  });
  await rateEvent(edition3.id, camila.id, { music: 5, floorComfort: 4 });

  // Operación en curso del evento LIVE: check-ins de pista (SCAN) y un
  // par de ventas manuales de puerta (MANUAL, sin Payment) + una venta
  // de puerta por la app — alimentan el tablero /events/:id/live.
  const liveAttendees = [camila, josefa, antonia, daniela, felipe, vale];
  for (const [i, p] of liveAttendees.entries()) {
    await ensure(
      () =>
        prisma.checkin.findFirst({
          where: { eventId: liveEvent.id, personId: p.id },
        }),
      () =>
        prisma.checkin.create({
          data: {
            eventId: liveEvent.id,
            personId: p.id,
            staffId: staff.id,
            method: "SCAN",
            inAt: new Date(Date.now() - (100 - i * 12) * 60_000),
          },
        }),
    );
  }
  for (const p of [sebastian, francisca]) {
    await ensure(
      () =>
        prisma.checkin.findFirst({
          where: { eventId: liveEvent.id, personId: p.id },
        }),
      () =>
        prisma.checkin.create({
          data: {
            eventId: liveEvent.id,
            personId: p.id,
            staffId: staff.id,
            method: "MANUAL",
            note: "venta en puerta",
            inAt: new Date(Date.now() - 45 * 60_000),
          },
        }),
    );
  }
  // Venta de puerta por la app ya pagada (canal DOOR del checkout).
  await prisma.payment.upsert({
    where: { refId: `seed-door-${liveEvent.id.slice(-6)}` },
    update: {},
    create: {
      orderType: "TICKET",
      refId: `seed-door-${liveEvent.id.slice(-6)}`,
      personId: dancer.id,
      eventId: liveEvent.id,
      amount: 7700,
      fee: 230,
      net: 7470,
      status: "PAID",
      channel: "DOOR",
      unitListPrice: 7000,
      unitServiceFee: 700,
      createdAt: new Date(Date.now() - 90 * 60_000),
    },
  });
  await ensure(
    () =>
      prisma.ticket.findFirst({
        where: {
          eventId: liveEvent.id,
          ownerId: dancer.id,
          status: "ACTIVE",
        },
      }),
    () =>
      prisma.ticket.create({
        data: {
          eventId: liveEvent.id,
          ownerId: dancer.id,
          buyerId: dancer.id,
          listPrice: 7000,
          serviceFee: 700,
        },
      }),
  );
  // El DJ del evento en vivo — su gig aparece en /dj/gigs.
  await prisma.eventDj.upsert({
    where: { eventId_personId: { eventId: liveEvent.id, personId: steban.id } },
    update: {},
    create: { eventId: liveEvent.id, personId: steban.id },
  });

  // Rachas semanales — el KPI del home lee Streak (WEEKLY_OUT); se
  // computa con buildStreakWeeks/computeStreak sobre la actividad real
  // (sesiones confirmadas + check-ins de las ediciones pasadas).
  const activityByPerson = new Map<string, Date[]>();
  const track = (personId: string, d: Date) => {
    const arr = activityByPerson.get(personId) ?? [];
    arr.push(d);
    activityByPerson.set(personId, arr);
  };
  for (const s of doneSessions) {
    const activityAt = s.confirmedAt ?? s.scannedAt;
    track(s.inviterId, activityAt);
    track(s.inviteeId, activityAt);
  }
  for (const c of pastCheckins) track(c.personId, c.inAt);
  for (const [personId, dates] of activityByPerson) {
    const { currentWeeks } = computeStreak(buildStreakWeeks(dates, now));
    const lastAt = new Date(Math.max(...dates.map((d) => d.getTime())));
    await ensure(
      () =>
        prisma.streak.findFirst({
          where: { personId, type: "WEEKLY_OUT", targetId: null },
        }),
      () =>
        prisma.streak.create({
          data: { personId, type: "WEEKLY_OUT", count: currentWeeks, lastAt },
        }),
      (row) =>
        prisma.streak.update({
          where: { id: row.id },
          data: { count: currentWeeks, lastAt },
        }),
    );
  }

  // Badges ganados por conducta — se otorgan con las mismas reglas del
  // dominio (BadgeAwarder + buildBadgeStats) sobre la actividad real, así
  // /me/badges no depende del lazy-award para mostrar el demo.
  const badgeRows = await prisma.badge.findMany();
  const badgeIdByKey = new Map(badgeRows.map((b) => [b.key, b.id]));
  const badgeKeyById = new Map(badgeRows.map((b) => [b.id, b.key]));
  const award = (
    personId: string,
    key: string,
    featured = false,
    expiresAt: Date | null = null,
  ) => {
    const badgeId = badgeIdByKey.get(key);
    if (!badgeId) return Promise.resolve(null);
    return prisma.personBadge.upsert({
      where: { personId_badgeId: { personId, badgeId } },
      update: featured || expiresAt ? { featured, expiresAt } : {},
      create: { personId, badgeId, featured, expiresAt },
    });
  };
  const awarder = new BadgeAwarder();
  const gamified = [
    dancer,
    camila,
    josefa,
    diego,
    antonia,
    daniela,
    francisca,
    sebastian,
    felipe,
    vale,
  ];
  for (const p of gamified) {
    const mySessions = await prisma.danceSession.findMany({
      where: {
        status: { in: ["CONFIRMED", "RATED"] },
        OR: [{ inviterId: p.id }, { inviteeId: p.id }],
      },
      select: { eventId: true, inviterId: true, inviteeId: true },
    });
    const myCheckins = await prisma.checkin.findMany({
      where: { personId: p.id, voidedAt: null },
      select: { inAt: true },
    });
    const owned = (
      await prisma.personBadge.findMany({
        where: { personId: p.id },
        select: { badgeId: true },
      })
    )
      .map((b) => badgeKeyById.get(b.badgeId))
      .filter((k): k is string => k != null);
    for (const key of awarder.evaluate(
      buildBadgeStats(mySessions, myCheckins, p.id),
      owned,
    )) {
      await award(p.id, key);
    }
  }
  // Badges exhibidos al escanear el QR (spec §7: el status vive en el
  // ritual) — bailarin_constante destacado del demo y corona Prime Time
  // vigente de Camila (temporal: vence en CROWN_TTL_DAYS).
  await award(dancer.id, "bailarin_constante", true);
  await award(
    camila.id,
    "prime_time_crown",
    true,
    new Date(Date.now() + CROWN_TTL_DAYS * 86_400_000),
  );

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
  // Mesa confirmada con número asignado — el venue la ve en su
  // dashboard ("qué mesas esperar cada noche").
  await ensure(
    () =>
      prisma.tableReservation.findFirst({
        where: { eventId: bachatamania.id, personId: josefa.id },
      }),
    () =>
      prisma.tableReservation.create({
        data: {
          eventId: bachatamania.id,
          personId: josefa.id,
          partySize: 4,
          tableNo: "M3",
          status: "CONFIRMED",
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

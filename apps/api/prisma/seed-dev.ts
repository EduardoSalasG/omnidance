// Dataset demo de la escena SBK Santiago (spec: omni-dance.md §2).
// Idempotente: personas/venues/series/eventos se resuelven por clave natural
// y las fechas se refrescan en cada corrida para que la demo no envejezca.
import { randomBytes, scryptSync } from "node:crypto";
import { Gender, Genre, Prisma, PrismaClient } from "@prisma/client";
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

// Password dev para todas las cuentas @omnidance.dev - permite probar el
// login por contraseña además del magic link. Nunca en seed-prod-baseline.
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

// Marcas de artefactos E2E/fixtures de Playwright que ensucian la DB dev
// (prefijos de specs + palabras clave + duplicados legados con em-dash).
// Se usan en dos puntos: para excluir residuos de las listas curadas
// (pubEvents) y para el cleanup del final. Ninguna entidad curada calza.
const TEST_MARKS = ["test", "prueba", "e2e", "payout"];
const TEST_EVENT_ROOTS = [
  "Capped", "Con Mesas", "Draft Checkout", "Evento Ajeno",
  "Evento de Serie", "Fee Cero", "Fee Override", "GE ",
  "Gala Academia", "Otro Evento", "Sin Preventa", "Social Checkout",
  "Social Sessions", "Social Venue", "Social del Venue",
];
const TEST_SERIES_ROOTS = [
  "Serie Gap", "Serie Inactiva", "Serie Ajena", "Serie Checkout",
];
const TEST_VENUE_ROOTS = [
  "Venue Gap", "GE Venue", "Venue Checkout", "Venue Sessions",
];
const markConds = (field = "name") =>
  TEST_MARKS.map((w) => ({
    [field]: { contains: w, mode: "insensitive" as const },
  }));
// Nombre calza alguna marca E2E (para filtrar listas ya en memoria).
const isTestName = (name: string) =>
  name.includes("—") ||
  TEST_MARKS.some((w) => name.toLowerCase().includes(w)) ||
  TEST_EVENT_ROOTS.some((r) => name.startsWith(r));

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
  const t0 = Date.now();
  // Progreso por sección: contra Neon el seed toma varios minutos y sin
  // logs intermedios parecía colgado (el seed de prod se cortó a la
  // mitad por timeout sin que se notara en qué tramo iba).
  const step = (label: string) =>
    console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${label}`);

  await seedCommon(prisma);

  // ─── Admin de plataforma (login real por magic link en dev) ───
  const admin = await ensurePerson(
    prisma,
    "admin@omnidance.dev",
    "Admin Omnidance",
    [{ role: "ADMIN" }],
  );

  // ─── Personas multi-rol - emails dev permiten login por magic link ───
  step("personas…");
  const person = (
    slug: string,
    name: string,
    roles: { role: string }[],
    gender?: Gender,
  ) => ensurePerson(prisma, `${slug}@${DEV_DOMAIN}`, name, roles, gender);

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
  // DJ Krrera (Andrés Carrera) - produce su propia noche semanal en
  // Tierra: "Bachata con Salsa" (ig @bachataclub), los miércoles.
  const krrera = await person("krrera", "DJ Krrera", [
    { role: "DJ" },
    { role: "PRODUCER" },
  ]);
  // DJ Criss (@djcrissbsoul) - tercer DJ de Trilogía en Orixas.
  const criss = await person("criss", "DJ Criss", [{ role: "DJ" }]);
  const muvetOwner = await person("muvet", "Dueño MuéveteOnTour", [
    { role: "ACADEMY_OWNER" },
    { role: "PRODUCER" },
    // También dicta clases - la consola de instructor se refina con su
    // cuenta (su serie propia se asigna más abajo).
    { role: "INSTRUCTOR" },
  ]);
  // Cuenta consumidora - flujo completo: RSVP, compra, QR, sesiones, ratings.
  const dancer = await person("dancer", "Bailarín Demo", [{ role: "DANCER" }], Gender.M);
  // Staff de puerta aprobado - consola /staff operable sin pasar por /admin.
  const staff = await person("staff", "Staff Puerta", [{ role: "STAFF" }]);
  // Instructor de academia - consola /academia/clases con sus clases asignadas.
  const vale = await person("profe", "Valeska Torres", [
    { role: "INSTRUCTOR" },
    { role: "DANCER" },
  ], Gender.F);
  const rodrigo = await person("rodrigo", "Rodrigo Fuentes", [
    { role: "INSTRUCTOR" },
    { role: "DANCER" },
  ]);
  // Segundo dueño de academia - Valeska también enseña ahí (lista cross-academia).
  const tumbaoOwner = await person("tumbao", "Dueño Academia Tumbao", [
    { role: "ACADEMY_OWNER" },
  ]);
  // Dueño real de Mambo Madness - cuenta con email real (magic link),
  // no @omnidance.dev. Enseña él mismo: instructor de la casa.
  const gabriel = await ensurePerson(
    prisma,
    "gazner3203@gmail.com",
    "Gabriel Arias",
    [
      { role: "ACADEMY_OWNER" },
      { role: "INSTRUCTOR" },
      { role: "DANCER" },
    ],
    Gender.M,
  );
  // Mónica y María - cuentas reales de prueba (emails .cl). Se reclaman
  // al registrarse: el magic link hace upsertByEmail sobre esta misma
  // Person, así toda la data pre-sembrada queda adjunta a su cuenta.
  const monica = await ensurePerson(
    prisma,
    "monica@omnidance.cl",
    "Mónica Soto",
    [{ role: "DANCER" }],
    Gender.F,
  );
  const maria = await ensurePerson(
    prisma,
    "maria@omnidance.cl",
    "María José Herrera",
    [{ role: "DANCER" }, { role: "INSTRUCTOR" }],
    Gender.F,
  );
  // Eduardo - cuenta real del piloto (email .cl, magic link): bailarín e
  // instructor. Co-profe de los sábados en Mambo Madness junto a María
  // (spec multi-instructor: el plantel vive en los joins).
  const eduardo = await ensurePerson(
    prisma,
    "salas.eduardo.cl@gmail.com",
    "Eduardo Salas",
    [{ role: "DANCER" }, { role: "INSTRUCTOR" }],
    Gender.M,
  );
  if (!eduardo.phone) {
    await prisma.person.update({
      where: { id: eduardo.id },
      data: { phone: "+56982439041" },
    });
  }
  // Dueños de "Adrian y Leo" - academia de solo mambo (abajo).
  const adrian = await person("adrian", "Adrián Paredes", [
    { role: "ACADEMY_OWNER" },
    { role: "INSTRUCTOR" },
  ]);
  const leo = await person("leo", "Leo Campos", [
    { role: "INSTRUCTOR" },
    { role: "DANCER" },
  ]);
  // Consola /venue - queda como ownerId de Orixas.
  const venueMgr = await person("venue", "Manager Orixas", [
    { role: "VENUE_MANAGER" },
  ]);
  // Consola /soporte - buscador de usuarios y fichas read-only.
  await person("soporte", "Soporte Omnidance", [{ role: "SUPPORT" }]);

  // Alumnos de la academia - enrollments, reservas, asistencias, historial.
  const alumno = (slug: string, name: string, gender?: Gender) =>
    person(slug, name, [{ role: "DANCER" }], gender);
  const camila = await alumno("camila", "Camila Rojas", Gender.F);
  const josefa = await alumno("josefa", "Josefa Martínez", Gender.F);
  const diego = await alumno("diego", "Diego Sanhueza", Gender.M);
  const francisca = await alumno("francisca", "Francisca León", Gender.OTHER);
  const sebastian = await alumno("sebastian", "Sebastián Pino", Gender.M);
  const antonia = await alumno("antonia", "Antonia Reyes", Gender.F);
  // Felipe sin género declarado - alimenta el bucket "unknown" de la analítica.
  const felipe = await alumno("felipe", "Felipe Contreras");
  const daniela = await alumno("daniela", "Daniela Fuentes", Gender.F);
  // Nómina ampliada de Muévete - el home del owner necesita masa crítica:
  // vencimientos repartidos, cobros por revisar y asistencias del mes.
  const isidora = await alumno("isidora", "Isidora Campos", Gender.F);
  const benjamin = await alumno("benjamin", "Benjamín Soto", Gender.M);
  const cata = await alumno("cata", "Catalina Paredes", Gender.F);
  const tomas = await alumno("tomas", "Tomás Riquelme", Gender.M);
  const javiera = await alumno("javiera", "Javiera Muñoz", Gender.F);
  const matiasb = await alumno("matiasb", "Matías Bravo", Gender.M);
  const fernanda = await alumno("fernanda", "Fernanda Araya", Gender.F);
  const vicente = await alumno("vicente", "Vicente Lagos", Gender.M);

  // Cumpleaños demo relativos a hoy - la lista "Cumpleaños próximos"
  // del dashboard de academia siempre tiene data (spec
  // academies/owner-insights). Diego a 45d queda fuera de la ventana.
  const birthdayIn = (personId: string, days: number, year: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    d.setUTCFullYear(year);
    return prisma.person.update({
      where: { id: personId },
      data: { birthDate: d },
    });
  };
  await birthdayIn(camila.id, 6, 1995);
  await birthdayIn(antonia.id, 14, 1998);
  await birthdayIn(daniela.id, 27, 1992);
  await birthdayIn(diego.id, 45, 1990);
  await birthdayIn(isidora.id, 3, 1997);
  await birthdayIn(vicente.id, 19, 1994);

  // ─── Venues ───
  step("venues…");
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
  // Rebrand: "Tierra Dura" → "Tierra" - renombra la fila (mismo id,
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

  // Consola /venue - el manager ve KPIs y arriendos de Orixas.
  await prisma.venue.update({
    where: { id: orixas.id },
    data: { ownerId: venueMgr.id },
  });

  // ─── MuéveteOnTour - academia Y productor ───
  step("academia muvet…");
  const muvetData = {
    name: "MuéveteOnTour",
    ownerId: muvetOwner.id,
    privateLessonPrice: 25000,
    description:
      "Escuela de salsa cubana y bachata - organiza además las sociales Muévete. Formación por niveles con enfoque en pista.",
    address: "Av. Providencia 1650, Providencia",
    lat: -33.4264,
    lng: -70.6155,
    instagram: "mueveteontour",
    whatsapp: "56912345678",
    website: "https://mueveteontour.cl",
  };
  const muvet = await ensure(
    () => prisma.academy.findFirst({ where: { name: "MuéveteOnTour" } }),
    () => prisma.academy.create({ data: muvetData }),
    (a) =>
      prisma.academy.update({
        where: { id: a.id },
        data: {
          ownerId: muvetOwner.id,
          description: a.description ?? muvetData.description,
          address: a.address ?? muvetData.address,
          lat: a.lat ?? muvetData.lat,
          lng: a.lng ?? muvetData.lng,
          instagram: a.instagram ?? muvetData.instagram,
          whatsapp: a.whatsapp ?? muvetData.whatsapp,
          website: a.website ?? muvetData.website,
          // Clase particular vendible desde el perfil (producto, precio
          // único; null = la academia no la vende).
          privateLessonPrice: a.privateLessonPrice ?? 25000,
        },
      }),
  );
  // Quórum default de la academia - slots/clases sin override heredan 15.
  await prisma.academy.update({
    where: { id: muvet.id },
    data: { defaultQuorum: 15 },
  });

  // Segunda academia - Valeska enseña en ambas (/classes/teaching es
  // cross-academia) y el owner tiene gate multi-academia propio.
  const tumbaoData = {
    name: "Academia Tumbao",
    ownerId: tumbaoOwner.id,
    defaultQuorum: 12,
    privateLessonPrice: 20000,
    description:
      "Academia de bachata y ritmos latinos - grupos reducidos, técnica y musicalidad desde el primer día.",
    address: "Av. Irarrázaval 2828, Ñuñoa",
    lat: -33.4546,
    lng: -70.5980,
    instagram: "academiatumbao",
    whatsapp: "56987654321",
    website: "https://tumbao.dance",
  };
  const tumbao = await ensure(
    () => prisma.academy.findFirst({ where: { name: "Academia Tumbao" } }),
    () => prisma.academy.create({ data: tumbaoData }),
    (a) =>
      prisma.academy.update({
        where: { id: a.id },
        data: {
          ownerId: tumbaoOwner.id,
          defaultQuorum: 12,
          description: a.description ?? tumbaoData.description,
          address: a.address ?? tumbaoData.address,
          lat: a.lat ?? tumbaoData.lat,
          lng: a.lng ?? tumbaoData.lng,
          instagram: a.instagram ?? tumbaoData.instagram,
          whatsapp: a.whatsapp ?? tumbaoData.whatsapp,
          website: a.website ?? tumbaoData.website,
          privateLessonPrice: a.privateLessonPrice ?? 20000,
        },
      }),
  );

  // Equipo de instructores - AcademyInstructor habilita requireManage.
  for (const [academyId, personId, commissionPct] of [
    [muvet.id, vale.id, 25],
    [muvet.id, rodrigo.id, 30],
    // El dueño también dicta (la serie "Cubano" de abajo es suya) - su
    // cuenta sirve para refinar la consola del instructor.
    [muvet.id, muvetOwner.id, null],
    [tumbao.id, vale.id, null],
  ] as const) {
    await prisma.academyInstructor.upsert({
      where: { academyId_personId: { academyId, personId } },
      update: { commissionPct },
      create: { academyId, personId, commissionPct },
    });
  }

  // Medios de pago BYO (academy-checkout-manual-pay): el alumno los
  // elige dentro del checkout de membresía - el owner los administra
  // en /academia/cobros y valida el comprobante ahí mismo.
  for (const m of [
    {
      academyId: muvet.id,
      type: "TRANSFER",
      label: "Transferencia",
      details: {
        bank: "BancoEstado",
        accountType: "Cuenta Corriente",
        accountNumber: "70123456",
        holder: "Muévete SpA",
        rut: "77.123.456-7",
        email: "pagos@muvet.cl",
      },
      order: 0,
    },
    {
      academyId: muvet.id,
      type: "PAYMENT_LINK",
      label: "MercadoPago",
      details: { url: "https://mpago.la/muvet-demo" },
      order: 1,
    },
    {
      academyId: tumbao.id,
      type: "TRANSFER",
      label: "Transferencia",
      details: {
        bank: "Banco de Chile",
        accountType: "Cuenta Vista",
        accountNumber: "0011223344",
        holder: "Tumbao Escuela",
        rut: "76.555.444-3",
        email: "pagos@tumbao.cl",
      },
      order: 0,
    },
    {
      academyId: tumbao.id,
      type: "CASH",
      label: "Efectivo en clase",
      details: { instructions: "Paga al llegar, al instructor a cargo." },
      order: 1,
    },
  ]) {
    const existing = await prisma.academyPaymentMethod.findFirst({
      where: { academyId: m.academyId, label: m.label },
    });
    if (!existing) {
      await prisma.academyPaymentMethod.create({ data: m });
    }
  }

  // ─── Planes de membresía ───
  step("planes…");
  // El nombre del plan es categoría propia de la academia (Básico, Plata,
  // Oro, Premium, VIP…) - el periodo y la cuota semanal ya los muestran
  // el tag de tipo y la metadata del card, no van en el nombre.
  const plan = async (
    academyId: string,
    name: string,
    type:
      | "MONTHLY"
      | "QUARTERLY"
      | "SEMIANNUAL"
      | "SINGLE"
      | "CLASS_PACK"
      | "PERIOD"
      | "TRIAL",
    price: number,
    extra: {
      classCount?: number;
      // Clases/semana que consume la cuota del plan (planes por tiempo);
      // ausente = ilimitado. Se fuerza null explícito al re-sembrar para
      // que renombrar/achicar un plan no deje cuota obsoleta.
      weeklyClasses?: number;
      periodDays?: number;
      // Bullets de venta - un ítem por línea del <ul> de la ficha.
      description?: string[];
    } = {},
    // Renombres del seed: el plan se busca por el nombre nuevo o por
    // estos nombres antiguos - si se encuentra por alias se renombra
    // in-place en vez de crear un duplicado.
    aliases: string[] = [],
  ) => {
    const row = await ensure(
      () =>
        prisma.membershipPlan
          .findFirst({ where: { academyId, name } })
          .then((p) =>
            p ??
            (aliases.length
              ? prisma.membershipPlan.findFirst({
                  where: { academyId, name: { in: aliases } },
                })
              : null),
          ),
      () =>
        prisma.membershipPlan.create({
          data: {
            academyId,
            name,
            type,
            price,
            ...extra,
            weeklyClasses: extra.weeklyClasses ?? null,
          },
        }),
      (p) =>
        prisma.membershipPlan.update({
          where: { id: p.id },
          data: {
            name,
            type,
            price,
            ...extra,
            weeklyClasses: extra.weeklyClasses ?? null,
          },
        }),
    );
    // Si además del recién asegurado quedó un resto con el nombre
    // antiguo, se desactiva - puede tener enrollments, no se borra.
    if (aliases.length) {
      await prisma.membershipPlan.updateMany({
        where: { academyId, name: { in: aliases }, id: { not: row.id } },
        data: { active: false },
      });
    }
    return row;
  };

  const muvetMensual = await plan(
    muvet.id,
    "Oro",
    "MONTHLY",
    45000,
    {
      description: [
        "Todas las clases, sin límite",
        "Válido hasta fin del mes calendario",
        "Se renueva antes de que venza",
      ],
    },
    ["Mensual ilimitado"],
  );
  await plan(
    muvet.id,
    "Platino",
    "QUARTERLY",
    120000,
    {
      description: [
        "Todas las clases, sin límite",
        "Válido hasta fin del 3er mes calendario",
        "Ahorras $15.000 vs. el mensual",
      ],
    },
    ["Trimestral ilimitado"],
  );
  await plan(
    muvet.id,
    "Diamante",
    "SEMIANNUAL",
    210000,
    {
      description: [
        "Todas las clases, sin límite",
        "Válido hasta fin del 6º mes calendario",
        "El mejor valor por mes",
      ],
    },
    ["Semestral ilimitado"],
  );
  await plan(
    muvet.id,
    "Clase suelta",
    "SINGLE",
    12000,
    {
      description: ["Una clase del día", "Ideal para probar antes del plan"],
    },
    ["Clase única"],
  );
  const muvetPack = await plan(
    muvet.id,
    "Pack flexible",
    "CLASS_PACK",
    38000,
    {
      classCount: 8,
      description: [
        "A tu ritmo, sin fecha de vencimiento",
        "Cualquier serie de la academia",
      ],
    },
    ["Pack 8 clases"],
  );
  const muvetTrial = await plan(muvet.id, "Clase de prueba", "TRIAL", 0);
  // Plan con cuota semanal - la ficha muestra "hasta N clases/semana" y
  // las reservas del alumno quedan limitadas por plan.
  const muvetBasico = await plan(muvet.id, "Básico", "MONTHLY", 30000, {
    weeklyClasses: 2,
    description: [
      "Hasta 2 clases por semana",
      "Válido hasta fin del mes calendario",
    ],
  });
  const tumbaoMensual = await plan(
    tumbao.id,
    "Normal",
    "MONTHLY",
    40000,
    {
      description: [
        "Todas las clases, sin límite",
        "Válido hasta fin del mes calendario",
      ],
    },
    ["Mensual Tumbao"],
  );
  await plan(
    tumbao.id,
    "Clase suelta",
    "SINGLE",
    10000,
    { description: ["Una clase del día"] },
    ["Clase única"],
  );
  await plan(tumbao.id, "Clase de prueba", "TRIAL", 0);

  // ─── Enrollments - mezcla de planes y estados para el listado ───
  step("enrollments…");
  const enroll = (
    academyId: string,
    personId: string,
    planId: string,
    status: "ACTIVE" | "PAUSED" | "TRIAL" | "FROZEN" | "ONLINE",
    startedDaysAgo = 45,
    // "Pagado hasta" en ±días desde hoy; null = sin fecha de término
    // (packs de clases y trials no tienen vencimiento natural).
    endsInDays: number | null = null,
  ) => {
    const endsAt =
      endsInDays === null
        ? null
        : new Date(Date.now() + endsInDays * 86_400_000);
    return ensure(
      () => prisma.enrollment.findFirst({ where: { academyId, personId } }),
      () =>
        prisma.enrollment.create({
          data: {
            academyId,
            personId,
            planId,
            status,
            startedAt: new Date(Date.now() - startedDaysAgo * 86_400_000),
            endsAt,
            pausedAt:
              status === "PAUSED" || status === "FROZEN" ? new Date() : null,
          },
        }),
      (e) =>
        prisma.enrollment.update({
          where: { id: e.id },
          data: { planId, status, endsAt },
        }),
    );
  };

  await enroll(muvet.id, camila.id, muvetMensual.id, "ACTIVE", 90, 18);
  await enroll(muvet.id, josefa.id, muvetPack.id, "ACTIVE", 30);
  // Diego vencido hace 6 días - demo del estado "Plan vencido" en rojo.
  await enroll(muvet.id, diego.id, muvetMensual.id, "ACTIVE", 120, -6);
  await enroll(muvet.id, francisca.id, muvetTrial.id, "TRIAL", 5);
  await enroll(muvet.id, sebastian.id, muvetMensual.id, "PAUSED", 75, 5);
  await enroll(muvet.id, antonia.id, muvetMensual.id, "ACTIVE", 20, 10);
  await enroll(muvet.id, felipe.id, muvetPack.id, "FROZEN", 150);
  await enroll(muvet.id, daniela.id, muvetPack.id, "ACTIVE", 12);
  await enroll(muvet.id, dancer.id, muvetMensual.id, "ACTIVE", 60, 25);
  // Vencimientos repartidos para "Planes por vencer": hoy, esta semana
  // y más allá dentro de la ventana (los de 8-14d alimentan "Ver todos").
  await enroll(muvet.id, isidora.id, muvetMensual.id, "ACTIVE", 27, 0);
  await enroll(muvet.id, benjamin.id, muvetMensual.id, "ACTIVE", 45, 2);
  await enroll(muvet.id, cata.id, muvetBasico.id, "ACTIVE", 35, 4);
  await enroll(muvet.id, tomas.id, muvetMensual.id, "ACTIVE", 55, 6);
  await enroll(muvet.id, matiasb.id, muvetMensual.id, "ONLINE", 22, 9);
  await enroll(muvet.id, fernanda.id, muvetMensual.id, "ONLINE", 30, 12);
  // Packs sin vencimiento natural - "activos" sin fecha de término.
  await enroll(muvet.id, javiera.id, muvetPack.id, "ACTIVE", 60);
  await enroll(muvet.id, vicente.id, muvetPack.id, "TRIAL", 6);
  await enroll(tumbao.id, camila.id, tumbaoMensual.id, "ACTIVE", 40, 21);
  await enroll(tumbao.id, antonia.id, tumbaoMensual.id, "TRIAL", 8, 2);

  // ─── Series + slots + clases materializadas ───
  step("series/slots/clases…");
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
    dropInPrice?: number; // CLP - precio de clase suelta
    slots: SlotSeed[];
    active?: boolean;
    /** también materializa el mes anterior (historial). Default true. */
    withHistory?: boolean;
    /** también materializa el mes siguiente (explorar cruza el borde de mes). */
    withNext?: boolean;
  }) => {
    const sId = opts.styleName ? await styleId(opts.styleName) : null;
    const lId = opts.levelName ? await levelId(opts.levelName) : null;
    // Identidad = academia+nombre+nivel: el mismo estilo puede existir
    // en dos niveles (p. ej. "Salsa" Iniciación y Básico son series
    // distintas) - la llave de la normalización ya incluye levelId.
    const series = await ensure(
      () =>
        prisma.classSeries.findFirst({
          where: { academyId: opts.academyId, name: opts.name, levelId: lId },
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
          prisma.classSlot.update({
            where: { id: sl.id },
            data: {
              endTime: s.endTime,
              capacity: s.capacity ?? null,
              instructorId: opts.instructorId ?? null,
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

  // ─── Normalización de títulos de series ───
  // El nombre lleva solo el estilo: nivel y mes son campos propios
  // (levelId / month). Seeds anteriores sembraron "X - Nivel",
  // "X — Nivel" y "X Nivel Mes"; esta pasada renombra esos títulos y
  // desactiva (soft delete - conserva clases/historial para analítica)
  // los duplicados huérfanos que dejaron, conservando la fila viva: la
  // ya limpia, o la más reciente (la lineage del seed actual).
  const LEVEL_WORDS =
    "(Iniciación|Principiante|Básico|Intermedio|Avanzado|Open|Intensivo)";
  const MONTH_WORDS =
    "(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)";
  const baseSeriesName = (name: string) =>
    name
      .replace(
        new RegExp(`\\s*[-—]\\s*${LEVEL_WORDS}(\\s+${MONTH_WORDS})?\\s*$`),
        "",
      )
      .replace(
        new RegExp(`\\s+${LEVEL_WORDS}\\s+${MONTH_WORDS}\\s*$`),
        "",
      )
      .replace(new RegExp(`\\s*[-—]\\s*${MONTH_WORDS}\\s*$`), "")
      .trim();
  const existingSeries = await prisma.classSeries.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      academyId: true,
      name: true,
      levelId: true,
      createdAt: true,
    },
  });
  const seriesGroups = new Map<string, typeof existingSeries>();
  for (const s of existingSeries) {
    const key = `${s.academyId}|${baseSeriesName(s.name)}|${s.levelId ?? ""}`;
    const list = seriesGroups.get(key);
    if (list) list.push(s);
    else seriesGroups.set(key, [s]);
  }
  for (const rows of seriesGroups.values()) {
    const base = baseSeriesName(rows[0].name);
    const keep =
      rows.find((r) => r.name === base) ??
      [...rows].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0];
    for (const r of rows) {
      if (r.id === keep.id) {
        if (r.name !== base) {
          await prisma.classSeries.update({
            where: { id: r.id },
            data: { name: base },
          });
        }
      } else {
        await prisma.classSeries.update({
          where: { id: r.id },
          data: { deletedAt: new Date() },
        });
      }
    }
  }

  // Serie 1: quórum override 8 (la academia tiene 15) - llena + waitlist.
  const bachataBasico = await mkClassSeries({
    academyId: muvet.id,
    name: "Bachata Sensual",
    styleName: "Bachata sensual",
    levelName: "Básico",
    typeNames: ["Pareja"],
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
    name: "Salsa Cubana",
    styleName: "Salsa cubana (casino)",
    levelName: "Intermedio",
    typeNames: ["Pareja", "Shines"],
    instructorId: rodrigo.id,
    slots: [
      { weekday: 2, startTime: "20:00", endTime: "21:00" },
      { weekday: 4, startTime: "20:00", endTime: "21:00", capacity: 10 },
    ],
  });

  // Serie 3: ni serie ni slots declaran cupo → todo hereda academy (15).
  const rueda = await mkClassSeries({
    academyId: muvet.id,
    name: "Rueda de Casino",
    styleName: "Rueda de casino",
    levelName: "Iniciación",
    typeNames: ["Pareja"],
    instructorId: vale.id,
    slots: [{ weekday: 6, startTime: "12:00", endTime: "13:00" }],
  });

  // Serie de la segunda academia (sin defaultQuorum propio en serie → 12
  // de Tumbao; si Tumbao no declarara, caería al fallback 20).
  await mkClassSeries({
    academyId: tumbao.id,
    name: "Timba",
    styleName: "Timba",
    levelName: "Intermedio",
    typeNames: ["Shines"],
    instructorId: vale.id,
    dropInPrice: 8000,
    slots: [{ weekday: 3, startTime: "21:00", endTime: "22:00" }],
  });

  // ─── Academias de la escena - catálogo Santiago ───
  step("academias catálogo…");
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

  // Ubicaciones Santiago para el directorio/mapa de academias - el
  // seed rota por ellas; direcciones plausibles del eje Providencia–
  // Ñuñoa–Centro donde están las academias reales de la escena.
  const ACADEMY_LOCS = [
    { address: "Av. Providencia 1208, Providencia", lat: -33.4289, lng: -70.6189 },
    { address: "Av. Irarrázaval 2480, Ñuñoa", lat: -33.4531, lng: -70.5998 },
    { address: "Nataniel Cox 52, Santiago Centro", lat: -33.4489, lng: -70.6627 },
    { address: "José Miguel de la Barra 430, Santiago", lat: -33.4412, lng: -70.6435 },
    { address: "Av. Manuel Montt 024, Providencia", lat: -33.4192, lng: -70.6150 },
    { address: "Av. Grecia 1120, Ñuñoa", lat: -33.4700, lng: -70.5850 },
    { address: "Calle Cumming 120, Santiago", lat: -33.4392, lng: -70.6718 },
    { address: "Av. Italia 1101, Providencia", lat: -33.4480, lng: -70.6230 },
  ];

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
    ["Pareja"],
    ["Shines"],
    ["Pareja", "Shines"],
    ["Corporalidad"],
  ];
  const LEVEL_ROT = ["Iniciación", "Básico", "Intermedio"];

  for (const [aIdx, a] of ACADEMY_SEED.entries()) {
    const loc = ACADEMY_LOCS[aIdx % ACADEMY_LOCS.length];
    // Handle/URL demo derivados del nombre - determinísticos por academia.
    const slug = a.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "");
    const academyData = {
      name: a.name,
      ownerId: academiasOwner.id,
      defaultQuorum: 15,
      description: `Academia de baile en ${loc.address.split(",").pop()?.trim() ?? "Santiago"} - clases regulares de la escena SBK.`,
      address: loc.address,
      lat: loc.lat,
      lng: loc.lng,
      instagram: slug,
      whatsapp: `569${String(20000000 + aIdx * 137).slice(0, 8)}`,
      website: `https://${slug}.cl`,
    };
    const academy = await ensure(
      () => prisma.academy.findFirst({ where: { name: a.name } }),
      () => prisma.academy.create({ data: academyData }),
      // Backfill idempotente: academias sembradas antes de los campos
      // de perfil público se completan sin pisar ediciones manuales.
      (existing) =>
        prisma.academy.update({
          where: { id: existing.id },
          data: {
            description: existing.description ?? academyData.description,
            address: existing.address ?? academyData.address,
            lat: existing.lat ?? academyData.lat,
            lng: existing.lng ?? academyData.lng,
            instagram: existing.instagram ?? academyData.instagram,
            whatsapp: existing.whatsapp ?? academyData.whatsapp,
            website: existing.website ?? academyData.website,
          },
        }),
    );
    // Mambo Madness es academia real curada (owner real, parrilla y
    // planes de verdad) - su bloque dedicado va tras este loop; acá se
    // omite toda la asignación genérica. La fila queda en ACADEMY_SEED
    // porque aIdx rota ubicaciones/horarios del resto del catálogo.
    const curated = a.name === "Mambo Madness";
    // Vale y Rodrigo se reparten las academias como profesores de la casa.
    const profe = aIdx % 2 === 0 ? vale : rodrigo;
    if (!curated) {
      await prisma.academyInstructor.upsert({
        where: {
          academyId_personId: { academyId: academy.id, personId: profe.id },
        },
        update: {},
        create: { academyId: academy.id, personId: profe.id },
      });
    }
    if (!curated)
      for (const [sIdx, styleNum] of a.styles.entries()) {
        const style = ACADEMY_STYLE_MAP[styleNum - 1];
        const weekdays = DAY_PAIRS[(aIdx + sIdx) % DAY_PAIRS.length];
        const startTime = CLASS_HOURS[(aIdx * 2 + sIdx) % CLASS_HOURS.length];
        const endTime = `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`;
        const levelName = LEVEL_ROT[(aIdx + sIdx) % LEVEL_ROT.length];
        const modality = MODALITIES[(aIdx + sIdx) % MODALITIES.length];
        // "Ambos" se resuelve por slot: cada día del par lleva una modalidad
        // (lunes Pareja / miércoles Shines) en una misma serie.
        const mixed = modality.length > 1;
        await mkClassSeries({
          academyId: academy.id,
          name: style.label,
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
          withHistory: true, // mes pasado → el relleno de asistencias lo necesita
          withNext: true,
        });
      }

    // Planes de membresía - el nombre es categoría propia de la academia
    // (el periodo lo muestra el tag; la cuota semanal, la metadata del
    // card). Regla general de precios: 1 clase/semana $25.000, 2
    // clases/semana $40.000. Todas ofrecen clase de prueba y clase suelta.
    // (La parrilla real de Mambo Madness va en su bloque curado.)
    if (!curated) {
      // Pares de categorías rotados por índice - el naming varía de
      // academia en academia como en la vida real.
      const TIERS = [
        ["Básico", "Premium"],
        ["Plata", "Oro"],
        ["Normal", "Extendido"],
        ["Esencial", "VIP"],
        ["Bronce", "Platino"],
        ["Inicial", "Diamante"],
      ] as const;
      const [tier1, tier2] = TIERS[aIdx % TIERS.length];
      await plan(
        academy.id,
        tier1,
        "MONTHLY",
        25000,
        {
          weeklyClasses: 1,
          description: ["Válido hasta fin del mes calendario"],
        },
        ["Mensual - 1 clase semanal"],
      );
      await plan(
        academy.id,
        tier2,
        "MONTHLY",
        40000,
        {
          weeklyClasses: 2,
          description: ["Válido hasta fin del mes calendario"],
        },
        ["Mensual - 2 clases semanales"],
      );
      await plan(academy.id, "Clase suelta", "SINGLE", 8000, {
        description: ["Una clase del día"],
      });
      await plan(academy.id, "Clase de prueba", "TRIAL", 0);
    }
  }

  // ─── Mambo Madness - academia real, no catálogo genérico ───
  step("mambo madness…");
  // Dueño real (Gabriel Arias, gazner3203@gmail.com), datos de contacto
  // y parrilla reales de mambomadnesscl.com. El loop de catálogo crea la
  // fila con placeholders (para no re-indexar al resto); acá se pisan
  // con los datos reales sin el backfill conservador - el seed es dueño
  // de esta academia.
  const mamboData = {
    name: "Mambo Madness",
    ownerId: gabriel.id,
    // Aforo de todas las clases: 20 - los slots heredan sin override.
    defaultQuorum: 20,
    description:
      "Academia de mambo on2 y bachata moderna en Providencia - formación por niveles, partnerwork y lady style.",
    address: "Almirante Riveros 0186, Providencia",
    lat: -33.4354,
    lng: -70.6134,
    instagram: "mambo.madness",
    whatsapp: "56959372339",
    website: "https://mambomadnesscl.com",
  };
  const mambo = await ensure(
    () => prisma.academy.findFirst({ where: { name: "Mambo Madness" } }),
    () => prisma.academy.create({ data: mamboData }),
    (a) =>
      prisma.academy.update({
        where: { id: a.id },
        data: mamboData,
      }),
  );

  // Cuerpo docente: Gabriel es el instructor de la casa; los genéricos
  // del catálogo (vale/rodrigo) salen de la nómina de esta academia.
  await prisma.academyInstructor.deleteMany({
    where: { academyId: mambo.id, personId: { in: [vale.id, rodrigo.id] } },
  });
  await prisma.academyInstructor.upsert({
    where: {
      academyId_personId: { academyId: mambo.id, personId: gabriel.id },
    },
    update: {},
    create: { academyId: mambo.id, personId: gabriel.id },
  });

  // Series fuera de la parrilla real (genéricas viejas o de mappings
  // previos de nivel) → soft delete: conserva sus clases e historial.
  const mmTarget = new Set([
    "Salsa|Iniciación",
    "Bachata|Iniciación",
    "Bachata Pareja|Básico",
    "Salsa Pareja|Básico",
    "Movimiento Corporal|Básico",
    "Pasos Libres|Básico",
    "Partnerwork|Básico",
    "Lady Style|Básico",
    "Shines|Intermedio",
    "Movimiento Corporal|Intermedio",
    "Partnerwork|Intermedio",
  ]);
  for (const s of await prisma.classSeries.findMany({
    where: { academyId: mambo.id, deletedAt: null },
    select: { id: true, name: true, level: { select: { name: true } } },
  })) {
    if (!mmTarget.has(`${s.name}|${s.level?.name ?? ""}`)) {
      await prisma.classSeries.update({
        where: { id: s.id },
        data: { deletedAt: new Date() },
      });
    }
  }

  // Parrilla real (mambomadnesscl.com). Niveles del flyer → catálogo:
  // N1·Desde Cero y N2·Iniciación 2 son ambos Iniciación; N3 → Básico;
  // N4 → Intermedio; N5 → Avanzado (sin clases aún en la parrilla).
  // "Salsa" es mambo on2; la bachata es moderna; partnerwork, lady
  // style, shines, pasos libres y movimiento corporal son técnica de
  // mambo. Aforo 20 vía defaultQuorum (los slots heredan).
  const mmSeries: Awaited<ReturnType<typeof mkClassSeries>>[] = [];
  const mmClass = async (
    name: string,
    styleName: string,
    levelName: string,
    typeNames: string[],
    slots: SlotSeed[],
  ) => {
    const r = await mkClassSeries({
      academyId: mambo.id,
      name,
      styleName,
      levelName,
      typeNames,
      instructorId: gabriel.id,
      slots,
      withHistory: true, // clases del mes pasado → alimentan asistencias
      withNext: true,
    });
    // Slots que quedaron fuera del horario publicado (mappings previos
    // del seed) se podan con sus clases/reservas - nunca existieron en
    // la parrilla real.
    const keep = new Set(slots.map((s) => `${s.weekday}|${s.startTime}`));
    for (const stale of await prisma.classSlot.findMany({
      where: { seriesId: r.series.id },
    })) {
      if (keep.has(`${stale.weekday}|${stale.startTime}`)) continue;
      const staleClasses = await prisma.class.findMany({
        where: { classSlotId: stale.id },
        select: { id: true },
      });
      const ids = staleClasses.map((c) => c.id);
      await prisma.attendance.deleteMany({ where: { classId: { in: ids } } });
      await prisma.classBooking.deleteMany({ where: { classId: { in: ids } } });
      await prisma.class.deleteMany({ where: { id: { in: ids } } });
      await prisma.classSlotType.deleteMany({ where: { slotId: stale.id } });
      await prisma.classSlot.delete({ where: { id: stale.id } });
    }
    mmSeries.push(r);
    return r;
  };

  // Iniciación - N1 (vie) y N2 (lun/sáb) comparten nivel → una serie.
  await mmClass("Salsa", "Mambo on2", "Iniciación", ["Pareja"], [
    { weekday: 1, startTime: "19:30", endTime: "20:30" },
    { weekday: 5, startTime: "19:00", endTime: "20:00" },
    { weekday: 6, startTime: "17:00", endTime: "18:00" },
  ]);
  await mmClass("Bachata", "Bachata moderna", "Iniciación", ["Pareja"], [
    { weekday: 1, startTime: "20:30", endTime: "21:30" },
    { weekday: 5, startTime: "20:00", endTime: "21:00" },
    { weekday: 6, startTime: "18:00", endTime: "19:00" },
  ]);
  // Martes - Nivel 3 (Básico).
  await mmClass("Bachata Pareja", "Bachata moderna", "Básico", ["Pareja"], [
    { weekday: 2, startTime: "19:30", endTime: "20:30" },
  ]);
  await mmClass("Salsa Pareja", "Mambo on2", "Básico", ["Pareja"], [
    { weekday: 2, startTime: "20:30", endTime: "21:30" },
  ]);
  await mmClass("Movimiento Corporal", "Mambo on2", "Básico", ["Corporalidad"], [
    { weekday: 2, startTime: "21:30", endTime: "22:30" },
  ]);
  // Miércoles - Nivel 4 (Intermedio).
  await mmClass("Shines", "Mambo on2", "Intermedio", ["Shines"], [
    { weekday: 3, startTime: "19:30", endTime: "20:30" },
  ]);
  await mmClass("Movimiento Corporal", "Mambo on2", "Intermedio", ["Corporalidad"], [
    { weekday: 3, startTime: "20:30", endTime: "21:30" },
  ]);
  await mmClass("Partnerwork", "Mambo on2", "Intermedio", ["Pareja"], [
    { weekday: 3, startTime: "21:30", endTime: "22:30" },
  ]);
  // Jueves - Nivel 3 (Básico).
  await mmClass("Pasos Libres", "Mambo on2", "Básico", ["Shines"], [
    { weekday: 4, startTime: "19:30", endTime: "20:30" },
  ]);
  await mmClass("Partnerwork", "Mambo on2", "Básico", ["Pareja"], [
    { weekday: 4, startTime: "20:30", endTime: "21:30" },
  ]);
  await mmClass("Lady Style", "Mambo on2", "Básico", ["Shines"], [
    { weekday: 4, startTime: "21:30", endTime: "22:30" },
  ]);

  // Planes reales de mambomadnesscl.com. Renombres in-place por alias:
  // Básico→"1 Vez por Semana" ($45k) y Premium→"Ilimitado" ($60k); Oro/
  // Diamante salen de la parrilla (desactivados - pueden tener
  // enrollments). Todas conservan clase suelta y de prueba.
  const mmOferta = await plan(mambo.id, "Oferta Especial", "CLASS_PACK", 40000, {
    classCount: 8,
    description: [
      "8 clases en 4 semanas - salsa y bachata",
      "Práctica social del mes incluida",
      "Completa el reto y gana tu mes 2 como crédito",
      "14 días de garantía",
    ],
  });
  const mmSemanal = await plan(
    mambo.id,
    "1 Vez por Semana",
    "MONTHLY",
    45000,
    {
      weeklyClasses: 1,
      description: [
        "Salsa o bachata - un ritmo, una clase por semana",
        "Válido hasta fin del mes calendario",
      ],
    },
    ["Básico"],
  );
  const mmIlimitado = await plan(
    mambo.id,
    "Ilimitado",
    "MONTHLY",
    60000,
    {
      description: [
        "Todas las clases de todos los ritmos y niveles",
        "Práctica social del mes",
        "Válido hasta fin del mes calendario",
      ],
    },
    ["Premium"],
  );
  const mmVip = await plan(mambo.id, "VIP", "MONTHLY", 99000, {
    description: [
      "Todo lo del plan Ilimitado",
      "1 clase privada 1 a 1 al mes",
      "Válido hasta fin del mes calendario",
    ],
  });
  await prisma.membershipPlan.updateMany({
    where: { academyId: mambo.id, name: { in: ["Oro", "Diamante"] } },
    data: { active: false },
  });
  await plan(mambo.id, "Clase suelta", "SINGLE", 10000, {
    description: ["Una clase del día", "Ideal para probar antes del plan"],
  });
  await plan(mambo.id, "Clase de prueba", "TRIAL", 0);

  // Transferencia con datos reales de contacto (el rut/cuenta quedan
  // placeholder - el seed no tiene datos bancarios reales).
  const mmMethodData = {
    academyId: mambo.id,
    type: "TRANSFER" as const,
    label: "Transferencia",
    details: {
      bank: "Banco Santander",
      accountType: "Cuenta Corriente",
      accountNumber: "98765432",
      holder: "Mambo Madness SpA",
      rut: "77.888.999-0",
      email: "info@mambomadnesscl.com",
    },
    order: 0,
  };
  const mmMethod = await prisma.academyPaymentMethod.findFirst({
    where: { academyId: mambo.id, label: "Transferencia" },
  });
  if (mmMethod) {
    await prisma.academyPaymentMethod.update({
      where: { id: mmMethod.id },
      data: mmMethodData,
    });
  } else {
    await prisma.academyPaymentMethod.create({ data: mmMethodData });
  }
  // MercadoPago - mismo flujo manual que la transferencia: el alumno se
  // redirige al link de pago y vuelve a subir el comprobante en la app;
  // Gabriel lo valida en /academia/cobros.
  const mmMpData = {
    academyId: mambo.id,
    type: "PAYMENT_LINK" as const,
    label: "MercadoPago",
    details: { url: "https://link.mercadopago.cl/mambomadness" },
    order: 1,
    active: true,
  };
  const mmMp = await prisma.academyPaymentMethod.findFirst({
    where: { academyId: mambo.id, label: "MercadoPago" },
  });
  if (mmMp) {
    await prisma.academyPaymentMethod.update({
      where: { id: mmMp.id },
      data: mmMpData,
    });
  } else {
    await prisma.academyPaymentMethod.create({ data: mmMpData });
  }

  // ─── Alumnos de Mambo Madness ───
  step("alumnos mambo madness…");
  // 92 alumnos con plan vigente - mix de la parrilla (oferta de entrada,
  // semanal, ilimitado) con el VIP exclusivo (solo 3). Nombres del pool
  // chileno determinístico; el volumen alimenta la analítica real.
  const MM_F = [
    "Camila", "Josefa", "Francisca", "Antonia", "Daniela", "Isidora",
    "Catalina", "Javiera", "Fernanda", "Martina", "Valentina", "Sofía",
    "Constanza", "Trinidad", "Florencia", "Antonieta", "Bernardita",
    "Ignacia", "Magdalena", "Paloma", "Rosario", "Millaray", "Rayén",
  ];
  const MM_M = [
    "Diego", "Sebastián", "Felipe", "Benjamín", "Tomás", "Matías",
    "Vicente", "Joaquín", "Ignacio", "Agustín", "Cristóbal",
    "Maximiliano", "Emilio", "Santiago", "Martín", "Gonzalo", "Rodrigo",
    "Nicolás", "Alonso", "Gaspar", "Simón", "Baltasar", "Facundo",
  ];
  const MM_LAST = [
    "González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras",
    "Silva", "Martínez", "Sepúlveda", "Morales", "Rodríguez", "López",
    "Fuentes", "Hernández", "Torres", "Araya", "Flores", "Espinoza",
    "Valenzuela", "Castro", "Tapia", "Reyes", "Gutiérrez", "Navarro",
    "Salinas", "Carvajal", "Vergara", "Paredes", "Figueroa", "Cárdenas",
    "Bravo", "Henríquez", "Saavedra", "Alarcón", "Vargas", "Villarroel",
    "Cortés", "Sanhueza", "Zamora", "Poblete", "Gallardo", "Candia",
    "Iturra", "Ossandón", "Maldonado",
  ];
  const mmStudents: { id: string }[] = [];
  for (let i = 0; i < 92; i++) {
    const fem = i % 2 === 0;
    const pool = fem ? MM_F : MM_M;
    const st = await ensurePerson(
      prisma,
      `mm${String(i + 1).padStart(2, "0")}@${DEV_DOMAIN}`,
      `${pool[Math.floor(i / 2) % pool.length]} ${MM_LAST[(i * 7) % MM_LAST.length]}`,
      [{ role: "DANCER" }],
      i % 23 === 22 ? Gender.OTHER : fem ? Gender.F : Gender.M,
    );
    mmStudents.push(st);
    // Mix: VIP solo 3; oferta de entrada 23; semanal 30; ilimitado 36.
    const pl = i < 3 ? mmVip : i < 26 ? mmOferta : i < 56 ? mmSemanal : mmIlimitado;
    // Mensuales con "pagado hasta" repartido en futuro (puebla "planes
    // por vencer"); el pack de clases no tiene vencimiento natural.
    await enroll(
      mambo.id,
      st.id,
      pl.id,
      "ACTIVE",
      10 + ((i * 7) % 60),
      pl.type === "MONTHLY" ? 5 + ((i * 11) % 50) : null,
    );
  }

  // María José: alumna del nivel más alto publicado (Intermedio,
  // miércoles) con plan Ilimitado + profesora de la casa en los slots de
  // iniciación (lunes 19:30/20:30 y sábado 17:00/18:00 - Gabriel dicta
  // el resto de la parrilla). Eduardo es co-profe de los sábados: misma
  // alumna/plan, mismo plantel - el join permite ambos (spec
  // multi-instructor).
  const mmIlimitadoPlan = await prisma.membershipPlan.findFirst({
    where: { academyId: mambo.id, name: "Ilimitado" },
  });
  if (mmIlimitadoPlan) {
    await enroll(mambo.id, maria.id, mmIlimitadoPlan.id, "ACTIVE", 60, 24);
    await enroll(mambo.id, eduardo.id, mmIlimitadoPlan.id, "ACTIVE", 30, 30);
  }
  for (const profe of [maria, eduardo]) {
    await prisma.academyInstructor.upsert({
      where: {
        academyId_personId: { academyId: mambo.id, personId: profe.id },
      },
      update: {},
      create: { academyId: mambo.id, personId: profe.id },
    });
  }
  // Plantel multi-instructor: agrega `personId` al join del slot y al
  // de todas sus clases ya materializadas - sin tocar instructorId
  // (primario). Idempotente vía createMany+skipDuplicates.
  const attachInstructor = async (slotId: string, personId: string) => {
    await prisma.classSlotInstructor.createMany({
      data: [{ slotId, personId }],
      skipDuplicates: true,
    });
    const slotClasses = await prisma.class.findMany({
      where: { classSlotId: slotId },
      select: { id: true },
    });
    await prisma.classInstructor.createMany({
      data: slotClasses.map((c) => ({ classId: c.id, personId })),
      skipDuplicates: true,
    });
  };
  // Slots de María: la iniciación de lunes y sábado (salsa + bachata).
  // Se marca en el slot y en las clases ya materializadas - la consola
  // del instructor lista por ambos según la vista.
  const mariaSlotKeys = [
    { series: "Salsa", weekday: 1, startTime: "19:30" },
    { series: "Bachata", weekday: 1, startTime: "20:30" },
    { series: "Salsa", weekday: 6, startTime: "17:00" },
    { series: "Bachata", weekday: 6, startTime: "18:00" },
  ];
  for (const k of mariaSlotKeys) {
    const slot = await prisma.classSlot.findFirst({
      where: {
        academyId: mambo.id,
        weekday: k.weekday,
        startTime: k.startTime,
        series: { name: k.series, deletedAt: null },
      },
    });
    if (!slot) continue;
    await prisma.classSlot.update({
      where: { id: slot.id },
      data: { instructorId: maria.id },
    });
    await prisma.class.updateMany({
      where: { classSlotId: slot.id },
      data: { instructorId: maria.id },
    });
    await attachInstructor(slot.id, maria.id);
  }
  // Sábado multi-profe: María queda como primaria y Eduardo entra al
  // plantel de ambos slots (salsa 17:00 y bachata 18:00) - las clases
  // materializadas también lo registran como co-profe.
  for (const k of [
    { series: "Salsa", weekday: 6, startTime: "17:00" },
    { series: "Bachata", weekday: 6, startTime: "18:00" },
  ]) {
    const slot = await prisma.classSlot.findFirst({
      where: {
        academyId: mambo.id,
        weekday: k.weekday,
        startTime: k.startTime,
        series: { name: k.series, deletedAt: null },
      },
    });
    if (slot) await attachInstructor(slot.id, eduardo.id);
  }

  // ─── Adrian y Leo - academia de solo mambo ───
  step("adrian y leo…");
  // Mónica es su alumna: plan más caro + asistencias del mes pasado y
  // vigente. Academia chica boutique - parrilla mínima pero real.
  const alData = {
    name: "Adrian y Leo",
    ownerId: adrian.id,
    defaultQuorum: 14,
    description:
      "Academia boutique de mambo on2 - grupos chicos, técnica de línea y musicalidad.",
    address: "Seminario 380, Providencia",
    lat: -33.4483,
    lng: -70.6227,
    instagram: "adrianyleo.mambo",
    whatsapp: "56987654321",
    website: "https://adrianyleo.cl",
  };
  const adrianLeo = await ensure(
    () => prisma.academy.findFirst({ where: { name: "Adrian y Leo" } }),
    () => prisma.academy.create({ data: alData }),
    (a) => prisma.academy.update({ where: { id: a.id }, data: alData }),
  );
  for (const profe of [adrian, leo]) {
    await prisma.academyInstructor.upsert({
      where: {
        academyId_personId: { academyId: adrianLeo.id, personId: profe.id },
      },
      update: {},
      create: { academyId: adrianLeo.id, personId: profe.id },
    });
  }
  // Parrilla mambo-only: dos series (línea y partnerwork).
  const alMambo = await mkClassSeries({
    academyId: adrianLeo.id,
    name: "Mambo",
    styleName: "Mambo on2",
    levelName: "Intermedio",
    typeNames: ["Pareja"],
    instructorId: adrian.id,
    dropInPrice: 10000,
    slots: [
      { weekday: 1, startTime: "20:00", endTime: "21:00" },
      { weekday: 3, startTime: "20:00", endTime: "21:00" },
    ],
    withHistory: true,
    withNext: true,
  });
  const alShines = await mkClassSeries({
    academyId: adrianLeo.id,
    name: "Shines Mambo",
    styleName: "Mambo on2",
    levelName: "Básico",
    typeNames: ["Shines"],
    instructorId: leo.id,
    dropInPrice: 8000,
    slots: [{ weekday: 4, startTime: "19:00", endTime: "20:00" }],
    withHistory: true,
    withNext: true,
  });
  await plan(adrianLeo.id, "Mambo Mensual", "MONTHLY", 40000, {
    weeklyClasses: 1,
    description: [
      "1 clase de mambo por semana",
      "Válido hasta fin del mes calendario",
    ],
  });
  // El plan más caro de la casa - es el de Mónica.
  const alIntensivo = await plan(adrianLeo.id, "Mambo Intensivo", "MONTHLY", 55000, {
    description: [
      "Todas las clases de la academia",
      "Feedback individual en cada clase",
      "Válido hasta fin del mes calendario",
    ],
  });
  await plan(adrianLeo.id, "Clase suelta", "SINGLE", 10000, {
    description: ["Una clase del día"],
  });
  await plan(adrianLeo.id, "Clase de prueba", "TRIAL", 0);
  // Mónica: plan más caro vigente; sus asistencias/reservas van en la
  // sección de reservas (los helpers book/attend se definen ahí).
  await enroll(adrianLeo.id, monica.id, alIntensivo.id, "ACTIVE", 40, 18);

  // "Muevete On Tour" del spec lleva estilos 2·5·6·7 - muvet ya tiene
  // Bachata Sensual (2), Rueda (6) y Casino (7); le falta Cubano (5).
  await mkClassSeries({
    academyId: muvet.id,
    name: "Cubano",
    styleName: "Cubano",
    levelName: "Básico",
    typeNames: ["Pareja", "Shines"],
    instructorId: muvetOwner.id,
    dropInPrice: 9000,
    slots: [
      {
        weekday: 2,
        startTime: "18:00",
        endTime: "19:00",
        typeNames: ["Pareja"],
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
  step("reservas y asistencias…");
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
    isidora,
    benjamin,
    cata,
    tomas,
    javiera,
    matiasb,
    fernanda,
    vicente,
  ];

  // Historial: asistencias en clases pasadas de bachata (las primeras N
  // pasadas por slot) + reservas históricas para que el dedup muestre
  // "attended" ganando sobre "booked".
  for (const { classes } of bachataBasico.slots) {
    for (const cls of classes.filter((c) => c.date < todayUTC)) {
      for (const p of alumnosMuvet.slice(0, 10)) {
        await book(cls.id, p.id);
        await attend(cls.id, p.id, cls.date);
      }
      // Algunos reservaron pero no asistieron → quedan "booked" en historial.
      for (const p of alumnosMuvet.slice(10, 14)) {
        await book(cls.id, p.id);
      }
    }
  }
  for (const { classes } of salsaInter.slots) {
    for (const cls of classes.filter((c) => c.date < todayUTC)) {
      for (const p of [camila, diego, antonia, dancer, benjamin, cata, matiasb]) {
        await book(cls.id, p.id);
        await attend(cls.id, p.id, cls.date);
      }
    }
  }
  for (const { classes } of rueda.slots) {
    for (const cls of classes.filter((c) => c.date < todayUTC)) {
      for (const p of alumnosMuvet.slice(0, 8)) {
        await book(cls.id, p.id);
        await attend(cls.id, p.id, cls.date);
      }
    }
  }

  // Las clases de hoy ya tienen lista pasada parcialmente - el home
  // muestra progreso real y la pantalla de asistencia abre marcada.
  const hoyMuvet = [bachataBasico, salsaInter, rueda]
    .flatMap((s) => s.slots.flatMap((sl) => sl.classes))
    .filter((c) => c.date.getTime() === todayUTC.getTime());
  for (const cls of hoyMuvet) {
    for (const p of alumnosMuvet.slice(0, 7)) {
      await book(cls.id, p.id);
      await attend(cls.id, p.id, cls.date);
    }
    for (const p of alumnosMuvet.slice(7, 11)) {
      await book(cls.id, p.id);
    }
  }

  // ─── Asistencias Mambo Madness: mes pasado + vigente a la fecha ───
  step("asistencias mambo madness…");
  // Ocupación realista (~50-70% del aforo 20) rotando el roster de 92
  // de forma determinística; un resto reserva y no asiste → queda
  // booked en el historial (misma semántica "attended gana" de muvet).
  const mmClasses = mmSeries.flatMap((s) =>
    s.slots.flatMap((sl) => sl.classes),
  );
  let mmIdx = 0;
  for (const cls of mmClasses.filter((c) => c.date < todayUTC)) {
    const offset = (mmIdx * 13) % mmStudents.length;
    const n = 8 + ((mmIdx * 7) % 6); // 8-13 asistentes por clase
    for (let k = 0; k < n; k++) {
      const p = mmStudents[(offset + k) % mmStudents.length];
      await book(cls.id, p.id);
      await attend(cls.id, p.id, cls.date);
    }
    for (let k = 0; k < 3; k++) {
      await book(cls.id, mmStudents[(offset + n + k) % mmStudents.length].id);
    }
    mmIdx++;
  }
  // Las de hoy con lista parcial (mismo criterio que Muévete).
  for (const cls of mmClasses.filter(
    (c) => c.date.getTime() === todayUTC.getTime(),
  )) {
    for (let k = 0; k < 7; k++) {
      await book(cls.id, mmStudents[k].id);
      await attend(cls.id, mmStudents[k].id, cls.date);
    }
    for (let k = 7; k < 11; k++) await book(cls.id, mmStudents[k].id);
  }
  // Reservas abiertas en las próximas - ocupación visible al explorar.
  for (const cls of mmClasses.filter((c) => c.date > todayUTC)) {
    const offset = (mmIdx * 13) % mmStudents.length;
    for (let k = 0; k < 6; k++) {
      await book(cls.id, mmStudents[(offset + k) % mmStudents.length].id);
    }
    mmIdx++;
  }

  // María: asistencia fija a las clases Intermedio del miércoles
  // (Shines, Movimiento Corporal, Partnerwork) - mes pasado + vigente.
  const mariaMmClasses = await prisma.class.findMany({
    where: {
      slot: { academyId: mambo.id, weekday: 3, series: { deletedAt: null } },
    },
    select: { id: true, date: true },
  });
  for (const cls of mariaMmClasses) {
    await book(cls.id, maria.id);
    if (cls.date <= todayUTC) await attend(cls.id, maria.id, cls.date);
  }

  // Mónica: asistencia completa en Adrian y Leo - ambas series, mes
  // pasado + vigente a la fecha, y reserva en las próximas.
  const alClasses = await prisma.class.findMany({
    where: {
      slot: { academyId: adrianLeo.id, series: { deletedAt: null } },
    },
    select: { id: true, date: true },
  });
  for (const cls of alClasses) {
    await book(cls.id, monica.id);
    if (cls.date <= todayUTC) await attend(cls.id, monica.id, cls.date);
  }

  // ─── Relleno de alumnos + asistencias: todas las academias ───
  step("relleno de academias…");
  // Cada academia queda con 20-70 alumnos vigentes (determinístico por
  // índice) repartidos en sus planes mensuales/pack, y asistencias en
  // sus clases del mes pasado + el vigente a la fecha - el mismo
  // criterio de ocupación 50-70% + no-shows de Mambo Madness. Muévete
  // conserva sus alumnos con nombre dentro del roster. Mambo Madness
  // queda fuera: su bloque curado ya lo hace.
  const catalogAcademies = await prisma.academy.findMany({
    where: {
      name: { in: ACADEMY_SEED.map((a) => a.name), not: "Mambo Madness" },
    },
  });
  const enrichList = [
    { academy: muvet, prefix: "mv", target: 45 },
    { academy: tumbao, prefix: "tb", target: 30 },
    ...ACADEMY_SEED.map((a, i) => ({
      academy: catalogAcademies.find((c) => c.name === a.name),
      prefix: `ac${i}`,
      target: 20 + ((i * 11) % 51), // 20-70 determinístico
    })).filter(
      (e): e is { academy: (typeof catalogAcademies)[number]; prefix: string; target: number } =>
        e.academy !== undefined,
    ),
  ];
  for (const [ai, { academy, prefix, target }] of enrichList.entries()) {
    const plans = await prisma.membershipPlan.findMany({
      where: {
        academyId: academy.id,
        active: true,
        type: { in: ["MONTHLY", "CLASS_PACK"] },
      },
    });
    if (plans.length === 0) continue;
    // El roster = todos los vigentes (incluye a los alumnos con nombre
    // de Muévete); se completa hasta el target con alumnos de relleno.
    const roster: { id: string }[] = (
      await prisma.enrollment.findMany({
        where: { academyId: academy.id, status: "ACTIVE" },
        select: { personId: true },
      })
    ).map((e) => ({ id: e.personId }));
    for (let i = roster.length; i < target; i++) {
      const fem = i % 2 === 0;
      const pool = fem ? MM_F : MM_M;
      const st = await ensurePerson(
        prisma,
        `${prefix}al${String(i).padStart(2, "0")}@${DEV_DOMAIN}`,
        `${pool[Math.floor(i / 2) % pool.length]} ${MM_LAST[(i * 7 + ai * 3) % MM_LAST.length]}`,
        [{ role: "DANCER" }],
        i % 23 === 22 ? Gender.OTHER : fem ? Gender.F : Gender.M,
      );
      const pl = plans[i % plans.length];
      await enroll(
        academy.id,
        st.id,
        pl.id,
        "ACTIVE",
        10 + ((i * 7) % 60),
        pl.type === "MONTHLY" ? 5 + ((i * 11) % 50) : null,
      );
      roster.push(st);
    }
    if (roster.length === 0) continue;
    const classes = await prisma.class.findMany({
      where: {
        slot: { academyId: academy.id, series: { deletedAt: null } },
      },
      select: { id: true, date: true },
      orderBy: { date: "asc" },
    });
    let idx = 0;
    for (const cls of classes.filter((c) => c.date < todayUTC)) {
      const offset = (idx * 13) % roster.length;
      const n = Math.min(roster.length - 3, 8 + ((idx * 7) % 6));
      const ops: Promise<unknown>[] = [];
      for (let k = 0; k < n; k++) {
        const p = roster[(offset + k) % roster.length];
        ops.push(book(cls.id, p.id).then(() => attend(cls.id, p.id, cls.date)));
      }
      for (let k = 0; k < Math.min(3, roster.length - n); k++) {
        ops.push(book(cls.id, roster[(offset + n + k) % roster.length].id));
      }
      await Promise.all(ops);
      idx++;
    }
    // Reservas abiertas en las próximas.
    for (const cls of classes.filter((c) => c.date > todayUTC)) {
      const offset = (idx * 13) % roster.length;
      await Promise.all(
        Array.from({ length: Math.min(6, roster.length) }, (_, k) =>
          book(cls.id, roster[(offset + k) % roster.length].id),
        ),
      );
      idx++;
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
    for (const p of [camila, josefa, diego, antonia, dancer, isidora, cata]) {
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
    for (const p of [camila, diego, antonia, josefa, tomas, matiasb]) {
      await book(cls.id, p.id);
    }
  }
  const ruedaFuturas = rueda.slots
    .flatMap((s) => s.classes)
    .filter((c) => c.date >= todayUTC);
  for (const cls of ruedaFuturas) {
    for (const p of alumnosMuvet.slice(0, 9)) {
      await book(cls.id, p.id);
    }
  }

  // ─── Cobros declarados (PaymentClaim) ───
  step("cobros declarados…");
  // Pendientes alimentan "Cobros por revisar" del home; los aprobados
  // del mes vigente y del tramo equivalente del anterior hacen que
  // Facturado, Ticket/alumno y sus comparativas tengan datos reales.
  // Al aprobar, el endpoint materializa un Payment MANUAL con refId
  // claim-<id> - el seed replica esa forma para que el libro cuadre
  // (los claim-* no cuentan en la suma de pasarela, sin doble cargo).
  const claim = async (opts: {
    personId: string;
    planId?: string;
    amount: number;
    status: "PENDING" | "APPROVED";
    /** día del mes de la declaración - se clampea al día de hoy. */
    monthDay: number;
    /** true = cae en el tramo MTD equivalente del mes anterior. */
    prevMonth?: boolean;
    methodType?: "TRANSFER" | "CASH";
    methodLabel?: string;
    note?: string;
  }) => {
    const day = Math.max(1, Math.min(opts.monthDay, now.getUTCDate()));
    const base = opts.prevMonth ? prevMonthDate : now;
    const createdAt = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day, 12),
    );
    // Idempotente por persona+plan+estado+mes - un alumno puede tener
    // claims distintos en meses distintos o en estados distintos.
    const mStart = new Date(
      Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), 1),
    );
    const mEnd = new Date(
      Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth() + 1, 1),
    );
    const found = await prisma.paymentClaim.findFirst({
      where: {
        academyId: muvet.id,
        personId: opts.personId,
        planId: opts.planId ?? null,
        status: opts.status,
        createdAt: { gte: mStart, lt: mEnd },
      },
    });
    if (found) {
      return prisma.paymentClaim.update({
        where: { id: found.id },
        data: { amount: opts.amount, createdAt },
      });
    }
    const created = await prisma.paymentClaim.create({
      data: {
        academyId: muvet.id,
        personId: opts.personId,
        planId: opts.planId ?? null,
        amount: opts.amount,
        methodType: opts.methodType ?? "TRANSFER",
        methodLabel: opts.methodLabel ?? "Transferencia",
        status: opts.status,
        note: opts.note ?? null,
        reviewedById: opts.status === "APPROVED" ? muvetOwner.id : null,
        reviewedAt: opts.status === "APPROVED" ? createdAt : null,
        createdAt,
      },
    });
    if (opts.status === "APPROVED") {
      // Mismo Payment que crea claims.approve() - el ledger de cobros
      // los muestra como pagados por método propio de la academia.
      const payment = await prisma.payment.create({
        data: {
          orderType: "MEMBERSHIP",
          refId: `claim-${created.id}`,
          personId: created.personId,
          amount: created.amount,
          fee: 0,
          net: created.amount,
          gateway: "MANUAL",
          status: "PAID",
          feeMode: "ACADEMY",
          platformFeeNetClp: 0,
          platformFeeVatClp: 0,
          gatewayFeeExpected: 0,
          producerNetClp: created.amount,
          createdAt,
        },
      });
      await prisma.paymentClaim.update({
        where: { id: created.id },
        data: { paymentId: payment.id },
      });
    }
    return created;
  };

  // Aprobados del mes vigente → Facturado + Ticket/alumno del KPI strip.
  await claim({ personId: camila.id, planId: muvetMensual.id, amount: 45000, status: "APPROVED", monthDay: 2 });
  await claim({ personId: josefa.id, planId: muvetPack.id, amount: 38000, status: "APPROVED", monthDay: 3 });
  await claim({ personId: antonia.id, planId: muvetMensual.id, amount: 45000, status: "APPROVED", monthDay: 5, methodType: "CASH", methodLabel: "Efectivo en clase" });
  await claim({ personId: tomas.id, planId: muvetMensual.id, amount: 45000, status: "APPROVED", monthDay: 7 });
  await claim({ personId: daniela.id, planId: muvetPack.id, amount: 38000, status: "APPROVED", monthDay: 9 });
  // Tramo equivalente del mes anterior → las comparativas muestran delta.
  await claim({ personId: camila.id, planId: muvetMensual.id, amount: 45000, status: "APPROVED", monthDay: 2, prevMonth: true });
  await claim({ personId: sebastian.id, planId: muvetMensual.id, amount: 45000, status: "APPROVED", monthDay: 4, prevMonth: true });
  await claim({ personId: felipe.id, planId: muvetPack.id, amount: 38000, status: "APPROVED", monthDay: 6, prevMonth: true });
  // Pendientes de revisión → "Cobros por revisar" (los más viejos primero).
  await claim({ personId: josefa.id, planId: muvetPack.id, amount: 38000, status: "PENDING", monthDay: now.getUTCDate() - 2, note: "Renovación pack" });
  await claim({ personId: benjamin.id, planId: muvetMensual.id, amount: 45000, status: "PENDING", monthDay: now.getUTCDate() - 1 });
  await claim({ personId: fernanda.id, planId: muvetMensual.id, amount: 45000, status: "PENDING", monthDay: now.getUTCDate(), methodType: "CASH", methodLabel: "Efectivo en clase", note: "Paga al llegar el sábado" });

  // Clases particulares - bandeja del instructor y del alumno.
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
  step("series y eventos nightlife…");
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
    // Cronograma de la noche - null deriva de genres (programFor).
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
    // sufijos - en la vida real el flyer dice solo eso.
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
      // refrescar fechas/precios - la demo apunta siempre a "la próxima semana"
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

  // Cronograma de la noche - filas {t: "HH:MM" (o "Hasta HH:MM"),
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

  // Cronograma Maníaco - Bachatamanía corre con formato propio
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

  // Orixas - una noche por día: las marcas del mismo weekday alternan
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
  // Desafío de Tronos - la noche mensual de MuéveteOnTour como
  // productora (muvetOwner también tiene lente PRODUCER; su consola
  // se prueba con esta data).
  const desafioTronos = await mkSeries("Desafío de Tronos", muvetOwner.id, orixas.id, "1x/month:fri", 6000, 8000, 5, [], ALL3, [], 1, MIX_2X2);
  // Su social semanal - segundo evento próximo para probar listas,
  // filtros y el dashboard con más de una cartelera.
  const muvetSocial = await mkSeries("Muévete Social", muvetOwner.id, orixas.id, "weekly:sun", 4000, 5000, 0, [krrera.id], ALL3);
  // SCE cede el sábado próximo a Trilogía (colaboración con
  // Bachatamanía) - su edición queda para el sábado siguiente.
  await mkSeries("Social con Estilo", carlos.id, orixas.id, "2x/month:sat", 6000, 8000, 6, [fabian.id], ALL3, [], 1,
    // 4 salsas, 2 bachatas, 2 salsas, 2 timbas, 2 bachatas → 50/33/17
    mix([Genre.SALSA, 4], [Genre.BACHATA, 2], [Genre.SALSA, 2], [Genre.CUBANO, 2], [Genre.BACHATA, 2]));
  // Trilogía - 5ta edición este sábado en Orixas: la noche compartida de
  // @bachatamaniacl y @socialconestilo que produce Carlos. Mezcla de
  // pista 50% bachata / 40% salsa / 10% timba (el flyer la anuncia como
  // "50% salsa · 50% bachata" - la data del producto es la del flyer
  // operativo). Aforo 350 en tres tramos: 100 socios/convenios/
  // cumpleaños a $5.000 (lista del productor), 200 preventa a $6.000,
  // 50 en puerta a $8.000.
  const PROG_TRILOGIA: ProgramItem[] = [
    { t: "20:30", label: "Apertura de puertas" },
    {
      t: "21:00",
      end: "22:00",
      label: "Clase de salsa y bachata gratis con tu entrada",
    },
    { t: "22:00", label: "Inicio del social" },
    { t: "00:00", label: "Shows" },
    { t: "00:30", label: "Cumpleaños" },
    { t: "03:45", label: "Cierre del social" },
  ];
  const trilogia = await mkSeries("Trilogía", carlos.id, orixas.id, "1x/month:sat", 6000, 8000, 6, [fabian.id, cesar.id, criss.id], ALL3, [], 0,
    // 5 bachatas, 4 salsas, 1 timba por ciclo → 50/40/10
    mix([Genre.BACHATA, 5], [Genre.SALSA, 4], [Genre.CUBANO, 1]),
    PROG_TRILOGIA);
  await prisma.event.update({
    where: { id: trilogia.id },
    data: {
      capacity: 350,
      presaleCap: 200,
      doorCap: 50,
      description:
        "TRILOGÍA / 5TA EDICIÓN – CLUB ORIXAS\n\n" +
        "¡Llegamos a nuestra 5TA EDICIÓN! Una noche creada para quienes realmente viven la pista, donde la salsa y la bachata encuentran su equilibrio perfecto. Dos marcas hermanas vuelven a unirse: @bachatamaniacl y @socialconestilo.\n\n" +
        "3 DJs en escena: DJ Fabián Valladares (@fabian__valladares), DJ Moreno (@cesar_moreno06) y DJ Criss (@djcrissbsoul). Shows: coreográfico Salsa Ladies by @michellekarime, pareja de bachata @piter.zs & @sofi.jashram y DF Mens Company by @diegoreyes_official.\n\n" +
        "Solo 350 entradas: 100 soci@s/convenios/cumpleaños a $5.000, 200 preventa general a $6.000 y 50 en puerta a $8.000 - una vez agotado cada stock se cierra ese valor. Agenda abierta para celebración de cumpleaños. Clase de salsa y bachata gratis con tu entrada. Auspiciador oficial: @bonett.garments.",
    },
  });
  // Tramo especial del flyer ($5.000 - socios, convenios y cumpleaños):
  // va como lista de invitados del productor con precio especial.
  const trilogiaList = await ensure(
    () =>
      prisma.guestList.findFirst({
        where: { eventId: trilogia.id, ownerId: carlos.id },
      }),
    () =>
      prisma.guestList.create({
        data: {
          eventId: trilogia.id,
          ownerId: carlos.id,
          label: "Socios, convenios y cumpleaños",
          specialPrice: 5000,
        },
      }),
  );
  // Entradas de la lista - la agenda de cumpleaños/convenios ya va
  // llenándose (Mónica celebra el suyo; el resto son socios de las dos
  // marcas organizadoras).
  for (const p of [monica, maria, camila, josefa, felipe]) {
    await prisma.guestListEntry.upsert({
      where: {
        guestListId_personId: {
          guestListId: trilogiaList.id,
          personId: p.id,
        },
      },
      update: {},
      create: { guestListId: trilogiaList.id, personId: p.id },
    });
  }
  // Los shows del flyer van en showRosters["Trilogía"] (abajo) - el
  // generador genérico recrea la cartelera de cada evento publicado.
  await mkSeries("Ashe", cesar.id, orixas.id, "1x/month:sat", 6000, 8000, 6, [cesar.id], [Genre.CUBANO], [], 1,
    // Pura timba
    mix([Genre.CUBANO, 1]));

  // Tierra - el miércoles es de DJ Krrera: "Bachata con Salsa" (ig
  // @bachataclub), serie propia del productor como Bachatamanía en
  // Orixas. Clase 21:30, entrada liberada hasta 23:45 (después
  // $5.000 en puerta), cierre 02:00.
  const PROG_BCS: ProgramItem[] = [
    { t: "21:00", label: "Apertura de puertas" },
    { t: "21:30", end: "22:30", label: "Clase de bachata" },
    { t: "22:30", label: "Inicio del social" },
    { t: "Hasta 23:45", label: "Entrada liberada" },
    { t: "02:00", label: "Cierre del social" },
  ];
  const bcsEvent = await mkSeries(
    "Bachata con Salsa", krrera.id, tierraDura.id, "weekly:wed",
    // preventa $0 (entrada liberada) hasta 23:45; puerta $5.000 después.
    0, 5000, 3, [krrera.id],
    [Genre.BACHATA, Genre.SALSA], [], 0,
    // 4 bachatas, 2 salsas → 67/33
    mix([Genre.BACHATA, 4], [Genre.SALSA, 2]),
    PROG_BCS,
  );
  // mkSeries asume 22:00→04:00 - la noche real abre 21:00 y cierra 02:00.
  // La entrada liberada ES la preventa $0 (spec event-presale-cutoff):
  // corte propio a las 23:45 del día del evento (1425 min) - desde ahí la
  // app vende a doorPrice. El item "Hasta 23:45" del programa queda como
  // copy; la regla real vive en presaleCutoffMinutes.
  await prisma.event.update({
    where: { id: bcsEvent.id },
    data: {
      startsAt: nextDay(3, 21),
      endsAt: nextDay(3, 26),
      presaleCutoffMinutes: 23 * 60 + 45,
    },
  });

  // Noches standalone (sin serie) - nombre = marca de la noche. Las
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

  // Tierra - programación mensual con la rotación real: martes fijo
  // Bachata Club, jueves alterna Switch/AbraZouk, vie+sáb rotan
  // Exóticas/Bachatazo/Galaxy/BC/Lovers. El miércoles lo produce DJ
  // Krrera con su serie "Bachata con Salsa" (arriba - no es standalone).
  // Puerta siempre > preventa: mar $6.000, jue a sáb $7.000.
  const PURE_B = mix([Genre.BACHATA, 1]);
  const GALAXY_MIX = mix([Genre.BACHATA, 5], [Genre.SALSA, 2]); // 5×2
  const tierraNights: [string, number, number, Genre[], MixBlock[] | null][] = [
    // [nombre, weekday, weeksAhead, genres, ciclo de mezcla]
    ["Bachata Club", 2, 0, [Genre.BACHATA], PURE_B],
    ["Bachata Club", 2, 1, [Genre.BACHATA], PURE_B],
    ["Bachata Club", 2, 2, [Genre.BACHATA], PURE_B],
    ["Bachata Club", 2, 3, [Genre.BACHATA], PURE_B],
    ["Switch", 4, 0, [Genre.BACHATA], PURE_B],
    ["AbraZouk", 4, 1, [], null], // zouk - sin género en el catálogo
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

  // Havana - programación mensual: cada viernes y sábado tiene su
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
  // - noche sáb") y duplicados nombre+fecha (misma noche, mismo día).
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
  step("shows de la noche…");
  // Formato real: academia (texto libre - puede no estar registrada),
  // tipo de team (BOOTCAMP | ALUMNOS | OPEN | PRO | AMATEUR) y nombre de
  // la coreografía. TODOS los eventos tienen shows; el volumen crece con
  // el día: vie/sáb son las noches grandes (6), jueves medio (4), el
  // resto base (2–3). Determinista por evento - el reseed no varía.
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
    // Trilogía 5ta edición - los 3 shows del flyer (teams sin academia
    // registrada → `academy` es texto libre, academyId queda null).
    "Trilogía": [
      {
        academy: "Salsa Ladies by @michellekarime",
        teamType: "ALUMNOS",
        name: "Coreográfico Salsa Ladies",
      },
      { academy: "@piter.zs & @sofi.jashram", teamType: "PRO", name: "Pareja de bachata" },
      {
        academy: "DF Mens Company by @diegoreyes_official",
        teamType: "PRO",
        name: "DF Mens Company",
      },
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
  step("fees de productores…");
  // Defaults del productor: el admin los edita en /admin/parametros;
  // el productor los ve read-only en /productor/parametros.
  await prisma.producerParams.upsert({
    where: { producerId: carlos.id },
    update: {},
    create: {
      producerId: carlos.id,
      platformFeePct: 5,
      // Defaults de mesas del productor: sus eventos nuevos los heredan
      // salvo override. El cupo sentable (40) es menor que el aforo del
      // evento - es el total real contra el que valida el checkout.
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
  // ninguno (los tres en null) - no pisa ediciones hechas en /productor/
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
  // 8 por mesa, 60 personas sentables - menos que su aforo).
  await prisma.event.update({
    where: { id: bachatamania.id },
    data: {
      platformFeePct: 10,
      tablesTotal: 10,
      tableSeatMax: 8,
      tableSeatsTotal: 60,
    },
  });
  // Las noches grandes de fin de semana también ofrecen mesa - hace la
  // sección de checkout descubrible en la demo sin depender de un solo
  // evento. 8 mesas × máx. 6 personas = 48 asientos (aforo es mayor).
  await prisma.event.updateMany({
    where: {
      status: "PUBLISHED",
      name: { in: ["Viernes Sabroso", "Sábado con Sabrosura", "Bachatazo", "La Gozadera"] },
    },
    data: { tablesTotal: 8, tableSeatMax: 6, tableSeatsTotal: 48 },
  });

  // ─── Edición pasada - alimenta analytics (GMV, check-ins) e historial ───
  step("edición pasada…");
  const lastWeek = new Date(Date.now() - 7 * 86_400_000);
  const prevEdition = await ensure(
    () =>
      prisma.event.findFirst({
        where: { name: "Bachatamanía - edición anterior" },
      }),
    () =>
      prisma.event.create({
        data: {
          seriesId: bachatamania.seriesId,
          venueId: orixas.id,
          producerId: carlos.id,
          name: "Bachatamanía - edición anterior",
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

  // ─── MuéveteOnTour como productor (consola del productor) ───
  step("eventos muvet productor…");
  // Edición anterior de Desafío de Tronos (CLOSED): entradas usadas,
  // pagos PAID y check-ins alimentan los tops del dashboard del
  // productor (facturación histórica + asistencia).
  const desafioPrev = await ensure(
    () =>
      prisma.event.findFirst({
        where: { name: "Desafío de Tronos - edición anterior" },
      }),
    () =>
      prisma.event.create({
        data: {
          seriesId: desafioTronos.seriesId,
          venueId: orixas.id,
          producerId: muvetOwner.id,
          name: "Desafío de Tronos - edición anterior",
          status: "CLOSED",
          startsAt: new Date(lastWeek.getTime() - 14 * 86_400_000),
          endsAt: new Date(
            lastWeek.getTime() - 14 * 86_400_000 + 6 * 3_600_000,
          ),
          presalePrice: 6000,
          doorPrice: 8000,
          capacity: 300,
        },
      }),
  );
  for (const [i, p] of [
    camila,
    josefa,
    diego,
    antonia,
    daniela,
    felipe,
    monica,
    maria,
    eduardo,
    dancer,
  ].entries()) {
    await ensure(
      () =>
        prisma.ticket.findFirst({
          where: { eventId: desafioPrev.id, ownerId: p.id },
        }),
      () =>
        prisma.ticket.create({
          data: {
            eventId: desafioPrev.id,
            ownerId: p.id,
            buyerId: p.id,
            listPrice: 6000,
            serviceFee: 600,
            status: "USED",
          },
        }),
    );
    await prisma.payment.upsert({
      where: { refId: `seed-desafioprev-${desafioPrev.id.slice(-6)}-${i}` },
      update: {},
      create: {
        orderType: "TICKET",
        refId: `seed-desafioprev-${desafioPrev.id.slice(-6)}-${i}`,
        personId: p.id,
        eventId: desafioPrev.id,
        amount: 6600,
        fee: 240,
        net: 6360,
        status: "PAID",
        createdAt: new Date(desafioPrev.startsAt.getTime() - 4 * 86_400_000),
      },
    });
    // 8 de 10 entran - el evento pasado lidera el top de asistencia.
    if (i < 8) {
      await ensure(
        () =>
          prisma.checkin.findFirst({
            where: { eventId: desafioPrev.id, personId: p.id },
          }),
        () =>
          prisma.checkin.create({
            data: {
              eventId: desafioPrev.id,
              personId: p.id,
              staffId: staff.id,
              method: "SCAN",
              inAt: new Date(desafioPrev.startsAt.getTime() + 100 * 60_000),
            },
          }),
      );
    }
  }

  // Ventas del mes en curso sobre los eventos próximos de muvet:
  // entradas ACTIVE + pagos PAID recientes → KPIs "Entradas vendidas"
  // y "Facturación mensual" del dashboard.
  const muvetSales: { ev: { id: string }; buyers: (typeof camila)[] }[] = [
    { ev: desafioTronos, buyers: [camila, josefa, diego, antonia, monica] },
    { ev: muvetSocial, buyers: [daniela, felipe, maria] },
  ];
  for (const { ev, buyers } of muvetSales) {
    for (const [i, p] of buyers.entries()) {
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
              listPrice: 5000,
              serviceFee: 500,
            },
          }),
      );
      await prisma.payment.upsert({
        where: { refId: `seed-muvetsale-${ev.id.slice(-6)}-${i}` },
        update: {},
        create: {
          orderType: "TICKET",
          refId: `seed-muvetsale-${ev.id.slice(-6)}-${i}`,
          personId: p.id,
          eventId: ev.id,
          amount: 5500,
          fee: 200,
          net: 5300,
          status: "PAID",
          createdAt: new Date(Date.now() - (i + 2) * 86_400_000),
        },
      });
    }
  }

  // Lista de invitados del próximo Desafío - alimenta la sección de
  // listas dentro de la ficha del evento.
  const desafioList = await ensure(
    () =>
      prisma.guestList.findFirst({
        where: { eventId: desafioTronos.id, ownerId: muvetOwner.id },
      }),
    () =>
      prisma.guestList.create({
        data: {
          eventId: desafioTronos.id,
          ownerId: muvetOwner.id,
          label: "Cumpleaños y staff de academia",
          specialPrice: 4000,
        },
      }),
  );
  for (const p of [sebastian, camila, daniela, rodrigo]) {
    await prisma.guestListEntry.upsert({
      where: {
        guestListId_personId: {
          guestListId: desafioList.id,
          personId: p.id,
        },
      },
      update: {},
      create: { guestListId: desafioList.id, personId: p.id },
    });
  }

  // Cola "Cobros por revisar": órdenes MANUAL pendientes con su
  // comprobante declarado - transferencia y link de pago (mismo
  // contrato que POST /payments/:id/claims: gateway MANUAL +
  // status PENDING del payment).
  for (const [i, { p, ev, methodType, methodLabel }] of [
    {
      p: josefa,
      ev: desafioTronos,
      methodType: "TRANSFER",
      methodLabel: "Transferencia",
    },
    {
      p: diego,
      ev: muvetSocial,
      methodType: "LINK",
      methodLabel: "MercadoPago",
    },
    {
      p: antonia,
      ev: desafioTronos,
      methodType: "TRANSFER",
      methodLabel: "Transferencia",
    },
  ].entries()) {
    const order = await prisma.payment.upsert({
      where: { refId: `seed-muvetclaim-${i}` },
      update: {},
      create: {
        orderType: "TICKET",
        refId: `seed-muvetclaim-${i}`,
        personId: p.id,
        eventId: ev.id,
        amount: 5500,
        fee: 200,
        net: 5300,
        status: "PENDING",
        gateway: "MANUAL",
      },
    });
    await prisma.ticketClaim.upsert({
      where: { id: `seed-muvetclaim-${i}` },
      update: {},
      create: {
        id: `seed-muvetclaim-${i}`,
        paymentId: order.id,
        personId: p.id,
        producerId: muvetOwner.id,
        receiptKey: `claims/${muvetOwner.id}/seed-receipt-${i}.png`,
        methodType,
        methodLabel,
        note: "Comprobante de prueba del seed",
      },
    });
  }

  // ─── Aforo de eventos (todos los productores) ───
  step("aforo de eventos…");
  // Cada evento del demo recibe su aforo realista: 150-350 entradas
  // según día - viernes y sábado se llenan (250-350), el resto
  // (150-250). Determinístico por hash del id: mismos números entre
  // corridas y sin crecer en reseed (skip por conteo).
  // El pool son los bailarines ya sembrados (relleno de academias +
  // cuentas demo): una persona puede tener entrada en eventos
  // distintos, nunca dos en el mismo.
  const attendeePool = await prisma.person.findMany({
    where: {
      roles: { some: { role: "DANCER", status: "APPROVED" } },
      email: { endsWith: `@${DEV_DOMAIN}` },
    },
    select: { id: true },
  });
  const fillableEvents = await prisma.event.findMany({
    where: { status: { in: ["PUBLISHED", "LIVE", "CLOSED"] } },
    select: {
      id: true,
      name: true,
      startsAt: true,
      presalePrice: true,
      doorPrice: true,
    },
  });
  for (const ev of fillableEvents) {
    if (isTestName(ev.name)) continue;
    let h = 0;
    for (const ch of ev.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const wd = ev.startsAt.getDay();
    const weekend = wd === 5 || wd === 6; // vie/sáb
    const target = weekend ? 250 + (h % 101) : 150 + (h % 101);
    const existing = await prisma.ticket.count({
      where: { eventId: ev.id },
    });
    if (existing >= target) continue;
    const taken = new Set(
      (
        await prisma.ticket.findMany({
          where: { eventId: ev.id },
          select: { ownerId: true },
        })
      ).map((tk) => tk.ownerId),
    );
    const buyers = attendeePool
      .filter((p) => !taken.has(p.id))
      .slice(0, target - existing);
    if (buyers.length === 0) continue;
    const past = ev.startsAt.getTime() < Date.now();
    const unit = ev.presalePrice ?? ev.doorPrice ?? 5000;
    const svc = Math.round(unit * 0.1);
    await prisma.ticket.createMany({
      data: buyers.map((b) => ({
        eventId: ev.id,
        ownerId: b.id,
        buyerId: b.id,
        listPrice: unit,
        serviceFee: svc,
        status: past ? "USED" : "ACTIVE",
      })),
    });
    await prisma.payment.createMany({
      data: buyers.map((b, i) => ({
        orderType: "TICKET",
        refId: `seed-aforo-${ev.id.slice(-6)}-${i}`,
        personId: b.id,
        eventId: ev.id,
        amount: unit + svc,
        fee: Math.round(unit * 0.04),
        net: unit + svc - Math.round(unit * 0.04),
        status: "PAID" as const,
        // Compra distribuida en la semana previa al evento.
        createdAt: new Date(
          ev.startsAt.getTime() - (3 + (i % 7)) * 86_400_000,
        ),
      })),
    });
    // Check-ins solo en eventos pasados: ~85% de los compradores
    // efectivamente entró (el resto son no-shows realistas).
    if (past) {
      await prisma.checkin.createMany({
        data: buyers.slice(0, Math.floor(buyers.length * 0.85)).map(
          (b, i) => ({
            eventId: ev.id,
            personId: b.id,
            staffId: staff.id,
            method: "SCAN",
            inAt: new Date(
              ev.startsAt.getTime() + (60 + (i % 90)) * 60_000,
            ),
          }),
        ),
      });
    }
  }

  // ─── Reservas de mesa ───
  step("reservas de mesa…");
  // Los eventos con mesas habilitadas reciben solicitudes: pendientes
  // (REQUESTED - la cola que el productor aprueba en la ficha del
  // evento), confirmadas con número de mesa y una cancelada.
  const tableEvents: { ev: { id: string }; tables: number }[] = [
    { ev: desafioTronos, tables: 12 },
    { ev: muvetSocial, tables: 8 },
    { ev: trilogia, tables: 15 },
  ];
  for (const [ei, { ev, tables }] of tableEvents.entries()) {
    await prisma.event.update({
      where: { id: ev.id },
      data: {
        tablesTotal: tables,
        tableSeatMax: 8,
        tableSeatsTotal: tables * 8,
      },
    });
    const requesters = attendeePool.slice(ei * 8, ei * 8 + 6);
    for (const [ri, rq] of requesters.entries()) {
      await ensure(
        () =>
          prisma.tableReservation.findFirst({
            where: { eventId: ev.id, personId: rq.id },
          }),
        () =>
          prisma.tableReservation.create({
            data: {
              eventId: ev.id,
              personId: rq.id,
              partySize: 4 + (ri % 5),
              status:
                ri < 3 ? "REQUESTED" : ri < 5 ? "CONFIRMED" : "CANCELLED",
              tableNo:
                ri >= 3 && ri < 5 ? `M${ri + 1}` : null,
            },
          }),
      );
    }
  }

  // ─── Data social / operativa sobre eventos próximos ───
  step("data social de eventos…");
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

  // Amistades: clique ACCEPTED entre los bailarines demo - cualquier
  // cuenta demo ve amigos en /amigos y "amigos que van" en los eventos.
  // Respeta la dirección de filas existentes (una PENDING previa entre
  // dos del clique se promueve a ACCEPTED sin duplicar el par).
  // Gabriel, Mónica y María van en el clique - son las cuentas reales
  // de prueba y necesitan la red social completa (amigos, "amigos que
  // van", solicitudes) desde el primer login.
  const clique = [
    dancer,
    camila,
    josefa,
    diego,
    antonia,
    daniela,
    gabriel,
    monica,
    maria,
    eduardo,
  ];
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
  // Solicitudes pendientes con gente fuera del clique - mantienen el
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
  // Solicitud entrante para Mónica - su bandeja de /amigos muestra la
  // cola desde el primer login.
  await prisma.friendship.upsert({
    where: { aId_bId: { aId: sebastian.id, bId: monica.id } },
    update: {},
    create: { aId: sebastian.id, bId: monica.id, status: "PENDING" },
  });

  // Entradas ACTIVE del clique en los próximos eventos - alimentan la
  // sección "amigos que van" del detalle y el feed "Tus amigos van a" de
  // /amigos. Distribución fija sobre los 3 próximos publicados.
  // Se filtra a futuros y sin residuos E2E: pubEvents incluye eventos
  // pasados y, en la primera corrida, fixtures que el cleanup del final
  // aún no borró (un ticket sobre esos eventos moriría en la cascada).
  const nowTs = Date.now();
  const nextPubEvents = pubEvents.filter(
    (e) => e.startsAt.getTime() >= nowTs && !isTestName(e.name),
  );
  const goingPlan: [number, { id: string }[]][] = [
    [0, [camila, josefa, diego, antonia, gabriel, monica]],
    [1, [camila, daniela, maria, eduardo]],
    [2, [josefa, diego, gabriel]],
  ];
  for (const [evIdx, people] of goingPlan) {
    const ev = nextPubEvents[evIdx];
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
  // Gabriel ya compró su preventa de Trilogía - su perfil de bailarín
  // muestra la entrada del sábado igual que la de cualquier dancer.
  // (Mónica y María van por la lista $5.000 - entrada arriba en la
  // sección del evento.)
  await ensure(
    () =>
      prisma.ticket.findFirst({
        where: { eventId: trilogia.id, ownerId: gabriel.id, status: "ACTIVE" },
      }),
    () =>
      prisma.ticket.create({
        data: {
          eventId: trilogia.id,
          ownerId: gabriel.id,
          buyerId: gabriel.id,
          listPrice: 6000,
          serviceFee: 600,
        },
      }),
  );

  // Roles de baile autodeclarados (PersonStyleRole) - alimentan la sección
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
    styleRole(sebastian, "Mambo on2", "LEADER", "intermedio"),
    styleRole(francisca, "Bachata sensual", "FOLLOWER", "principiante"),
    styleRole(felipe, "Timba", "LEADER", "intermedio"),
    styleRole(felipe, "Salsa cubana (casino)", "SWITCH", "principiante"),
    styleRole(daniela, "Bachata sensual", "FOLLOWER", "principiante"),
    // Instructores y DJs también bailan social - sus perfiles lo reflejan.
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
    // Gabriel (Mambo Madness): mambo on2 / bachata sensual / cubano,
    // los tres leader avanzado.
    styleRole(gabriel, "Mambo on2", "LEADER", "avanzado"),
    styleRole(gabriel, "Bachata sensual", "LEADER", "avanzado"),
    styleRole(gabriel, "Cubano", "LEADER", "avanzado"),
    // Mónica - alumna de Adrian y Leo: mambo follower en progreso.
    styleRole(monica, "Mambo on2", "FOLLOWER", "básico"),
    styleRole(monica, "Bachata sensual", "FOLLOWER", "intermedio"),
    // María - profe de iniciación y alumna Intermedio: baila ambos
    // roles (SWITCH) en mambo, follower avanzada en bachata.
    styleRole(maria, "Mambo on2", "SWITCH", "avanzado"),
    styleRole(maria, "Bachata sensual", "FOLLOWER", "avanzado"),
    styleRole(maria, "Salsa cubana (casino)", "FOLLOWER", "intermedio"),
    styleRole(eduardo, "Mambo on2", "LEADER", "intermedio"),
    styleRole(eduardo, "Bachata sensual", "LEADER", "intermedio"),
    // Adrián y Leo - su perfil público muestra el estilo de la casa.
    styleRole(adrian, "Mambo on2", "LEADER", "avanzado"),
    styleRole(leo, "Mambo on2", "LEADER", "avanzado"),
  ]);

  // Handles de Instagram - alimentan la fila "@handle" del perfil del
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
    ig(krrera, "bachataclub"),
    ig(ardilla, "ardilla.dance"),
    ig(gabriel, "gabomadness"),
    ig(monica, "moni.soto"),
    ig(maria, "majose.herrera"),
    ig(eduardo, "eduardosalasg"),
    ig(adrian, "adrian.mambo"),
    ig(leo, "leo.campos"),
  ]);
  // Teléfono real de Gabriel (contacto del owner de Mambo Madness).
  await prisma.person.update({
    where: { id: gabriel.id },
    data: { phone: "+56959372339" },
  });

  // ─── Prácticas - Event type=PRACTICA, hostId=creador bailarín ───
  step("prácticas…");
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
            // Las prácticas nunca se vinculan a un Venue del catálogo -
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
  await practice("Práctica de casino - rueda abierta", dancer, 6, 16, 15, {
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
  await practice("Práctica de salsa on1 - línea y tiempo", vale, 2, 19, 20, {
    venueText: "Studio Rame",
    venueNotes: "Sala 1 - Metro Salvador",
    description:
      "Trabajamos línea, tiempo y marcas básicas. Nivel abierto: si sabes el básico, alcanzas. Consultas por interno.",
  });
  // Sin aforo declarado → card sin badge de cupos.
  const timbaPractice = await practice("Timba para todos - práctica libre", jesus, 4, 18, null, {
    venueText: "Plaza Ñuñoa",
    venueNotes: "Junto a la pila central",
    description:
      "Timba libre con parlante propio. Todos los niveles - si vienes a mirar, terminas bailando.",
  });

  // RSVPs "voy" - alimentan el badge "N van" y el estado del PracticeBar.
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
  step("sesiones de baile…");
  // Historial sobre la edición pasada de Bachatamanía (evento CLOSED) +
  // invitaciones vivas sobre la próxima - cubre todas las ramas de
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
      // anchors relativos al presente (at(), liveAt(), scannedNow) - sin
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
  // Historial entre otros del clique - visible al entrar con sus cuentas.
  await session(prevEdition.id, diego, camila, "RATED", at(70), "Bachata sensual", [
    [diego, 5],
    [camila, 4],
  ]);
  await session(prevEdition.id, antonia, daniela, "CONFIRMED", at(110), "Salsa cubana (casino)", [
    [antonia, 5],
  ]);
  await session(prevEdition.id, josefa, diego, "CONFIRMED", at(145), "Timba");
  // Gabriel/Mónica/María también bailaron la edición pasada - sus
  // /bailes arrancan con historial, no con una lista vacía.
  await session(prevEdition.id, gabriel, antonia, "RATED", at(80), "Bachata sensual", [
    [gabriel, 5],
    [antonia, 5],
  ]);
  await session(prevEdition.id, vale, gabriel, "RATED", at(140), "Mambo on2", [
    [vale, 5],
    [gabriel, 5],
  ]);
  await session(prevEdition.id, monica, diego, "CONFIRMED", at(100), "Bachata sensual", [
    [diego, 4],
  ]);
  await session(prevEdition.id, felipe, monica, "CONFIRMED", at(170), "Mambo on2");
  await session(prevEdition.id, maria, sebastian, "RATED", at(120), "Mambo on2", [
    [maria, 5],
    [sebastian, 5],
  ]);
  await session(prevEdition.id, gabriel, maria, "CONFIRMED", at(190), "Mambo on2");
  // Eduardo bailó la edición pasada - su /bailes arranca con historial.
  await session(prevEdition.id, eduardo, camila, "RATED", at(75), "Bachata sensual", [
    [eduardo, 4],
    [camila, 5],
  ]);
  await session(prevEdition.id, daniela, eduardo, "CONFIRMED", at(155), "Mambo on2");

  // Invitaciones vivas - solo existen dentro de una noche en curso:
  // nacen del escaneo en pista y expiran ~24h después (spec §4). El seed
  // crea un evento LIVE esta noche para anclarlas; reseed refresca la
  // ventana y el scannedAt para que la demo no envejezca.
  const liveEvent = await ensure(
    () => prisma.event.findFirst({ where: { name: "Social en vivo - demo" } }),
    () =>
      prisma.event.create({
        data: {
          name: "Social en vivo - demo",
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
  // ha escaneado en un evento que no ocurre) - limpia residuos de seeds
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

  // Bailes ya resueltos de esta misma noche - alimentan el card
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
  // Camila: su propia noche - el card también debe verse rico en su cuenta.
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
  // Los perfiles reales también están en la pista esta noche.
  await session(liveEvent.id, gabriel, camila, "RATED", liveAt(15), "Bachata sensual", [
    [gabriel, 5],
    [camila, 4],
  ]);
  await session(liveEvent.id, monica, diego, "CONFIRMED", liveAt(25), "Mambo on2");
  await session(liveEvent.id, maria, gabriel, "CONFIRMED", liveAt(55), "Mambo on2");
  await session(liveEvent.id, daniela, monica, "CONFIRMED", liveAt(65), "Bachata sensual");

  // ─── Gamificación - actividad real que produce badges/puntos/rachas ───
  step("gamificación…");
  // Dos ediciones más de Bachatamanía (hace 2 y 3 semanas) con sesiones
  // resueltas del clique. Las rachas semanales, los puntos de temporada y
  // los badges por conducta se derivan de esta actividad con las mismas
  // reglas del dominio - no se fabrican números de exhibición.
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
    "Bachatamanía - hace 2 semanas",
    weeksAgo(2),
  );
  const edition3 = await pastEdition(
    "Bachatamanía - hace 3 semanas",
    weeksAgo(3),
  );
  const atEdition = (ev: { startsAt: Date }, min: number) =>
    new Date(ev.startsAt.getTime() + min * 60_000);

  // Check-ins tempranos (21:30 - antes del cutoff madrugador) en las
  // ediciones pasadas: alimentan puntos early_checkin y el badge
  // madrugador. La hora es fija - no depende de cuándo corre el seed.
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
        gabriel,
        monica,
        maria,
        eduardo,
      ],
    ],
    [edition3, [dancer, camila, josefa, diego, antonia, daniela, monica, maria]],
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
  // Los perfiles reales en la edición -2.
  await session(edition2.id, gabriel, josefa, "CONFIRMED", atEdition(edition2, 105), "Bachata sensual");
  await session(edition2.id, monica, felipe, "CONFIRMED", atEdition(edition2, 135), "Mambo on2");
  await session(edition2.id, sebastian, maria, "RATED", atEdition(edition2, 165), "Mambo on2", [
    [sebastian, 5],
    [maria, 5],
  ]);
  await session(edition2.id, maria, diego, "CONFIRMED", atEdition(edition2, 225), "Salsa cubana (casino)");

  // Edición -3 - sostiene la tercera semana de las rachas del clique.
  await session(edition3.id, dancer, antonia, "CONFIRMED", atEdition(edition3, 70), "Bachata sensual", [
    [antonia, 5],
  ]);
  await session(edition3.id, josefa, diego, "RATED", atEdition(edition3, 100), "Timba", [
    [josefa, 4],
    [diego, 4],
  ]);
  await session(edition3.id, camila, daniela, "CONFIRMED", atEdition(edition3, 130), "Salsa cubana (casino)");
  await session(edition3.id, sebastian, josefa, "CONFIRMED", atEdition(edition3, 160), "Bachata sensual");
  await session(edition3.id, monica, gabriel, "CONFIRMED", atEdition(edition3, 90), "Mambo on2");
  await session(edition3.id, maria, antonia, "CONFIRMED", atEdition(edition3, 140), "Bachata sensual");

  // Temporada activa del año - los puntos del ledger se posicionan por
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

  // Puntos de temporada - mismo accrual del dominio: session_confirmed a
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

  // ─── Data de consolas - productor / DJ / venue ───
  step("data de consolas…");

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
  // residente) - sin EventDj el gig no aparece en /dj/gigs ni puede ver
  // su evaluación de música.
  for (const ev of [prevEdition, edition2, edition3]) {
    await prisma.eventDj.upsert({
      where: { eventId_personId: { eventId: ev.id, personId: matias.id } },
      update: {},
      create: { eventId: ev.id, personId: matias.id },
    });
  }

  // Evaluaciones post-evento (spec §5): agregados por actor - música →
  // DJ, ocupación/organización → productor, piso/temperatura/sonido →
  // venue. ≥3 evaluaciones por edición para que los promedios superen
  // la k-anonymity del resumen. Sin texto libre, rater privado.
  type EventDims = {
    overall?: number;
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
      update: dims,
      create: { eventId, raterId, ...dims },
    });
  const eventRaters = [dancer, camila, josefa, diego, antonia, daniela];
  const prevDims: EventDims[] = [
    { overall: 5, music: 5, occupation: 4, organization: 5, floorComfort: 4, temperature: 3, lightingSound: 4 },
    { overall: 4, music: 4, occupation: 5, organization: 4, floorComfort: 5, temperature: 4, lightingSound: 5 },
    { overall: 5, music: 5, occupation: 4, organization: 5, floorComfort: 4, temperature: 4, lightingSound: 4 },
    { overall: 3, music: 4, occupation: 4, organization: 4, floorComfort: 4, temperature: 2, lightingSound: 4 },
    { overall: 5, music: 5, occupation: 5, organization: 5, floorComfort: 5, temperature: 3, lightingSound: 5 },
    { overall: 4, music: 4, occupation: 4, organization: 4, floorComfort: 3, temperature: 3, lightingSound: 4 },
  ];
  const ed2Dims: EventDims[] = [
    { overall: 5, music: 5, occupation: 5, organization: 5, floorComfort: 5, temperature: 4, lightingSound: 5 },
    { overall: 4, music: 5, occupation: 4, organization: 5, floorComfort: 4, temperature: 3, lightingSound: 4 },
    { overall: 5, music: 4, occupation: 5, organization: 4, floorComfort: 5, temperature: 4, lightingSound: 5 },
    { overall: 4, music: 5, occupation: 4, organization: 4, floorComfort: 4, temperature: 3, lightingSound: 4 },
  ];
  for (const [i, p] of eventRaters.entries()) {
    await rateEvent(prevEdition.id, p.id, prevDims[i]);
    if (i < ed2Dims.length) await rateEvent(edition2.id, p.id, ed2Dims[i]);
  }
  // Edición -3 queda bajo el umbral (2 evaluaciones) - demuestra el
  // estado "insuficientes evaluaciones" de la consola del DJ.
  await rateEvent(edition3.id, dancer.id, {
    overall: 4,
    music: 4,
    organization: 4,
  });
  await rateEvent(edition3.id, camila.id, { overall: 5, music: 5, floorComfort: 4 });

  // Operación en curso del evento LIVE: check-ins de pista (SCAN) y un
  // par de ventas manuales de puerta (MANUAL, sin Payment) + una venta
  // de puerta por la app - alimentan el tablero /events/:id/live.
  const liveAttendees = [
    camila,
    josefa,
    antonia,
    daniela,
    felipe,
    vale,
    gabriel,
    monica,
    maria,
  ];
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
  // El DJ del evento en vivo - su gig aparece en /dj/gigs.
  await prisma.eventDj.upsert({
    where: { eventId_personId: { eventId: liveEvent.id, personId: steban.id } },
    update: {},
    create: { eventId: liveEvent.id, personId: steban.id },
  });

  // Rachas semanales - el KPI del home lee Streak (WEEKLY_OUT); se
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

  // Badges ganados por conducta - se otorgan con las mismas reglas del
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
    gabriel,
    monica,
    maria,
    eduardo,
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
  // ritual) - bailarin_constante destacado del demo y corona Prime Time
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

  // Lista de invitados + mesa - operación social del evento.
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
  // Mesa confirmada con número asignado - el venue la ve en su
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
  // Mesa de Gabriel en Bachatamanía y la de cumpleaños de Mónica en
  // Trilogía - el flyer abre agenda para celebraciones y su lista
  // especial $5.000 cubre "cumpleaños".
  await ensure(
    () =>
      prisma.tableReservation.findFirst({
        where: { eventId: bachatamania.id, personId: gabriel.id },
      }),
    () =>
      prisma.tableReservation.create({
        data: {
          eventId: bachatamania.id,
          personId: gabriel.id,
          partySize: 8,
          tableNo: "M5",
          status: "CONFIRMED",
        },
      }),
  );
  await ensure(
    () =>
      prisma.tableReservation.findFirst({
        where: { eventId: trilogia.id, personId: monica.id },
      }),
    () =>
      prisma.tableReservation.create({
        data: {
          eventId: trilogia.id,
          personId: monica.id,
          partySize: 8,
          status: "REQUESTED",
        },
      }),
  );

  // Sugerencias de canciones - ranking en la consola /dj de Steban.
  const songs: [string, string, string][] = [
    [juevesCubano.id, "La Vida Es Un Carnaval", "Celia Cruz"],
    [juevesCubano.id, "La Vida Es Un Carnaval", "Celia Cruz"],
    [juevesCubano.id, "Obsesión", "Aventura"],
    [juevesCubano.id, "Llorarás", "Oscar D'León"],
    [juevesCubano.id, "Llorarás", "Oscar D'León"],
    [juevesCubano.id, "Llorarás", "Oscar D'León"],
    [trilogia.id, "La Gozadera", "Gente de Zona"],
    [trilogia.id, "Propuesta Indecente", "Romeo Santos"],
  ];
  const suggesters = [
    camila,
    josefa,
    diego,
    antonia,
    daniela,
    dancer,
    monica,
    maria,
  ];
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

  // Pase de serie del mes vigente - badge de "pase activo" en checkout.
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

  // Arriendos del venue - consola /venue los confirma/cancela.
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

  // Notificaciones in-app - el badge de la campana muestra pendientes.
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
    "Se liberó un cupo en Bachata Sensual - Básico",
  );
  await notif(
    dancer.id,
    "friend.request",
    "Nueva solicitud de amistad",
    "Antonia Reyes quiere agregarte",
  );

  // ─── Plantel multi-instructor (spec multi-instructor) ───
  step("plantel multi-instructor…");
  // Todo primario queda también en su join - misma regla que el backfill
  // de la migración 20261101000000. Cubre los slots/clases que el seed
  // crea por prisma directo (sin pasar por el controller).
  {
    const slotsW = await prisma.classSlot.findMany({
      where: { instructorId: { not: null } },
      select: { id: true, instructorId: true },
    });
    await prisma.classSlotInstructor.createMany({
      data: slotsW.map((s) => ({
        slotId: s.id,
        personId: s.instructorId!,
      })),
      skipDuplicates: true,
    });
    const classesW = await prisma.class.findMany({
      where: { instructorId: { not: null } },
      select: { id: true, instructorId: true },
    });
    await prisma.classInstructor.createMany({
      data: classesW.map((c) => ({
        classId: c.id,
        personId: c.instructorId!,
      })),
      skipDuplicates: true,
    });
  }

  // ─── Limpieza de residuos E2E ───
  step("limpieza E2E…");
  // Las corridas Playwright dejan academias, series, venues y eventos
  // marcador ("... Test", "E2E", raíces de spec tipo "Con Mesas xxxx"
  // o sufijo aleatorio). El schema casi no usa onDelete → cascada
  // explícita. Criterio por nombre + raíces observadas en los specs
  // (TEST_*_ROOTS / markConds del tope del archivo): ninguna entidad
  // curada del seed calza estos patrones.
  const testVenues = await prisma.venue.findMany({
    where: {
      OR: [
        ...markConds(),
        ...TEST_VENUE_ROOTS.map((r) => ({ name: { startsWith: r } })),
      ],
    },
    select: { id: true },
  });
  const testVenueIds = testVenues.map((v) => v.id);

  const testSeries = await prisma.eventSeries.findMany({
    where: {
      OR: [
        ...markConds(),
        ...TEST_SERIES_ROOTS.map((r) => ({ name: { startsWith: r } })),
        ...(testVenueIds.length ? [{ venueId: { in: testVenueIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const testSeriesIds = testSeries.map((s) => s.id);

  // Academias de test - se resuelven antes porque sus eventos propios
  // (galas) también caen.
  const testAcademies = await prisma.academy.findMany({
    where: { OR: markConds() },
    select: { id: true },
  });
  const testAcademyIds = testAcademies.map((a) => a.id);

  const testEvents = await prisma.event.findMany({
    where: {
      OR: [
        ...markConds(),
        ...TEST_EVENT_ROOTS.map((r) => ({ name: { startsWith: r } })),
        // Duplicados legados con em-dash (versión vieja del seed) - las
        // entidades actuales usan "-" o ningún guion.
        { name: { contains: "—" } },
        ...(testSeriesIds.length
          ? [{ seriesId: { in: testSeriesIds } }]
          : []),
        ...(testVenueIds.length ? [{ venueId: { in: testVenueIds } }] : []),
        ...(testAcademyIds.length
          ? [{ academyId: { in: testAcademyIds } }]
          : []),
      ],
    },
    select: { id: true },
  });
  const testEventIds = testEvents.map((e) => e.id);

  if (testEventIds.length) {
    const sessions = await prisma.danceSession.findMany({
      where: { eventId: { in: testEventIds } },
      select: { id: true },
    });
    const lists = await prisma.guestList.findMany({
      where: { eventId: { in: testEventIds } },
      select: { id: true },
    });
    const missions = await prisma.mission.findMany({
      where: { eventId: { in: testEventIds } },
      select: { id: true },
    });
    const payments = await prisma.payment.findMany({
      where: { eventId: { in: testEventIds } },
      select: { id: true },
    });
    const sids = sessions.map((s) => s.id);
    const lids = lists.map((l) => l.id);
    const mids = missions.map((m) => m.id);
    const pids = payments.map((p) => p.id);

    if (sids.length)
      await prisma.sessionRating.deleteMany({
        where: { sessionId: { in: sids } },
      });
    if (lids.length)
      await prisma.guestListEntry.deleteMany({
        where: { guestListId: { in: lids } },
      });
    if (mids.length)
      await prisma.missionProgress.deleteMany({
        where: { missionId: { in: mids } },
      });
    if (pids.length) {
      await prisma.ticketClaim.deleteMany({
        where: { paymentId: { in: pids } },
      });
      await prisma.gatewayTransaction.deleteMany({
        where: { paymentId: { in: pids } },
      });
      await prisma.paymentEvent.deleteMany({
        where: { paymentId: { in: pids } },
      });
      await prisma.discountRedemption.deleteMany({
        where: { paymentId: { in: pids } },
      });
      await prisma.payoutLine.deleteMany({
        where: { paymentId: { in: pids } },
      });
      await prisma.ticket.deleteMany({ where: { paymentId: { in: pids } } });
      await prisma.classBooking.deleteMany({
        where: { paymentId: { in: pids } },
      });
      await prisma.privateLesson.deleteMany({
        where: { paymentId: { in: pids } },
      });
      await prisma.paymentClaim.deleteMany({
        where: { paymentId: { in: pids } },
      });
    }
    await prisma.ticket.deleteMany({ where: { eventId: { in: testEventIds } } });
    await prisma.checkin.deleteMany({ where: { eventId: { in: testEventIds } } });
    await prisma.rsvp.deleteMany({ where: { eventId: { in: testEventIds } } });
    await prisma.scheduleBlock.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.eventDj.deleteMany({ where: { eventId: { in: testEventIds } } });
    await prisma.entryPass.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.staffAssignment.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.guestList.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.waitlist.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.tableReservation.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.songSuggestion.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.eventRating.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.mission.deleteMany({ where: { eventId: { in: testEventIds } } });
    await prisma.prizeDraw.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.nightSummary.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.happyHourWindow.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.venueRental.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.show.deleteMany({ where: { eventId: { in: testEventIds } } });
    await prisma.discountCode.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    await prisma.danceSession.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    // eventDay después de ticket (Ticket.eventDayId).
    await prisma.eventDay.deleteMany({
      where: { eventId: { in: testEventIds } },
    });
    if (pids.length)
      await prisma.payment.deleteMany({ where: { id: { in: pids } } });
    await prisma.event.deleteMany({ where: { id: { in: testEventIds } } });
  }

  // Series de test (o huérfanas de toda edición) y sus pases/códigos.
  const orphanSeries = await prisma.eventSeries.findMany({
    where: {
      OR: [
        { id: { in: testSeriesIds } },
        // Serie sin ningún evento no muestra nada - residuo seguro.
        { events: { none: {} } },
      ],
    },
    select: { id: true },
  });
  const deadSeriesIds = orphanSeries.map((s) => s.id);
  if (deadSeriesIds.length) {
    await prisma.seriesPass.deleteMany({
      where: { seriesId: { in: deadSeriesIds } },
    });
    await prisma.discountCode.deleteMany({
      where: { seriesId: { in: deadSeriesIds } },
    });
    await prisma.eventSeries.deleteMany({
      where: { id: { in: deadSeriesIds } },
    });
  }

  // Academias de test - cascada por la ruta clases→slots→series y por
  // sus filas propias (planes, claims, métodos de pago, staff, subs).
  if (testAcademyIds.length) {
    const slots = await prisma.classSlot.findMany({
      where: { academyId: { in: testAcademyIds } },
      select: { id: true },
    });
    const classes = await prisma.class.findMany({
      where: { classSlotId: { in: slots.map((s) => s.id) } },
      select: { id: true },
    });
    const classIds = classes.map((c) => c.id);
    // Pagos ligados a la academia (claims, clase suelta, private lessons).
    const acPayIds = [
      ...(
        await prisma.paymentClaim.findMany({
          where: { academyId: { in: testAcademyIds }, paymentId: { not: null } },
          select: { paymentId: true },
        })
      ).map((c) => c.paymentId!),
      ...(
        await prisma.classBooking.findMany({
          where: { classId: { in: classIds }, paymentId: { not: null } },
          select: { paymentId: true },
        })
      ).map((b) => b.paymentId!),
      ...(
        await prisma.privateLesson.findMany({
          where: { academyId: { in: testAcademyIds }, paymentId: { not: null } },
          select: { paymentId: true },
        })
      ).map((l) => l.paymentId!),
    ];
    await prisma.attendance.deleteMany({
      where: { classId: { in: classIds } },
    });
    await prisma.classBooking.deleteMany({
      where: { classId: { in: classIds } },
    });
    await prisma.video.deleteMany({
      where: {
        OR: [
          { classId: { in: classIds } },
          { academyId: { in: testAcademyIds } },
        ],
      },
    });
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    // ClassSlotType/ClassSeriesType caen por onDelete: Cascade.
    await prisma.classSlot.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.classSeries.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.enrollment.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.paymentClaim.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.membershipPlan.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.academyPaymentMethod.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.academyInstructor.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.academyStaff.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.privateLesson.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.academySubscription.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.membershipSubscription.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.platformSubscription.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.courseSurvey.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    await prisma.venueRental.deleteMany({
      where: { academyId: { in: testAcademyIds } },
    });
    if (acPayIds.length) {
      await prisma.ticketClaim.deleteMany({
        where: { paymentId: { in: acPayIds } },
      });
      await prisma.gatewayTransaction.deleteMany({
        where: { paymentId: { in: acPayIds } },
      });
      await prisma.paymentEvent.deleteMany({
        where: { paymentId: { in: acPayIds } },
      });
      await prisma.payoutLine.deleteMany({
        where: { paymentId: { in: acPayIds } },
      });
      await prisma.payment.deleteMany({ where: { id: { in: acPayIds } } });
    }
    // Referencias blandas (sin cascada): desvincular antes de borrar.
    await prisma.show.updateMany({
      where: { academyId: { in: testAcademyIds } },
      data: { academyId: null },
    });
    await prisma.event.updateMany({
      where: { academyId: { in: testAcademyIds } },
      data: { academyId: null },
    });
    await prisma.academy.deleteMany({ where: { id: { in: testAcademyIds } } });
  }

  // Venues de test - sus series/eventos ya cayeron arriba.
  if (testVenueIds.length) {
    await prisma.venueMenu.deleteMany({
      where: { venueId: { in: testVenueIds } },
    });
    await prisma.venueRental.deleteMany({
      where: { venueId: { in: testVenueIds } },
    });
    await prisma.event.updateMany({
      where: { venueId: { in: testVenueIds } },
      data: { venueId: null },
    });
    await prisma.venue.deleteMany({ where: { id: { in: testVenueIds } } });
  }
  if (testEventIds.length || testAcademyIds.length || testVenueIds.length) {
    console.log("Residuos E2E eliminados:", {
      eventos: testEventIds.length,
      series: deadSeriesIds.length,
      academias: testAcademyIds.length,
      venues: testVenueIds.length,
    });
  }

  // Password dev: mismo formato scrypt$N$r$p$salt$hash que AuthService.
  step("passwords dev…");
  const salt = randomBytes(16);
  const key = scryptSync(DEV_PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 });
  const passwordHash = `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
  await prisma.person.updateMany({
    where: { email: { endsWith: `@${DEV_DOMAIN}` } },
    data: { passwordHash },
  });
  // Mónica entra con password propio (cuenta real de prueba - el seed
  // la puebla y su primer login/password ya funciona sin magic link).
  {
    const mSalt = randomBytes(16);
    const mKey = scryptSync("gatoperro123", mSalt, 64, {
      N: 16384,
      r: 8,
      p: 1,
    });
    await prisma.person.update({
      where: { id: monica.id },
      data: {
        passwordHash: `scrypt$16384$8$1$${mSalt.toString("hex")}$${mKey.toString("hex")}`,
      },
    });
  }

  console.log("Seed dev listo:", {
    admin: admin.email,
    academias: [muvet.name],
    loginDemo: `cualquier *@${DEV_DOMAIN} por magic link`,
    password: `${DEV_PASSWORD} (todas las cuentas @${DEV_DOMAIN})`,
  });
}

// Dataset demo de la escena SBK Santiago (spec: omni-dance.md §2).
// Idempotente: personas/venues/series/eventos se resuelven por clave natural
// y las fechas se refrescan en cada corrida para que la demo no envejezca.
import { PrismaClient } from "@prisma/client";
import { ensurePerson, seedCommon } from "./seed-common";

const DEV_DOMAIN = "omnidance.dev";

const nextDay = (weekday: number, hour = 22) => {
  // próximo <weekday> (0=dom … 6=sáb) a las <hour>h
  const d = new Date();
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7));
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
  await person("dancer", "Bailarín Demo", [{ role: "DANCER" }]);
  // Staff de puerta aprobado — consola /staff operable sin pasar por /admin.
  await person("staff", "Staff Puerta", [{ role: "STAFF" }]);

  // ─── Venues ───
  const venue = (name: string, capacity: number) =>
    ensure(
      () => prisma.venue.findFirst({ where: { name } }),
      () =>
        prisma.venue.create({
          data: { name, address: "Santiago", capacity },
        }),
      (v) =>
        prisma.venue.update({ where: { id: v.id }, data: { capacity } }),
    );

  const orixas = await venue("Orixas", 300);
  const tierraDura = await venue("Tierra Dura", 250);
  const havana = await venue("Havana", 200);

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
  ) => {
    const series = await ensure(
      () =>
        prisma.eventSeries.findFirst({ where: { name, producerId } }),
      () =>
        prisma.eventSeries.create({
          data: { name, producerId, venueId, recurrence },
        }),
      (s) =>
        prisma.eventSeries.update({
          where: { id: s.id },
          data: { venueId, recurrence },
        }),
    );

    const eventName = `${name} — edición`;
    const event = await ensure(
      () =>
        prisma.event.findFirst({
          where: { name: eventName, seriesId: series.id },
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

  // Orixas
  await mkSeries("Bachatamanía", carlos.id, orixas.id, "weekly:wed", 5000, 6000, 3, [matias.id]);
  await mkSeries("Baila Cubano con Bachata (Jueves Cubano)", ardilla.id, orixas.id, "weekly:thu", 5000, 7000, 4, [steban.id]);
  await mkSeries("La Gozadera", ardilla.id, orixas.id, "3x/month:fri", 5000, 7000, 5, [steban.id]);
  await mkSeries("Desafío de Tronos", muvetOwner.id, orixas.id, "1x/month:fri", 6000, 8000, 5, []);
  await mkSeries("Social con Estilo", carlos.id, orixas.id, "2x/month", 6000, 8000, 6, [fabian.id]);
  await mkSeries("Ashe", cesar.id, orixas.id, "1x/month", 6000, 8000, 6, [cesar.id]);

  // Noches standalone (sin serie) — find-or-create por nombre+venue+weekday
  const mkNight = async (
    venueId: string,
    name: string,
    weekday: number,
    presale: number,
    door: number,
    capacity: number,
    djIds: string[] = [],
  ) => {
    // clave natural: nombre + venue + weekday implícito en la fecha
    const event = await ensure(
      () =>
        prisma.event.findFirst({
          where: { name, venueId, seriesId: null },
        }),
      () =>
        prisma.event.create({
          data: {
            venueId,
            name,
            status: "PUBLISHED",
            startsAt: nextDay(weekday),
            endsAt: nextDay(weekday, 22 + 6),
            presalePrice: presale,
            doorPrice: door,
            capacity,
          },
        }),
      (e) =>
        prisma.event.update({
          where: { id: e.id },
          data: {
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
  };

  // Tierra Dura — mar–sáb; mar/mié liberada hasta 23:30 luego $4.000 en puerta.
  // weekday va en el nombre para distinguir las 5 noches homónimas.
  const wdName = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  for (const wd of [2, 3, 4, 5, 6]) {
    await mkNight(
      tierraDura.id,
      `Tierra Dura — noche ${wdName[wd]}`,
      wd,
      5000,
      wd === 2 || wd === 3 ? 4000 : 7000,
      250,
    );
  }

  // Havana — sáb y dom, DJ Jesús
  for (const wd of [6, 0]) {
    await mkNight(
      havana.id,
      `Havana — noche ${wdName[wd]}`,
      wd,
      5000,
      7000,
      200,
      [jesus.id],
    );
  }

  console.log("Seed dev listo:", {
    admin: admin.email,
    academias: [muvet.name],
    loginDemo: `cualquier *@${DEV_DOMAIN} por magic link`,
  });
}

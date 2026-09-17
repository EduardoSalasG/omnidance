// Seed de desarrollo — data real de la escena SBK Santiago (spec: omni-dance.md §2)
import { PrismaClient, UserRole, Genre } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding omnidance dev data…");

  // ─── Estilos ───
  const styles = await Promise.all(
    [
      { name: "Salsa cubana (casino)", genre: Genre.CUBANO },
      { name: "Salsa on2", genre: Genre.SALSA },
      { name: "Salsa on1", genre: Genre.SALSA },
      { name: "Bachata sensual", genre: Genre.BACHATA },
      { name: "Bachata dominicana", genre: Genre.BACHATA },
      { name: "Bachata tradicional", genre: Genre.BACHATA },
      { name: "Rueda de casino", genre: Genre.CUBANO },
      { name: "Timba", genre: Genre.CUBANO },
    ].map((s) => prisma.style.create({ data: s }))
  );
  console.log(`  ${styles.length} estilos`);

  // ─── Admin de plataforma ───
  const admin = await prisma.person.create({
    data: {
      email: "admin@omnidance.cl",
      name: "Admin Omnidance",
      roles: {
        create: [{ role: UserRole.ADMIN, status: "APPROVED" }],
      },
    },
  });

  // ─── Venues ───
  const orixas = await prisma.venue.create({
    data: { name: "Orixas", address: "Santiago", capacity: 300 },
  });
  const tierraDura = await prisma.venue.create({
    data: { name: "Tierra Dura", address: "Santiago", capacity: 250 },
  });
  const havana = await prisma.venue.create({
    data: { name: "Havana", address: "Santiago", capacity: 200 },
  });

  // ─── Personas (multi-rol) ───
  const person = (
    name: string,
    roles: { role: UserRole; status?: "APPROVED" | "SANDBOX" }[]
  ) =>
    prisma.person.create({
      data: {
        name,
        roles: { create: roles.map((r) => ({ ...r, status: r.status ?? "APPROVED" })) },
      },
    });

  const carlos = await person("Carlos Andrés", [{ role: UserRole.PRODUCER }]);
  const ardilla = await person("Ardilla", [
    { role: UserRole.PRODUCER },
    { role: UserRole.DJ },
  ]);
  const steban = await person("DJ Steban", [{ role: UserRole.DJ }]);
  const matias = await person("Matías Herrera", [{ role: UserRole.DJ }]);
  const fabian = await person("Fabián Valladares", [{ role: UserRole.DJ }]);
  const cesar = await person("César Moreno", [
    { role: UserRole.PRODUCER },
    { role: UserRole.DJ },
  ]);
  const jesus = await person("DJ Jesús", [{ role: UserRole.DJ }]);

  // MuéveteOnTour — academia Y productor
  const muvet = await prisma.academy.create({
    data: { name: "MuéveteOnTour", ownerId: carlos.id },
  });
  const muvetOwner = await person("Dueño MuéveteOnTour", [
    { role: UserRole.ACADEMY_OWNER },
    { role: UserRole.PRODUCER },
  ]);

  // ─── Series + eventos ───
  const nextDay = (weekday: number, hour = 22) => {
    // próximo <weekday> (0=dom … 6=sáb) a las <hour>h
    const d = new Date();
    d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7));
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  const mkSeries = (
    name: string,
    producerId: string,
    venueId: string,
    recurrence: string,
    presale: number,
    door: number,
    weekday: number,
    djIds: string[]
  ) =>
    prisma.eventSeries
      .create({
        data: { name, producerId, venueId, recurrence },
      })
      .then((series) =>
        prisma.event.create({
          data: {
            seriesId: series.id,
            venueId,
            producerId,
            name: `${name} — edición`,
            status: "PUBLISHED",
            startsAt: nextDay(weekday),
            endsAt: nextDay(weekday, 22 + 6), // ~04:00 del día siguiente aprox
            presalePrice: presale,
            doorPrice: door,
            capacity: 300,
            djs: { create: djIds.map((personId) => ({ personId })) },
          },
        })
      );

  // Orixas
  await mkSeries("Bachatamanía", carlos.id, orixas.id, "weekly:wed", 5000, 6000, 3, [matias.id]);
  await mkSeries("Baila Cubano con Bachata (Jueves Cubano)", ardilla.id, orixas.id, "weekly:thu", 5000, 7000, 4, [steban.id]);
  await mkSeries("La Gozadera", ardilla.id, orixas.id, "3x/month:fri", 5000, 7000, 5, [steban.id]);
  await mkSeries("Desafío de Tronos", muvetOwner.id, orixas.id, "1x/month:fri", 6000, 8000, 5, []);
  await mkSeries("Social con Estilo", carlos.id, orixas.id, "2x/month", 6000, 8000, 6, [fabian.id]);
  await mkSeries("Ashe", cesar.id, orixas.id, "1x/month", 6000, 8000, 6, [cesar.id]);

  // Tierra Dura — mar–sáb; mar/mié liberada hasta 23:30 luego $4.000 en puerta
  for (const wd of [2, 3, 4, 5, 6]) {
    await prisma.event.create({
      data: {
        venueId: tierraDura.id,
        name: `Tierra Dura — noche`,
        status: "PUBLISHED",
        startsAt: nextDay(wd),
        endsAt: nextDay(wd, 22 + 6),
        presalePrice: 5000,
        doorPrice: wd === 2 || wd === 3 ? 4000 : 7000, // liberada hasta 23:30 mar/mié
        capacity: 250,
      },
    });
  }

  // Havana — sáb y dom, DJ Jesús
  for (const wd of [6, 0]) {
    await prisma.event.create({
      data: {
        venueId: havana.id,
        name: "Havana — noche",
        status: "PUBLISHED",
        startsAt: nextDay(wd),
        endsAt: nextDay(wd, 22 + 6),
        presalePrice: 5000,
        doorPrice: 7000,
        capacity: 200,
        djs: { create: [{ personId: jesus.id }] },
      },
    });
  }

  // Parámetros de plataforma — defaults operativos (editables en /admin)
  const params: Array<{ key: string; value: unknown; description: string }> = [
    { key: "service_fee.presale_clp", value: 500, description: "Cargo por servicio por ticket de preventa (CLP)" },
    { key: "service_fee.door_app_clp", value: 700, description: "Cargo por servicio venta en puerta por app (CLP)" },
    { key: "service_fee.door_cash_clp", value: 0, description: "Cargo por servicio registro en efectivo (CLP)" },
    { key: "session.cooldown_minutes", value: 4, description: "Minutos de cooldown entre sesiones del mismo par" },
    { key: "qr.rotation_seconds", value: 60, description: "Segundos de vigencia del QR personal rotativo" },
    { key: "prime_time.window_minutes", value: 30, description: "Minutos de la ventana Prime Time" },
    { key: "prime_time.threshold_pct", value: 0.2, description: "Umbral Prime Time como fracción del aforo" },
  ];
  for (const p of params) {
    await prisma.platformParam.upsert({
      where: { key: p.key },
      update: {},
      create: { key: p.key, value: p.value as never, description: p.description },
    });
  }

  console.log("Seed listo:", { admin: admin.email, academias: [muvet.name], params: params.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

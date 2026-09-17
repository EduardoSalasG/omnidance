import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();
  const counts = async () => ({
    persons: await p.person.count(),
    personRoles: await p.personRole.count(),
    styles: await p.style.count(),
    venues: await p.venue.count(),
    series: await p.eventSeries.count(),
    events: await p.event.count(),
    eventDjs: await p.eventDj.count(),
    academies: await p.academy.count(),
  });
  console.log("counts:", await counts());
  await p.$disconnect();
}
main();

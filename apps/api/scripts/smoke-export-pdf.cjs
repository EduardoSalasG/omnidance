// Smoke export PDF - corre contra API viva en :4000.
// node scripts/smoke-export-pdf.cjs
const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");
const fs = require("fs");

const API = "http://localhost:4000/api";
const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const prisma = new PrismaClient();

const session = (personId) =>
  new SignJWT({ purpose: "session" })
    .setSubject(personId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

const call = async (path, tok) => {
  const r = await fetch(`${API}${path}`, {
    headers: tok ? { cookie: `omnidance_session=${tok}` } : {},
  });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get("content-type"), buf };
};

const check = (name, cond, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);

const isPdf = (b) => b.subarray(0, 5).toString("latin1") === "%PDF-";

async function main() {
  const event = await prisma.event.findFirst({
    where: { producerId: { not: null } },
    orderBy: { startsAt: "desc" },
  });
  if (!event) throw new Error("sin eventos con productor en seed");
  const stranger = await prisma.person.findFirst({
    where: { id: { not: event.producerId } },
  });

  const ownerTok = await session(event.producerId);
  const strangerTok = await session(stranger.id);

  for (const d of ["sales", "checkins", "guestlist"]) {
    const r = await call(`/events/${event.id}/export.pdf?dataset=${d}`, ownerTok);
    check(`evento pdf ${d} owner 200`, r.status === 200 && isPdf(r.buf) && r.type === "application/pdf", `(${r.status}, ${r.buf.length}b)`);
  }
  const csv = await call(`/events/${event.id}/export.csv?dataset=sales`, ownerTok);
  const hasBom = csv.buf[0] === 0xef && csv.buf[1] === 0xbb && csv.buf[2] === 0xbf;
  check("csv sigue OK", csv.status === 200 && hasBom, `(${csv.status})`);

  let r = await call(`/events/${event.id}/export.pdf?dataset=sales`, strangerTok);
  check("stranger 403", r.status === 403, `(${r.status})`);
  r = await call(`/events/${event.id}/export.pdf?dataset=nudes`, ownerTok);
  check("dataset inválido 400", r.status === 400, `(${r.status})`);
  r = await call(`/events/nope/export.pdf?dataset=sales`, ownerTok);
  check("evento inexistente 404", r.status === 404, `(${r.status})`);
  r = await call(`/events/${event.id}/export.pdf?dataset=sales`, null);
  check("sin sesión 401", r.status === 401, `(${r.status})`);

  const series = await prisma.eventSeries.findFirst({ where: { events: { some: {} } } });
  if (series) {
    const sTok = await session(series.producerId);
    r = await call(`/events/series/${series.id}/export.pdf?dataset=sales`, sTok);
    check("serie pdf owner 200", r.status === 200 && isPdf(r.buf), `(${r.status}, ${r.buf.length}b)`);
    r = await call(`/events/series/${series.id}/export.pdf?dataset=sales`, strangerTok);
    check("serie stranger 403", r.status === 403, `(${r.status})`);
    r = await call(`/events/series/nope/export.pdf?dataset=sales`, sTok);
    check("serie inexistente 404", r.status === 404, `(${r.status})`);
  }

  // evidencia visual: guardar un PDF real
  const full = await call(`/events/${event.id}/export.pdf?dataset=sales`, ownerTok);
  fs.writeFileSync("smoke-export.pdf", full.buf);
  console.log(`evidencia: smoke-export.pdf (${full.buf.length}b, evento "${event.name}")`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

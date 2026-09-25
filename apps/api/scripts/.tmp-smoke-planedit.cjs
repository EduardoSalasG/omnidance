// Smoke temporal: PATCH /academies/:id/plans/:planId (edit + type-lock).
const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");

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

const call = (method, path, tok, body) =>
  fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(tok ? { cookie: `omnidance_session=${tok}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  cond ? pass++ : fail++;
};

async function main() {
  const academy = await prisma.academy.findFirst({
    where: { active: true },
  });
  const ownerTok = await session(academy.ownerId);

  // Plan nuevo para no tocar los del seed
  const created = await call("POST", `/academies/${academy.id}/plans`, ownerTok, {
    name: "Plan Smoke Editar", type: "MONTHLY", price: 10000,
    description: ["b1"],
  });
  check("POST plan → 200/201", created.status === 200 || created.status === 201, `(${created.status})`);
  const planId = created.body.id;

  // PATCH nombre + precio + descripción
  const edited = await call("PATCH", `/academies/${academy.id}/plans/${planId}`, ownerTok, {
    name: "Plan Smoke Editado", price: 12000, description: ["nuevo bullet"],
  });
  check("PATCH plan → 200", edited.status === 200, `(${edited.status})`);
  check("name actualizado", edited.body?.name === "Plan Smoke Editado");
  check("price actualizado", edited.body?.price === 12000);
  check("description reemplazada", Array.isArray(edited.body?.description) && edited.body.description[0] === "nuevo bullet");

  // PATCH active toggle
  const off = await call("PATCH", `/academies/${academy.id}/plans/${planId}`, ownerTok, { active: false });
  check("PATCH active=false → 200 + active false", off.status === 200 && off.body?.active === false);

  // PATCH plan de otra academia → 404
  const other = await prisma.academy.findFirst({ where: { id: { not: academy.id } } });
  const foreign = await call("PATCH", `/academies/${other.id}/plans/${planId}`, ownerTok, { price: 1 });
  // owner no administra la otra academia → 403 (access) o 404 — ambos correctos según orden
  check("PATCH plan ajeno → 403/404", [403, 404].includes(foreign.status), `(${foreign.status})`);

  // PATCH con flowPlanId (espejo) + cambio de type → 400
  await prisma.membershipPlan.update({ where: { id: planId }, data: { flowPlanId: "omni_smoke" } });
  const typeChange = await call("PATCH", `/academies/${academy.id}/plans/${planId}`, ownerTok, { type: "SINGLE" });
  check("PATCH type con espejo → 400", typeChange.status === 400, `(${typeChange.status} ${JSON.stringify(typeChange.body)})`);

  // Con espejo, editar precio con gateway stub → syncMirrorPlan no-op → 200
  const priceEdit = await call("PATCH", `/academies/${academy.id}/plans/${planId}`, ownerTok, { price: 13000 });
  check("PATCH price con espejo + stub → 200", priceEdit.status === 200, `(${priceEdit.status})`);

  // limpieza
  await prisma.membershipPlan.delete({ where: { id: planId } });
  console.log(`\n${pass} pass, ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

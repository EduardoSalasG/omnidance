import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { Mailer } from "../../auth/domain/ports";
import { TrialLifecycleService } from "./trial-lifecycle.service";

// TrialLifecycleService.sweepTrialLastDay - fake prisma stateful (mismo
// patrón que platform-subscriptions.service.spec). La ventana es
// (now, now+24h]: gt estricto abajo, lte arriba. Solo actores AÚN en
// trial (academy.tier null / person.proTier FREE) y sin dedup previo.
//
// `now` fijo al mediodía UTC del 2026-11-09: en Santiago (UTC-3 en
// noviembre, horario de verano) es el mismo día 2026-11-09 → la promo
// diaria es trial-conv-20261109 y validUntil cae 2026-11-10T04:00Z
// (fin de día CL conservador, cubre UTC-3/UTC-4 sin lib de zonas).

type Row = Record<string, unknown>;

const NOW = new Date("2026-11-09T18:00:00.000Z");
const DAY = 24 * 60 * 60_000;

function mkAcademy(over: Partial<Row> = {}): Row {
  return {
    id: `ac-${Math.random().toString(36).slice(2, 8)}`,
    name: "Academia Trial",
    ownerId: "owner-1",
    tier: null,
    trialEndsAt: new Date(NOW.getTime() + 12 * 60 * 60_000),
    trialEndNotifiedAt: null,
    ...over,
  };
}

function mkPerson(over: Partial<Row> = {}): Row {
  return {
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    name: "Productor Trial",
    email: "prod@example.cl",
    phone: "+56911111111",
    proTier: "FREE",
    proTrialEndsAt: new Date(NOW.getTime() + 12 * 60 * 60_000),
    proTrialEndNotifiedAt: null,
    ...over,
  };
}

/** Subconjunto de matchWhere que usa el barrido: eq/null, in, gt, lte. */
function matchWhere(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const v = row[k];
    if (cond != null && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      if ("in" in c) {
        if (!(c.in as unknown[]).includes(v)) return false;
      } else if ("gt" in c || "lte" in c) {
        if (!(v instanceof Date)) return false;
        const t = v.getTime();
        if ("gt" in c && !(t > (c.gt as Date).getTime())) return false;
        if ("lte" in c && !(t <= (c.lte as Date).getTime())) return false;
      } else {
        return false;
      }
    } else if (v !== cond) {
      return false;
    }
  }
  return true;
}

function mkPrisma() {
  const academies = new Map<string, Row>();
  const persons = new Map<string, Row>();
  const promos = new Map<string, Row>();
  const activities: Row[] = [];
  let seq = 0;
  const nid = () => `id-${++seq}`;

  const prisma = {
    academy: {
      findMany: vi.fn(async ({ where }: { where?: Row }) =>
        [...academies.values()].filter(
          (a) => !where || matchWhere(a, where),
        ),
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const a = academies.get(where.id);
          if (a) Object.assign(a, data);
          return a;
        },
      ),
    },
    person: {
      findMany: vi.fn(async ({ where }: { where?: Row }) =>
        [...persons.values()].filter(
          (p) => !where || matchWhere(p, where),
        ),
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const p = persons.get(where.id);
          if (p) Object.assign(p, data);
          return p;
        },
      ),
    },
    platformPromo: {
      findFirst: vi.fn(
        async ({ where }: { where: Row }) =>
          [...promos.values()].find((p) => matchWhere(p, where)) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = {
          id: nid(),
          academyIds: [] as string[],
          producerIds: [] as string[],
          ...data,
        };
        promos.set(row.id as string, row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const p = promos.get(where.id);
          if (!p) return null;
          // Whitelist: connect de academias/producers se acumula en
          // academyIds/producerIds para aserciones.
          const conn = data.academies as
            | { connect?: { id: string } }
            | undefined;
          if (conn?.connect)
            (p.academyIds as string[]).push(conn.connect.id);
          const connP = data.producers as
            | { connect?: { id: string } }
            | undefined;
          if (connP?.connect)
            (p.producerIds as string[]).push(connP.connect.id);
          return p;
        },
      ),
    },
    activityEvent: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const stored = JSON.parse(JSON.stringify(data)) as Row;
        activities.push(stored);
        return stored;
      }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
  };
  return { prisma, academies, persons, promos, activities };
}

const PARAMS = new Map<string, string>([
  ["cx.contact.name", "Eduardo Salas"],
  ["cx.contact.email", "eduardo@omnidance.tech"],
  ["cx.contact.phone", "+56982439041"],
  ["cx.notify_email", "cx@omnidance.dev"],
]);

describe("TrialLifecycleService.sweepTrialLastDay", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let svc: TrialLifecycleService;

  beforeEach(() => {
    fx = mkPrisma();
    mailer = { send: vi.fn(async () => undefined) };
    svc = new TrialLifecycleService(
      fx.prisma as unknown as PrismaService,
      {
        get: vi.fn(async (k: string) => PARAMS.get(k) ?? null),
      } as unknown as ParamsService,
      mailer as unknown as Mailer,
      { notifySafe: vi.fn() } as unknown as NotificationsService,
    );
  });

  it("ventana 24h: avisa a los que vencen en (now, now+24h], no a los demás", async () => {
    const inWindow = mkAcademy({
      trialEndsAt: new Date(NOW.getTime() + 20 * 60 * 60_000),
    });
    const boundary = mkAcademy({
      trialEndsAt: new Date(NOW.getTime() + DAY),
    });
    const tooLate = mkAcademy({
      trialEndsAt: new Date(NOW.getTime() + DAY + 60_000),
    });
    const expired = mkAcademy({
      trialEndsAt: new Date(NOW.getTime() - 60_000),
    });
    for (const a of [inWindow, boundary, tooLate, expired]) {
      fx.academies.set(a.id as string, a);
    }
    fx.persons.set("owner-1", {
      id: "owner-1",
      name: "Dueña",
      email: "duena@example.cl",
      phone: null,
    });

    const res = await svc.sweepTrialLastDay(NOW);

    expect(res.academies).toBe(2);
    expect(fx.academies.get(inWindow.id as string)?.trialEndNotifiedAt).toEqual(
      NOW,
    );
    expect(fx.academies.get(boundary.id as string)?.trialEndNotifiedAt).toEqual(
      NOW,
    );
    expect(
      fx.academies.get(tooLate.id as string)?.trialEndNotifiedAt,
    ).toBeNull();
    expect(
      fx.academies.get(expired.id as string)?.trialEndNotifiedAt,
    ).toBeNull();
    // Un correo por academia avisada (mismo owner), ninguno por las demás.
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });

  it("dedup: ya notificado no se reenvía ni se re-whitelistea", async () => {
    const a = mkAcademy();
    fx.academies.set(a.id as string, a);
    fx.persons.set("owner-1", {
      id: "owner-1",
      name: "Dueña",
      email: "duena@example.cl",
      phone: null,
    });

    await svc.sweepTrialLastDay(NOW);
    const res = await svc.sweepTrialLastDay(NOW);

    expect(res).toEqual({ academies: 0, producers: 0 });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    // Y una academia marcada de antemano tampoco entra al primer barrido.
    const pre = mkAcademy({ trialEndNotifiedAt: new Date(NOW.getTime() - DAY) });
    fx.academies.set(pre.id as string, pre);
    const res2 = await svc.sweepTrialLastDay(NOW);
    expect(res2.academies).toBe(0);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("promo diaria: una por día CL, 50% 1 ciclo, válida hasta fin del día Santiago", async () => {
    const a = mkAcademy();
    fx.academies.set(a.id as string, a);
    fx.persons.set("owner-1", {
      id: "owner-1",
      name: "Dueña",
      email: "duena@example.cl",
      phone: null,
    });
    const prod = mkPerson();
    fx.persons.set(prod.id as string, prod);

    await svc.sweepTrialLastDay(NOW);

    expect(fx.promos.size).toBe(1);
    const promo = [...fx.promos.values()][0];
    expect(promo.name).toBe("trial-conv-20261109");
    expect(promo.discountType).toBe("PERCENT");
    expect(promo.percentOff).toBe(50);
    expect(promo.maxCycles).toBe(1);
    expect(promo.enabled).toBe(true);
    // Expira al cerrar el día CL del barrido (~04:00 UTC del día
    // siguiente): la oferta no sobrevive al "solo por hoy" del correo.
    expect((promo.validUntil as Date).toISOString()).toBe(
      "2026-11-10T04:00:00.000Z",
    );
    // Whitelist: la academia a promo.academies, el productor a
    // promo.producers - la promo no queda global.
    expect(promo.academyIds).toEqual([a.id]);
    expect(promo.producerIds).toEqual([prod.id]);
  });

  it("segundo barrido el mismo día CL reutiliza la promo (no crea otra)", async () => {
    const a1 = mkAcademy();
    fx.academies.set(a1.id as string, a1);
    fx.persons.set("owner-1", {
      id: "owner-1",
      name: "Dueña",
      email: "duena@example.cl",
      phone: null,
    });
    await svc.sweepTrialLastDay(NOW);

    // Otro actor entra a la ventana unas horas después, mismo día CL.
    const later = new Date(NOW.getTime() + 3 * 60 * 60_000);
    const a2 = mkAcademy({
      trialEndsAt: new Date(later.getTime() + 12 * 60 * 60_000),
    });
    fx.academies.set(a2.id as string, a2);
    await svc.sweepTrialLastDay(later);

    expect(fx.promos.size).toBe(1);
    const promo = [...fx.promos.values()][0];
    expect(promo.academyIds).toEqual([a1.id, a2.id]);
  });

  it("convertido excluido: academia con tier y productor con Pro no reciben aviso", async () => {
    const converted = mkAcademy({ tier: "STUDIO" });
    fx.academies.set(converted.id as string, converted);
    fx.persons.set("owner-1", {
      id: "owner-1",
      name: "Dueña",
      email: "duena@example.cl",
      phone: null,
    });
    const pro = mkPerson({ proTier: "PRO_STARTER" });
    fx.persons.set(pro.id as string, pro);

    const res = await svc.sweepTrialLastDay(NOW);

    expect(res).toEqual({ academies: 0, producers: 0 });
    expect(mailer.send).not.toHaveBeenCalled();
    expect(fx.promos.size).toBe(0);
  });

  it("emite ActivityEvent trial.ending con ref a la promo por actor", async () => {
    const a = mkAcademy();
    fx.academies.set(a.id as string, a);
    fx.persons.set("owner-1", {
      id: "owner-1",
      name: "Dueña",
      email: "duena@example.cl",
      phone: null,
    });
    const prod = mkPerson();
    fx.persons.set(prod.id as string, prod);

    await svc.sweepTrialLastDay(NOW);

    const promo = [...fx.promos.values()][0];
    const academyEvt = fx.activities.find(
      (e) => e.academyId === a.id,
    );
    expect(academyEvt).toMatchObject({
      type: "trial.ending",
      personId: "owner-1",
      refType: "PlatformPromo",
      refId: promo.id,
      data: { kind: "ACADEMY", promo: "trial-conv-20261109" },
    });
    const prodEvt = fx.activities.find((e) => e.personId === prod.id);
    expect(prodEvt).toMatchObject({
      type: "trial.ending",
      refType: "PlatformPromo",
      refId: promo.id,
      data: { kind: "PRODUCER", promo: "trial-conv-20261109" },
    });
  });

  it("actor sin email igual queda whitelisteado y marcado (sin correo)", async () => {
    const a = mkAcademy();
    fx.academies.set(a.id as string, a);
    fx.persons.set("owner-1", {
      id: "owner-1",
      name: "Dueña",
      email: null,
      phone: null,
    });

    const res = await svc.sweepTrialLastDay(NOW);

    expect(res.academies).toBe(1);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(fx.academies.get(a.id as string)?.trialEndNotifiedAt).toEqual(NOW);
    const promo = [...fx.promos.values()][0];
    expect(promo.academyIds).toEqual([a.id]);
  });
});

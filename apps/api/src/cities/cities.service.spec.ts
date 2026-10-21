import {
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CitiesService } from "./cities.service";
import { FeatureFlagsService } from "../features/feature-flags.service";
import type { PrismaService } from "../prisma.service";

// CitiesService (spec city-discovery). Reglas bajo prueba:
// - Flag city_landing OFF → 404 en los tres endpoints (fail-closed).
// - GET /cities: solo ciudades con eventos futuros PUBLISHED de
//   productores APPROVED (o sin productor), orden por count desc.
// - GET /cities/:slug: shape de landing (feed público + venues + hasGuide).
// - GET /events/near: haversine sobre City.lat/lng, radio default 25 /
//   máx 200, orden por distancia de ciudad, empty → nearestCity.

type FakeFlag = { key: string; enabled: boolean };
type FakeRole = { personId: string; role: string; status: string };
type FakeCity = {
  id: string;
  slug: string;
  name: string;
  lat: number | null;
  lng: number | null;
  country: { code: string; name: string };
  guide?: { id: string } | null;
};
type FakeVenue = {
  id: string;
  name: string;
  cityId: string | null;
  active: boolean;
};
type FakeEvent = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  producerId: string | null;
  cityId: string | null;
  presalePrice: number | null;
  doorPrice: number | null;
  genres: string[];
  genreMix: unknown[] | null;
  platformFeePct: number | null;
  series?: {
    id: string;
    name: string;
    genres: string[];
    genreMix: unknown[] | null;
  } | null;
  venue?: {
    id: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
};

/** Mini-matcher del where que arma el service (status, gt, in, AND/OR, null). */
function matchWhere(e: Record<string, unknown>, where: unknown): boolean {
  const w = where as Record<string, unknown>;
  if (w.status !== undefined && e.status !== w.status) return false;
  const startsAt = w.startsAt as { gt?: Date } | undefined;
  if (startsAt?.gt && !((e.startsAt as Date) > startsAt.gt)) return false;
  const cityId = w.cityId as { in?: string[] } | undefined;
  if (cityId?.in && !cityId.in.includes(e.cityId as string)) return false;
  const producerId = w.producerId as { in?: string[] } | null | undefined;
  if (producerId !== undefined) {
    if (producerId === null && e.producerId !== null) return false;
    if (
      producerId?.in &&
      !producerId.in.includes(e.producerId as string)
    )
      return false;
  }
  if (Array.isArray(w.AND)) {
    for (const cond of w.AND) if (!matchWhere(e, cond)) return false;
  }
  if (Array.isArray(w.OR)) {
    if (!w.OR.some((cond) => matchWhere(e, cond))) return false;
  }
  return true;
}

/** Aplica el `select` de Prisma (anidado incluido) a la fila fake. */
function applySelect(row: unknown, select: Record<string, unknown>) {
  const r = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(select)) {
    if (v === true) {
      out[k] = r[k];
    } else if (v && typeof v === "object" && "select" in v) {
      const sub = (v as { select: Record<string, unknown> }).select;
      const val = r[k];
      out[k] = val == null ? val : applySelect(val, sub);
    }
  }
  return out;
}

function mkPrisma(data: {
  flags?: FakeFlag[];
  cities?: FakeCity[];
  events?: FakeEvent[];
  venues?: FakeVenue[];
  roles?: FakeRole[];
}) {
  const flags = new Map((data.flags ?? []).map((f) => [f.key, f]));
  const cities = data.cities ?? [];
  const events = data.events ?? [];
  const venues = data.venues ?? [];
  const roles = data.roles ?? [];

  const prisma = {
    featureFlag: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        flags.get(where.key) ?? null,
    },
    personRole: {
      findMany: async ({
        where,
      }: {
        where: { role?: string; status?: string };
      }) =>
        roles.filter(
          (r) =>
            (where.role === undefined || r.role === where.role) &&
            (where.status === undefined || r.status === where.status),
        ),
    },
    city: {
      findMany: async (args: {
        where?: {
          id?: { in: string[] };
          lat?: { not: null };
          lng?: { not: null };
        };
        select?: Record<string, unknown>;
      }) => {
        let rows = cities;
        const w = args.where ?? {};
        if (w.id?.in) rows = rows.filter((c) => w.id!.in.includes(c.id));
        if (w.lat) rows = rows.filter((c) => c.lat != null);
        if (w.lng) rows = rows.filter((c) => c.lng != null);
        return args.select
          ? rows.map((c) => applySelect(c, args.select!))
          : rows;
      },
      findUnique: async (args: {
        where: { slug: string };
        select?: Record<string, unknown>;
      }) => {
        const city = cities.find((c) => c.slug === args.where.slug) ?? null;
        if (!city) return null;
        return args.select ? applySelect(city, args.select) : city;
      },
    },
    venue: {
      findMany: async (args: {
        where?: { cityId?: string; active?: boolean };
        orderBy?: { name: "asc" | "desc" };
        select?: Record<string, unknown>;
      }) => {
        let rows = venues;
        const w = args.where ?? {};
        if (w.cityId !== undefined)
          rows = rows.filter((v) => v.cityId === w.cityId);
        if (w.active !== undefined)
          rows = rows.filter((v) => v.active === w.active);
        if (args.orderBy?.name === "asc")
          rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
        return args.select
          ? rows.map((v) => applySelect(v, args.select!))
          : rows;
      },
    },
    event: {
      groupBy: async (args: {
        by: ["cityId"];
        where?: unknown;
        _count: { _all: true };
      }) => {
        const rows = events.filter((e) =>
          matchWhere(e as never, args.where),
        );
        const counts = new Map<string | null, number>();
        for (const e of rows) {
          counts.set(e.cityId, (counts.get(e.cityId) ?? 0) + 1);
        }
        return [...counts.entries()].map(([cityId, n]) => ({
          cityId,
          _count: { _all: n },
        }));
      },
      findMany: async (args: {
        where?: unknown;
        orderBy?: { startsAt: "asc" | "desc" };
        take?: number;
        select?: Record<string, unknown>;
      }) => {
        let rows = events.filter((e) =>
          matchWhere(e as never, args.where),
        );
        if (args.orderBy?.startsAt === "asc")
          rows = [...rows].sort(
            (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
          );
        if (args.take) rows = rows.slice(0, args.take);
        return args.select
          ? rows.map((e) => applySelect(e, args.select!))
          : rows;
      },
    },
  };
  return prisma as unknown as PrismaService;
}

const flag = (enabled: boolean): FakeFlag => ({
  key: "city_landing",
  enabled,
});

const CL = { code: "CL", name: "Chile" };
const cityStgo: FakeCity = {
  id: "city-stgo-cl",
  slug: "santiago-cl",
  name: "Santiago",
  lat: -33.45,
  lng: -70.66,
  country: CL,
};
const cityVina: FakeCity = {
  id: "city-vina-cl",
  slug: "vina-cl",
  name: "Viña del Mar",
  lat: -33.02,
  lng: -71.55,
  country: CL,
};

let seq = 0;
const FUTURE = new Date(Date.now() + 72 * 60 * 60 * 1000);
const ev = (over: Partial<FakeEvent>): FakeEvent => ({
  id: `ev-${++seq}`,
  name: "Social",
  type: "SOCIAL",
  status: "PUBLISHED",
  startsAt: FUTURE,
  endsAt: new Date(FUTURE.getTime() + 4 * 60 * 60 * 1000),
  producerId: null,
  cityId: null,
  presalePrice: 8000,
  doorPrice: 10000,
  genres: ["SALSA"],
  genreMix: null,
  platformFeePct: null,
  series: null,
  venue: null,
  ...over,
});

function mkService(prisma: PrismaService) {
  return new CitiesService(prisma, new FeatureFlagsService(prisma));
}

describe("CitiesService.list (GET /cities)", () => {
  it("flag OFF → 404 sin consultar eventos", async () => {
    const svc = mkService(mkPrisma({ flags: [flag(false)] }));
    await expect(svc.list()).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lista solo ciudades con eventos futuros publicados, orden por actividad", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      cities: [cityStgo, cityVina],
      events: [
        // Pasado y DRAFT no cuentan; productor PENDING tampoco.
        ev({ cityId: "city-stgo-cl", startsAt: new Date(Date.now() - 1000) }),
        ev({ cityId: "city-stgo-cl", status: "DRAFT" }),
        ev({ cityId: "city-stgo-cl", producerId: "prod-pending" }),
        ev({ cityId: "city-stgo-cl" }),
        ev({ cityId: "city-stgo-cl", producerId: "prod-ok" }),
        ev({ cityId: "city-vina-cl" }),
      ],
      roles: [
        { personId: "prod-ok", role: "PRODUCER", status: "APPROVED" },
        { personId: "prod-pending", role: "PRODUCER", status: "PENDING" },
      ],
    });

    const rows = await mkService(prisma).list();
    expect(rows).toEqual([
      {
        id: "city-stgo-cl",
        slug: "santiago-cl",
        name: "Santiago",
        country: CL,
        upcomingEvents: 2,
      },
      {
        id: "city-vina-cl",
        slug: "vina-cl",
        name: "Viña del Mar",
        country: CL,
        upcomingEvents: 1,
      },
    ]);
  });

  it("sin actividad → []", async () => {
    const svc = mkService(mkPrisma({ flags: [flag(true)], cities: [cityStgo] }));
    expect(await svc.list()).toEqual([]);
  });
});

describe("CitiesService.detail (GET /cities/:slug)", () => {
  it("flag OFF → 404; slug inexistente → 404", async () => {
    const off = mkService(mkPrisma({ flags: [flag(false)], cities: [cityStgo] }));
    await expect(off.detail("santiago-cl")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const on = mkService(mkPrisma({ flags: [flag(true)], cities: [cityStgo] }));
    await expect(on.detail("no-existe")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("devuelve ficha con eventos del feed, venues activos y hasGuide", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      cities: [cityStgo],
      events: [
        ev({
          cityId: "city-stgo-cl",
          name: "Noche de salsa",
          genres: [],
          series: {
            id: "ser-1",
            name: "Bachatamania",
            genres: ["BACHATA"],
            genreMix: [{ genre: "BACHATA", pct: 70 }],
          },
        }),
        // De otra ciudad - no debe entrar.
        ev({ cityId: "city-vina-cl", name: "Ajeno" }),
      ],
      venues: [
        { id: "v2", name: "Zafiro", cityId: "city-stgo-cl", active: true },
        { id: "v1", name: "Alma Latina", cityId: "city-stgo-cl", active: true },
        { id: "v3", name: "Cerrado", cityId: "city-stgo-cl", active: false },
      ],
    });

    const res = await mkService(prisma).detail("santiago-cl");
    expect(res.slug).toBe("santiago-cl");
    expect(res.lat).toBeCloseTo(-33.45);
    expect(res.hasGuide).toBe(false);
    // Géneros/mix heredados de la serie (misma regla del feed público).
    expect(res.upcomingEvents).toHaveLength(1);
    expect(res.upcomingEvents[0].name).toBe("Noche de salsa");
    expect(res.upcomingEvents[0].genres).toEqual(["BACHATA"]);
    expect(res.upcomingEvents[0].series).toEqual({
      id: "ser-1",
      name: "Bachatamania",
    });
    // Solo venues activos de la ciudad, por nombre.
    expect(res.venues).toEqual([
      { id: "v1", name: "Alma Latina" },
      { id: "v2", name: "Zafiro" },
    ]);
  });

  it("ciudad sin eventos → upcomingEvents: [] y hasGuide según guía", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      cities: [{ ...cityStgo, guide: { id: "g-1" } }],
    });
    const res = await mkService(prisma).detail("santiago-cl");
    expect(res.upcomingEvents).toEqual([]);
    expect(res.hasGuide).toBe(true);
  });
});

describe("CitiesService.nearEvents (GET /events/near)", () => {
  const santiago = { lat: -33.45, lng: -70.66 };

  it("flag OFF → 404", async () => {
    const svc = mkService(mkPrisma({ flags: [flag(false)] }));
    await expect(
      svc.nearEvents(santiago.lat, santiago.lng),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lat/lng fuera de rango → 400", async () => {
    const svc = mkService(mkPrisma({ flags: [flag(true)] }));
    await expect(svc.nearEvents(999, 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.nearEvents(NaN, -70)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("dentro del radio: eventos de ciudades cercanas por distancia", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      cities: [
        cityStgo,
        // Valparaíso (~100km de Santiago) - dentro del radio pedido.
        { ...cityVina, id: "city-valpo-cl", slug: "valparaiso-cl", name: "Valparaíso", lat: -33.04, lng: -71.63 },
      ],
      events: [
        ev({
          cityId: "city-valpo-cl",
          name: "Social Valpo",
          startsAt: new Date(FUTURE.getTime() - 60 * 60 * 1000),
        }),
        ev({ cityId: "city-stgo-cl", name: "Social Stgo" }),
      ],
    });

    const res = await mkService(prisma).nearEvents(
      santiago.lat,
      santiago.lng,
      150,
    );
    expect(res.nearestCity).toBeUndefined();
    // Stgo (0km) antes que Valpo (~100km) aunque su evento sea después.
    expect(res.events.map((e) => e.name)).toEqual([
      "Social Stgo",
      "Social Valpo",
    ]);
  });

  it("radio default 25km: una ciudad a ~100km queda fuera → sugerencia", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      cities: [cityVina],
      events: [ev({ cityId: "city-vina-cl" })],
    });
    const res = await mkService(prisma).nearEvents(
      santiago.lat,
      santiago.lng,
    );
    expect(res.events).toEqual([]);
    expect(res.nearestCity).toEqual({
      name: "Viña del Mar",
      slug: "vina-cl",
      distanceKm: expect.any(Number),
    });
    expect(res.nearestCity!.distanceKm).toBeGreaterThan(80);
  });

  it("radioKm > 200 se acota a 200", async () => {
    // Ciudad a ~160km: dentro de 200 pero fuera de 25.
    const prisma = mkPrisma({
      flags: [flag(true)],
      cities: [
        { ...cityVina, lat: -32.0, lng: -70.66 },
      ],
      events: [ev({ cityId: "city-vina-cl", name: "Lejana" })],
    });
    const res = await mkService(prisma).nearEvents(
      santiago.lat,
      santiago.lng,
      5000,
    );
    expect(res.events.map((e) => e.name)).toEqual(["Lejana"]);
  });
});

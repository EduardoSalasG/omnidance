import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  AdminCityGuidesService,
  guideStatus,
} from "./city-guides.service";
import { FeatureFlagsService } from "../../features/feature-flags.service";
import type { PrismaService } from "../../prisma.service";

// AdminCityGuidesService (spec city-guides). Reglas bajo prueba:
// - Flag city_guides OFF → 404 en los 3 endpoints (fail-closed).
// - list: todas las ciudades, status empty/draft/complete por secciones
//   con texto (trim), updatedAt de la guía o null.
// - detail: guía con las 3 secciones ("" si no hay fila) + editor
//   resuelto (person.findUnique); ciudad inexistente → 404.
// - update: upsert por cityId con updatedById del actor, solo secciones
//   presentes en el DTO; audita CITY_GUIDE_UPDATE con el conteo de
//   secciones con texto resultante; ciudad inexistente → 404.

type FakeFlag = { key: string; enabled: boolean };
type FakeGuide = {
  id: string;
  cityId: string;
  intro: string;
  nightlife: string;
  practical: string;
  updatedById: string | null;
  updatedAt: Date;
};
type FakeCity = {
  id: string;
  slug: string;
  name: string;
  country: { code: string; name: string };
  guide?: FakeGuide | null;
};

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
  people?: { id: string; name: string; email: string | null }[];
}) {
  const flags = new Map((data.flags ?? []).map((f) => [f.key, f]));
  const cities = data.cities ?? [];
  const people = data.people ?? [];
  // Los CityGuide viven dentro de city.guide - upsert mantiene la tabla.
  const guides = new Map<string, FakeGuide>(
    cities
      .filter((c) => c.guide != null)
      .map((c) => [c.id, c.guide as FakeGuide]),
  );
  const auditCreate = vi.fn(async (args: { data: unknown }) => args.data);

  const prisma = {
    featureFlag: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        flags.get(where.key) ?? null,
    },
    city: {
      findMany: async (args: {
        orderBy?: unknown[];
        select?: Record<string, unknown>;
      }) => {
        // orderBy [{country:{name}},{name}] - replica el orden real.
        const rows = [...cities].sort(
          (a, b) =>
            a.country.name.localeCompare(b.country.name, "es") ||
            a.name.localeCompare(b.name, "es"),
        );
        return args.select
          ? rows.map((c) => applySelect(c, args.select!))
          : rows;
      },
      findUnique: async (args: {
        where: { id?: string; slug?: string };
        select?: Record<string, unknown>;
      }) => {
        const city =
          cities.find(
            (c) =>
              (args.where.id !== undefined && c.id === args.where.id) ||
              (args.where.slug !== undefined && c.slug === args.where.slug),
          ) ?? null;
        if (!city) return null;
        // La relación guide se lee de la tabla fake (post-upserts).
        const row = { ...city, guide: guides.get(city.id) ?? null };
        return args.select ? applySelect(row, args.select) : row;
      },
    },
    person: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        people.find((p) => p.id === where.id) ?? null,
    },
    cityGuide: {
      upsert: async (args: {
        where: { cityId: string };
        create: Partial<FakeGuide> & { cityId: string };
        update: Partial<FakeGuide>;
        select?: Record<string, unknown>;
      }) => {
        const existing = guides.get(args.where.cityId);
        const row: FakeGuide = existing
          ? { ...existing, ...args.update, updatedAt: new Date() }
          : {
              id: `g-${args.where.cityId}`,
              intro: "",
              nightlife: "",
              practical: "",
              updatedById: null,
              ...args.create, // incluye cityId (requerido en el create)
              updatedAt: new Date(),
            };
        guides.set(args.where.cityId, row);
        return args.select ? applySelect(row, args.select) : row;
      },
    },
    auditLog: { create: auditCreate },
  };
  return { prisma: prisma as unknown as PrismaService, auditCreate };
}

const ON: FakeFlag = { key: "city_guides", enabled: true };

const CL = { code: "CL", name: "Chile" };
const cityStgo: FakeCity = {
  id: "city-stgo",
  slug: "santiago-cl",
  name: "Santiago",
  country: CL,
};
const cityVina: FakeCity = {
  id: "city-vina",
  slug: "vina-cl",
  name: "Viña del Mar",
  country: CL,
};

const guide = (over: Partial<FakeGuide>): FakeGuide => ({
  id: "g-1",
  cityId: "city-stgo",
  intro: "",
  nightlife: "",
  practical: "",
  updatedById: null,
  updatedAt: new Date("2026-01-10T12:00:00Z"),
  ...over,
});

function mkService(prisma: PrismaService) {
  return new AdminCityGuidesService(
    prisma,
    new FeatureFlagsService(prisma),
  );
}

describe("guideStatus", () => {
  it("empty sin guía o sin secciones con texto (trim)", () => {
    expect(guideStatus(null)).toBe("empty");
    expect(
      guideStatus({ intro: "  ", nightlife: "", practical: "" }),
    ).toBe("empty");
  });

  it("draft con 1-2 secciones, complete con las 3", () => {
    expect(
      guideStatus({ intro: "Hola", nightlife: "", practical: "" }),
    ).toBe("draft");
    expect(
      guideStatus({ intro: "Hola", nightlife: "x", practical: " y " }),
    ).toBe("complete");
  });
});

describe("AdminCityGuidesService", () => {
  it("flag OFF → 404 en list, detail y update", async () => {
    const { prisma } = mkPrisma({
      flags: [{ key: "city_guides", enabled: false }],
      cities: [cityStgo],
    });
    const svc = mkService(prisma);
    await expect(svc.list()).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.detail("city-stgo")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      svc.update("city-stgo", { intro: "x" }, "adm-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("list devuelve ciudades con status y updatedAt de su guía", async () => {
    const at = new Date("2026-01-10T12:00:00Z");
    const { prisma } = mkPrisma({
      flags: [ON],
      cities: [
        { ...cityStgo, guide: guide({ intro: "Escena grande", updatedAt: at }) },
        // Guía creada pero vacía: status "empty" con updatedAt (fue tocada).
        {
          ...cityVina,
          guide: guide({
            id: "g-2",
            cityId: "city-vina",
            updatedAt: new Date("2026-01-05T12:00:00Z"),
          }),
        },
        // Sin fila de guía → empty.
        {
          id: "city-sts",
          slug: "santo-domingo-do",
          name: "Santo Domingo",
          country: { code: "DO", name: "Rep. Dominicana" },
        },
      ],
    });
    const rows = await mkService(prisma).list();
    // Orden: país (Chile < Rep. Dominicana) y luego nombre.
    expect(rows.map((r) => r.slug)).toEqual([
      "santiago-cl",
      "vina-cl",
      "santo-domingo-do",
    ]);
    expect(rows[0]).toMatchObject({
      status: "draft",
      updatedAt: at,
      country: CL,
    });
    expect(rows[1].status).toBe("empty");
    expect(rows[1].updatedAt).toEqual(new Date("2026-01-05T12:00:00Z"));
    // Sin fila de guía → empty y updatedAt null.
    expect(rows[2].status).toBe("empty");
    expect(rows[2].updatedAt).toBeNull();
    // La lista no arrastra el contenido editorial.
    expect("intro" in rows[0]).toBe(false);
  });

  it("detail devuelve secciones, editor resuelto y 404 sin ciudad", async () => {
    const at = new Date("2026-01-10T12:00:00Z");
    const { prisma } = mkPrisma({
      flags: [ON],
      cities: [
        {
          ...cityStgo,
          guide: guide({
            intro: "La escena",
            updatedById: "adm-9",
            updatedAt: at,
          }),
        },
      ],
      people: [{ id: "adm-9", name: "Admin", email: "a@omnidance.dev" }],
    });
    const svc = mkService(prisma);
    const res = await svc.detail("city-stgo");
    expect(res.city).toMatchObject({ slug: "santiago-cl", name: "Santiago" });
    expect(res.guide).toEqual({
      intro: "La escena",
      nightlife: "",
      practical: "",
      updatedAt: at,
      updatedBy: { id: "adm-9", name: "Admin", email: "a@omnidance.dev" },
    });
    await expect(svc.detail("no-existe")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("detail sin guía → secciones vacías y updatedBy null", async () => {
    const { prisma } = mkPrisma({ flags: [ON], cities: [cityStgo] });
    const res = await mkService(prisma).detail("city-stgo");
    expect(res.guide).toEqual({
      intro: "",
      nightlife: "",
      practical: "",
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("update upsertea por cityId con updatedById y audita el conteo", async () => {
    const { prisma, auditCreate } = mkPrisma({
      flags: [ON],
      cities: [cityStgo],
    });
    const svc = mkService(prisma);
    const saved = await svc.update(
      "city-stgo",
      { intro: "Bienvenida", nightlife: "Viernes social" },
      "adm-1",
    );
    expect(saved).toMatchObject({
      intro: "Bienvenida",
      nightlife: "Viernes social",
      practical: "",
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: "adm-1",
          action: "CITY_GUIDE_UPDATE",
          targetType: "CityGuide",
          payload: { cityId: "city-stgo", sections: 2 },
        }),
      }),
    );

    // Segundo PUT: merge por sección (las ausentes no se tocan) y el
    // conteo auditado refleja el total resultante.
    await svc.update("city-stgo", { practical: "Metro + Uber" }, "adm-2");
    const res = await svc.detail("city-stgo");
    expect(res.guide.intro).toBe("Bienvenida");
    expect(res.guide.practical).toBe("Metro + Uber");
    expect(auditCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: "adm-2",
          payload: { cityId: "city-stgo", sections: 3 },
        }),
      }),
    );
  });

  it("update con ciudad inexistente → 404 sin auditar", async () => {
    const { prisma, auditCreate } = mkPrisma({ flags: [ON] });
    await expect(
      mkService(prisma).update("fantasma", { intro: "x" }, "adm-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

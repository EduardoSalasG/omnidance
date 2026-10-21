import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FeatureFlagsService } from "./feature-flags.service";
import type { PrismaService } from "../prisma.service";

// FeatureFlagsService (spec feature-flags-admin). Reglas bajo prueba:
// - list() ordena por label y resuelve el editor (updatedById → person)
// - isEnabled() cachea 30s, fail-closed con flag inexistente
// - setEnabled() persiste updatedById, audita FEATURE_FLAG_TOGGLE y deja
//   la cache caliente (lectura inmediata del valor nuevo)
// - setEnabled() sobre key inexistente → 404 sin tocar audit

type FlagRow = {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  updatedById: string | null;
  updatedAt: Date;
};

function mkPrisma(initial: FlagRow[] = []) {
  const flags = new Map<string, FlagRow>(initial.map((f) => [f.key, f]));
  const persons = new Map<string, { id: string; name: string; email: string }>();
  const audit: Record<string, unknown>[] = [];
  const prisma = {
    featureFlag: {
      findMany: vi.fn(async (args?: { select?: Record<string, boolean> }) => {
        const rows = [...flags.values()].sort((a, b) =>
          a.label.localeCompare(b.label),
        );
        if (args?.select) {
          return rows.map((r) =>
            Object.fromEntries(
              Object.keys(args.select!).map((k) => [
                k,
                r[k as keyof FlagRow],
              ]),
            ),
          );
        }
        return rows;
      }),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        return flags.get(where.key) ?? null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { key: string };
          data: Partial<FlagRow>;
        }) => {
          const row = flags.get(where.key);
          if (!row) throw new Error("P2025");
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        },
      ),
    },
    person: {
      findMany: vi.fn(
        async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in
            .map((id) => persons.get(id))
            .filter((p): p is NonNullable<typeof p> => p != null),
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return data;
      }),
    },
    _flags: flags,
    _persons: persons,
    _audit: audit,
  };
  return prisma as unknown as PrismaService & {
    _flags: Map<string, FlagRow>;
    _persons: Map<string, { id: string; name: string; email: string }>;
    _audit: Record<string, unknown>[];
  };
}

const flag = (key: string, enabled: boolean, label = key): FlagRow => ({
  key,
  label,
  description: null,
  enabled,
  updatedById: null,
  updatedAt: new Date("2026-01-01"),
});

describe("FeatureFlagsService", () => {
  it("list() ordena por label y resuelve el nombre del editor", async () => {
    const prisma = mkPrisma([
      { ...flag("trip_planner", true), label: "Mi viaje" },
      {
        ...flag("social_pass", false),
        label: "Pase Social",
        updatedById: "adm-1",
      },
    ]);
    prisma._persons.set("adm-1", {
      id: "adm-1",
      name: "Admin",
      email: "adm@x.cl",
    });
    const svc = new FeatureFlagsService(prisma);

    const rows = await svc.list();
    expect(rows.map((r) => r.key)).toEqual(["trip_planner", "social_pass"]);
    expect(rows[1].updatedBy).toEqual({
      id: "adm-1",
      name: "Admin",
      email: "adm@x.cl",
    });
    expect(rows[0].updatedBy).toBeNull();
  });

  it("isEnabled() cachea la lectura (una sola query en la ventana)", async () => {
    const prisma = mkPrisma([flag("trip_planner", true)]);
    const svc = new FeatureFlagsService(prisma);

    expect(await svc.isEnabled("trip_planner")).toBe(true);
    expect(await svc.isEnabled("trip_planner")).toBe(true);
    expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(1);
  });

  it("isEnabled() es fail-closed con flag inexistente", async () => {
    const svc = new FeatureFlagsService(mkPrisma());
    expect(await svc.isEnabled("no_existe")).toBe(false);
  });

  it("setEnabled() persiste actor, audita y deja la lectura caliente", async () => {
    const prisma = mkPrisma([flag("social_pass", false)]);
    const svc = new FeatureFlagsService(prisma);

    await svc.isEnabled("social_pass"); // cachea false
    const row = await svc.setEnabled("social_pass", true, "adm-9");

    expect(row.enabled).toBe(true);
    expect(row.updatedById).toBe("adm-9");
    // Lectura caliente: responde el valor nuevo sin expirar el TTL.
    expect(await svc.isEnabled("social_pass")).toBe(true);
    expect(prisma._audit).toEqual([
      {
        actorId: "adm-9",
        action: "FEATURE_FLAG_TOGGLE",
        targetType: "FeatureFlag",
        targetId: "social_pass",
        payload: { flag: "social_pass", enabled: true },
      },
    ]);
  });

  it("setEnabled() con key inexistente → 404 sin audit", async () => {
    const prisma = mkPrisma();
    const svc = new FeatureFlagsService(prisma);
    await expect(
      svc.setEnabled("no_existe", true, "adm-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma._audit).toEqual([]);
  });

  it("publicMap() devuelve {key: enabled} de todos los flags", async () => {
    const prisma = mkPrisma([
      flag("social_pass", false),
      flag("trip_planner", true),
    ]);
    const svc = new FeatureFlagsService(prisma);
    expect(await svc.publicMap()).toEqual({
      social_pass: false,
      trip_planner: true,
    });
  });
});

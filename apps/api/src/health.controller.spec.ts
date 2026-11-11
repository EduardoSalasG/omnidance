import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "./prisma.service";
import { HealthController } from "./health.controller";

// spec api-hardening: /health responde estado del proceso sin tocar la
// DB (flood barato); el check de Postgres vive aparte en /health/db.
describe("HealthController", () => {
  const prisma = { $queryRaw: vi.fn(async () => [{ "?column?": 1 }]) };
  const ctrl = new HealthController(prisma as unknown as PrismaService);

  it("GET /health responde ok sin consultar Postgres", () => {
    expect(ctrl.check()).toEqual({
      status: "ok",
      service: "omnidance-api",
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("GET /health/db sí ejecuta el SELECT 1", async () => {
    await expect(ctrl.checkDb()).resolves.toMatchObject({
      status: "ok",
      db: "up",
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

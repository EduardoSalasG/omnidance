import { describe, expect, it, vi } from "vitest";
import "../../auth/infrastructure/auth.controller"; // rompe el ciclo session.guard ⇄ auth.controller
import { AdminJobsController, RunsQueryDto } from "./jobs.controller";
import type { JobsService } from "../../jobs/jobs.service";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

// AdminJobsController (spec admin-jobs-mail-campaigns): wiring de rutas
//; list/update/run/runs delegan al service con key + actor de sesión.

const req = (id = "adm-1") => ({ person: { id } }) as never;

function mkJobs() {
  return {
    list: vi.fn(async () => []),
    update: vi.fn(async (key: string) => ({ key })),
    runNow: vi.fn(async () => ({ id: "run-1" })),
    listRuns: vi.fn(async () => []),
  } as unknown as JobsService;
}

describe("AdminJobsController", () => {
  it("update delega key + patch + actor", async () => {
    const jobs = mkJobs();
    const ctrl = new AdminJobsController(jobs);
    await ctrl.update(
      "academies.renewal_reminders",
      { cronExpr: "0 10 * * *", enabled: true },
      req("adm-9"),
    );
    expect(jobs.update).toHaveBeenCalledWith(
      "academies.renewal_reminders",
      "adm-9",
      { cronExpr: "0 10 * * *", enabled: true },
    );
  });

  it("run dispara corrida manual con el actor de sesión", async () => {
    const jobs = mkJobs();
    const ctrl = new AdminJobsController(jobs);
    const run = await ctrl.run("crm.triggers", req("adm-2"));
    expect(jobs.runNow).toHaveBeenCalledWith("crm.triggers", "adm-2");
    expect(run).toEqual({ id: "run-1" });
  });

  it("runs usa take por defecto de 50", async () => {
    const jobs = mkJobs();
    const ctrl = new AdminJobsController(jobs);
    await ctrl.runs("tickets.day_of", {});
    expect(jobs.listRuns).toHaveBeenCalledWith("tickets.day_of", 50);
  });

  it("runs pasa el take validado al service", async () => {
    const jobs = mkJobs();
    const ctrl = new AdminJobsController(jobs);
    await ctrl.runs("tickets.day_of", { take: 25 });
    expect(jobs.listRuns).toHaveBeenCalledWith("tickets.day_of", 25);
  });
});

// RunsQueryDto: take llega como string en la query (?take=25); el
// @Type(() => Number) del pipe global lo castea antes de validar.
// Sin el transform IsInt rechazaba el string con 400.
describe("RunsQueryDto (take por query)", () => {
  it("castea '25' a número y valida", async () => {
    const dto = plainToInstance(RunsQueryDto, { take: "25" });
    expect(await validate(dto)).toEqual([]);
    expect(dto.take).toBe(25);
  });

  it("sin take queda undefined (default 50 en el controller)", async () => {
    const dto = plainToInstance(RunsQueryDto, {});
    expect(await validate(dto)).toEqual([]);
    expect(dto.take).toBeUndefined();
  });

  it.each(["0", "201", "abc", "1.5"])(
    "take=%s fuera de rango o no entero → error de validación",
    async (take) => {
      const dto = plainToInstance(RunsQueryDto, { take });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === "take")).toBe(true);
    },
  );
});

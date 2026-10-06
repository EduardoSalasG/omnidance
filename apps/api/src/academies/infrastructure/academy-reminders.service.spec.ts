import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { ParamsService } from "../../params/params.service";
import type { Mailer } from "../../auth/domain/ports";
import { AcademyRemindersService } from "./academy-reminders.service";

// Recordatorios de renovación (spec academy-renewal-reminders):
// ventanas, dedup por ciclo, exclusiones y tolerancia a fallos.
// prisma.enrollment.findMany se simula por llamada (1ª = expirings,
// 2ª = en gracia); person.findMany resuelve nombre/email por lote.

const DAY = 86_400_000;
const NOW = new Date("2026-10-26T12:00:00Z");

interface FakeEnrollmentRow {
  id: string;
  personId: string;
  academyId: string;
  endsAt: Date | null;
  reminderExpiringFor: Date | null;
  reminderExpiredFor: Date | null;
  academy: { name: string };
  plan: { name: string } | null;
}

const PEOPLE = new Map([
  [
    "per-1",
    { id: "per-1", email: "alumno@x.dev", name: "Ana Alumna" },
  ],
]);

const row = (over: Partial<FakeEnrollmentRow> = {}): FakeEnrollmentRow => ({
  id: "enr-1",
  personId: "per-1",
  academyId: "acad-1",
  endsAt: new Date(NOW.getTime() + 4 * DAY), // vence en 4d
  reminderExpiringFor: null,
  reminderExpiredFor: null,
  academy: { name: "Academia X" },
  plan: { name: "Mensual" },
  ...over,
});

function makeService(expiring: FakeEnrollmentRow[], grace: FakeEnrollmentRow[]) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const findMany = vi
    .fn()
    .mockResolvedValueOnce(expiring)
    .mockResolvedValueOnce(grace);
  const prisma = {
    enrollment: {
      findMany,
      update: vi.fn(
        async (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          updates.push({ id: args.where.id, data: args.data });
        },
      ),
    },
    person: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .map((id) => PEOPLE.get(id))
          .filter((p): p is NonNullable<typeof p> => p != null),
      ),
    },
  } as unknown as PrismaService;
  const notifications = {
    notifySafe: vi.fn(async () => undefined),
  } as unknown as NotificationsService;
  const params = {
    getNumber: vi.fn(async (_k: string, fb: number) => fb),
  } as unknown as ParamsService;
  const mailer = { send: vi.fn(async () => undefined) } as unknown as Mailer;
  const svc = new AcademyRemindersService(prisma, notifications, params, mailer);
  return { svc, mailer, notifications, updates, findMany };
}

describe("AcademyRemindersService.runDaily", () => {
  beforeEach(() => vi.clearAllMocks());

  it("endsAt dentro de la ventana → email por vencer + notificación + marcador", async () => {
    const { svc, mailer, notifications, updates } = makeService([row()], []);
    const res = await svc.runDaily(NOW);
    expect(res.expiring).toBe(1);
    expect(mailer.send).toHaveBeenCalledOnce();
    const [to, subject, html] = (mailer.send as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(to).toBe("alumno@x.dev");
    expect(subject).toContain("Academia X");
    expect(html).toContain("Mensual");
    expect(html).toContain("/academias/acad-1");
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "per-1",
      expect.objectContaining({ type: "academy.plan_expiring" }),
    );
    expect(updates[0].data.reminderExpiringFor).toEqual(
      new Date(NOW.getTime() + 4 * DAY),
    );
  });

  it("marcador igual al endsAt → no reenvía (dedup del ciclo)", async () => {
    const endsAt = new Date(NOW.getTime() + 4 * DAY);
    const { svc, mailer } = makeService(
      [row({ reminderExpiringFor: endsAt })],
      [],
    );
    const res = await svc.runDaily(NOW);
    expect(res.expiring).toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("renovación (endsAt nuevo ≠ marcador) → rearma el aviso", async () => {
    const { svc, mailer } = makeService(
      [
        row({
          endsAt: new Date(NOW.getTime() + 2 * DAY),
          reminderExpiringFor: new Date(NOW.getTime() - 30 * DAY),
        }),
      ],
      [],
    );
    const res = await svc.runDaily(NOW);
    expect(res.expiring).toBe(1);
    expect(mailer.send).toHaveBeenCalledOnce();
  });

  it("consultas solo ACTIVE/ONLINE y con endsAt en ventana", async () => {
    const { svc, findMany } = makeService([], []);
    await svc.runDaily(NOW);
    const [expArgs, graceArgs] = findMany.mock.calls;
    expect(expArgs[0].where.status).toEqual({ in: ["ACTIVE", "ONLINE"] });
    expect(expArgs[0].where.endsAt.gte).toEqual(NOW);
    expect(expArgs[0].where.endsAt.lte).toEqual(
      new Date(NOW.getTime() + 5 * DAY),
    );
    expect(graceArgs[0].where.endsAt.lt).toEqual(NOW);
    expect(graceArgs[0].where.endsAt.gte).toEqual(
      new Date(NOW.getTime() - 5 * DAY),
    );
  });

  it("endsAt vencido dentro de gracia → email de gracia con fecha límite", async () => {
    const endsAt = new Date(NOW.getTime() - DAY); // venció ayer
    const { svc, mailer, notifications, updates } = makeService(
      [],
      [row({ endsAt })],
    );
    const res = await svc.runDaily(NOW);
    expect(res.grace).toBe(1);
    const [to, subject, html] = (mailer.send as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(to).toBe("alumno@x.dev");
    expect(subject).toContain("venció");
    expect(html).toContain("no podrás agendar");
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "per-1",
      expect.objectContaining({ type: "academy.plan_grace" }),
    );
    expect(updates[0].data.reminderExpiredFor).toEqual(endsAt);
  });

  it("un mail que falla no detiene el barrido", async () => {
    const { svc, mailer } = makeService(
      [row({ id: "e1" }), row({ id: "e2" })],
      [],
    );
    (mailer.send as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("resend down"))
      .mockResolvedValueOnce(undefined);
    const res = await svc.runDaily(NOW);
    expect(res.expiring).toBe(1);
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });
});

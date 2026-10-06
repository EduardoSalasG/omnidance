import { describe, expect, it, vi } from "vitest";
import { TicketDayOfService } from "./ticket-day-of.service";

// TicketDayOfService (spec wallet-passes): push day-of - eventos
// PUBLISHED/LIVE que inician hoy en America/Santiago → notificación
// ticket.day_of a cada dueño de ticket ACTIVE, dedup por
// (persona, evento, día) contra Notification con data.eventId.

function mkDeps() {
  const sent: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const tickets: Record<string, unknown>[] = [];
  const prisma = {
    event: {
      findMany: vi.fn(async (args?: { where?: { status?: { in: string[] } } }) => {
        const allowed = args?.where?.status?.in ?? [];
        return events.filter((e) => allowed.includes(e.status as string));
      }),
    },
    ticket: {
      findMany: vi.fn(async () => tickets),
    },
    notification: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { personId: string; data?: { equals?: string } };
        }) =>
          sent.find(
            (n) =>
              n.personId === where.personId &&
              n.type === "ticket.day_of" &&
              (n.data as Record<string, unknown>)?.eventId ===
                where.data?.equals,
          ) ?? null,
      ),
    },
    _events: events,
    _tickets: tickets,
    _sent: sent,
  };
  const notifications = {
    notifySafe: vi.fn(async (personId: string, input: Record<string, unknown>) => {
      sent.push({ personId, ...input });
    }),
  };
  return { prisma, notifications };
}

describe("TicketDayOfService", () => {
  it("notifica a dueños de tickets ACTIVE de eventos del día (PUBLISHED/LIVE)", async () => {
    const { prisma, notifications } = mkDeps();
    prisma._events.push(
      { id: "e1", name: "Social SBK", status: "PUBLISHED" },
      { id: "e2", name: "En vivo", status: "LIVE" },
      { id: "e3", name: "Cancelado", status: "CANCELLED" },
    );
    prisma._tickets.push(
      { ownerId: "p1", eventId: "e1" },
      { ownerId: "p2", eventId: "e1" },
      { ownerId: "p3", eventId: "e2" },
      { ownerId: "p4", eventId: "e3" },
    );
    const svc = new TicketDayOfService(prisma as never, notifications as never);
    const r = await svc.runDaily();
    expect(r).toEqual({ events: 2, notified: 3 });
    const p1 = prisma._sent.find((n) => n.personId === "p1");
    expect(p1?.type).toBe("ticket.day_of");
    expect(p1?.category).toBe("SOCIAL");
    expect((p1?.data as Record<string, unknown>).eventId).toBe("e1");
    expect((p1?.data as Record<string, unknown>).url).toBe("/qr");
    expect(prisma._sent.find((n) => n.personId === "p4")).toBeUndefined();
  });

  it("un segundo barrido el mismo día no duplica", async () => {
    const { prisma, notifications } = mkDeps();
    prisma._events.push({ id: "e1", name: "X", status: "PUBLISHED" });
    prisma._tickets.push({ ownerId: "p1", eventId: "e1" });
    const svc = new TicketDayOfService(prisma as never, notifications as never);
    await svc.runDaily();
    const second = await svc.runDaily();
    expect(second.notified).toBe(0);
    expect(prisma._sent).toHaveLength(1);
  });

  it("sin eventos del día → no consulta tickets ni notifica", async () => {
    const { prisma, notifications } = mkDeps();
    const svc = new TicketDayOfService(prisma as never, notifications as never);
    const r = await svc.runDaily();
    expect(r).toEqual({ events: 0, notified: 0 });
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });
});

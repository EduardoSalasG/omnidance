import type { Prisma } from "@prisma/client";
import type { QueryFilters } from "@omnidance/shared";
import type { PrismaService } from "../../prisma.service";
import {
  exportDataset,
  type ExportDataset,
} from "../producer-export";
import {
  dateRange,
  iso,
  personNames,
  whitelist,
  type EntityHandler,
  type EntityResult,
  type QueryScope,
} from "./helpers";

/**
 * Entidades del lente PRODUCER (spec analytics/query-console): los tres
 * datasets de export existentes (sales/checkins/guestlist - mismos
 * builders que /events/:id/export.*) más attendees/reservations/waitlist/
 * rsvps. Scope = eventos propios del productor (o el evento/serie elegido
 * vía scopeId) ya validado por QueryService - con scopeId ajeno llega
 * `{in: []}` y el resultado es vacío, nunca datos de otro.
 */

const eventScope = (scope: QueryScope): string | { in: string[] } =>
  scope.eventId ?? { in: [] };

const evCol = (scope: QueryScope, eventId: string): unknown[] =>
  scope.labelByEvent ? [scope.labelByEvent.get(eventId) ?? ""] : [];

const capped = (
  rows: unknown[][],
  take?: number,
  skip?: number,
): unknown[][] => {
  const from = skip ?? 0;
  return take == null ? rows.slice(from) : rows.slice(from, from + take);
};

function producerDataset(dataset: ExportDataset): EntityHandler {
  return {
    async execute(prisma, scope, filters, opts) {
      const table = await exportDataset(
        prisma,
        dataset,
        eventScope(scope),
        scope.labelByEvent,
        filters,
      );
      return {
        rows: capped(table.rows, opts?.take, opts?.skip),
        total: table.rows.length,
        summary: table.summary,
      };
    },
  };
}

/** Asistentes únicos (Checkin sin anular) → primera/última entrada + visitas. */
const attendees: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const method = whitelist(
      f.method,
      ["SCAN", "MANUAL", "OFFLINE"] as const,
      "method",
    );
    const range = dateRange(f.from, f.to);
    const where: Prisma.CheckinWhereInput = {
      eventId: eventScope(scope),
      voidedAt: null,
      ...(method ? { method } : {}),
      ...(range ? { inAt: range } : {}),
    };
    const checkins = await prisma.checkin.findMany({
      where,
      orderBy: { inAt: "asc" },
      select: { personId: true, eventId: true, inAt: true },
    });
    const byPerson = new Map<
      string,
      { personId: string; first: Date; last: Date; visits: number }
    >();
    for (const c of checkins) {
      const cur = byPerson.get(c.personId);
      if (!cur) {
        byPerson.set(c.personId, {
          personId: c.personId,
          first: c.inAt,
          last: c.inAt,
          visits: 1,
        });
      } else {
        cur.visits += 1;
        if (c.inAt > cur.last) cur.last = c.inAt;
      }
    }
    const names = await personNames(prisma, [...byPerson.keys()]);
    interface Attendee {
      personId: string;
      first: Date;
      last: Date;
      visits: number;
    }
    const objects: Attendee[] = [...byPerson.values()];
    const total = objects.length;
    const rows = capped(
      objects.map((a) => [
        names.get(a.personId) ?? "?",
        iso(a.first),
        iso(a.last),
        a.visits,
      ]),
      opts?.take,
      opts?.skip,
    );
    return {
      rows,
      total,
      summary: [`${total} asistentes únicos · ${checkins.length} check-ins`],
    };
  },
};

/** Reservas de mesa del evento/serie (spec checkout-table-reservation). */
const reservations: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const status = whitelist(
      f.status,
      ["REQUESTED", "CONFIRMED", "CANCELLED"] as const,
      "status",
    );
    const range = dateRange(f.from, f.to);
    const where: Prisma.TableReservationWhereInput = {
      eventId: eventScope(scope),
      ...(status ? { status } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const rows0 = await prisma.tableReservation.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    const names = await personNames(
      prisma,
      rows0.map((r) => r.personId),
    );
    const total = rows0.length;
    return {
      rows: capped(
        rows0.map((r) => [
          ...evCol(scope, r.eventId),
          iso(r.createdAt),
          names.get(r.personId) ?? "?",
          r.partySize,
          r.tableNo ?? "",
          r.status,
        ]),
        opts?.take,
        opts?.skip,
      ),
      total,
      summary: [
        `${total} reservas · ${rows0
          .filter((r) => r.status !== "CANCELLED")
          .reduce((a, r) => a + r.partySize, 0)} personas en activas`,
      ],
    };
  },
};

/** Lista de espera del evento/serie. */
const waitlist: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const status = whitelist(
      f.status,
      ["WAITING", "PROMOTED", "EXPIRED"] as const,
      "status",
    );
    const range = dateRange(f.from, f.to);
    const where: Prisma.WaitlistWhereInput = {
      eventId: eventScope(scope),
      ...(status ? { status } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const rows0 = await prisma.waitlist.findMany({
      where,
      orderBy: [{ eventId: "asc" }, { position: "asc" }],
    });
    const names = await personNames(
      prisma,
      rows0.map((r) => r.personId),
    );
    const total = rows0.length;
    return {
      rows: capped(
        rows0.map((r) => [
          ...evCol(scope, r.eventId),
          iso(r.createdAt),
          names.get(r.personId) ?? "?",
          r.position,
          r.status,
        ]),
        opts?.take,
        opts?.skip,
      ),
      total,
      summary: [`${total} en lista de espera`],
    };
  },
};

/** RSVPs "voy" del evento/serie. */
const rsvps: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const range = dateRange(f.from, f.to);
    const where: Prisma.RsvpWhereInput = {
      eventId: eventScope(scope),
      ...(range ? { createdAt: range } : {}),
    };
    const rows0 = await prisma.rsvp.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { personId: true, eventId: true, createdAt: true },
    });
    const names = await personNames(
      prisma,
      rows0.map((r) => r.personId),
    );
    const total = rows0.length;
    return {
      rows: capped(
        rows0.map((r) => [
          ...evCol(scope, r.eventId),
          names.get(r.personId) ?? "?",
          iso(r.createdAt),
        ]),
        opts?.take,
        opts?.skip,
      ),
      total,
      summary: [`${total} confirmaciones`],
    };
  },
};

export const PRODUCER_ENTITIES: Record<string, EntityHandler> = {
  sales: producerDataset("sales"),
  checkins: producerDataset("checkins"),
  guestlist: producerDataset("guestlist"),
  attendees,
  reservations,
  waitlist,
  rsvps,
};

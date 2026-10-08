import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  entityDef,
  QUERY_CATALOG,
  QUERY_ROLES,
  SYSTEM_QUERIES,
  type FkSource,
  type QueryFilters,
  type QueryRole,
  type QueryRunResult,
} from "@omnidance/shared";
import { PrismaService } from "../prisma.service";
import { assertProducerPro } from "../common/producer-pro";
import { ADMIN_ENTITIES } from "./entities/admin";
import { ACADEMY_ENTITIES } from "./entities/academy";
import { PRODUCER_ENTITIES } from "./entities/producer";
import { validateEntityFilters, validateSavedParams } from "./filters";
import type { EntityHandler, QueryScope } from "./entities/helpers";
import type { ExportTable } from "./producer-export";

/**
 * Motor de consultas compartido (spec analytics/query-console): registry
 * entidad → handler con scoping por lente inyectado. ADMIN = global;
 * PRODUCER = sus eventos/series (gate Producer Pro); ACADEMY_OWNER = sus
 * academias. Un scopeId ajeno produce `{in: []}` → vacío, nunca datos ni
 * 403 que revele existencia fuera del catálogo del actor.
 */

const PREVIEW_ROWS = 50;
const OPTION_TAKE = 300;

export interface QueryOption {
  value: string;
  label: string;
  kind?: "event" | "series";
}

const ENTITIES: Record<QueryRole, Record<string, EntityHandler>> = {
  PRODUCER: PRODUCER_ENTITIES,
  ACADEMY_OWNER: ACADEMY_ENTITIES,
  ADMIN: ADMIN_ENTITIES,
};

/** Títulos es-CL por entidad para el encabezado del PDF exportado. */
const ENTITY_TITLES: Record<QueryRole, Record<string, string>> = {
  PRODUCER: {
    sales: "Ventas",
    checkins: "Check-ins",
    guestlist: "Listas de invitados",
    attendees: "Asistentes",
    reservations: "Reservas de mesa",
    waitlist: "Lista de espera",
    rsvps: "Confirmaciones",
  },
  ACADEMY_OWNER: {
    students: "Alumnos",
    attendance: "Asistencia",
    bookings: "Reservas de clases",
    memberships: "Suscripciones",
    payments: "Pagos",
    private_lessons: "Clases particulares",
  },
  ADMIN: {
    events: "Eventos",
    classes: "Clases",
    payments: "Pagos",
    tickets: "Tickets",
    academies: "Academias",
    venues: "Locales",
    rentals: "Arriendos",
    people: "Personas",
    leads: "Leads",
    "payment-events": "Eventos de pago",
    "gateway-transactions": "Transacciones de pasarela",
    "membership-subscriptions": "Suscripciones",
    payouts: "Liquidaciones",
  },
};

@Injectable()
export class QueryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lente válido + aprobado (misma regla que AnalyticsService: PersonRole
   * APPROVED ∩ lentes del catálogo). Inválido o no aprobado → 403.
   */
  async assertLens(personId: string, role: string): Promise<QueryRole> {
    if (!(QUERY_ROLES as readonly string[]).includes(role)) {
      throw new ForbiddenException("lente inválido");
    }
    const approved = await this.prisma.personRole.findFirst({
      where: { personId, role, status: "APPROVED" },
      select: { id: true },
    });
    if (!approved) {
      throw new ForbiddenException(
        "tu rol no tiene consultas o no está aprobado",
      );
    }
    return role as QueryRole;
  }

  /** Lens + gate Producer Pro (catálogo/run/export/options del lente). */
  private async assertLensWithPro(
    personId: string,
    role: string,
  ): Promise<QueryRole> {
    const r = await this.assertLens(personId, role);
    if (r === "PRODUCER") await assertProducerPro(this.prisma, personId);
    return r;
  }

  // ─── Catálogo y opciones FK ─────────────────────────────────────────

  /**
   * GET /query/catalog?role= — entidades del lente con sus filtros y
   * columnas (del catálogo shared) + opciones FK no-scope-dependientes
   * resueltas (scope pickers del actor; fuentes globales admin).
   */
  async catalog(personId: string, roleRaw: string) {
    const role = await this.assertLensWithPro(personId, roleRaw);
    const options: Record<string, QueryOption[]> = {};
    let scopes: QueryOption[] = [];
    if (role === "PRODUCER") {
      scopes = await this.myEventScopes(personId);
      options.myEventScopes = scopes;
    } else if (role === "ACADEMY_OWNER") {
      scopes = await this.myAcademies(personId);
      options.myAcademies = scopes;
    } else {
      Object.assign(options, await this.adminOptions());
    }
    return {
      entities: QUERY_CATALOG[role],
      scopes,
      options,
      system: SYSTEM_QUERIES[role],
    };
  }

  /**
   * GET /query/options?role=&source=&scopeId= — resuelve una fuente FK.
   * Las fuentes scope-dependientes (academyPlans, academyClassSeries,
   * academyInstructors, eventGuestLists) exigen scopeId y validan
   * ownership (ajeno → lista vacía). La fuente debe estar declarada por
   * alguna entidad del lente → si no, 400.
   */
  async options(
    personId: string,
    roleRaw: string,
    source: string,
    scopeId?: string,
  ): Promise<{ options: QueryOption[] }> {
    const role = await this.assertLensWithPro(personId, roleRaw);
    const declared = new Set(
      QUERY_CATALOG[role].flatMap((e) =>
        e.filters.map((f) => f.source).filter((s): s is FkSource => !!s),
      ),
    );
    if (!declared.has(source as FkSource)) {
      throw new BadRequestException(`source inválido: "${source}"`);
    }
    switch (source as FkSource) {
      case "myEventScopes":
        return { options: await this.myEventScopes(personId) };
      case "myAcademies":
        return { options: await this.myAcademies(personId) };
      case "academyPlans":
        return {
          options: await this.academyScoped(personId, role, scopeId, (id) =>
            this.prisma.membershipPlan
              .findMany({
                where: { academyId: id },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
                take: OPTION_TAKE,
              })
              .then((r) => r.map((p) => ({ value: p.id, label: p.name }))),
          ),
        };
      case "academyClassSeries":
        return {
          options: await this.academyScoped(personId, role, scopeId, (id) =>
            this.prisma.classSeries
              .findMany({
                where: { academyId: id },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
                take: OPTION_TAKE,
              })
              .then((r) => r.map((s) => ({ value: s.id, label: s.name }))),
          ),
        };
      case "academyInstructors":
        return {
          options: await this.academyScoped(personId, role, scopeId, async (id) => {
            const rows = await this.prisma.academyInstructor.findMany({
              where: { academyId: id },
              select: { personId: true },
              take: OPTION_TAKE,
            });
            const names = new Map(
              (
                await this.prisma.person.findMany({
                  where: { id: { in: rows.map((r) => r.personId) } },
                  select: { id: true, name: true },
                })
              ).map((p) => [p.id, p.name]),
            );
            return rows.map((r) => ({
              value: r.personId,
              label: names.get(r.personId) ?? "?",
            }));
          }),
        };
      case "eventGuestLists": {
        if (!scopeId) throw new BadRequestException("scopeId requerido");
        const scope = await this.producerEventScope(personId, role, scopeId);
        if (!scope.eventId) return { options: [] };
        const lists = await this.prisma.guestList.findMany({
          where: { eventId: scope.eventId },
          select: { id: true, label: true, ownerId: true },
          take: OPTION_TAKE,
        });
        return {
          options: lists.map((l) => ({
            value: l.id,
            label: l.label ?? `Lista ${l.id.slice(0, 6)}`,
          })),
        };
      }
      default:
        return { options: await this.adminOption(source) };
    }
  }

  /** Opciones de una academia - validando ownership según lente. */
  private async academyScoped(
    personId: string,
    role: QueryRole,
    academyId: string | undefined,
    resolve: (academyId: string) => Promise<QueryOption[]>,
  ): Promise<QueryOption[]> {
    if (!academyId) throw new BadRequestException("scopeId requerido");
    if (role === "ADMIN") return resolve(academyId);
    // ACADEMY_OWNER: solo academias propias - ajena → lista vacía.
    const owned = await this.prisma.academy.findFirst({
      where: { id: academyId, ownerId: personId },
      select: { id: true },
    });
    if (!owned) return [];
    return resolve(academyId);
  }

  // ─── Ejecución ──────────────────────────────────────────────────────

  /** POST /query/run — preview capado a PREVIEW_ROWS + total real. */
  async run(
    personId: string,
    input: { role: string; entity: string; filters?: QueryFilters },
  ): Promise<QueryRunResult> {
    const role = await this.assertLensWithPro(personId, input.role);
    const { def, handler } = this.resolveEntity(role, input.entity);
    const filters = validateEntityFilters(def, input.filters);
    const scope = await this.scopeFor(personId, role, filters);
    const res = await handler.execute(this.prisma, scope, filters, {
      take: PREVIEW_ROWS,
    });
    return {
      headers: this.headers(def.columns, scope),
      rows: res.rows,
      total: res.total,
      summary: res.summary,
    };
  }

  /**
   * Tabla completa para /query/export.{csv,pdf} (sin cap de preview) -
   * misma fuente de datos que run().
   */
  async exportTable(
    personId: string,
    roleRaw: string,
    entity: string,
    rawFilters: Record<string, unknown>,
  ): Promise<{ title: string; table: ExportTable }> {
    const role = await this.assertLensWithPro(personId, roleRaw);
    const { def, handler } = this.resolveEntity(role, entity);
    const filters = validateEntityFilters(def, rawFilters);
    const scope = await this.scopeFor(personId, role, filters);
    const res = await handler.execute(this.prisma, scope, filters);
    return {
      title: ENTITY_TITLES[role][entity] ?? entity,
      table: {
        headers: this.headers(def.columns, scope),
        rows: res.rows,
        summary: res.summary,
      },
    };
  }

  private resolveEntity(role: QueryRole, entity: string) {
    const def = entityDef(role, entity);
    const handler = ENTITIES[role][entity];
    if (!def || !handler) {
      throw new BadRequestException(`entity inválido: "${entity}"`);
    }
    return { def, handler };
  }

  private headers(columns: readonly string[], scope: QueryScope): string[] {
    return [...(scope.labelByEvent ? ["evento"] : []), ...columns];
  }

  /**
   * Scope del lente ya validado por ownership: ADMIN = global; PRODUCER =
   * sus eventos/series (scopeId evento|serie, ajeno → `{in:[]}` = vacío);
   * ACADEMY_OWNER = sus academias (academyId ajena → vacío).
   */
  private async scopeFor(
    personId: string,
    role: QueryRole,
    filters: QueryFilters,
  ): Promise<QueryScope> {
    if (role === "ADMIN") return {};
    if (role === "ACADEMY_OWNER") {
      const owned = new Set(
        (
          await this.prisma.academy.findMany({
            where: { ownerId: personId },
            select: { id: true },
          })
        ).map((a) => a.id),
      );
      const academyId = filters.academyId;
      if (academyId) {
        return { academyId: owned.has(academyId) ? academyId : { in: [] } };
      }
      return { academyId: { in: [...owned] } };
    }
    // PRODUCER
    const scopeId = filters.scopeId;
    if (scopeId) {
      return this.producerEventScope(personId, role, scopeId);
    }
    const events = await this.prisma.event.findMany({
      where: {
        OR: [
          { producerId: personId },
          { series: { producerId: personId } },
        ],
      },
      select: { id: true },
    });
    return { eventId: { in: events.map((e) => e.id) } };
  }

  /**
   * scopeId del lente PRODUCER = eventId o seriesId del actor. Evento
   * propio → ese id; serie propia → sus eventos + etiquetas `evento`;
   * ajeno → `{in:[]}` (vacío, sin revelar existencia). ADMIN resuelve el
   * mismo scopeId sin ownership (export admin-side del engine).
   */
  private async producerEventScope(
    personId: string,
    role: QueryRole,
    scopeId: string,
  ): Promise<QueryScope> {
    const ev = await this.prisma.event.findUnique({
      where: { id: scopeId },
      select: { id: true, producerId: true },
    });
    if (ev && (role === "ADMIN" || ev.producerId === personId)) {
      return { eventId: scopeId };
    }
    const series = await this.prisma.eventSeries.findUnique({
      where: { id: scopeId },
      select: { id: true, producerId: true },
    });
    if (series && (role === "ADMIN" || series.producerId === personId)) {
      const events = await this.prisma.event.findMany({
        where: { seriesId: scopeId },
        select: { id: true, name: true, startsAt: true },
        orderBy: { startsAt: "asc" },
      });
      return {
        eventId: { in: events.map((e) => e.id) },
        labelByEvent: new Map(
          events.map((e) => [
            e.id,
            `${e.name} (${e.startsAt.toISOString().slice(0, 10)})`,
          ]),
        ),
      };
    }
    return { eventId: { in: [] } };
  }

  // ─── Opciones FK ────────────────────────────────────────────────────

  /** Eventos + series propias del productor como opciones de scopeId. */
  private async myEventScopes(personId: string): Promise<QueryOption[]> {
    const [events, series] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          OR: [{ producerId: personId }, { series: { producerId: personId } }],
        },
        select: { id: true, name: true, startsAt: true },
        orderBy: { startsAt: "desc" },
        take: OPTION_TAKE,
      }),
      this.prisma.eventSeries.findMany({
        where: { producerId: personId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: OPTION_TAKE,
      }),
    ]);
    return [
      ...series.map((s) => ({
        value: s.id,
        label: s.name,
        kind: "series" as const,
      })),
      ...events.map((e) => ({
        value: e.id,
        label: `${e.name} (${e.startsAt.toISOString().slice(0, 10)})`,
        kind: "event" as const,
      })),
    ];
  }

  private async myAcademies(personId: string): Promise<QueryOption[]> {
    const academies = await this.prisma.academy.findMany({
      where: { ownerId: personId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return academies.map((a) => ({ value: a.id, label: a.name }));
  }

  private async adminOptions(): Promise<Record<string, QueryOption[]>> {
    const [producers, venues, academies, styles, events, roles] =
      await Promise.all([
        this.prisma.person.findMany({
          where: {
            roles: { some: { role: "PRODUCER", status: "APPROVED" } },
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: OPTION_TAKE,
        }),
        this.prisma.venue.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: OPTION_TAKE,
        }),
        this.prisma.academy.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: OPTION_TAKE,
        }),
        this.prisma.style.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: OPTION_TAKE,
        }),
        this.prisma.event.findMany({
          select: { id: true, name: true, startsAt: true },
          orderBy: { startsAt: "desc" },
          take: OPTION_TAKE,
        }),
        this.prisma.role.findMany({
          select: { key: true, label: true },
          orderBy: { key: "asc" },
        }),
      ]);
    return {
      producers: producers.map((p) => ({
        value: p.id,
        label: p.name ?? p.id,
      })),
      venues: venues.map((v) => ({ value: v.id, label: v.name })),
      academies: academies.map((a) => ({ value: a.id, label: a.name })),
      styles: styles.map((s) => ({ value: s.id, label: s.name })),
      events: events.map((e) => ({
        value: e.id,
        label: `${e.name} (${e.startsAt.toISOString().slice(0, 10)})`,
      })),
      roles: roles.map((r) => ({ value: r.key, label: r.label })),
    };
  }

  private async adminOption(source: string): Promise<QueryOption[]> {
    const all = await this.adminOptions();
    return all[source] ?? [];
  }

  // ─── Consultas guardadas (SavedReport) ──────────────────────────────
  // Sin gate Pro: listar/editar/borrar lo guardado no ejecuta la consulta.

  async listSaved(personId: string, roleRaw: string) {
    const role = await this.assertLens(personId, roleRaw);
    const saved = await this.prisma.savedReport.findMany({
      where: { personId, role },
      orderBy: { createdAt: "desc" },
    });
    return { saved, system: SYSTEM_QUERIES[role] };
  }

  async createSaved(
    personId: string,
    input: { role: string; name: string; params: unknown },
  ) {
    const role = await this.assertLens(personId, input.role);
    const params = validateSavedParams(role, input.params);
    return this.prisma.savedReport.create({
      data: { personId, role, name: input.name, params: params as object },
    });
  }

  async renameSaved(personId: string, id: string, name: string) {
    const owned = await this.prisma.savedReport.findFirst({
      where: { id, personId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException("consulta no encontrada");
    return this.prisma.savedReport.update({
      where: { id },
      data: { name },
    });
  }

  async deleteSaved(personId: string, id: string) {
    const owned = await this.prisma.savedReport.findFirst({
      where: { id, personId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException("consulta no encontrada");
    await this.prisma.savedReport.delete({ where: { id } });
    return { ok: true };
  }
}

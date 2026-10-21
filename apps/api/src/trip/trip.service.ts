import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { FeatureFlagsService } from "../features/feature-flags.service";
import { PUBLIC_FEED_SELECT, mapPublicFeed } from "../common/event-feed";

// Spec mi-viaje: el trip planner vive detrás del flag `trip_planner` -
// OFF → toda la superficie responde 404 (fail-closed, igual que
// city_landing en CitiesService).
const TRIP_FLAG = "trip_planner";

// Evento guardado: shape del feed público (EventCard del front) + la
// ciudad - el itinerario se agrupa por ciudad en /mi-viaje.
const TRIP_EVENT_SELECT = {
  ...PUBLIC_FEED_SELECT,
  city: { select: { name: true, slug: true, timezone: true } },
} satisfies Prisma.EventSelect;

/**
 * "Mi viaje" (spec mi-viaje): la lista de eventos guardados del
 * bailarín para planear su itinerario multipaís. Todo opera sobre el
 * `personId` del request - ningún método acepta el actor por parámetro
 * externo (aislamiento por persona del spec).
 */
@Injectable()
export class TripService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** Gate del flag - 404 si está apagado (spec). */
  private async assertEnabled() {
    if (!(await this.flags.isEnabled(TRIP_FLAG))) {
      throw new NotFoundException();
    }
  }

  /**
   * GET /me/trip - items del usuario con el evento expandido (shape
   * feed + `city{name,slug}`) ordenados por `startsAt` asc. Default
   * excluye eventos ya pasados (startsAt <= ahora); `includePast`
   * los trae (historial del viaje).
   */
  async list(personId: string, includePast = false) {
    await this.assertEnabled();
    const items = await this.prisma.tripItem.findMany({
      where: {
        personId,
        ...(includePast ? {} : { event: { startsAt: { gt: new Date() } } }),
      },
      orderBy: { event: { startsAt: "asc" } },
      select: {
        note: true,
        addedAt: true,
        event: { select: TRIP_EVENT_SELECT },
      },
    });
    // La herencia genres/genreMix de la serie la resuelve el mismo
    // mapper de la cartelera pública - el card no distingue endpoint.
    const feed = mapPublicFeed(items.map((i) => i.event));
    return items.map((item, i) => ({
      ...feed[i],
      city: item.event.city,
      note: item.note,
      addedAt: item.addedAt,
    }));
  }

  /**
   * GET /me/trip/ids - solo los eventId guardados: liviano para que la
   * ficha de evento resuelva `inTrip` del viewer sin traer el feed
   * completo (GET /events/:id es público y no conoce sesión).
   */
  async ids(personId: string): Promise<string[]> {
    await this.assertEnabled();
    const rows = await this.prisma.tripItem.findMany({
      where: { personId },
      select: { eventId: true },
    });
    return rows.map((r) => r.eventId);
  }

  /**
   * PUT /me/trip/:eventId - upsert idempotente por (person, event):
   * el primer PUT crea, re-PUT con nota distinta la actualiza sin
   * duplicar. `note` ausente NO toca la nota existente (guardar desde
   * la ficha no debe pisar lo que el usuario anotó en /mi-viaje);
   * `note` presente va trimmeada y "" queda null (borrar la nota).
   * 404 si el evento no existe.
   */
  async save(personId: string, eventId: string, note?: string) {
    await this.assertEnabled();
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");
    const normalized = note === undefined ? undefined : note.trim() || null;
    return this.prisma.tripItem.upsert({
      where: { personId_eventId: { personId, eventId } },
      create: { personId, eventId, note: normalized ?? null },
      update: { note: normalized },
      select: { eventId: true, note: true, addedAt: true },
    });
  }

  /** DELETE /me/trip/:eventId - 404 si el evento no estaba guardado. */
  async remove(personId: string, eventId: string) {
    await this.assertEnabled();
    const res = await this.prisma.tripItem.deleteMany({
      where: { personId, eventId },
    });
    if (res.count === 0) throw new NotFoundException();
    return { removed: true };
  }
}

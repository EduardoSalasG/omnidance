import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma.service";

/**
 * Shape compartido del feed público de eventos (GET /events) - lo
 * reusan las superficies de descubrimiento (landing por ciudad,
 * "cerca de mí") para que el EventCard del front reciba siempre el
 * mismo contrato sin importar el endpoint que lo sirvió.
 */
export const PUBLIC_FEED_SELECT = {
  id: true,
  name: true,
  type: true,
  status: true,
  startsAt: true,
  endsAt: true,
  presalePrice: true,
  doorPrice: true,
  genres: true,
  genreMix: true,
  platformFeePct: true,
  // Visibilidad + academia del evento (spec internal-academy-socials):
  // el filtro va en el where; el campo viaja para que el front pueda
  // marcar el social interno al alumno que sí lo ve.
  visibility: true,
  academyId: true,
  series: { select: { id: true, name: true, genres: true, genreMix: true } },
  venue: {
    select: { id: true, name: true, address: true, lat: true, lng: true },
  },
  // Zona horaria de la ciudad del evento - el front formatea startsAt
  // en la hora local del evento (no del server/viewer).
  city: { select: { timezone: true } },
} satisfies Prisma.EventSelect;

export type PublicFeedRow = Prisma.EventGetPayload<{
  select: typeof PUBLIC_FEED_SELECT;
}>;

/**
 * genreMix y genres resueltos igual que en la cartelera: el evento
 * manda; si no tiene, hereda el ciclo de la serie (null → el card no
 * muestra barra de mezcla).
 */
export function mapPublicFeed(rows: PublicFeedRow[]) {
  return rows.map(({ series, genres, genreMix, ...e }) => ({
    ...e,
    genres: genres.length > 0 ? genres : (series?.genres ?? []),
    genreMix: genreMix ?? series?.genreMix ?? null,
    series: series ? { id: series.id, name: series.name } : null,
  }));
}

/**
 * Ids de productores validados (APPROVED): la cartelera pública solo
 * muestra eventos de productores aprobados o sin productor - los
 * PENDING quedan invisibles hasta la aprobación (spec
 * role-registration-pipeline). Mismo filtro en todo listado público.
 */
export async function approvedProducerIds(
  prisma: PrismaService,
): Promise<string[]> {
  const rows = await prisma.personRole.findMany({
    where: { role: "PRODUCER", status: "APPROVED" },
    select: { personId: true },
  });
  return rows.map((r) => r.personId);
}

/** Rama `AND` del where público: sin productor o productor APPROVED. */
export function publicProducerWhere(
  approvedIds: string[],
): Prisma.EventWhereInput {
  return {
    OR: [{ producerId: null }, { producerId: { in: approvedIds } }],
  };
}

/**
 * Rama `AND` de visibilidad (spec internal-academy-socials): PUBLIC
 * para todos; INTERNAL_ACADEMY solo cuando el viewer tiene Enrollment
 * ACTIVE de la academia del evento (los ids los resuelve
 * `viewerAcademyIds` desde la sesión - vacío = solo PUBLIC).
 */
export function visibilityWhere(
  viewerAcademyIds: string[],
): Prisma.EventWhereInput {
  return viewerAcademyIds.length
    ? {
        OR: [
          { visibility: "PUBLIC" },
          {
            visibility: "INTERNAL_ACADEMY",
            academyId: { in: viewerAcademyIds },
          },
        ],
      }
    : { visibility: "PUBLIC" };
}

/**
 * AcademyIds donde la persona tiene Enrollment ACTIVE - input del
 * filtro de visibilidad del feed. Sin sesión → [] (viewer anónimo).
 */
export async function viewerAcademyIds(
  prisma: PrismaService,
  personId: string | undefined,
): Promise<string[]> {
  if (!personId) return [];
  const rows = await prisma.enrollment.findMany({
    where: { personId, status: "ACTIVE" },
    select: { academyId: true },
    distinct: ["academyId"],
  });
  return rows.map((r) => r.academyId);
}

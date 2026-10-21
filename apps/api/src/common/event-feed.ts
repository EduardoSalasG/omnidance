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
  series: { select: { id: true, name: true, genres: true, genreMix: true } },
  venue: {
    select: { id: true, name: true, address: true, lat: true, lng: true },
  },
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

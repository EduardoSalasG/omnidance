import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";

// Los estilos no tienen slug en schema — se deriva del nombre
// ("Salsa cubana (casino)" → "salsa-cubana-casino"). Debe calzar con
// styleSlug() de apps/web/src/lib/styles.ts (mismo algoritmo).
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** GET /api/styles — catálogo público de estilos (selects del front). */
@Controller("styles")
export class StylesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.style.findMany({
      select: { id: true, name: true, genre: true },
      orderBy: { name: "asc" },
    });
  }

  /**
   * GET /api/styles/:id/landing — datos públicos para la landing SEO del
   * estilo (/estilos/[style]). :id acepta el cuid o el slug del nombre.
   * Solo datos de negocio públicos: academias activas que lo enseñan,
   * próximas clases materializadas y próximos eventos con bloques del
   * estilo. Sin métricas ni datos de alumnos.
   */
  @Get(":id/landing")
  async landing(@Param("id") idOrSlug: string) {
    // El catálogo es chico (~10 filas, sin unique en name) — resolver el
    // slug en memoria evita SQL frágil por accentos/paréntesis.
    const styles = await this.prisma.style.findMany({
      select: { id: true, name: true, genre: true, parentId: true },
    });
    const needle = slugify(idOrSlug);
    const style =
      styles.find((s) => s.id === idOrSlug) ??
      styles.find((s) => slugify(s.name) === needle);
    if (!style) throw new NotFoundException("estilo no encontrado");

    const now = new Date();
    const [academies, upcomingClasses, upcomingEvents] = await Promise.all([
      // Academias activas con una serie activa del estilo (todo slot
      // pertenece a una serie — el estilo vive en series.styleId).
      this.prisma.academy.findMany({
        where: {
          active: true,
          classSeries: { some: { styleId: style.id, active: true } },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // Próximas clases materializadas del estilo (vía la serie del
      // slot), no canceladas.
      this.prisma.class.findMany({
        where: {
          cancelled: false,
          date: { gte: now },
          slot: { series: { styleId: style.id } },
        },
        orderBy: { date: "asc" },
        take: 10,
        select: {
          id: true,
          date: true,
          slot: {
            select: {
              startTime: true,
              endTime: true,
              academy: { select: { name: true } },
              series: {
                select: {
                  name: true,
                  level: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
      // Próximos eventos publicados con al menos un bloque del estilo —
      // alimentan la sección "dónde bailarlo" y el JSON-LD DanceEvent.
      this.prisma.event.findMany({
        where: {
          status: { in: ["PUBLISHED", "LIVE"] },
          startsAt: { gte: now },
          scheduleBlocks: { some: { styleId: style.id } },
        },
        orderBy: { startsAt: "asc" },
        take: 6,
        select: {
          id: true,
          name: true,
          type: true,
          startsAt: true,
          endsAt: true,
          series: { select: { name: true } },
          venue: { select: { name: true, address: true } },
        },
      }),
    ]);

    return {
      style: { ...style, slug: slugify(style.name) },
      academies,
      upcomingClasses: upcomingClasses.map((c) => ({
        id: c.id,
        date: c.date,
        startTime: c.slot.startTime,
        endTime: c.slot.endTime,
        seriesName: c.slot.series.name,
        levelName: c.slot.series.level?.name ?? null,
        academyName: c.slot.academy.name,
      })),
      upcomingEvents,
    };
  }
}

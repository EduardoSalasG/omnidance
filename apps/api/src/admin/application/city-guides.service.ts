import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { FeatureFlagsService } from "../../features/feature-flags.service";

// Guías editoriales por ciudad (spec city-guides): el equipo cura tres
// secciones de texto por ciudad (intro, nightlife, practical) desde
// /admin/ciudades; la landing pública las lee vía CitiesService.detail.
// Toda la superficie va detrás del flag `city_guides` - apagado → 404
// (fail-closed, mismo criterio que el resto de superficies gated).

const FLAG = "city_guides";

/** Secciones editoriales del modelo CityGuide (texto, max 8000 chars). */
export const GUIDE_SECTIONS = ["intro", "nightlife", "practical"] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

export type GuideStatus = "empty" | "draft" | "complete";

type GuideFields = Record<GuideSection, string>;

/** ¿Sección con texto? - el trim importa: "   " no cuenta. */
const hasText = (v: string | null | undefined) => (v ?? "").trim().length > 0;

/** Estado de la guía: completa = 3 secciones, borrador = 1-2, vacía = 0. */
export function guideStatus(guide: GuideFields | null): GuideStatus {
  if (!guide) return "empty";
  const filled = GUIDE_SECTIONS.filter((s) => hasText(guide[s])).length;
  return filled === 0 ? "empty" : filled === 3 ? "complete" : "draft";
}

const CITY_SELECT = {
  id: true,
  slug: true,
  name: true,
  country: { select: { code: true, name: true } },
} as const;

const GUIDE_SELECT = {
  intro: true,
  nightlife: true,
  practical: true,
  updatedAt: true,
  updatedById: true,
} as const;

@Injectable()
export class AdminCityGuidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** Gate del flag - 404 si está apagado (la superficie no existe). */
  private async assertEnabled() {
    if (!(await this.flags.isEnabled(FLAG))) throw new NotFoundException();
  }

  /**
   * GET /admin/city-guides - todas las ciudades (con o sin guía) con su
   * estado editorial y fecha de última edición, por país + nombre.
   */
  async list() {
    await this.assertEnabled();
    const cities = await this.prisma.city.findMany({
      orderBy: [{ country: { name: "asc" } }, { name: "asc" }],
      select: {
        ...CITY_SELECT,
        guide: { select: GUIDE_SELECT },
      },
    });
    return cities.map(({ guide, ...c }) => ({
      ...c,
      status: guideStatus(guide),
      updatedAt: guide?.updatedAt ?? null,
    }));
  }

  /**
   * GET /admin/city-guides/:cityId - contenido editable de la guía con
   * su último editor resuelto (nombre/email). La guía siempre viaja con
   * las 3 secciones (strings vacíos si no hay fila) para que el editor
   * las renderice directo. 404 con cityId inexistente.
   */
  async detail(cityId: string) {
    await this.assertEnabled();
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: { ...CITY_SELECT, guide: { select: GUIDE_SELECT } },
    });
    if (!city) throw new NotFoundException("ciudad no encontrada");

    const { guide, ...cityBase } = city;
    const editor = guide?.updatedById
      ? await this.prisma.person.findUnique({
          where: { id: guide.updatedById },
          select: { id: true, name: true, email: true },
        })
      : null;

    return {
      city: cityBase,
      guide: {
        intro: guide?.intro ?? "",
        nightlife: guide?.nightlife ?? "",
        practical: guide?.practical ?? "",
        updatedAt: guide?.updatedAt ?? null,
        updatedBy: editor,
      },
    };
  }

  /**
   * PUT /admin/city-guides/:cityId - upsert por cityId: solo las
   * secciones presentes en el DTO se escriben (undefined = no tocar).
   * Persiste updatedById y audita CITY_GUIDE_UPDATE con el conteo de
   * secciones con texto resultante. 404 con ciudad inexistente.
   */
  async update(
    cityId: string,
    dto: Partial<GuideFields>,
    actorId: string,
  ) {
    await this.assertEnabled();
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true },
    });
    if (!city) throw new NotFoundException("ciudad no encontrada");

    const patch = Object.fromEntries(
      GUIDE_SECTIONS.filter((s) => dto[s] !== undefined).map((s) => [
        s,
        dto[s],
      ]),
    ) as Partial<GuideFields>;

    const guide = await this.prisma.cityGuide.upsert({
      where: { cityId },
      create: { cityId, ...patch, updatedById: actorId },
      update: { ...patch, updatedById: actorId },
      select: { id: true, ...GUIDE_SELECT },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "CITY_GUIDE_UPDATE",
        targetType: "CityGuide",
        targetId: guide.id,
        payload: {
          cityId,
          sections: GUIDE_SECTIONS.filter((s) => hasText(guide[s])).length,
        },
      },
    });

    const { id: _id, updatedById: _u, ...rest } = guide;
    return rest;
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

// Flags de funcionalidad (spec feature-flags-admin): catálogo global
// seedado desde código - un flag sin consumer no sirve, por eso no hay
// alta/baja por API; el admin solo flippea `enabled` y el front gatea
// superficies con el mapa público de GET /features.
//
// Cache in-memory corta (mismo criterio que ParamsService): los flags
// se leen en gates de request y cambian solo por /admin - 30s de TTL;
// la escritura actualiza la entrada para lectura caliente inmediata.
const CACHE_TTL_MS = 30_000;

@Injectable()
export class FeatureFlagsService {
  private readonly cache = new Map<
    string,
    { enabled: boolean; at: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catálogo completo para /admin/funcionalidades, ordenado por label.
   * Resuelve el último editor (updatedById → nombre/email) con una sola
   * query extra - sin N+1 por flag.
   */
  async list() {
    const flags = await this.prisma.featureFlag.findMany({
      orderBy: { label: "asc" },
    });
    const editorIds = [
      ...new Set(
        flags
          .map((f) => f.updatedById)
          .filter((id): id is string => id != null),
      ),
    ];
    const editors = editorIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: editorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const byId = new Map(editors.map((p) => [p.id, p]));
    return flags.map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      enabled: f.enabled,
      updatedAt: f.updatedAt,
      updatedBy: f.updatedById ? (byId.get(f.updatedById) ?? null) : null,
    }));
  }

  /**
   * Mapa público {key: enabled} de GET /features - los flags son
   * metadatos de producto (booleanos), no secretos (spec).
   */
  async publicMap(): Promise<Record<string, boolean>> {
    const flags = await this.prisma.featureFlag.findMany({
      select: { key: true, enabled: true },
    });
    return Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
  }

  /**
   * Gate server-side. Fail-closed: un flag inexistente responde false -
   * un typo de key nunca enciende una superficie.
   */
  async isEnabled(key: string): Promise<boolean> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.enabled;

    const row = await this.prisma.featureFlag.findUnique({
      where: { key },
      select: { enabled: true },
    });
    const enabled = row?.enabled ?? false;
    this.cache.set(key, { enabled, at: Date.now() });
    return enabled;
  }

  /**
   * Flip del flag con auditoría FEATURE_FLAG_TOGGLE. 404 si la key no
   * existe: el catálogo lo define el seed, no la UI (spec).
   */
  async setEnabled(key: string, enabled: boolean, actorId: string) {
    const exists = await this.prisma.featureFlag.findUnique({
      where: { key },
      select: { key: true },
    });
    if (!exists) throw new NotFoundException("funcionalidad no encontrada");

    const row = await this.prisma.featureFlag.update({
      where: { key },
      data: { enabled, updatedById: actorId },
    });
    // Lectura caliente: el próximo isEnabled(key) del proceso ya ve el
    // valor nuevo sin esperar la expiración del TTL (spec scenario).
    this.cache.set(key, { enabled, at: Date.now() });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "FEATURE_FLAG_TOGGLE",
        targetType: "FeatureFlag",
        targetId: key,
        payload: { flag: key, enabled },
      },
    });
    return row;
  }
}

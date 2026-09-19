import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

// ParamsService — parámetros operativos de plataforma (PlatformParam).
// Cache in-memory corto: los params se leen en rutas calientes (checkout)
// y cambian solo por /admin — 30s de TTL es tolerancia sobrada.
const CACHE_TTL_MS = 30_000;

/** Defaults de fees configurables por productor (null = hereda global). */
export interface ProducerFeeDefaults {
  serviceFeeClp: number | null;
  doorAppFeeClp: number | null;
  doorCashFeeClp: number | null;
  platformFeePct: number | null;
}

@Injectable()
export class ParamsService {
  private readonly cache = new Map<string, { value: unknown; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<unknown> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    const row = await this.prisma.platformParam.findUnique({
      where: { key },
      select: { value: true },
    });
    const value = row?.value;
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const v = await this.get(key);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Defaults de fees del productor (ProducerParams). null si no tiene fila —
   * los consumidores encadenan: campo del evento → esto → param global.
   * Cache propio (30s) porque se lee en checkout/puerta.
   */
  private readonly producerCache = new Map<
    string,
    { value: ProducerFeeDefaults | null; at: number }
  >();

  async getProducerParams(
    producerId: string | null | undefined,
  ): Promise<ProducerFeeDefaults | null> {
    if (!producerId) return null;
    const hit = this.producerCache.get(producerId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    const row = await this.prisma.producerParams.findUnique({
      where: { producerId },
    });
    const value: ProducerFeeDefaults | null = row
      ? {
          serviceFeeClp: row.serviceFeeClp,
          doorAppFeeClp: row.doorAppFeeClp,
          doorCashFeeClp: row.doorCashFeeClp,
          platformFeePct: row.platformFeePct,
        }
      : null;
    this.producerCache.set(producerId, { value, at: Date.now() });
    return value;
  }

  invalidateProducer(producerId: string): void {
    this.producerCache.delete(producerId);
  }

  async list() {
    return this.prisma.platformParam.findMany({
      orderBy: { key: "asc" },
      select: { key: true, value: true, description: true, updatedAt: true },
    });
  }

  async set(key: string, value: unknown, updatedById?: string) {
    const row = await this.prisma.platformParam.upsert({
      where: { key },
      update: { value: value as never, updatedById },
      create: { key, value: value as never, updatedById },
    });
    this.cache.delete(key);
    return row;
  }
}

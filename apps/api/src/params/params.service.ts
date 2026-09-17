import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

// ParamsService — parámetros operativos de plataforma (PlatformParam).
// Cache in-memory corto: los params se leen en rutas calientes (checkout)
// y cambian solo por /admin — 30s de TTL es tolerancia sobrada.
const CACHE_TTL_MS = 30_000;

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

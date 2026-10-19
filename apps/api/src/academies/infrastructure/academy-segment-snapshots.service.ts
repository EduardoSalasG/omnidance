import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { clWeekStart } from "../../common/cl-time";

/**
 * Snapshot semanal de la distribución de segmentos de score por academia.
 * Corre a diario tras el recompute de scores y hace upsert por
 * (academyId, weekStart) — la semana siempre refleja el último estado
 * conocido; leer snapshots de lunes sucesivos da el desglose semanal y
 * compararlos con el mes anterior da la tendencia.
 */
@Injectable()
export class AcademySegmentSnapshotsService {
  constructor(private readonly prisma: PrismaService) {}

  async runDaily(): Promise<Record<string, unknown>> {
    const weekStart = clWeekStart(new Date());
    const scores = await this.prisma.relationshipScore.findMany({
      where: { actorType: "ACADEMY" },
      select: { actorId: true, segment: true },
    });
    const dist = new Map<string, Record<string, number>>();
    for (const s of scores) {
      const d = dist.get(s.actorId) ?? {};
      const k = s.segment ?? "NONE";
      d[k] = (d[k] ?? 0) + 1;
      dist.set(s.actorId, d);
    }
    for (const [academyId, segments] of dist) {
      await this.prisma.academySegmentSnapshot.upsert({
        where: { academyId_weekStart: { academyId, weekStart } },
        update: { segments },
        create: { academyId, weekStart, segments },
      });
    }
    return { academies: dist.size, weekStart: weekStart.toISOString() };
  }
}

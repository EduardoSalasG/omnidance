// Lista operativa de trials de plataforma (spec admin/home-insights
// §Panel de trials): la consumen `GET /admin/trials` y los KPIs +
// preview de la lente ADMIN de /home/stats - una sola consulta para
// que el panel y el endpoint nunca diverjan.
//
// "En trial" sigue la misma semántica del corte: academia `tier null`
// (sin suscripción proyectada) y productor `proTier FREE`; convertidos
// no aparecen aunque su trialEndsAt siga futura. El estado EXPIRED
// exige además "sin suscripción viva" del actor: una PENDING_CARD a
// medio checkout o una CANCEL_PENDING aún en período pagado no están
// cortadas, están convirtiendo/saliendo.
import type { PrismaService } from "../prisma.service";
import { PLATFORM_SUB_LIVE_STATUSES } from "../payments/domain/platform-tiers";

type TrialsPrisma = Pick<
  PrismaService,
  "academy" | "person" | "platformSubscription"
>;

export type PlatformTrialState = "ACTIVE" | "EXPIRING" | "EXPIRED";

export interface PlatformTrialRow {
  kind: "ACADEMY" | "PRODUCER";
  /** academyId o personId - el id de la ficha destino. */
  id: string;
  name: string;
  email: string | null;
  role: "ACADEMY_OWNER" | "PRODUCER";
  /** Nivel que vende el trial (academia STUDIO, productor PRO_STARTER). */
  tier: "STUDIO" | "PRO_STARTER";
  trialEndsAt: Date;
  /** Días al vencimiento; ≤0 cuando ya venció. */
  daysLeft: number;
  state: PlatformTrialState;
}

const DAY_MS = 86_400_000;
const EXPIRING_DAYS = 7;

export async function listPlatformTrials(
  prisma: TrialsPrisma,
  now: Date = new Date(),
): Promise<PlatformTrialRow[]> {
  const [academies, persons] = await Promise.all([
    prisma.academy.findMany({
      where: { tier: null, trialEndsAt: { not: null } },
      select: { id: true, name: true, ownerId: true, trialEndsAt: true },
    }),
    prisma.person.findMany({
      where: { proTier: "FREE", proTrialEndsAt: { not: null } },
      select: { id: true, name: true, email: true, proTrialEndsAt: true },
    }),
  ]);

  // "Sin suscripción viva" solo decide el bucket EXPIRED (spec): con
  // trial vigente el actor sigue en trial aunque ya inició checkout.
  const expiredCandidates = [
    ...academies.filter((a) => a.trialEndsAt! <= now),
    ...persons.filter((p) => p.proTrialEndsAt! <= now),
  ];
  let liveAcademies = new Set<string>();
  let liveProducers = new Set<string>();
  if (expiredCandidates.length > 0) {
    const subs = await prisma.platformSubscription.findMany({
      where: {
        status: { in: [...PLATFORM_SUB_LIVE_STATUSES] },
        OR: [
          {
            kind: "ACADEMY",
            academyId: {
              in: academies.map((a) => a.id),
            },
          },
          {
            kind: "PRODUCER",
            producerId: { in: persons.map((p) => p.id) },
          },
        ],
      },
      select: { kind: true, academyId: true, producerId: true },
    });
    liveAcademies = new Set(
      subs.filter((s) => s.kind === "ACADEMY").map((s) => s.academyId!),
    );
    liveProducers = new Set(
      subs.filter((s) => s.kind === "PRODUCER").map((s) => s.producerId!),
    );
  }

  // Datos de contacto de la academia = su owner (join manual, ownerId
  // es escalar sin FK - mismo patrón que el resto del dominio).
  const ownerIds = [...new Set(academies.map((a) => a.ownerId))];
  const owners = ownerIds.length
    ? await prisma.person.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  const rows: PlatformTrialRow[] = [];
  for (const a of academies) {
    const endsAt = a.trialEndsAt!;
    const expired = endsAt <= now;
    if (expired && liveAcademies.has(a.id)) continue;
    const owner = ownerById.get(a.ownerId);
    rows.push({
      kind: "ACADEMY",
      id: a.id,
      name: a.name,
      email: owner?.email ?? null,
      role: "ACADEMY_OWNER",
      tier: "STUDIO",
      trialEndsAt: endsAt,
      daysLeft: Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS),
      state: expired
        ? "EXPIRED"
        : endsAt.getTime() - now.getTime() <= EXPIRING_DAYS * DAY_MS
          ? "EXPIRING"
          : "ACTIVE",
    });
  }
  for (const p of persons) {
    const endsAt = p.proTrialEndsAt!;
    const expired = endsAt <= now;
    if (expired && liveProducers.has(p.id)) continue;
    rows.push({
      kind: "PRODUCER",
      id: p.id,
      name: p.name,
      email: p.email,
      role: "PRODUCER",
      tier: "PRO_STARTER",
      trialEndsAt: endsAt,
      daysLeft: Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS),
      state: expired
        ? "EXPIRED"
        : endsAt.getTime() - now.getTime() <= EXPIRING_DAYS * DAY_MS
          ? "EXPIRING"
          : "ACTIVE",
    });
  }
  // Urgencia primero: vencidos y los que vencen antes encabezan.
  rows.sort(
    (a, b) => a.trialEndsAt.getTime() - b.trialEndsAt.getTime(),
  );
  return rows;
}

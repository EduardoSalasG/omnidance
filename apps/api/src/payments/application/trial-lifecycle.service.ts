import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import { MAILER, type Mailer } from "../../auth/domain/ports";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { emitActivity } from "../../common/activity-log";
import { emitTrialEnded } from "../../common/platform-trials";
import {
  academyTrialWelcomeEmailHtml,
  cxFichaEmailHtml,
  producerTrialWelcomeEmailHtml,
  trialLastDayEmailHtml,
  type CxContact,
} from "../infrastructure/trial-emails";

// Ciclo de vida del trial de plataforma (spec platform-trials):
// - Bienvenida al iniciarse el trial (academia al crearla, productor al
//   aprobar el rol) + ficha a cx.notify_email.
// - Barrido diario en subscriptions.reconcile: trials que vencen en las
//   próximas 24h → correo de último día con oferta 50% + promo diaria
//   trial-conv-<YYYYMMDD> whitelisteada al actor (válida solo ese día).
// - Dedup en Academy.trialEndNotifiedAt / Person.proTrialEndNotifiedAt.

const CL_TZ = "America/Santiago";
const DAY_MS = 86_400_000;

const clFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYYMMDD del día en Santiago - key de la promo diaria. */
function clDayKey(d: Date): string {
  return clFmt.format(d).replaceAll("-", "");
}

/**
 * Fin del día en Santiago del día CL de `d` ≈ 04:00 UTC del día
 * siguiente (cubre UTC-3 y UTC-4 sin librería de zonas).
 */
function clEndOfDay(d: Date): Date {
  const [y, m, day] = clFmt.format(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1, 4));
}

@Injectable()
export class TrialLifecycleService {
  private readonly logger = new Logger(TrialLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly notifications: NotificationsService,
  ) {}

  private async cx(): Promise<CxContact> {
    const [name, email, phone] = await Promise.all([
      this.params.get("cx.contact.name"),
      this.params.get("cx.contact.email"),
      this.params.get("cx.contact.phone"),
    ]);
    return {
      name: String(name ?? "Equipo Omnidance"),
      email: String(email ?? "soporte@omnidance.tech"),
      phone: String(phone ?? ""),
    };
  }

  /** Ficha del registro a cx.notify_email - best-effort, nunca bota el flujo. */
  private async fichaCx(
    title: string,
    rows: [string, string][],
  ): Promise<void> {
    try {
      const to = String(
        (await this.params.get("cx.notify_email")) ?? "",
      ).trim();
      if (!to) return;
      await this.mailer.send(to, title, cxFichaEmailHtml(title, rows));
    } catch (e) {
      this.logger.error(`ficha CX falló (${title}): ${e}`);
    }
  }

  /** Bienvenida al trial de academia + ficha CX (spec platform-trials). */
  async sendAcademyTrialWelcome(
    academy: { id: string; name: string; trialEndsAt: Date | null },
    owner: { name: string; email: string | null; phone: string | null },
  ): Promise<void> {
    const cx = await this.cx();
    if (academy.trialEndsAt && owner.email) {
      try {
        const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
        await this.mailer.send(
          owner.email,
          `Bienvenido a Omnidance - ${academy.name} ya tiene su consola`,
          academyTrialWelcomeEmailHtml({
            personName: owner.name,
            academyName: academy.name,
            trialEndsAt: academy.trialEndsAt,
            ctaUrl: `${webUrl}/academia`,
            cx,
          }),
        );
      } catch (e) {
        this.logger.error(`welcome academia ${academy.id}: ${e}`);
      }
    }
    await this.fichaCx(`Nueva academia en trial: ${academy.name}`, [
      ["Academia", academy.name],
      ["Owner", owner.name],
      ["Email", owner.email ?? "-"],
      ["Teléfono", owner.phone ?? "-"],
      ["Tier en prueba", "STUDIO"],
      [
        "Fin del trial",
        academy.trialEndsAt?.toISOString().slice(0, 10) ?? "-",
      ],
    ]);
  }

  /** Bienvenida al trial Producer Pro + ficha CX (spec platform-trials). */
  async sendProducerTrialWelcome(
    person: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
    },
    trialEndsAt: Date,
  ): Promise<void> {
    const cx = await this.cx();
    if (person.email) {
      try {
        const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
        await this.mailer.send(
          person.email,
          "Tu cuenta de productor está activa - prueba Pro gratis",
          producerTrialWelcomeEmailHtml({
            personName: person.name,
            trialEndsAt,
            ctaUrl: `${webUrl}/productor`,
            cx,
          }),
        );
      } catch (e) {
        this.logger.error(`welcome productor ${person.id}: ${e}`);
      }
    }
    await this.fichaCx(`Nuevo productor en trial: ${person.name}`, [
      ["Productor", person.name],
      ["Email", person.email ?? "-"],
      ["Teléfono", person.phone ?? "-"],
      ["Tier en prueba", "PRO_STARTER"],
      ["Fin del trial", trialEndsAt.toISOString().slice(0, 10)],
    ]);
  }

  /**
   * Promo diaria de conversión: una por día (`trial-conv-<YYYYMMDD>`),
   * 50% off, 1 ciclo, vigente hasta el fin del día Santiago. Los actores
   * del día se conectan a su whitelist por barrido.
   */
  private async ensureDailyPromo(now: Date) {
    const key = clDayKey(now);
    const name = `trial-conv-${key}`;
    const existing = await this.prisma.platformPromo.findFirst({
      where: { name },
      select: { id: true },
    });
    if (existing) return { id: existing.id, name };
    return this.prisma.platformPromo.create({
      data: {
        name,
        kind: null,
        discountType: "PERCENT",
        percentOff: 50,
        validFrom: now,
        validUntil: clEndOfDay(now),
        maxCycles: 1,
        enabled: true,
      },
      select: { id: true, name: true },
    });
  }

  /**
   * Barrido del último día de trial (ventana 24h): correo con la oferta
   * del día + whitelist en la promo diaria + marca de dedup +
   * ActivityEvent trial.ending. Solo actores AÚN en trial: academia con
   * tier null y productor FREE (un convertido no recibe el aviso).
   */
  async sweepTrialLastDay(now: Date = new Date()): Promise<{
    academies: number;
    producers: number;
  }> {
    const windowEnd = new Date(now.getTime() + DAY_MS);
    const [academies, persons] = await Promise.all([
      this.prisma.academy.findMany({
        where: {
          tier: null,
          trialEndsAt: { gt: now, lte: windowEnd },
          trialEndNotifiedAt: null,
        },
        select: {
          id: true,
          name: true,
          trialEndsAt: true,
          ownerId: true,
        },
      }),
      this.prisma.person.findMany({
        where: {
          proTier: "FREE",
          proTrialEndsAt: { gt: now, lte: windowEnd },
          proTrialEndNotifiedAt: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          proTrialEndsAt: true,
        },
      }),
    ]);
    if (!academies.length && !persons.length) {
      return { academies: 0, producers: 0 };
    }
    // ownerId es escalar sin FK - nombres/emails por join manual (mismo
    // patrón que los insights de academias).
    const ownerIds = [...new Set(academies.map((a) => a.ownerId))];
    const owners = ownerIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, name: true, email: true, phone: true },
        })
      : [];
    const ownerById = new Map(owners.map((o) => [o.id, o]));
    const promo = await this.ensureDailyPromo(now);
    const cx = await this.cx();
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    let academiesDone = 0;
    let producersDone = 0;

    for (const a of academies) {
      const owner = ownerById.get(a.ownerId);
      if (!owner) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.platformPromo.update({
            where: { id: promo.id },
            data: { academies: { connect: { id: a.id } } },
          });
          await tx.academy.update({
            where: { id: a.id },
            data: { trialEndNotifiedAt: now },
          });
          await emitActivity(tx, {
            type: "trial.ending",
            personId: owner.id,
            academyId: a.id,
            refType: "PlatformPromo",
            refId: promo.id,
            data: { kind: "ACADEMY", promo: promo.name },
          });
        });
        if (owner.email) {
          await this.mailer.send(
            owner.email,
            `Último día de tu prueba - 50% off solo por hoy`,
            trialLastDayEmailHtml({
              personName: owner.name,
              actorLabel:
                `La consola de <strong style="color:#ffffff;">${escapeLabel(a.name)}</strong> queda en pausa cuando venza el trial.`,
              ctaUrl: `${webUrl}/academia/configuracion/suscripcion`,
              cx,
            }),
          );
        }
        academiesDone++;
      } catch (e) {
        this.logger.error(`trial last-day academia ${a.id}: ${e}`);
      }
    }

    for (const p of persons) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.platformPromo.update({
            where: { id: promo.id },
            data: { producers: { connect: { id: p.id } } },
          });
          await tx.person.update({
            where: { id: p.id },
            data: { proTrialEndNotifiedAt: now },
          });
          await emitActivity(tx, {
            type: "trial.ending",
            personId: p.id,
            refType: "PlatformPromo",
            refId: promo.id,
            data: { kind: "PRODUCER", promo: promo.name },
          });
        });
        if (p.email) {
          await this.mailer.send(
            p.email,
            `Último día de tu prueba Pro - 50% off solo por hoy`,
            trialLastDayEmailHtml({
              personName: p.name,
              actorLabel:
                "Las herramientas Pro se apagan cuando venza el trial.",
              ctaUrl: `${webUrl}/productor/suscripcion`,
              cx,
            }),
          );
        }
        producersDone++;
      } catch (e) {
        this.logger.error(`trial last-day productor ${p.id}: ${e}`);
      }
    }
    return { academies: academiesDone, producers: producersDone };
  }

  /**
   * Barrido de trials vencidos (spec platform-trials §5b): el corte de
   * features es lazy (featuresForAcademy) y no hay transición física al
   * vencer - este pase materializa `trial.ended` (outcome expired) en la
   * línea de vida admin, con el timestamp real del vencimiento. Solo
   * actores AÚN sin conversión (tier null / proTier FREE): un convertido
   * ya emitió su trial.ended en la activación de la sub. Dedup por
   * data.endsAt dentro de emitTrialEnded: un trial re-extendido por el
   * admin que vuelve a vencer produce un evento nuevo.
   */
  async sweepTrialEnded(now: Date = new Date()): Promise<{
    academies: number;
    producers: number;
  }> {
    const [academies, persons] = await Promise.all([
      this.prisma.academy.findMany({
        where: { tier: null, trialEndsAt: { lte: now } },
        select: { id: true, ownerId: true, trialEndsAt: true },
      }),
      this.prisma.person.findMany({
        where: { proTier: "FREE", proTrialEndsAt: { lte: now } },
        select: { id: true, proTrialEndsAt: true },
      }),
    ]);
    let academiesDone = 0;
    let producersDone = 0;
    for (const a of academies) {
      if (!a.trialEndsAt) continue;
      try {
        const r = await this.prisma.$transaction((tx) =>
          emitTrialEnded(tx, {
            kind: "ACADEMY",
            personId: a.ownerId,
            academyId: a.id,
            endsAt: a.trialEndsAt!,
            via: "sweep",
            now,
          }),
        );
        if (r.created) academiesDone++;
      } catch (e) {
        this.logger.error(`trial ended academia ${a.id}: ${e}`);
      }
    }
    for (const p of persons) {
      if (!p.proTrialEndsAt) continue;
      try {
        const r = await this.prisma.$transaction((tx) =>
          emitTrialEnded(tx, {
            kind: "PRODUCER",
            personId: p.id,
            endsAt: p.proTrialEndsAt!,
            via: "sweep",
            now,
          }),
        );
        if (r.created) producersDone++;
      } catch (e) {
        this.logger.error(`trial ended productor ${p.id}: ${e}`);
      }
    }
    return { academies: academiesDone, producers: producersDone };
  }
}

const escapeLabel = (s: string) => s.replace(/</g, "&lt;");

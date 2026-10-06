import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import {
  STORAGE,
  type FileStorage,
} from "../../storage/storage.service";
import { buildBillingPdf } from "../../common/billing-pdf";

/**
 * Documento interno de cobro (spec admin-billing-documents): emite la
 * nota por las deducciones de un Payout (comisión plataforma, métodos
 * propios, passthrough de pasarela) con folio correlativo atómico.
 *
 * Decisiones:
 * - Emisión idempotente por `payoutId @unique` - re-emitir devuelve el
 *   doc existente sin consumir folio. La asignación de folio va dentro
 *   de la tx (BillingCounter con increment): dos emisiones concurrentes
 *   nunca toman el mismo número ni dejan huecos.
 * - El PDF se genera FUERA de la tx y se regenera lazy en la descarga si
 *   falta (pdfKey null): la emisión no se revierte por un fallo de PDF.
 * - VOID conserva el documento y el PDF como evidencia - nunca se borra.
 * - NO es DTE tributario: disclaimer impreso en el documento.
 */

/** Tipos de PayoutLine que son cargo documentable (MANUAL_ADJUSTMENT no). */
const LINE_LABELS: Record<string, string> = {
  PLATFORM_FEE_NET: "Comisión de plataforma (neto)",
  OWN_METHOD_FEE_NET: "Comisión por métodos propios (neto)",
  GATEWAY_FEE_PASSTHROUGH: "Costo de pasarela (reembolso)",
  PLATFORM_FEE_VAT: "IVA comisión de plataforma",
  OWN_METHOD_FEE_VAT: "IVA comisión métodos propios",
};

const CHARGE_TYPES = Object.keys(LINE_LABELS);
const LINE_ORDER = CHARGE_TYPES;

const NET_TYPES = [
  "PLATFORM_FEE_NET",
  "OWN_METHOD_FEE_NET",
  "GATEWAY_FEE_PASSTHROUGH",
];
const VAT_TYPES = ["PLATFORM_FEE_VAT", "OWN_METHOD_FEE_VAT"];

export interface BillingLine {
  label: string;
  amount: number;
}

function aggregateCharges(lines: { type: string; amount: number }[]) {
  const agg = new Map<string, number>();
  for (const l of lines) {
    if (!(l.type in LINE_LABELS)) continue;
    agg.set(l.type, (agg.get(l.type) ?? 0) + l.amount);
  }
  const out: BillingLine[] = LINE_ORDER.filter(
    (t) => (agg.get(t) ?? 0) > 0,
  ).map((t) => ({ label: LINE_LABELS[t], amount: agg.get(t)! }));
  const net = NET_TYPES.reduce((s, t) => s + (agg.get(t) ?? 0), 0);
  const vat = VAT_TYPES.reduce((s, t) => s + (agg.get(t) ?? 0), 0);
  return { lines: out, net, vat };
}

@Injectable()
export class AdminBillingService {
  private readonly logger = new Logger(AdminBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Emite (o devuelve el ya emitido) el documento de un payout. */
  async generate(payoutId: string, actorId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { lines: true, billingDoc: true },
    });
    if (!payout) throw new NotFoundException("liquidación no encontrada");
    if (payout.billingDoc) return payout.billingDoc;

    const charges = aggregateCharges(payout.lines);
    if (!charges.lines.length)
      throw new BadRequestException(
        "la liquidación no tiene cargos que documentar",
      );

    const receiverId = await this.resolveReceiver(
      payout.actorType,
      payout.actorId,
    );
    const person = await this.prisma.person.findUnique({
      where: { id: receiverId },
      include: { fiscalProfile: true },
    });
    if (!person) throw new NotFoundException("receptor no encontrado");

    const doc = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.billingDocument.findUnique({
        where: { payoutId },
      });
      if (existing) return existing;
      const counter = await tx.billingCounter.upsert({
        where: { id: "billing" },
        create: { id: "billing", next: 2 },
        update: { next: { increment: 1 } },
      });
      try {
        return await tx.billingDocument.create({
          data: {
            folio: counter.next - 1,
            payoutId,
            actorType: payout.actorType,
            receiverId,
            receiverRut: person.fiscalProfile?.rut ?? null,
            receiverName: person.fiscalProfile?.legalName ?? person.name,
            periodStart: payout.periodStart,
            periodEnd: payout.periodEnd,
            lines: charges.lines as unknown as Prisma.InputJsonValue,
            netClp: charges.net,
            vatClp: charges.vat,
            totalClp: charges.net + charges.vat,
            issuedById: actorId,
          },
        });
      } catch (e) {
        // Carrera: otra emisión insertó primero - devolver la ganadora.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          const existing = await tx.billingDocument.findUnique({
            where: { payoutId },
          });
          if (existing) return existing;
        }
        throw e;
      }
    });

    const pdfKey = await this.persistPdf(doc);
    const final = pdfKey
      ? await this.prisma.billingDocument.update({
          where: { id: doc.id },
          data: { pdfKey },
        })
      : doc;

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "BILLING_ISSUE",
        targetType: "BillingDocument",
        targetId: doc.id,
        payload: { payoutId, folio: doc.folio, totalClp: doc.totalClp },
      },
    });
    return final;
  }

  /** Payouts recientes con cargos, marcados si ya tienen documento. */
  async candidates() {
    const payouts = await this.prisma.payout.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        lines: {
          where: { type: { in: CHARGE_TYPES } },
          select: { type: true, amount: true },
        },
        billingDoc: { select: { id: true, folio: true, status: true } },
      },
    });
    return payouts
      .filter((p) => p.lines.length > 0)
      .map((p) => ({
        id: p.id,
        actorType: p.actorType,
        actorId: p.actorId,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        gross: p.gross,
        net: p.net,
        status: p.status,
        chargeTotal: p.lines.reduce((s, l) => s + l.amount, 0),
        document: p.billingDoc,
      }));
  }

  list(opts: { status?: string; receiverId?: string; take?: number }) {
    return this.prisma.billingDocument.findMany({
      where: {
        ...(opts.status ? { status: opts.status as "ISSUED" } : {}),
        ...(opts.receiverId ? { receiverId: opts.receiverId } : {}),
      },
      orderBy: { folio: "desc" },
      take: Math.min(opts.take ?? 50, 200),
      include: {
        receiver: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /** Documentos ISSUED visibles para el propio actor. */
  listMine(personId: string) {
    return this.prisma.billingDocument.findMany({
      where: { receiverId: personId, status: "ISSUED" },
      orderBy: { folio: "desc" },
    });
  }

  /**
   * PDF del documento. `ownerPersonId` acota al actor dueño: los suyos
   * y solo ISSUED - lo demás responde como inexistente.
   */
  async pdfBuffer(id: string, ownerPersonId?: string) {
    const doc = await this.prisma.billingDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException("documento no encontrado");
    if (
      ownerPersonId &&
      (doc.receiverId !== ownerPersonId || doc.status !== "ISSUED")
    )
      throw new NotFoundException("documento no disponible");

    let pdfKey = doc.pdfKey;
    if (!pdfKey) {
      pdfKey = await this.persistPdf(doc);
      if (pdfKey)
        await this.prisma.billingDocument.update({
          where: { id },
          data: { pdfKey },
        });
    }
    if (!pdfKey)
      throw new BadRequestException("no fue posible generar el PDF");
    return { doc, buffer: await this.storage.read(pdfKey) };
  }

  /** Anula con motivo obligatorio; el doc y su PDF quedan de evidencia. */
  async void(id: string, reason: string, actorId: string) {
    const doc = await this.prisma.billingDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException("documento no encontrado");
    if (doc.status !== "ISSUED")
      throw new BadRequestException("el documento ya está anulado");
    const updated = await this.prisma.billingDocument.update({
      where: { id },
      data: { status: "VOID", voidedAt: new Date(), voidReason: reason },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "BILLING_VOID",
        targetType: "BillingDocument",
        targetId: id,
        payload: { folio: doc.folio, reason },
      },
    });
    return updated;
  }

  /** PRODUCER → el propio actorId; ACADEMY → owner de la academia. */
  private async resolveReceiver(actorType: string, actorId: string) {
    if (actorType === "PRODUCER") return actorId;
    if (actorType === "ACADEMY") {
      const academy = await this.prisma.academy.findUnique({
        where: { id: actorId },
        select: { ownerId: true },
      });
      if (!academy)
        throw new BadRequestException(
          "academia de la liquidación no encontrada",
        );
      return academy.ownerId;
    }
    throw new BadRequestException(
      `sin receptor resoluble para actorType ${actorType}`,
    );
  }

  /** Genera el PDF y lo persiste en storage privado; null si falla. */
  private async persistPdf(doc: {
    id: string;
    folio: number;
    issuedAt: Date;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    receiverName: string;
    receiverRut: string | null;
    actorType: string;
    lines: unknown;
    netClp: number;
    vatClp: number;
    totalClp: number;
    currency: string;
  }) {
    try {
      const buffer = await buildBillingPdf({
        folio: doc.folio,
        issuedAt: doc.issuedAt,
        status: doc.status,
        periodStart: doc.periodStart,
        periodEnd: doc.periodEnd,
        receiverName: doc.receiverName,
        receiverRut: doc.receiverRut,
        actorType: doc.actorType,
        lines: doc.lines as BillingLine[],
        netClp: doc.netClp,
        vatClp: doc.vatClp,
        totalClp: doc.totalClp,
        currency: doc.currency,
      });
      return await this.storage.save(
        {
          originalname: `billing-${doc.folio}.pdf`,
          mimetype: "application/pdf",
          buffer,
          size: buffer.length,
        },
        `billing`,
      );
    } catch (e) {
      this.logger.warn(
        `billing pdf ${doc.id} folio ${doc.folio}: ${(e as Error).message}`,
      );
      return null;
    }
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiQuery } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { GatewayAccountsService } from "../../payments/application/gateway-accounts.service";
import { AcademyCollectionsService } from "../../payments/application/academy-collections.service";
import { AcademyAccess } from "./academy-access.service";
import { toCsv } from "../../query/producer-export";
import { buildTablePdf } from "../../common/pdf-report";

// Labels localizados del export statements.{csv,pdf} (spec
// academy-byo-collections): `lang` del query param, es default.
const STATEMENT_EXPORT_I18N = {
  es: {
    title: "Liquidación de cobranza",
    fileBase: "liquidacion-cobranza",
    headers: ["Fecha", "Tipo", "Orden", "Pasarela", "Monto", "Take"],
    gross: "Cobrado por tu pasarela",
    orders: "Órdenes",
    takeNet: "Take neto",
    vat: "IVA",
    total: "Total a pagar",
    dueAt: "Vence",
    paidAt: "Pagada",
    statusPending: "Pendiente",
    statusPaid: "Pagada",
    periodOf: (p: string) => `Período: ${p}`,
    orderTypes: {
      MEMBERSHIP: "Plan",
      WORKSHOP: "Taller",
      PRIVATE: "Particular",
    } as Record<string, string>,
  },
  en: {
    title: "Collections statement",
    fileBase: "collections-statement",
    headers: ["Date", "Type", "Order", "Gateway", "Amount", "Take"],
    gross: "Collected via your gateway",
    orders: "Orders",
    takeNet: "Net take",
    vat: "VAT",
    total: "Total due",
    dueAt: "Due",
    paidAt: "Paid",
    statusPending: "Pending",
    statusPaid: "Paid",
    periodOf: (p: string) => `Period: ${p}`,
    orderTypes: {
      MEMBERSHIP: "Membership",
      WORKSHOP: "Workshop",
      PRIVATE: "Private class",
    } as Record<string, string>,
  },
} as const;

class AcademyGatewayAccountDto {
  /** FLOW | MERCADOPAGO | FINTOC (STUB solo fuera de producción;
      STRIPE no aplica a academias - su Connect es rail de payout). */
  @IsIn(["FLOW", "MERCADOPAGO", "FINTOC", "STUB"])
  provider!: string;

  /** FLOW: apiKey · MERCADOPAGO: access token · FINTOC: secret key. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKey?: string;

  /** FLOW: secret key · FINTOC: webhook endpoint secret (whsec_).
      Obligatorio para FLOW/FINTOC, ignorado en MP/STUB. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  secret?: string;
}

/**
 * Pasarela propia de la academia (spec academy-byo-collections): alta,
 * vista y baja de la cuenta Flow/MP que cobra sus ventas
 * (MEMBERSHIP/WORKSHOP/PRIVATE) - la plata va directo a la academia y
 * Omnidance le factura el take mes vencido, jamás por payout. Las
 * credenciales viajan solo en el PUT (TLS) y se persisten cifradas:
 * ninguna respuesta las devuelve. Apagar la cuenta deja la venta
 * online en solo claim manual por comprobante.
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class AcademyGatewayController {
  constructor(
    private readonly access: AcademyAccess,
    private readonly accounts: GatewayAccountsService,
    private readonly collections: AcademyCollectionsService,
  ) {}

  /** Vista segura de la cuenta (mask + webhookUrl) - owner/staff payments. */
  @Get(":id/gateway-account")
  async view(@Param("id") id: string, @Req() req: Request) {
    const { academy } = await this.access.requireCapability(
      id,
      req.person!,
      "payments",
    );
    return { account: await this.accounts.viewForAcademy(academy.id) };
  }

  @Put(":id/gateway-account")
  async upsert(
    @Param("id") id: string,
    @Body() dto: AcademyGatewayAccountDto,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "payments",
    );
    if (!dto.apiKey?.trim()) {
      throw new BadRequestException("apiKey requerido");
    }
    const account = await this.accounts.upsert(
      { academyId: academy.id },
      dto,
    );
    return { account };
  }

  @Delete(":id/gateway-account")
  async disable(@Param("id") id: string, @Req() req: Request) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "payments",
    );
    const account = await this.accounts.viewForAcademy(academy.id);
    if (account) {
      await this.accounts.disable(account.id, { academyId: academy.id });
    }
    return { account: await this.accounts.viewForAcademy(academy.id) };
  }

  /**
   * Liquidaciones mensuales del take BYO (spec academy-byo-collections):
   * statements emitidos (take neto + IVA sobre órdenes PAID por su
   * pasarela) + vista previa del período en curso.
   */
  @Get(":id/statements")
  async statements(@Param("id") id: string, @Req() req: Request) {
    const { academy } = await this.access.requireCapability(
      id,
      req.person!,
      "payments",
    );
    const [list, open] = await Promise.all([
      this.collections.listForAcademy(academy.id),
      this.collections.previewOpen(academy.id),
    ]);
    return { statements: list, open };
  }

  /**
   * GET /academies/:id/statements/:period.{csv,pdf} - export del
   * statement (spec academy-byo-collections): operaciones BYO del
   * período + totales (mismo formato del reporte de cobros - PDF vía
   * buildTablePdf, CSV con BOM + CRLF). `lang` localiza filename y
   * contenido (es default). Declarados ANTES del :period plano: el
   * param capturaría el sufijo como parte del período.
   */
  @Get(":id/statements/:period.csv")
  @ApiQuery({ name: "lang", required: false })
  async statementCsv(
    @Param("id") id: string,
    @Param("period") period: string,
    @Query("lang") lang: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ex = await this.statementExport(id, period, lang, req);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${ex.filename}.csv"`,
    );
    return toCsv(ex.headers, ex.rows);
  }

  @Get(":id/statements/:period.pdf")
  @ApiQuery({ name: "lang", required: false })
  async statementPdf(
    @Param("id") id: string,
    @Param("period") period: string,
    @Query("lang") lang: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ex = await this.statementExport(id, period, lang, req);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${ex.filename}.pdf"`,
    );
    const pdf = await buildTablePdf({
      title: ex.title,
      subtitle: ex.subtitle,
      summary: ex.summary,
      kpis: ex.kpis,
      headers: ex.headers,
      // Pesos por columna: # chica, Orden ancha (refId), montos al
      // alcance de $1.234.567.
      colWidths: [0.05, 0.12, 0.11, 0.37, 0.11, 0.12, 0.12],
      rows: ex.rows,
    });
    return new StreamableFile(pdf);
  }

  /** Compone el export del statement localizado (csv/pdf). */
  private async statementExport(
    id: string,
    period: string,
    lang: string | undefined,
    req: Request,
  ) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException("periodo inválido - formato YYYY-MM");
    }
    const { academy } = await this.access.requireCapability(
      id,
      req.person!,
      "payments",
    );
    const st = await this.collections.getStatement(academy.id, period);
    const L = STATEMENT_EXPORT_I18N[lang === "en" ? "en" : "es"];
    const locale = lang === "en" ? "en-US" : "es-CL";
    const money = (a: number, c = "CLP") =>
      `${c === "CLP" ? "$" : `${c} `}${new Intl.NumberFormat(locale).format(a)}`;
    const day = (iso: string | Date) =>
      new Date(iso).toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    const slug = academy.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const statusLine =
      st.status === "PAID"
        ? `${L.statusPaid}${st.paidAt ? ` · ${L.paidAt} ${day(st.paidAt)}` : ""}`
        : `${L.statusPending} · ${L.dueAt} ${day(st.dueAt)}`;

    return {
      filename: `${L.fileBase}-${slug || "academia"}-${st.period}`,
      title: L.title,
      subtitle: `${academy.name}\n${L.periodOf(st.period)}`,
      summary: [statusLine],
      kpis: [
        { label: L.gross, value: money(st.grossClp, st.currency) },
        { label: L.orders, value: String(st.orderCount) },
        { label: L.takeNet, value: money(st.takeNetClp, st.currency) },
        { label: L.vat, value: money(st.takeVatClp, st.currency) },
        { label: L.total, value: money(st.totalClp, st.currency), newRow: true },
      ],
      headers: ["#", ...L.headers],
      rows: st.operations.map((op, i) => [
        i + 1,
        day(op.paidAt),
        L.orderTypes[op.orderType] ?? op.orderType,
        op.refId,
        op.gateway ?? "",
        money(op.amount, op.currency),
        money(op.takeClp ?? 0, op.currency),
      ]),
    };
  }

  /** Detalle de un período: statement + sus operaciones BYO. */
  @Get(":id/statements/:period")
  async statement(
    @Param("id") id: string,
    @Param("period") period: string,
    @Req() req: Request,
  ) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException("periodo inválido - formato YYYY-MM");
    }
    const { academy } = await this.access.requireCapability(
      id,
      req.person!,
      "payments",
    );
    return this.collections.getStatement(academy.id, period);
  }
}

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { PrismaService } from "../prisma.service";
import { NotificationsService } from "../notifications/domain/notifications.service";
import { AuthService } from "../auth/domain/auth.service";
import { setSessionCookie } from "../auth/infrastructure/auth.controller";

// Roles que un lead puede declarar en el formulario de /pro — whitelist
// dura porque el formulario es público y escribe PersonRole directo.
const ALLOWED_ROLES = new Set([
  "PRODUCER",
  "DJ",
  "ACADEMY_OWNER",
  "VENUE_MANAGER",
]);
const ALLOWED_INTENTS = new Set(["CONTACT", "DEMO"]);

// Rate limit in-memory (mismo patrón que /auth/login): el formulario es
// público y escribe DB + crea cuentas demo — se acota por IP.
const WINDOW_MS = 60 * 60 * 1000;
const LEAD_MAX = 10; // submits por IP/hora
const DEMO_MAX = 20; // activaciones por IP/hora
const hits = new Map<string, number[]>();

function throttle(key: string, max: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= max) {
    throw new ForbiddenException("demasiados intentos");
  }
  list.push(now);
  hits.set(key, list);
}

type LeadBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  roles?: unknown;
  intent?: unknown;
};

type DemoBody = { token?: unknown };

/**
 * Formulario público de la landing /pro — sin sesión. POST /leads captura
 * el lead (upsert por email) y avisa a ADMIN; POST /leads/:id/demo crea la
 * cuenta demo con los roles declarados y emite la sesión en cookie.
 *
 * El id del lead NO es credencial: el demo exige el `demoToken` devuelto
 * una sola vez en la respuesta del POST /leads — un tercero que adivine o
 * conozca el id no puede activar la cuenta.
 */
@Controller("leads")
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  async create(@Body() body: LeadBody, @Req() req: Request) {
    throttle(`lead|${req.ip ?? "?"}`, LEAD_MAX);

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone =
      typeof body?.phone === "string" ? body.phone.trim() : "";
    const roles = Array.isArray(body?.roles)
      ? body.roles.filter(
          (r): r is string =>
            typeof r === "string" && ALLOWED_ROLES.has(r),
        )
      : [];
    const intent =
      typeof body?.intent === "string" ? body.intent.toUpperCase() : "";

    if (name.length < 2) throw new BadRequestException("name requerido");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("email inválido");
    }
    if (!phone) throw new BadRequestException("phone requerido");
    if (roles.length === 0) {
      throw new BadRequestException("roles: elige al menos uno");
    }
    if (!ALLOWED_INTENTS.has(intent)) {
      throw new BadRequestException("intent inválido");
    }
    const emailTaken = !!(await this.prisma.person.findUnique({
      where: { email },
      select: { id: true },
    }));

    // Upsert por email: un re-envío refresca datos/intent, no duplica.
    // El demoToken se genera una vez y se conserva en updates — así un
    // re-envío legítimo sigue pudiendo activar el demo, pero solo quien
    // recibió la respuesta original (o este) tiene el token.
    const existing = await this.prisma.lead.findUnique({
      where: { email },
      select: { id: true, demoToken: true },
    });
    const lead = await this.prisma.lead.upsert({
      where: { email },
      create: {
        name,
        email,
        phone,
        roles,
        intent,
        demoToken: randomBytes(24).toString("hex"),
      },
      update: { name, phone, roles, intent },
      select: { id: true, demoToken: true },
    });

    if (!existing) {
      // Aviso a admins aprobados — best-effort, nunca rompe el submit.
      const admins = await this.prisma.personRole.findMany({
        where: { role: "ADMIN", status: "APPROVED" },
        select: { personId: true },
      });
      for (const admin of admins) {
        await this.notifications.notifySafe(admin.personId, {
          category: "OPERATIONAL",
          type: "lead.new",
          title: `Nuevo lead: ${name}`,
          body: `${email} · ${roles.join(", ")} · ${intent === "DEMO" ? "pide demo" : "quiere contacto"}`,
          data: { leadId: lead.id },
        });
      }
    }

    // Si el correo ya tiene cuenta real, no sirve el demo: no devolvemos
    // token para no entregar una credencial inútil ni marcar el estado.
    return {
      id: lead.id,
      demoToken: emailTaken ? null : lead.demoToken,
      accountExists: emailTaken,
    };
  }

  /**
   * Acceso demo: crea la Person con los datos del lead y sus roles en
   * APPROVED (necesario para que pase los guards y explore la app),
   * marcada isDemoAccount para auditoría/exclusión analítica. Enlaza
   * lead.personId y emite sesión.
   *
   * - Email ya registrado → 409 account_exists (nunca takeover).
   * - Re-entrar con el mismo lead+token reemite sesión sobre la cuenta.
   * - El correo queda SIN verifiedAt — jamás se verificó; el dueño real
   *   del correo puede reclamar la cuenta vía magic link.
   */
  @Post(":id/demo")
  @HttpCode(200)
  async demo(
    @Param("id") id: string,
    @Body() body: DemoBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    throttle(`demo|${req.ip ?? "?"}`, DEMO_MAX);

    const lead = await this.prisma.lead.findUnique({ where: { id } });
    const token = typeof body?.token === "string" ? body.token : "";
    const ok =
      lead?.demoToken &&
      token.length === lead.demoToken.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(lead.demoToken));
    // Mismo 404 para lead inexistente y token inválido: no se filtra
    // cuál de los dos falló.
    if (!lead || !ok) throw new NotFoundException("lead no encontrado");

    let personId = lead.personId;
    if (!personId) {
      const existing = await this.prisma.person.findUnique({
        where: { email: lead.email },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException("account_exists");
      }
      // Solo roles que existen en el catálogo — evita FK roto si el
      // seed aún no corre.
      const known = await this.prisma.role.findMany({
        where: { key: { in: lead.roles } },
        select: { key: true },
      });
      const person = await this.prisma.person.create({
        data: {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          isDemoAccount: true,
          roles: {
            create: known.map((r) => ({ role: r.key, status: "APPROVED" })),
          },
        },
        select: { id: true },
      });
      personId = person.id;
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { personId, status: "CONVERTED" },
      });
    }

    const session = await this.auth.issueSession(personId);
    setSessionCookie(res, session);
    return { ok: true };
  }
}

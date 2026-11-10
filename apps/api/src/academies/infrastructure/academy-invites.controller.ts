import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { consumeAcademyInvites } from "../../common/consume-academy-invites";
import { PrismaService } from "../../prisma.service";
import { AcademyAccess } from "./academy-access.service";
import { AcademyInvitesService } from "./academy-invites.service";

class CreateInviteDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
}

/**
 * Invitaciones de registro de la academia (spec academies/student-invites):
 * el staff invita a personas SIN crearles enrollment - la invitada se
 * registra por el magic link, aterriza en la ficha pública de la academia
 * (`next=/academias/:id`, consumo en auth.controller) y se inscribe sola.
 * Canal de adquisición del dancer, no gestión de nómina.
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class AcademyInvitesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
    private readonly invites: AcademyInvitesService,
  ) {}

  /**
   * POST /academies/:id/invites (cap `students`): email + nombre y
   * apellido. Crea AcademyInvite pendiente y envía correo con magic
   * link (next → ficha pública). Idempotente por pendiente: un re-envío
   * sobre (academy, email) pendiente reenvía el correo sin duplicar fila.
   * Email con cuenta existente: correo igual + push "te invitó".
   */
  @Post(":id/invites")
  async invite(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() dto: CreateInviteDto,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "students",
    );
    const email = dto.email.trim().toLowerCase();
    const name = `${dto.name.trim()} ${dto.lastName?.trim() ?? ""}`.trim();
    const { invite, resent } = await this.invites.sendInvite(academy, {
      email,
      name,
      invitedById: req.person!.id,
    });
    return { invite, resent };
  }

  /**
   * POST /academies/invites/:inviteId/consume (sesión): camino push
   * `academy.invite` de la cuenta existente - consume la invitación
   * pendiente del propio usuario sin pasar por el magic link. Mismo
   * efecto que el verify (Referral INVITE + invite.registered) vía el
   * helper compartido. 404 si la invite no existe o es de otro email
   * (no filtra invitaciones ajenas); idempotente sobre consumida.
   */
  @Post("invites/:inviteId/consume")
  async consume(@Param("inviteId") inviteId: string, @Req() req: Request) {
    const [invite, person] = await Promise.all([
      this.prisma.academyInvite.findUnique({ where: { id: inviteId } }),
      this.prisma.person.findUnique({
        where: { id: req.person!.id },
        select: { email: true },
      }),
    ]);
    if (
      !invite ||
      !person?.email ||
      invite.email !== person.email.toLowerCase()
    ) {
      throw new NotFoundException();
    }
    if (invite.consumedAt) return { consumed: false };
    const consumed = await consumeAcademyInvites(this.prisma, {
      email: invite.email,
      personId: req.person!.id,
      academyId: invite.academyId,
    });
    return { consumed };
  }

  /**
   * GET /academies/:id/invites (cap `students`): seguimiento de la
   * invitación - pendientes primero (consumedAt null arriba), dentro de
   * cada grupo las más recientes primero.
   */
  @Get(":id/invites")
  async list(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireCapability(id, req.person!, "students");
    const items = await this.prisma.academyInvite.findMany({
      where: { academyId: id },
      orderBy: [
        { consumedAt: { sort: "desc", nulls: "first" } },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        email: true,
        name: true,
        consumedAt: true,
        createdAt: true,
      },
    });
    return { items };
  }
}

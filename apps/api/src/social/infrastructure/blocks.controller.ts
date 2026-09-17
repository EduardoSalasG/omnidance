import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsString } from "class-validator";
import type { Request, Response } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";

class BlockDto {
  @IsString()
  personId!: string;
}

/**
 * Bloqueos de seguridad (spec-gap-closure: safety/user-blocks — omni-dance.md
 * §4). Unidireccionales y silenciosos: el bloqueado nunca es notificado ni
 * puede descubrir el bloqueo. UserBlock no tiene @relation a Person → joins
 * manuales. El enforcement vive en sessions.invite / sessions.declare.
 */
@Controller("blocks")
@UseGuards(SessionGuard)
export class BlocksController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bloquear a una persona — idempotente: 201 si se crea, 200 si ya existía
   * (@@unique([blockerId, blockedId])).
   */
  @Post()
  async block(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: BlockDto,
  ) {
    const blockerId = req.person!.id;
    if (dto.personId === blockerId) {
      throw new BadRequestException("no puedes bloquearte a ti mismo");
    }

    const target = await this.prisma.person.findUnique({
      where: { id: dto.personId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("persona no encontrada");

    const key = { blockerId, blockedId: dto.personId };
    const existing = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: key },
    });
    if (existing) {
      res.status(200);
      return existing;
    }
    return this.prisma.userBlock.create({ data: key });
  }

  /** Desbloquear — solo bloqueos propios; inexistente → 404. */
  @Delete(":personId")
  @HttpCode(200)
  async unblock(@Req() req: Request, @Param("personId") personId: string) {
    const existing = await this.prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: { blockerId: req.person!.id, blockedId: personId },
      },
    });
    if (!existing) throw new NotFoundException("bloqueo no encontrado");
    return this.prisma.userBlock.delete({ where: { id: existing.id } });
  }

  /**
   * Mis bloqueos activos → [{id, blockedId, createdAt, person:{id,name,photoUrl}}].
   * Nunca expone bloqueos de terceros ni quién me bloqueó a mí.
   */
  @Get()
  async mine(@Req() req: Request) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: req.person!.id },
      orderBy: { createdAt: "desc" },
    });
    const people = await this.prisma.person.findMany({
      where: { id: { in: blocks.map((b) => b.blockedId) } },
      select: { id: true, name: true, photoUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return blocks.map((b) => ({
      id: b.id,
      blockedId: b.blockedId,
      createdAt: b.createdAt,
      person: byId.get(b.blockedId) ?? null,
    }));
  }
}

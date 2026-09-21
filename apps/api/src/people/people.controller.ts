import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, MinLength } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { AuthService } from "../auth/domain/auth.service";
import { PrismaService } from "../prisma.service";

class CompleteProfileDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(6)
  phone!: string;

  // Opcional: la cuenta también puede operar solo por magic link.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

@Controller()
export class PeopleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get("me")
  @UseGuards(SessionGuard)
  async me(@Req() req: Request) {
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: req.person!.id },
      include: { roles: { select: { role: true, status: true } } },
    });
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      photoUrl: person.photoUrl,
      roles: person.roles
        .filter((r) => r.status === "APPROVED")
        .map((r) => r.role),
      roleStates: person.roles,
      // Flags de ciclo de vida: demo (lead /pro, solo lectura) y
      // pendingProfile (admin convirtió el lead — falta completar datos).
      isDemo: person.isDemoAccount,
      pendingProfile: !!person.pendingProfileAt,
    };
  }

  /**
   * Cierre del flujo lead → real: el admin convirtió el lead
   * (pendingProfileAt) y la persona confirma/completa sus datos.
   * Apaga isDemoAccount → ya puede escribir en la app, y el lead ligado
   * pasa a CONVERTED. Whitelisted en la barrera demo del SessionGuard.
   */
  @Post("me/complete-profile")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async completeProfile(@Req() req: Request, @Body() dto: CompleteProfileDto) {
    const personId = req.person!.id;
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { pendingProfileAt: true, isDemoAccount: true },
    });
    if (!person.pendingProfileAt && !person.isDemoAccount) {
      throw new ForbiddenException("nada que completar");
    }
    const name = dto.name.trim();
    const phone = dto.phone.trim();
    if (name.length < 2 || !phone) {
      throw new BadRequestException("datos inválidos");
    }
    // Person.phone es unique — si el teléfono ya está en otra cuenta el
    // update explotaría en 500. 409 explícito para el frontend.
    const phoneTaken = await this.prisma.person.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (phoneTaken && phoneTaken.id !== personId) {
      throw new ConflictException("phone_exists");
    }
    await this.prisma.person.update({
      where: { id: personId },
      data: {
        name,
        phone,
        pendingProfileAt: null,
        isDemoAccount: false,
        ...(dto.password
          ? { passwordHash: await this.auth.hashPassword(dto.password) }
          : {}),
      },
    });
    // Si vino de un lead, queda CONVERTED — el pipeline admin lo refleja.
    await this.prisma.lead.updateMany({
      where: { personId },
      data: { status: "CONVERTED" },
    });
    return { ok: true };
  }
}

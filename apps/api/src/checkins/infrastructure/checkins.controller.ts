import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { QrService } from "../../qr/domain/qr.service";
import {
  AlreadyVoidedError,
  CheckinForbiddenError,
  CheckinNotFoundError,
  CheckinsService,
  DoorCapReachedError,
  DuplicateCheckinError,
  EventNotFoundError,
  EventNotOpenError,
  PersonNotFoundError,
  type CheckinResult,
  type RegisterCheckinInput,
} from "../domain/checkins.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { GamificationService } from "../../gamification/domain/gamification.service";

class ScanCheckinDto {
  @IsString()
  qrToken!: string;

  @IsString()
  eventId!: string;

  @IsOptional()
  @IsIn(["SCAN", "MANUAL"])
  method?: "SCAN" | "MANUAL";
}

class ManualCheckinDto {
  @IsString()
  eventId!: string;

  @IsString()
  personId!: string;

  /** Nota del staff (lista/cortesía) — se persiste en Checkin.note. */
  @IsOptional()
  @IsString()
  note?: string;
}

class VoidCheckinDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

class DoorSaleDto {
  @IsString()
  eventId!: string;

  @IsIn(["CASH", "APP"])
  channel!: "CASH" | "APP";

  @IsString()
  @IsNotEmpty()
  name!: string;

  /** Llave de la cuenta ligera — Person.phone es único. */
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

function mapDomainError(e: unknown): never {
  if (
    e instanceof EventNotFoundError ||
    e instanceof PersonNotFoundError ||
    e instanceof CheckinNotFoundError
  ) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof CheckinForbiddenError) {
    throw new ForbiddenException(e.message);
  }
  if (e instanceof DuplicateCheckinError) {
    throw new ConflictException({
      error: "DUPLICATE_CHECKIN",
      message: e.message,
      checkin: e.existing,
    });
  }
  if (e instanceof AlreadyVoidedError) {
    throw new ConflictException({
      error: "ALREADY_VOIDED",
      message: e.message,
      checkin: e.checkin,
    });
  }
  if (e instanceof EventNotOpenError) {
    throw new ConflictException({
      error: "EVENT_NOT_OPEN",
      message: e.message,
    });
  }
  if (e instanceof DoorCapReachedError) {
    throw new ConflictException({
      error: "DOOR_CAP_REACHED",
      message: e.message,
      doorCap: e.doorCap,
    });
  }
  throw e;
}

@Controller("checkins")
export class CheckinsController {
  constructor(
    private readonly checkins: CheckinsService,
    private readonly qr: QrService,
    private readonly gamification: GamificationService,
  ) {}

  @Post()
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("checkins.write")
  async scan(
    @Body() dto: ScanCheckinDto,
    @Req() req: Request,
  ): Promise<CheckinResult> {
    let personId: string;
    try {
      ({ personId } = await this.qr.verify(dto.qrToken));
    } catch {
      throw new BadRequestException("qrToken inválido o expirado");
    }
    return this.register({
      eventId: dto.eventId,
      personId,
      staffId: req.person!.id,
      method: dto.method ?? "SCAN",
    });
  }

  @Post("manual")
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("checkins.write")
  manual(
    @Body() dto: ManualCheckinDto,
    @Req() req: Request,
  ): Promise<CheckinResult> {
    return this.register({
      eventId: dto.eventId,
      personId: dto.personId,
      staffId: req.person!.id,
      method: "MANUAL",
      note: dto.note,
    });
  }

  /**
   * Check-out ("me fui"): dueño del check-in o staff con checkins.write.
   * Sin @RequirePermissions — el owner no tiene el permiso; la autorización
   * fina (owner || permiso) la resuelve el servicio. Idempotente.
   */
  @Post(":id/out")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async out(@Param("id") id: string, @Req() req: Request) {
    try {
      return await this.checkins.closeCheckin(id, { id: req.person!.id });
    } catch (e) {
      mapDomainError(e);
    }
  }

  /**
   * Anula un check-in: staff asignado al evento o admin (verificado en el
   * servicio además del permiso del guard). Revierte el pase y audita.
   */
  @Post(":id/void")
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("checkins.write")
  @HttpCode(200)
  async voidCheckin(
    @Param("id") id: string,
    @Body() dto: VoidCheckinDto,
    @Req() req: Request,
  ) {
    try {
      return await this.checkins.voidCheckin(id, dto.reason, {
        id: req.person!.id,
      });
    } catch (e) {
      mapDomainError(e);
    }
  }

  /**
   * Venta en puerta (spec door-sale): staff asignado / productor / admin —
   * por eso no lleva @RequirePermissions (el productor no tiene el grant);
   * la autorización por evento la hace el servicio. Devuelve qrToken
   * minteado para mostrar el QR de la persona al instante.
   */
  @Post("door-sale")
  @UseGuards(SessionGuard)
  async doorSale(@Body() dto: DoorSaleDto, @Req() req: Request) {
    try {
      const result = await this.checkins.doorSale(
        {
          eventId: dto.eventId,
          channel: dto.channel,
          name: dto.name,
          phone: dto.phone,
        },
        { id: req.person!.id },
      );
      await this.safeOnCheckin(result.checkin.personId, result.checkin);
      const { token, expiresAt } = await this.qr.mint(result.person.id);
      return { ...result, qrToken: token, qrExpiresAt: expiresAt };
    } catch (e) {
      mapDomainError(e);
    }
  }

  private async register(input: RegisterCheckinInput) {
    try {
      const result = await this.checkins.register(input);
      await this.safeOnCheckin(result.checkin.personId, result.checkin);
      return result;
    } catch (e) {
      mapDomainError(e);
    }
  }

  /** Hook de gamificación best-effort (early-checkin puntos + badges). */
  private async safeOnCheckin(
    personId: string,
    checkin: Parameters<GamificationService["onCheckin"]>[1],
  ): Promise<void> {
    try {
      await this.gamification.onCheckin(personId, checkin);
    } catch {
      /* gamificación no crítica */
    }
  }
}

@Controller("events")
export class EventCheckinsController {
  constructor(private readonly checkins: CheckinsService) {}

  @Get(":eventId/checkins")
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("checkins.write")
  async list(@Param("eventId") eventId: string) {
    try {
      return await this.checkins.listByEvent(eventId);
    } catch (e) {
      mapDomainError(e);
    }
  }
}

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { QrService } from "../../qr/domain/qr.service";
import {
  CheckinsService,
  DuplicateCheckinError,
  EventNotFoundError,
  PersonNotFoundError,
  type CheckinResult,
  type RegisterCheckinInput,
} from "../domain/checkins.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";

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

  /** Nota del staff (lista/cortesía) — sin columna en schema v1, se acepta y no persiste. */
  @IsOptional()
  @IsString()
  note?: string;
}

function mapDomainError(e: unknown): never {
  if (e instanceof EventNotFoundError || e instanceof PersonNotFoundError) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof DuplicateCheckinError) {
    throw new ConflictException({
      error: "DUPLICATE_CHECKIN",
      message: e.message,
      checkin: e.existing,
    });
  }
  throw e;
}

@Controller("checkins")
export class CheckinsController {
  constructor(
    private readonly checkins: CheckinsService,
    private readonly qr: QrService,
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
    });
  }

  private async register(input: RegisterCheckinInput) {
    try {
      return await this.checkins.register(input);
    } catch (e) {
      mapDomainError(e);
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

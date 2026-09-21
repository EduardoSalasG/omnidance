import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  CheckoutService,
  EventNotFoundError,
  InvalidDiscountError,
  PresaleSoldOutError,
  PresaleUnavailableError,
  SeriesInactiveError,
  SeriesNotFoundError,
  SeriesPassAlreadyOwnedError,
  RecipientError,
} from "../application/checkout.service";

class CheckoutTicketDto {
  @IsString()
  eventId!: string;

  @IsOptional()
  @IsString()
  discountCode?: string;

  // Canción pedida para el DJ (spec song-suggestions): se guarda ligada al
  // comprador; el top-N del evento solo cuenta personas con ticket pagado.
  @IsOptional()
  @IsString()
  @MaxLength(140)
  songSuggestion?: string;

  /**
   * Regalo multi-entrada: personIds de amigos (ACCEPTED) que reciben una
   * entrada cada uno al confirmarse el pago. Máx. 9 → órdenes de hasta 10
   * tickets. El servidor valida existencia, amistad y que no tengan ya
   * entrada ACTIVE para el evento.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  recipientIds?: string[];
}

class CheckoutSeriesPassDto {
  @IsString()
  seriesId!: string;

  /** Mes de vigencia del pase — formato estricto "YYYY-MM". */
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "month debe ser YYYY-MM" })
  month!: string;
}

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post("ticket")
  @UseGuards(SessionGuard)
  async ticket(@Req() req: Request, @Body() dto: CheckoutTicketDto) {
    try {
      return await this.checkout.purchaseTicket(req.person!.id, dto);
    } catch (e) {
      if (e instanceof EventNotFoundError) {
        throw new NotFoundException(e.message);
      }
      if (e instanceof PresaleSoldOutError) {
        throw new ConflictException(e.message);
      }
      if (
        e instanceof PresaleUnavailableError ||
        e instanceof InvalidDiscountError ||
        e instanceof RecipientError
      ) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  /**
   * Pase mensual de serie: cubre todos los eventos de la serie en el mes.
   * El pase se emite cuando el webhook confirma el pago (upsert por
   * serie+persona+mes).
   */
  @Post("series-pass")
  @UseGuards(SessionGuard)
  async seriesPass(@Req() req: Request, @Body() dto: CheckoutSeriesPassDto) {
    try {
      return await this.checkout.purchaseSeriesPass(req.person!.id, dto);
    } catch (e) {
      if (e instanceof SeriesNotFoundError) {
        throw new NotFoundException(e.message);
      }
      if (e instanceof SeriesPassAlreadyOwnedError) {
        throw new ConflictException(e.message);
      }
      if (e instanceof SeriesInactiveError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }
}

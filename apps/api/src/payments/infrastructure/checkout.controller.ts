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
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  CheckoutService,
  EventNotFoundError,
  InvalidDiscountError,
  PresaleSoldOutError,
  PresaleUnavailableError,
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
        e instanceof InvalidDiscountError
      ) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }
}

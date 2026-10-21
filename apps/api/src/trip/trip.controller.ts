import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { TripService } from "./trip.service";

/**
 * Body de PUT /me/trip/:eventId (spec mi-viaje): la nota privada es
 * opcional y corta (recordatorio de viaje - hotel, vuelo, con quién).
 */
class SaveTripItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * Lista de viaje del bailarín (spec mi-viaje): solo opera sobre
 * `request.person.id` - no hay forma de leer ni mutar el viaje ajeno.
 * SessionGuard en todo el controller; el flag `trip_planner` gatea en
 * el service (OFF → 404).
 */
@Controller("me/trip")
@UseGuards(SessionGuard)
export class TripController {
  constructor(private readonly trip: TripService) {}

  /** GET /me/trip - itinerario: evento expandido (feed + city), orden
      por fecha; ?includePast=true incluye los ya pasados. */
  @Get()
  @ApiQuery({ name: "includePast", required: false })
  list(@Req() req: Request, @Query("includePast") includePast?: string) {
    return this.trip.list(req.person!.id, includePast === "true");
  }

  /** GET /me/trip/ids - eventIds guardados (inTrip de la ficha). */
  @Get("ids")
  ids(@Req() req: Request) {
    return this.trip.ids(req.person!.id);
  }

  /** PUT /me/trip/:eventId - guarda o actualiza la nota (idempotente). */
  @Put(":eventId")
  save(
    @Req() req: Request,
    @Param("eventId") eventId: string,
    @Body() dto: SaveTripItemDto,
  ) {
    return this.trip.save(req.person!.id, eventId, dto.note);
  }

  /** DELETE /me/trip/:eventId - quita el evento del viaje (404 si no). */
  @Delete(":eventId")
  @HttpCode(204)
  remove(@Req() req: Request, @Param("eventId") eventId: string) {
    return this.trip.remove(req.person!.id, eventId);
  }
}

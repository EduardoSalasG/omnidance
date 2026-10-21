import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { FeaturesModule } from "../features/features.module";
import { CitiesService } from "./cities.service";
import {
  CitiesController,
  EventsNearController,
} from "./cities.controller";

/**
 * Descubrimiento por ciudad (spec city-discovery): /cities público +
 * /events/near. Reemplaza al antiguo CitiesController de social
 * (session-gated, shape distinto) - esta es la superficie pública
 * definitiva detrás del flag city_landing.
 */
@Module({
  imports: [PrismaModule, FeaturesModule],
  controllers: [
    // EventsNearController primero: mismo prefijo "events" que
    // EventsController - su @Get("near") debe registrarse antes de
    // cualquier ":id" del otro módulo (ver app.module).
    EventsNearController,
    CitiesController,
  ],
  providers: [CitiesService],
})
export class CitiesModule {}

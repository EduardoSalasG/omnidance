import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FeaturesModule } from "../features/features.module";
import { PrismaModule } from "../prisma.module";
import { TripController } from "./trip.controller";
import { TripService } from "./trip.service";

/**
 * "Mi viaje" (spec mi-viaje): el trip planner multipaís del bailarín -
 * guardar eventos de cualquier ciudad en una lista propia (bookmark en
 * la ficha → itinerario en /mi-viaje). Todo detrás de SessionGuard +
 * flag `trip_planner`.
 */
@Module({
  imports: [PrismaModule, FeaturesModule, AuthModule],
  controllers: [TripController],
  providers: [TripService],
})
export class TripModule {}

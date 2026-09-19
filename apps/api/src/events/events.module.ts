import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { ParamsModule } from "../params/params.module";
import { EventsController } from "./infrastructure/events.controller";
import { EventRatingsController } from "./infrastructure/event-ratings.controller";
import { ProducerController } from "./infrastructure/producer.controller";
import { TableReservationsController } from "./infrastructure/table-reservations.controller";
import { SongSuggestionsController } from "./infrastructure/song-suggestions.controller";

@Module({
  imports: [AuthModule, PrismaModule, ParamsModule],
  controllers: [
    EventsController,
    EventRatingsController,
    ProducerController,
    TableReservationsController,
    SongSuggestionsController,
  ],
})
export class EventsModule {}

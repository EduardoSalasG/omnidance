import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { ParamsModule } from "../params/params.module";
import { EventsController } from "./infrastructure/events.controller";
import { EventRatingsController } from "./infrastructure/event-ratings.controller";
import { ProducerController } from "./infrastructure/producer.controller";
import { TableReservationsController } from "./infrastructure/table-reservations.controller";
import { SongSuggestionsController } from "./infrastructure/song-suggestions.controller";
import { DjController } from "./infrastructure/dj.controller";

@Module({
  imports: [AuthModule, PrismaModule, ParamsModule],
  controllers: [
    EventsController,
    EventRatingsController,
    ProducerController,
    TableReservationsController,
    SongSuggestionsController,
    DjController,
  ],
})
export class EventsModule {}

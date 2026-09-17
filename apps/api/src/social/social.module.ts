import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import {
  EventGuestListsController,
  GuestListsController,
} from "./infrastructure/guest-lists.controller";
import { PracticesController } from "./infrastructure/practices.controller";
import { RsvpController } from "./infrastructure/rsvp.controller";
import { TripsController } from "./infrastructure/trips.controller";
import { WaitlistController } from "./infrastructure/waitlist.controller";

/**
 * Social: RSVP, guest lists, waitlist, prácticas y trips.
 * NOTA: para exponerlo en runtime hay que importarlo en AppModule
 * (prohibido tocarlo en este cambio — queda como pendiente de wiring).
 */
@Module({
  imports: [AuthModule],
  controllers: [
    RsvpController,
    EventGuestListsController,
    GuestListsController,
    WaitlistController,
    PracticesController,
    TripsController,
  ],
  providers: [PrismaService],
})
export class SocialModule {}

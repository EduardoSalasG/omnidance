import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PrismaService } from "../prisma.service";
import { AvailabilityController } from "./infrastructure/availability.controller";
import {
  EventGuestListsController,
  GuestListsController,
} from "./infrastructure/guest-lists.controller";
import { PartnerRequestsController } from "./infrastructure/partner-requests.controller";
import { PracticesController } from "./infrastructure/practices.controller";
import {
  MeRsvpController,
  RsvpController,
} from "./infrastructure/rsvp.controller";
import { StylesController } from "./infrastructure/styles.controller";
import { TripsController } from "./infrastructure/trips.controller";
import { VenuesController } from "./infrastructure/venues.controller";
import { WaitlistController } from "./infrastructure/waitlist.controller";

/** Social: RSVP, guest lists, waitlist, prácticas, trips, venues, matchmaking y disponibilidad. */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [
    RsvpController,
    MeRsvpController,
    EventGuestListsController,
    GuestListsController,
    WaitlistController,
    PracticesController,
    StylesController,
    TripsController,
    VenuesController,
    PartnerRequestsController,
    AvailabilityController,
  ],
  providers: [PrismaService],
})
export class SocialModule {}

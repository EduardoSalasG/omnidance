import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PrismaModule } from "../prisma.module";
import { AvailabilityController } from "./infrastructure/availability.controller";
import { BlocksController } from "./infrastructure/blocks.controller";
import { EventEntryPassesController } from "./infrastructure/entry-passes.controller";
import { FriendsController } from "./infrastructure/friends.controller";
import {
  EventGuestListsController,
  GuestListsController,
} from "./infrastructure/guest-lists.controller";
import { PartnerRequestsController } from "./infrastructure/partner-requests.controller";
import { PeopleController } from "./infrastructure/people.controller";
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
  imports: [AuthModule, NotificationsModule, PrismaModule],
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
    BlocksController,
    FriendsController,
    PeopleController,
    EventEntryPassesController,
  ],
})
export class SocialModule {}

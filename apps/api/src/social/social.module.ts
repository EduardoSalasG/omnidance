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
import { StylesController } from "./infrastructure/styles.controller";
import { VenueConsoleController } from "./infrastructure/venue-console.controller";
import { VenuesController } from "./infrastructure/venues.controller";
import { WaitlistController } from "./infrastructure/waitlist.controller";

/** Social: guest lists, waitlist, prácticas, venues, matchmaking y disponibilidad. */
@Module({
  imports: [AuthModule, NotificationsModule, PrismaModule],
  controllers: [
    EventGuestListsController,
    GuestListsController,
    WaitlistController,
    PracticesController,
    StylesController,
    VenuesController,
    VenueConsoleController,
    PartnerRequestsController,
    AvailabilityController,
    BlocksController,
    FriendsController,
    PeopleController,
    EventEntryPassesController,
  ],
})
export class SocialModule {}

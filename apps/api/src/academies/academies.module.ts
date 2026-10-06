import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ParamsModule } from "../params/params.module";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma.module";
import { StorageModule } from "../storage/storage.module";
import { AcademyAccessModule } from "./academy-access.module";
import { AcademyBillingController } from "./infrastructure/academy-billing.controller";
import { AcademyClaimsController } from "./infrastructure/academy-claims.controller";
import { AcademyClaimsService } from "./infrastructure/academy-claims.service";
import { AcademyImportController } from "./infrastructure/academy-import.controller";
import { AcademyImportService } from "./infrastructure/academy-import.service";
import { AcademyRemindersService } from "./infrastructure/academy-reminders.service";
import { AcademyStaffController } from "./infrastructure/academy-staff.controller";
import { AcademiesScheduler } from "./infrastructure/academies.scheduler";
import {
  AcademiesController,
  EnrollmentsController,
} from "./infrastructure/academies.controller";
import { AttendanceController } from "./infrastructure/attendance.controller";
import { ClassesController } from "./infrastructure/classes.controller";
import { ClassSeriesController } from "./infrastructure/class-series.controller";
import { PrivateLessonsController } from "./infrastructure/private-lessons.controller";
import { VideosController } from "./infrastructure/videos.controller";

@Module({
  imports: [
    AcademyAccessModule,
    AuthModule,
    NotificationsModule,
    ParamsModule,
    PaymentsModule,
    PrismaModule,
    StorageModule,
  ],
  controllers: [
    AcademiesController,
    AcademyBillingController,
    AcademyClaimsController,
    AcademyImportController,
    AcademyStaffController,
    EnrollmentsController,
    AttendanceController,
    ClassesController,
    ClassSeriesController,
    PrivateLessonsController,
    VideosController,
  ],
  providers: [
    AcademyClaimsService,
    AcademyImportService,
    AcademyRemindersService,
    AcademiesScheduler,
  ],
})
export class AcademiesModule {}

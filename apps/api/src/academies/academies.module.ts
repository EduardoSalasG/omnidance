import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PrismaModule } from "../prisma.module";
import { AcademyAccess } from "./infrastructure/academy-access.service";
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
  imports: [AuthModule, NotificationsModule, PrismaModule],
  controllers: [
    AcademiesController,
    EnrollmentsController,
    AttendanceController,
    ClassesController,
    ClassSeriesController,
    PrivateLessonsController,
    VideosController,
  ],
  providers: [AcademyAccess],
})
export class AcademiesModule {}

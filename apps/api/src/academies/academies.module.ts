import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { AcademyAccess } from "./infrastructure/academy-access.service";
import {
  AcademiesController,
  EnrollmentsController,
} from "./infrastructure/academies.controller";
import { AttendanceController } from "./infrastructure/attendance.controller";
import { PrivateLessonsController } from "./infrastructure/private-lessons.controller";
import { VideosController } from "./infrastructure/videos.controller";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [
    AcademiesController,
    EnrollmentsController,
    AttendanceController,
    PrivateLessonsController,
    VideosController,
  ],
  providers: [AcademyAccess],
})
export class AcademiesModule {}

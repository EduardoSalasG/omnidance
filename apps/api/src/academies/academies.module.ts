import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { AcademyAccess } from "./infrastructure/academy-access.service";
import { AcademyOwnerGuard } from "./infrastructure/academy-role.guard";
import {
  AcademiesController,
  EnrollmentsController,
} from "./infrastructure/academies.controller";
import { AttendanceController } from "./infrastructure/attendance.controller";

@Module({
  imports: [AuthModule],
  controllers: [
    AcademiesController,
    EnrollmentsController,
    AttendanceController,
  ],
  providers: [PrismaService, AcademyAccess, AcademyOwnerGuard],
})
export class AcademiesModule {}

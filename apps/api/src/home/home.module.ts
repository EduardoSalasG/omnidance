import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { HomeController } from "./home.controller";
import { HomeService } from "./home.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}

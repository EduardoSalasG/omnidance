import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { PeopleController } from "./people.controller";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PeopleController],
})
export class PeopleModule {}

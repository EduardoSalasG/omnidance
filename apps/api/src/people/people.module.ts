import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { PeopleController } from "./people.controller";

@Module({
  imports: [AuthModule],
  controllers: [PeopleController],
  providers: [PrismaService],
})
export class PeopleModule {}

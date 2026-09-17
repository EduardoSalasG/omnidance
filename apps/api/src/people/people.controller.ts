import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { PrismaService } from "../prisma.service";

@Controller()
export class PeopleController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  @UseGuards(SessionGuard)
  async me(@Req() req: Request) {
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: req.person!.id },
      include: { roles: { select: { role: true, status: true } } },
    });
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      photoUrl: person.photoUrl,
      roles: person.roles
        .filter((r) => r.status === "APPROVED")
        .map((r) => r.role),
      roleStates: person.roles,
    };
  }
}

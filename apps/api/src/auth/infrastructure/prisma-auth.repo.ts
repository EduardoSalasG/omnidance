import { Injectable } from "@nestjs/common";
import type { Person } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import type { AuthRepo } from "../domain/ports";

@Injectable()
export class PrismaAuthRepo implements AuthRepo {
  constructor(private readonly prisma: PrismaService) {}

  upsertByEmail(email: string): Promise<Person> {
    return this.prisma.person.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: email.split("@")[0],
        roles: { create: { role: "DANCER", status: "APPROVED" } },
      },
    });
  }

  findById(id: string) {
    return this.prisma.person.findUnique({
      where: { id },
      include: { roles: { select: { role: true, status: true } } },
    });
  }
}

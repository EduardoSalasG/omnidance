import { Injectable } from "@nestjs/common";
import type { Person } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import type { AuthRepo } from "../domain/ports";

@Injectable()
export class PrismaAuthRepo implements AuthRepo {
  constructor(private readonly prisma: PrismaService) {}

  async upsertByEmail(email: string): Promise<Person> {
    const existing = await this.prisma.person.findUnique({ where: { email } });
    if (existing) {
      return this.prisma.person.update({
        where: { email },
        data: {
          // El magic link prueba posesión del correo. La promoción
          // demo→real se salta si el admin la convirtió y falta el
          // perfil (pendingProfileAt) — eso lo cierra /me/complete-profile.
          verifiedAt: new Date(),
          ...(existing.pendingProfileAt ? {} : { isDemoAccount: false }),
        },
      });
    }
    return this.prisma.person.create({
      data: {
        email,
        name: email.split("@")[0],
        verifiedAt: new Date(),
        roles: { create: { role: "DANCER", status: "APPROVED" } },
      },
    });
  }

  findByEmail(email: string) {
    return this.prisma.person.findUnique({ where: { email } });
  }

  createWithPassword(email: string, name: string, passwordHash: string) {
    return this.prisma.person.create({
      data: {
        email,
        name,
        passwordHash,
        roles: { create: { role: "DANCER", status: "APPROVED" } },
      },
    });
  }

  async setPassword(personId: string, passwordHash: string) {
    await this.prisma.person.update({
      where: { id: personId },
      data: { passwordHash },
    });
  }

  findById(id: string) {
    return this.prisma.person.findUnique({
      where: { id },
      include: { roles: { select: { role: true, status: true } } },
    });
  }
}

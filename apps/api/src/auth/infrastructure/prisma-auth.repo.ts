import { Injectable } from "@nestjs/common";
import type { Person } from "@prisma/client";
import { CONSENT_VERSION } from "@omnidance/shared";
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
          // perfil (pendingProfileAt) - eso lo cierra /me/complete-profile.
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

  recordConsent(personId: string) {
    return this.prisma.person
      .update({
        where: { id: personId },
        data: {
          consentAcceptedAt: new Date(),
          consentVersion: CONSENT_VERSION,
        },
      })
      .then(() => {});
  }

  findById(id: string) {
    return this.prisma.person.findUnique({
      where: { id },
      include: { roles: { select: { role: true, status: true } } },
    });
  }

  // ─── OTP de acceso (spec auth-email-otp) ───

  createOtp(data: {
    email: string;
    codeHash: string;
    consent: boolean;
    role?: string;
    expiresAt: Date;
  }) {
    return this.prisma.authOtp.create({ data }).then(() => {});
  }

  // Registro por landing: crea el PersonRole PENDING si no existe -
  // upsert vacío en update para no pisar un estado ya resuelto por admin.
  ensurePendingRole(personId: string, role: string) {
    return this.prisma.personRole
      .upsert({
        where: { personId_role: { personId, role } },
        update: {},
        create: { personId, role, status: "PENDING" },
      })
      .then(() => {});
  }

  consumeActives(email: string) {
    return this.prisma.authOtp
      .updateMany({
        where: { email, consumedAt: null },
        data: { consumedAt: new Date() },
      })
      .then(() => {});
  }

  findActiveOtp(email: string) {
    return this.prisma.authOtp.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  bumpAttempts(id: string) {
    return this.prisma.authOtp
      .update({ where: { id }, data: { attempts: { increment: 1 } } })
      .then(() => {});
  }

  consumeOtp(id: string) {
    return this.prisma.authOtp
      .update({ where: { id }, data: { consumedAt: new Date() } })
      .then(() => {});
  }
}

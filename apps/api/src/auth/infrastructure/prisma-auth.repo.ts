import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma, type Person } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { emitActivity } from "../../common/activity-log";
import type { ResolvedAcquisition } from "../domain/acquisition";
import type { AuthRepo } from "../domain/ports";

@Injectable()
export class PrismaAuthRepo implements AuthRepo {
  constructor(private readonly prisma: PrismaService) {}

  async upsertByEmail(
    email: string,
    acquisition?: ResolvedAcquisition,
  ): Promise<Person> {
    const existing = await this.prisma.person.findUnique({ where: { email } });
    // Cuenta con baja lógica: el link/OTP no la resucita ni le da
    // sesión - el admin la reactiva si corresponde (spec
    // admin-user-soft-delete).
    if (existing?.deletedAt) {
      throw new UnauthorizedException("cuenta desactivada");
    }
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
    return this.registerPerson({
      email,
      name: email.split("@")[0],
      via: "auth.magic-link",
      acquisition,
    });
  }

  // Alta de cuenta + hitos de la línea de vida admin (spec
  // platform-trials §5b): person.registered y role.approved por cada
  // rol auto-aprobado en el create (DANCER por defecto).
  private async registerPerson(data: {
    email?: string;
    name: string;
    passwordHash?: string;
    phone?: string;
    phoneCountryCode?: string | null;
    verifiedAt?: Date;
    isLightAccount?: boolean;
    jurisdiction?: string;
    via: string;
    acquisition?: ResolvedAcquisition;
  }): Promise<Person> {
    const { via, acquisition, ...fields } = data;
    const person = await this.prisma.person.create({
      data: {
        ...fields,
        verifiedAt: fields.verifiedAt ?? new Date(),
        roles: { create: { role: "DANCER", status: "APPROVED" } },
        // Fuente orgánica (spec auth/acquisition-source): solo se
        // escribe en el alta; ausente → null (invite/untracked).
        ...(acquisition
          ? {
              acquisitionSource: acquisition.source,
              acquisitionDetail:
                acquisition.detail as Prisma.InputJsonValue,
            }
          : {}),
      },
      include: { roles: { select: { id: true, role: true } } },
    });
    await emitActivity(this.prisma, {
      type: "person.registered",
      personId: person.id,
      refType: "Person",
      refId: person.id,
      data: {
        via,
        ...(acquisition ? { acquisitionSource: acquisition.source } : {}),
      },
    });
    for (const r of person.roles) {
      await emitActivity(this.prisma, {
        type: "role.approved",
        personId: person.id,
        refType: "PersonRole",
        refId: r.id,
        data: { role: r.role, via },
      });
    }
    return person;
  }

  findByEmail(email: string) {
    return this.prisma.person.findUnique({ where: { email } });
  }

  createWithPassword(
    email: string,
    name: string,
    passwordHash: string,
    jurisdiction?: string,
    acquisition?: ResolvedAcquisition,
  ) {
    return this.registerPerson({
      email,
      name,
      passwordHash,
      ...(jurisdiction ? { jurisdiction } : {}),
      via: "auth.register",
      acquisition,
    });
  }

  async setPassword(personId: string, passwordHash: string) {
    await this.prisma.person.update({
      where: { id: personId },
      data: { passwordHash },
    });
  }

  async setJurisdiction(personId: string, jurisdiction: string) {
    await this.prisma.person.update({
      where: { id: personId },
      data: { jurisdiction },
    });
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
    next?: string;
    acquisition?: ResolvedAcquisition;
    expiresAt: Date;
  }) {
    const { acquisition, ...rest } = data;
    return this.prisma.authOtp
      .create({
        data: {
          ...rest,
          // Capture crudo en la fila (spec auth/acquisition-source) -
          // el verify lo resuelve de nuevo junto al claim del token.
          ...(acquisition
            ? { acquisition: acquisition.detail as Prisma.InputJsonValue }
            : {}),
        },
      })
      .then(() => {});
  }

  // Admins APPROVED - destinatarios del aviso user.registered (spec
  // notifications/admin-alerts), mismo filtro que leads/payments.
  async approvedAdminIds() {
    const rows = await this.prisma.personRole.findMany({
      where: { role: "ADMIN", status: "APPROVED" },
      select: { personId: true },
    });
    return rows.map((r) => r.personId);
  }

  // Registro por landing: crea el PersonRole PENDING si no existe -
  // upsert vacío en update para no pisar un estado ya resuelto por admin.
  async ensurePendingRole(personId: string, role: string) {
    // Línea de vida (spec platform-trials §5b): solo el alta real del
    // PENDING emite role.requested - un re-login no re-solicita el rol.
    const existing = await this.prisma.personRole.findUnique({
      where: { personId_role: { personId, role } },
      select: { id: true },
    });
    if (existing) return;
    try {
      const row = await this.prisma.personRole.create({
        data: { personId, role, status: "PENDING" },
      });
      await emitActivity(this.prisma, {
        type: "role.requested",
        personId,
        refType: "PersonRole",
        refId: row.id,
        data: { role },
      });
    } catch (e) {
      // Carrera doble-submit: la unique ya la ganó otro request.
      if (
        !(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        )
      ) {
        throw e;
      }
    }
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

  // Magic token consumible (spec api-hardening/auth): el insert con
  // @@unique(tokenHash) ES el claim atómico - dos verifies concurrentes
  // del mismo link serializan en la constraint y el perdedor recibe
  // P2002 → false (ya consumido). El service decide el grace por sesión.
  async consumeMagicToken(data: { tokenHash: string; email: string }) {
    try {
      await this.prisma.magicTokenUse.create({ data });
      return true;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return false;
      }
      throw e;
    }
  }

  // ─── Sesiones persistidas (spec auth-sessions) ───

  async createAuthSession(data: {
    jti: string;
    personId: string;
    userAgent?: string;
    ip?: string;
  }) {
    await this.prisma.authSession.create({ data });
  }

  findAuthSessionByJti(jti: string) {
    return this.prisma.authSession.findUnique({
      where: { jti },
      select: { id: true, revokedAt: true, lastSeenAt: true },
    });
  }

  async touchAuthSession(jti: string) {
    // updateMany tolera fila inexistente (la sesión pudo ser revocada y
    // borrada entre el check del guard y este write - no es error).
    await this.prisma.authSession.updateMany({
      where: { jti, revokedAt: null },
      data: { lastSeenAt: new Date() },
    });
  }

  listAuthSessions(personId: string) {
    return this.prisma.authSession.findMany({
      where: { personId },
      orderBy: { lastSeenAt: "desc" },
      take: 100,
    });
  }

  async revokeAuthSession(id: string, personId?: string) {
    const res = await this.prisma.authSession.updateMany({
      where: {
        id,
        revokedAt: null,
        ...(personId ? { personId } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }

  async revokeOtherAuthSessions(personId: string, exceptJti?: string) {
    const res = await this.prisma.authSession.updateMany({
      where: {
        personId,
        revokedAt: null,
        ...(exceptJti ? { jti: { not: exceptJti } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }

  async revokeAllAuthSessions(personId: string) {
    const res = await this.prisma.authSession.updateMany({
      where: { personId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }
}

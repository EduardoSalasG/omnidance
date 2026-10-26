import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request } from "express";
import { CONSENT_VERSION } from "@omnidance/shared";
import type { PrismaService } from "../prisma.service";
import "../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver events.controller.spec)
import {
  ChangePasswordDto,
  PeopleController,
  UpdateMeDto,
} from "./people.controller";
import { ConsentService } from "../legal/consent.service";
import type { NotificationsService } from "../notifications/domain/notifications.service";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

// PeopleController - PATCH /me (gender), GET /me (expone gender) y
// GET /me/pending-surveys (ventana post-evento + fan-out lazy único
// por evento vía claim atómico de surveyNotifiedAt).

interface FakePerson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phoneCountryCode: string | null;
  photoUrl: string | null;
  instagram: string | null;
  gender: string | null;
  birthDate: Date | null;
  createdAt: Date;
  verifiedAt: Date | null;
  isDemoAccount: boolean;
  pendingProfileAt: Date | null;
  onboarding: unknown;
  proTier: string;
  proTrialEndsAt: Date | null;
  consentVersion: string | null;
  consentAcceptedAt: Date | null;
  jurisdiction: string | null;
  passwordHash: string | null;
  roles: { role: string; status: string }[];
  styleRoles: {
    role: string;
    level: string | null;
    style: { id: string; name: string; genre: string };
  }[];
}

interface FakeCheckin {
  eventId: string;
  personId: string;
  voidedAt: Date | null;
}

interface FakeEvent {
  id: string;
  name: string;
  endsAt: Date;
  surveyNotifiedAt: Date | null;
  producerId?: string;
}

interface FakeRating {
  eventId: string;
  raterId: string;
}

class FakePrisma {
  people = new Map<string, FakePerson>();
  checkins: FakeCheckin[] = [];
  events: FakeEvent[] = [];
  ratings: FakeRating[] = [];
  personUpdates: Record<string, unknown>[] = [];
  academies: { ownerId: string }[] = [];
  personRoles: { personId: string; role: string; status: string }[] = [];

  person = {
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const p = this.people.get(where.id);
      if (!p) throw new Error("not found");
      return p;
    },
    findUnique: async ({
      where,
    }: {
      where: { id?: string; phone?: string };
    }) => {
      if (where.id) return this.people.get(where.id) ?? null;
      if (where.phone) {
        return (
          [...this.people.values()].find((p) => p.phone === where.phone) ??
          null
        );
      }
      return null;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      this.personUpdates.push(data);
      const p = this.people.get(where.id)!;
      Object.assign(p, data);
      return p;
    },
  };

  enrollment = {
    findMany: async () => [],
  };

  personRole = {
    findMany: async ({
      where,
    }: {
      where: { personId: string; role: { in: string[] }; status: string };
    }) =>
      this.personRoles
        .filter(
          (r) =>
            r.personId === where.personId &&
            where.role.in.includes(r.role) &&
            r.status === where.status,
        )
        .map((r) => ({ role: r.role })),
  };

  academy = {
    count: async ({ where }: { where: { ownerId: string } }) =>
      this.academies.filter((a) => a.ownerId === where.ownerId).length,
  };

  checkin = {
    findMany: async ({
      where,
      distinct,
    }: {
      where: { personId?: string; eventId?: string; voidedAt?: null };
      distinct?: string[];
    }) => {
      let rows = this.checkins.filter(
        (c) =>
          (where.personId === undefined || c.personId === where.personId) &&
          (where.eventId === undefined || c.eventId === where.eventId) &&
          (where.voidedAt === null ? c.voidedAt === null : true),
      );
      if (distinct?.includes("personId")) {
        const seen = new Set<string>();
        rows = rows.filter(
          (r) => !seen.has(r.personId) && seen.add(r.personId),
        );
      }
      return rows;
    },
  };

  event = {
    count: async ({ where }: { where: { producerId: string } }) =>
      this.events.filter((e) => e.producerId === where.producerId).length,
    findMany: async ({
      where,
      orderBy,
    }: {
      where: { id: { in: string[] }; endsAt: { lt: Date; gte: Date } };
      orderBy?: { endsAt: "desc" };
    }) => {
      const rows = this.events.filter(
        (e) =>
          where.id.in.includes(e.id) &&
          e.endsAt < where.endsAt.lt &&
          e.endsAt >= where.endsAt.gte,
      );
      if (orderBy?.endsAt === "desc") {
        rows.sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
      }
      return rows;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; surveyNotifiedAt: null };
      data: { surveyNotifiedAt: Date };
    }) => {
      // Claim atómico: solo gana si el flag sigue en null.
      const e = this.events.find((x) => x.id === where.id);
      if (!e || e.surveyNotifiedAt !== null) return { count: 0 };
      Object.assign(e, data);
      return { count: 1 };
    },
  };

  eventRating = {
    findMany: async ({
      where,
    }: {
      where: { raterId: string; eventId: { in: string[] } };
    }) =>
      this.ratings.filter(
        (r) =>
          r.raterId === where.raterId && where.eventId.in.includes(r.eventId),
      ),
  };

  // spec consent-por-jurisdiccion: catálogo LegalText + records auditables.
  legalTexts: {
    jurisdiction: string;
    version: string;
    body: string;
    requiredScopes: string[];
    granular: boolean;
    active: boolean;
    publishedAt: Date;
  }[] = [];
  consentRecords: {
    personId: string;
    jurisdiction: string;
    version: string;
    scopes: unknown;
  }[] = [];

  legalText = {
    findFirst: async ({
      where,
    }: {
      where: { jurisdiction: string; active: boolean };
    }) =>
      this.legalTexts
        .filter(
          (t) =>
            t.jurisdiction === where.jurisdiction && t.active === where.active,
        )
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[0] ??
      null,
  };

  consentRecord = {
    create: async ({
      data,
    }: {
      data: {
        personId: string;
        jurisdiction: string;
        version: string;
        scopes: unknown;
      };
    }) => {
      this.consentRecords.push(data);
      return data;
    },
  };

  // POST /me/complete-profile marca los leads ligados como CONVERTED.
  lead = {
    updateMany: async () => ({ count: 0 }),
  };

  $transaction = async (ops: Promise<unknown>[]) => Promise.all(ops);
}

const mkPerson = (id: string, gender: string | null = null): FakePerson => ({
  id,
  name: `Persona ${id}`,
  email: null,
  phone: null,
  phoneCountryCode: null,
  photoUrl: null,
  instagram: null,
  gender,
  birthDate: null,
  createdAt: new Date("2026-01-01"),
  verifiedAt: null,
  isDemoAccount: false,
  pendingProfileAt: null,
  onboarding: {},
  proTier: "FREE",
  proTrialEndsAt: null,
  consentVersion: null,
  consentAcceptedAt: null,
  jurisdiction: null,
  passwordHash: null,
  roles: [],
  styleRoles: [],
});

const reqAs = (personId: string) =>
  ({ person: { id: personId, roles: [] } }) as unknown as Request;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);

describe("PeopleController", () => {
  let prisma: FakePrisma;
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let ctrl: PeopleController;

  beforeEach(() => {
    prisma = new FakePrisma();
    notifications = { notifySafe: vi.fn(async () => {}) };
    ctrl = new PeopleController(
      prisma as unknown as PrismaService,
      // Fake auth con formato determinista hashed:<pw> - permite
      // ejercer verifyPassword de verdad en PUT /me/password.
      {
        hashPassword: async (pw: string) => `hashed:${pw}`,
        verifyPassword: async (pw: string, stored: string) =>
          stored === `hashed:${pw}`,
      } as never,
      notifications as unknown as NotificationsService,
      {
        // FakeStorage: save devuelve key con folder como el real.
        save: async (_f: unknown, folder: string) => `${folder}/uuid-x.jpg`,
        read: async () => Buffer.from("img"),
      } as never,
      // ConsentService real sobre el mismo FakePrisma - ejerce
      // LegalText + ConsentRecord de verdad.
      new ConsentService(prisma as unknown as PrismaService),
    );
    prisma.people.set("me", mkPerson("me"));
  });

  describe("POST /me/photo", () => {
    const multerFile = {
      originalname: "f.jpg",
      mimetype: "image/jpeg",
      buffer: Buffer.from("x"),
      size: 1,
    };

    // Bug prod: photoUrl quedaba /api/people/photos/people-photos/<id>.jpg
    // (folder duplicado) → la URL no matcheaba la ruta y la foto se veía
    // rota. La URL pública va solo con el filename.
    it("guarda photoUrl sin el folder duplicado", async () => {
      const res = await ctrl.uploadMyPhoto(multerFile as never, reqAs("me"));
      expect(res.photoUrl).toBe("/api/people/photos/uuid-x.jpg");
      expect(prisma.people.get("me")!.photoUrl).toBe(
        "/api/people/photos/uuid-x.jpg",
      );
    });

    it("sirve por filename y por la URL legacy con folder duplicado", async () => {
      const res = { setHeader: vi.fn(), send: vi.fn() };
      await ctrl.servePersonPhoto("uuid-x.jpg", res as never);
      await ctrl.servePersonPhotoCompat("uuid-x.jpg", res as never);
      expect(res.send).toHaveBeenCalledTimes(2);
    });
  });

  describe("PATCH /me gender", () => {
    it("persiste el género autodeclarado", async () => {
      await ctrl.updateMe(reqAs("me"), { gender: "F" });
      expect(prisma.personUpdates.at(-1)).toEqual({ gender: "F" });
      expect(prisma.people.get("me")!.gender).toBe("F");
    });

    it("null limpia el género (prefiere no declarar)", async () => {
      prisma.people.get("me")!.gender = "M";
      await ctrl.updateMe(reqAs("me"), { gender: null });
      expect(prisma.personUpdates.at(-1)).toEqual({ gender: null });
      expect(prisma.people.get("me")!.gender).toBeNull();
    });

    it("no toca gender si el campo no viene", async () => {
      prisma.people.get("me")!.gender = "M";
      await ctrl.updateMe(reqAs("me"), { name: "Nuevo Nombre" });
      expect(prisma.personUpdates.at(-1)).toEqual({ name: "Nuevo Nombre" });
      expect(prisma.people.get("me")!.gender).toBe("M");
    });

    it("valor fuera del enum → error de validación (400 en el pipe)", async () => {
      const errors = await validate(
        plainToInstance(UpdateMeDto, { gender: "X" }),
      );
      expect(errors.some((e) => e.property === "gender")).toBe(true);
    });
  });

  describe("PATCH /me birthDate", () => {
    it("persiste fecha válida en el pasado", async () => {
      await ctrl.updateMe(reqAs("me"), { birthDate: "1994-03-15" });
      expect(prisma.personUpdates.at(-1)).toEqual({
        birthDate: new Date("1994-03-15"),
      });
    });

    it.each([null, "", "  "])("limpiar con %j → null", async (v) => {
      prisma.people.get("me")!.birthDate = new Date("1994-03-15");
      await ctrl.updateMe(reqAs("me"), { birthDate: v });
      expect(prisma.personUpdates.at(-1)).toEqual({ birthDate: null });
    });

    it.each([
      "no-es-fecha",
      "2999-01-01", // futura
      "1800-01-01", // año < 1900
    ])("fecha inválida %j → 400 sin mutar", async (v) => {
      await expect(
        ctrl.updateMe(reqAs("me"), { birthDate: v }),
      ).rejects.toThrow("birthDate inválida");
      expect(prisma.personUpdates).toHaveLength(0);
    });

    it("no toca birthDate si el campo no viene", async () => {
      const prev = new Date("1994-03-15");
      prisma.people.get("me")!.birthDate = prev;
      await ctrl.updateMe(reqAs("me"), { name: "Otro Nombre" });
      expect(prisma.personUpdates.at(-1)).toEqual({ name: "Otro Nombre" });
      expect(prisma.people.get("me")!.birthDate).toEqual(prev);
    });
  });

  describe("PATCH /me phone", () => {
    it("teléfono de otra cuenta → ConflictException phone_exists", async () => {
      prisma.people.set("otra", {
        ...mkPerson("otra"),
        phone: "+56911111111",
      });
      await expect(
        ctrl.updateMe(reqAs("me"), { phone: "+56 9 1111 1111" }),
      ).rejects.toThrow("phone_exists");
      expect(prisma.personUpdates).toHaveLength(0);
    });

    // Spec multipais-phone: el 409 también salta cuando la otra cuenta
    // guardó el E.164 y esta manda el formato nacional equivalente.
    it("mismo E.164 en formato nacional → phone_exists igual", async () => {
      prisma.people.set("otra", {
        ...mkPerson("otra"),
        phone: "+56911111111",
      });
      await expect(
        ctrl.updateMe(reqAs("me"), {
          phone: "9 1111 1111",
          phoneCountryCode: "CL",
        }),
      ).rejects.toThrow("phone_exists");
      expect(prisma.personUpdates).toHaveLength(0);
    });

    it("su propio teléfono ya registrado → guarda sin conflicto", async () => {
      prisma.people.get("me")!.phone = "+56911111111";
      await ctrl.updateMe(reqAs("me"), { phone: "+56 9 1111-1111" });
      expect(prisma.personUpdates.at(-1)).toEqual({
        phone: "+56911111111",
        phoneCountryCode: "CL",
      });
    });

    it("teléfono libre → normaliza a E.164 y persiste país derivado", async () => {
      await ctrl.updateMe(reqAs("me"), { phone: "+56 9 8765 4321" });
      expect(prisma.personUpdates.at(-1)).toEqual({
        phone: "+56987654321",
        phoneCountryCode: "CL",
      });
    });

    it("nacional con phoneCountryCode hint → E.164 del país declarado", async () => {
      await ctrl.updateMe(reqAs("me"), {
        phone: "11 5555 1234",
        phoneCountryCode: "AR",
      });
      expect(prisma.personUpdates.at(-1)).toEqual({
        phone: "+541155551234",
        phoneCountryCode: "AR",
      });
    });

    it("'+' inicial ignora el hint y deriva el país del número", async () => {
      await ctrl.updateMe(reqAs("me"), {
        phone: "+34 612 345 678",
        phoneCountryCode: "CL",
      });
      expect(prisma.personUpdates.at(-1)).toEqual({
        phone: "+34612345678",
        phoneCountryCode: "ES",
      });
    });

    it("teléfono inválido → 400 teléfono inválido sin mutar", async () => {
      await expect(
        ctrl.updateMe(reqAs("me"), { phone: "123" }),
      ).rejects.toThrow("teléfono inválido");
      expect(prisma.personUpdates).toHaveLength(0);
    });

    it("limpiar teléfono también limpia el código de país", async () => {
      const me = prisma.people.get("me")!;
      me.phone = "+56912345678";
      me.phoneCountryCode = "CL";
      await ctrl.updateMe(reqAs("me"), { phone: "" });
      expect(prisma.personUpdates.at(-1)).toEqual({
        phone: null,
        phoneCountryCode: null,
      });
      expect(me.phoneCountryCode).toBeNull();
    });
  });

  // Spec multipais-phone: POST /me/complete-profile normaliza igual que
  // PATCH /me (E.164 + país derivado, 409 sobre el E.164).
  describe("POST /me/complete-profile phone", () => {
    beforeEach(() => {
      // El endpoint exige cuenta pendiente (lead convertido o demo).
      prisma.people.get("me")!.pendingProfileAt = new Date();
    });

    it("normaliza nacional a E.164 + persiste el país derivado", async () => {
      await ctrl.completeProfile(reqAs("me"), {
        name: "Nombre Real",
        phone: "9 1234 5678",
        phoneCountryCode: "CL",
      });
      const last = prisma.personUpdates.at(-1)!;
      expect(last.phone).toBe("+56912345678");
      expect(last.phoneCountryCode).toBe("CL");
      expect(last.pendingProfileAt).toBeNull();
      expect(last.isDemoAccount).toBe(false);
    });

    it("'+' en el número ignora el hint → país derivado del número", async () => {
      await ctrl.completeProfile(reqAs("me"), {
        name: "Nombre Real",
        phone: "+34612345678",
        phoneCountryCode: "CL",
      });
      expect(prisma.personUpdates.at(-1)).toMatchObject({
        phone: "+34612345678",
        phoneCountryCode: "ES",
      });
    });

    it("teléfono inválido → 400 teléfono inválido", async () => {
      await expect(
        ctrl.completeProfile(reqAs("me"), { name: "Nombre Real", phone: "abc" }),
      ).rejects.toThrow("teléfono inválido");
      expect(prisma.personUpdates).toHaveLength(0);
    });

    it("E.164 de otra cuenta → ConflictException phone_exists", async () => {
      prisma.people.set("otra", {
        ...mkPerson("otra"),
        phone: "+56911111111",
      });
      await expect(
        ctrl.completeProfile(reqAs("me"), {
          name: "Nombre Real",
          phone: "911111111",
        }),
      ).rejects.toThrow("phone_exists");
      expect(prisma.personUpdates).toHaveLength(0);
    });
  });

  describe("GET /me", () => {
    it("expone gender junto a styleRoles", async () => {
      prisma.people.get("me")!.gender = "OTHER";
      const res = await ctrl.me(reqAs("me"));
      expect(res.gender).toBe("OTHER");
      expect(res.styleRoles).toEqual([]);
    });

    // Spec multipais-phone: el front pre-carga el selector de país con
    // el ISO-2 persistido.
    it("expone phoneCountryCode junto al phone E.164", async () => {
      const me = prisma.people.get("me")!;
      me.phone = "+34612345678";
      me.phoneCountryCode = "ES";
      const res = await ctrl.me(reqAs("me"));
      expect(res.phone).toBe("+34612345678");
      expect(res.phoneCountryCode).toBe("ES");
    });

    // Estado Producer Pro (S5): solo personas con rol PRODUCER APPROVED
    // reciben proTier/proTrialEndsAt/effectivePro - el front gatea el
    // paywall sin llamada extra.
    it("persona sin rol PRODUCER → no expone campos Pro", async () => {
      const res = await ctrl.me(reqAs("me"));
      expect("effectivePro" in res).toBe(false);
      expect("proTier" in res).toBe(false);
      expect("proTrialEndsAt" in res).toBe(false);
    });

    it("PRODUCER FREE sin trial → effectivePro false", async () => {
      const me = prisma.people.get("me")!;
      me.roles = [{ role: "PRODUCER", status: "APPROVED" }];
      const res = await ctrl.me(reqAs("me"));
      expect(res).toMatchObject({
        proTier: "FREE",
        proTrialEndsAt: null,
        effectivePro: false,
      });
    });

    it("PRODUCER con trial vigente o tier pago → effectivePro true", async () => {
      const me = prisma.people.get("me")!;
      me.roles = [{ role: "PRODUCER", status: "APPROVED" }];
      me.proTrialEndsAt = new Date(Date.now() + 90 * 24 * 3600 * 1000);
      expect((await ctrl.me(reqAs("me"))).effectivePro).toBe(true);

      me.proTier = "PRO_STARTER";
      me.proTrialEndsAt = null;
      expect((await ctrl.me(reqAs("me"))).effectivePro).toBe(true);
    });

    it("rol PRODUCER no aprobado (PENDING) → sin campos Pro", async () => {
      prisma.people.get("me")!.roles = [
        { role: "PRODUCER", status: "PENDING" },
      ];
      const res = await ctrl.me(reqAs("me"));
      expect("effectivePro" in res).toBe(false);
    });

    // Spec legal-consent: GET /me expone el consentimiento para que el
    // front decida el banner de re-aceptación.
    it("expone consentVersion/consentAcceptedAt", async () => {
      const res = await ctrl.me(reqAs("me"));
      expect(res.consentVersion).toBeNull();
      expect(res.consentAcceptedAt).toBeNull();
    });

    // Spec consent-por-jurisdiccion: el banner consulta el texto por
    // la jurisdiction persistida.
    it("expone jurisdiction", async () => {
      prisma.people.get("me")!.jurisdiction = "EU";
      const res = await ctrl.me(reqAs("me"));
      expect(res.jurisdiction).toBe("EU");
    });

    // Spec cambiar-password: el front decide el form (pedir actual vs
    // establecer) según el flag - el hash nunca sale en el payload.
    it("expone hasPassword sin filtrar el hash", async () => {
      expect((await ctrl.me(reqAs("me"))).hasPassword).toBe(false);
      prisma.people.get("me")!.passwordHash = "hashed:vieja-123";
      const res = await ctrl.me(reqAs("me"));
      expect(res.hasPassword).toBe(true);
      expect("passwordHash" in res).toBe(false);
    });
  });

  // spec cambiar-password - PUT /me/password: con hash previo exige la
  // actual verificada; magic-link-only establece la primera sin actual.
  describe("PUT /me/password", () => {
    it("con hash existente y actual correcta → reemplaza el hash", async () => {
      prisma.people.get("me")!.passwordHash = "hashed:vieja-123";
      const res = await ctrl.changePassword(reqAs("me"), {
        currentPassword: "vieja-123",
        newPassword: "nueva-clave-456",
      });
      expect(res).toEqual({ ok: true });
      expect(prisma.people.get("me")!.passwordHash).toBe(
        "hashed:nueva-clave-456",
      );
    });

    it.each([{ currentPassword: "mala-000" }, {}])(
      "actual incorrecta o ausente → 400 password.incorrect sin mutar",
      async (dto) => {
        prisma.people.get("me")!.passwordHash = "hashed:vieja-123";
        await expect(
          ctrl.changePassword(reqAs("me"), {
            newPassword: "nueva-clave-456",
            ...dto,
          }),
        ).rejects.toThrow("password.incorrect");
        expect(prisma.people.get("me")!.passwordHash).toBe("hashed:vieja-123");
      },
    );

    it("newPassword igual a la actual → 400 password.same", async () => {
      prisma.people.get("me")!.passwordHash = "hashed:vieja-123";
      await expect(
        ctrl.changePassword(reqAs("me"), {
          currentPassword: "vieja-123",
          newPassword: "vieja-123",
        }),
      ).rejects.toThrow("password.same");
      expect(prisma.people.get("me")!.passwordHash).toBe("hashed:vieja-123");
    });

    it("sin hash (magic-link-only) → establece la primera sin actual", async () => {
      const res = await ctrl.changePassword(reqAs("me"), {
        newPassword: "primera-clave-1",
      });
      expect(res).toEqual({ ok: true });
      expect(prisma.people.get("me")!.passwordHash).toBe(
        "hashed:primera-clave-1",
      );
    });

    it("newPassword <8 → error de validación (400 en el pipe)", async () => {
      const errors = await validate(
        plainToInstance(ChangePasswordDto, { newPassword: "corta" }),
      );
      expect(errors.some((e) => e.property === "newPassword")).toBe(true);
    });
  });

  // spec rbac - checklist visible al actor: misma evaluación que la
  // cola admin, expuesta al dueño de la cuenta.
  describe("GET /me/role-checks", () => {
    it("sin roles PENDING de validación → []", async () => {
      expect(await ctrl.roleChecks(reqAs("me"))).toEqual([]);
      // Un DANCER APPROVED tampoco genera checklist.
      prisma.personRoles.push({
        personId: "me",
        role: "DANCER",
        status: "APPROVED",
      });
      expect(await ctrl.roleChecks(reqAs("me"))).toEqual([]);
    });

    it("ACADEMY_OWNER PENDING devuelve el checklist con lo faltante", async () => {
      prisma.personRoles.push({
        personId: "me",
        role: "ACADEMY_OWNER",
        status: "PENDING",
      });
      const [row] = await ctrl.roleChecks(reqAs("me"));
      expect(row.role).toBe("ACADEMY_OWNER");
      // mkPerson: name real, sin email verificado, sin phone, sin academia.
      expect(row.checks).toEqual({
        name: true,
        emailVerified: false,
        phone: false,
        actorData: false,
      });
      expect(row.complete).toBe(false);

      // Completando datos el checklist pasa.
      const me = prisma.people.get("me")!;
      me.verifiedAt = new Date();
      me.phone = "+56911111111";
      prisma.academies.push({ ownerId: "me" });
      const [done] = await ctrl.roleChecks(reqAs("me"));
      expect(done.checks.actorData).toBe(true);
      expect(done.complete).toBe(true);
    });

    it("PRODUCER PENDING evalúa actorData por eventos, no academias", async () => {
      prisma.personRoles.push(
        { personId: "me", role: "PRODUCER", status: "PENDING" },
        { personId: "me", role: "ACADEMY_OWNER", status: "APPROVED" },
      );
      prisma.events.push({
        id: "ev-1",
        name: "Social",
        endsAt: new Date(),
        surveyNotifiedAt: null,
        producerId: "me",
      });
      const rows = await ctrl.roleChecks(reqAs("me"));
      // Solo roles PENDING entran a la lista.
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe("PRODUCER");
      expect(rows[0].checks.actorData).toBe(true);
    });

    it("nombre = prefijo del email no cuenta como nombre real", async () => {
      const me = prisma.people.get("me")!;
      me.email = "baila@omnidance.dev";
      me.name = "baila"; // default del alta por magic link
      prisma.personRoles.push({
        personId: "me",
        role: "ACADEMY_OWNER",
        status: "PENDING",
      });
      const [row] = await ctrl.roleChecks(reqAs("me"));
      expect(row.checks.name).toBe(false);
    });
  });

  describe("PATCH /me jurisdiction", () => {
    // Spec consent-por-jurisdiccion: la jurisdicción es editable en el
    // perfil del usuario.
    it("persiste la jurisdicción declarada", async () => {
      await ctrl.updateMe(reqAs("me"), { jurisdiction: "EU" });
      expect(prisma.personUpdates.at(-1)).toEqual({ jurisdiction: "EU" });
      expect(prisma.people.get("me")!.jurisdiction).toBe("EU");
    });

    it("valor fuera del set → error de validación (400 en el pipe)", async () => {
      const errors = await validate(
        plainToInstance(UpdateMeDto, { jurisdiction: "US" }),
      );
      expect(errors.some((e) => e.property === "jurisdiction")).toBe(true);
    });
  });

  describe("POST /me/consent", () => {
    it("estampa la versión vigente y el timestamp + escribe ConsentRecord", async () => {
      // Sin LegalText sembrado → baseline legacy (CONSENT_VERSION).
      const res = await ctrl.consent(reqAs("me"), { version: "0.0-vieja" });
      const me = prisma.people.get("me")!;
      // Siempre la versión del servidor - nunca la que envía el cliente.
      expect(me.consentVersion).toBe(CONSENT_VERSION);
      expect(me.consentAcceptedAt).toBeInstanceOf(Date);
      expect(res).toMatchObject({
        ok: true,
        consentVersion: CONSENT_VERSION,
      });
      // spec consent-por-jurisdiccion: registro auditable por aceptación.
      expect(prisma.consentRecords).toHaveLength(1);
      expect(prisma.consentRecords[0]).toMatchObject({
        personId: "me",
        jurisdiction: "CL",
        version: CONSENT_VERSION,
        scopes: { essential: true },
      });
    });

    it("con LegalText vigente estampa su versión y scopes de la jurisdicción", async () => {
      prisma.legalTexts.push({
        jurisdiction: "EU",
        version: "eu-v1.0",
        body: "x",
        requiredScopes: ["essential", "marketing", "analytics"],
        granular: true,
        active: true,
        publishedAt: new Date(),
      });
      prisma.people.get("me")!.jurisdiction = "EU";
      const res = await ctrl.consent(reqAs("me"), {
        version: "eu-v1.0",
        scopes: { essential: true, marketing: true },
      });
      expect(res.consentVersion).toBe("eu-v1.0");
      expect(prisma.consentRecords[0]).toMatchObject({
        jurisdiction: "EU",
        version: "eu-v1.0",
        scopes: { essential: true, marketing: true, analytics: false },
      });
    });
  });

  describe("GET /me/pending-surveys", () => {
    it("evento elegible: devuelve la entrada y fan-out a todos los asistentes una vez", async () => {
      prisma.events.push({
        id: "ev-1",
        name: "La Gozadera",
        endsAt: hoursAgo(2),
        surveyNotifiedAt: null,
      });
      prisma.checkins.push(
        { eventId: "ev-1", personId: "me", voidedAt: null },
        { eventId: "ev-1", personId: "otro", voidedAt: null },
        { eventId: "ev-1", personId: "otro", voidedAt: null }, // 2do check-in
        { eventId: "ev-1", personId: "anulado", voidedAt: new Date() },
      );

      const res = await ctrl.pendingSurveys(reqAs("me"));
      expect(res).toEqual([
        {
          eventId: "ev-1",
          name: "La Gozadera",
          endsAt: prisma.events[0].endsAt,
        },
      ]);
      // Fan-out: me + otro (distinct, sin voided) → 2 notificaciones.
      expect(notifications.notifySafe).toHaveBeenCalledTimes(2);
      expect(notifications.notifySafe).toHaveBeenCalledWith(
        "otro",
        expect.objectContaining({
          category: "SOCIAL",
          type: "event.survey",
          data: { eventId: "ev-1" },
        }),
      );
      expect(prisma.events[0].surveyNotifiedAt).not.toBeNull();
    });

    it("trigger idempotente: 2 requests → 1 fan-out por evento", async () => {
      prisma.events.push({
        id: "ev-1",
        name: "La Gozadera",
        endsAt: hoursAgo(2),
        surveyNotifiedAt: null,
      });
      prisma.checkins.push(
        { eventId: "ev-1", personId: "me", voidedAt: null },
        { eventId: "ev-1", personId: "otro", voidedAt: null },
      );

      await ctrl.pendingSurveys(reqAs("me"));
      await ctrl.pendingSurveys(reqAs("otro"));
      expect(notifications.notifySafe).toHaveBeenCalledTimes(2);
    });

    it("fuera de ventana (terminó hace 30h) y en curso → []", async () => {
      prisma.events.push(
        {
          id: "ev-old",
          name: "Viejo",
          endsAt: hoursAgo(30),
          surveyNotifiedAt: null,
        },
        {
          id: "ev-live",
          name: "En curso",
          endsAt: hoursAgo(-1),
          surveyNotifiedAt: null,
        },
      );
      prisma.checkins.push(
        { eventId: "ev-old", personId: "me", voidedAt: null },
        { eventId: "ev-live", personId: "me", voidedAt: null },
      );

      expect(await ctrl.pendingSurveys(reqAs("me"))).toEqual([]);
      expect(notifications.notifySafe).not.toHaveBeenCalled();
    });

    it("ya evaluado por el viewer → no sale en pending pero el fan-out igual corre (por los demás asistentes)", async () => {
      prisma.events.push({
        id: "ev-1",
        name: "La Gozadera",
        endsAt: hoursAgo(2),
        surveyNotifiedAt: null,
      });
      prisma.checkins.push({ eventId: "ev-1", personId: "me", voidedAt: null });
      prisma.ratings.push({ eventId: "ev-1", raterId: "me" });

      expect(await ctrl.pendingSurveys(reqAs("me"))).toEqual([]);
      // el claim sí ocurre - otro asistente podría no haber abierto la app;
      // aquí "me" es el único asistente, así que se le notifica (recordatorio)
      expect(notifications.notifySafe).toHaveBeenCalledTimes(1);
    });

    it("check-in anulado → []", async () => {
      prisma.events.push({
        id: "ev-1",
        name: "La Gozadera",
        endsAt: hoursAgo(2),
        surveyNotifiedAt: null,
      });
      prisma.checkins.push({
        eventId: "ev-1",
        personId: "me",
        voidedAt: new Date(),
      });

      expect(await ctrl.pendingSurveys(reqAs("me"))).toEqual([]);
    });

    it("ordena más reciente primero", async () => {
      prisma.events.push(
        {
          id: "ev-1",
          name: "Antigua",
          endsAt: hoursAgo(20),
          surveyNotifiedAt: new Date(),
        },
        {
          id: "ev-2",
          name: "Reciente",
          endsAt: hoursAgo(3),
          surveyNotifiedAt: new Date(),
        },
      );
      prisma.checkins.push(
        { eventId: "ev-1", personId: "me", voidedAt: null },
        { eventId: "ev-2", personId: "me", voidedAt: null },
      );

      const res = await ctrl.pendingSurveys(reqAs("me"));
      expect(res.map((e) => e.eventId)).toEqual(["ev-2", "ev-1"]);
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request } from "express";
import { CONSENT_VERSION } from "@omnidance/shared";
import type { PrismaService } from "../prisma.service";
import "../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver events.controller.spec)
import { PeopleController, UpdateMeDto } from "./people.controller";
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
}

const mkPerson = (id: string, gender: string | null = null): FakePerson => ({
  id,
  name: `Persona ${id}`,
  email: null,
  phone: null,
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
      { hashPassword: async () => "hash" } as never,
      notifications as unknown as NotificationsService,
    );
    prisma.people.set("me", mkPerson("me"));
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

    it("su propio teléfono ya registrado → guarda sin conflicto", async () => {
      prisma.people.get("me")!.phone = "+56911111111";
      await ctrl.updateMe(reqAs("me"), { phone: "+56 9 1111-1111" });
      expect(prisma.personUpdates.at(-1)).toEqual({ phone: "+56911111111" });
    });

    it("teléfono libre → normaliza y persiste", async () => {
      await ctrl.updateMe(reqAs("me"), { phone: "+56 9 8765 4321" });
      expect(prisma.personUpdates.at(-1)).toEqual({ phone: "+56987654321" });
    });
  });

  describe("GET /me", () => {
    it("expone gender junto a styleRoles", async () => {
      prisma.people.get("me")!.gender = "OTHER";
      const res = await ctrl.me(reqAs("me"));
      expect(res.gender).toBe("OTHER");
      expect(res.styleRoles).toEqual([]);
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
  });

  describe("POST /me/consent", () => {
    it("estampa la versión vigente y el timestamp", async () => {
      const res = await ctrl.consent(reqAs("me"), { version: "0.0-vieja" });
      const me = prisma.people.get("me")!;
      // Siempre la versión del servidor - nunca la que envía el cliente.
      expect(me.consentVersion).toBe(CONSENT_VERSION);
      expect(me.consentAcceptedAt).toBeInstanceOf(Date);
      expect(res).toMatchObject({
        ok: true,
        consentVersion: CONSENT_VERSION,
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

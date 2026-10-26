import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { PrismaService } from "../prisma.service";
import "../auth/infrastructure/auth.controller"; // setSessionCookie + ciclo auth
import { LeadsController } from "./leads.controller";
import type { NotificationsService } from "../notifications/domain/notifications.service";

// LeadsController - POST /leads (spec multipais-phone): el teléfono se
// normaliza a E.164 en captura (hint phoneCountryCode, "+" overridea) y
// el país derivado se hereda a la Person en /leads/:id/demo.

interface FakePerson {
  id: string;
  email: string | null;
  phone: string | null;
  phoneCountryCode: string | null;
}

interface FakeLead {
  id: string;
  email: string;
  phone: string | null;
  roles: string[];
  intent: string;
  personId: string | null;
  demoToken: string | null;
  status: string;
  name: string;
}

class FakePrisma {
  people: FakePerson[] = [];
  leads: FakeLead[] = [];
  upserts: { create: Record<string, unknown>; update: Record<string, unknown> }[] =
    [];
  personCreates: Record<string, unknown>[] = [];
  seq = 0;

  person = {
    findUnique: async ({ where }: { where: { email?: string; phone?: string; id?: string } }) => {
      if (where.email) {
        return this.people.find((p) => p.email === where.email) ?? null;
      }
      if (where.phone) {
        return this.people.find((p) => p.phone === where.phone) ?? null;
      }
      if (where.id) return this.people.find((p) => p.id === where.id) ?? null;
      return null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.personCreates.push(data);
      const p: FakePerson = {
        id: `per-${++this.seq}`,
        email: (data.email as string) ?? null,
        phone: (data.phone as string) ?? null,
        phoneCountryCode: (data.phoneCountryCode as string) ?? null,
      };
      this.people.push(p);
      return { id: p.id };
    },
  };

  lead = {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      if (where.email) {
        return this.leads.find((l) => l.email === where.email) ?? null;
      }
      if (where.id) return this.leads.find((l) => l.id === where.id) ?? null;
      return null;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { email: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      this.upserts.push({ create, update });
      const existing = this.leads.find((l) => l.email === where.email);
      const lead =
        existing ??
        ({
          ...(create as Record<string, unknown>),
          id: `lead-${++this.seq}`,
          personId: null,
          status: "NEW",
        } as unknown as FakeLead);
      if (!existing) this.leads.push(lead);
      else Object.assign(lead, update);
      return { id: lead.id, demoToken: lead.demoToken };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const lead = this.leads.find((l) => l.id === where.id)!;
      Object.assign(lead, data);
      return lead;
    },
  };

  personRole = {
    findMany: async () => [] as { personId: string }[],
  };

  role = {
    findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
      where.key.in.map((key) => ({ key })),
  };
}

const req = () => ({ ip: "10.0.0.1" }) as unknown as Request;

const res = () =>
  ({
    cookie: vi.fn(),
  }) as unknown as Response;

describe("LeadsController", () => {
  let prisma: FakePrisma;
  let ctrl: LeadsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new LeadsController(
      prisma as unknown as PrismaService,
      { notifySafe: vi.fn(async () => {}) } as unknown as NotificationsService,
      { issueSession: vi.fn(async () => ({ token: "t" })) } as never,
    );
  });

  const body = (over: Record<string, unknown> = {}) => ({
    name: "Pro Lead",
    email: "lead@correo.cl",
    roles: ["PRODUCER"],
    intent: "CONTACT",
    phone: "912345678",
    ...over,
  });

  it("normaliza el teléfono nacional a E.164 al capturar (default CL)", async () => {
    await ctrl.create(body(), req());
    expect(prisma.upserts.at(-1)!.create.phone).toBe("+56912345678");
    expect(prisma.upserts.at(-1)!.update.phone).toBe("+56912345678");
  });

  it("phoneCountryCode hint interpreta el nacional de otro país", async () => {
    await ctrl.create(
      body({ phone: "11 5555 1234", phoneCountryCode: "AR" }),
      req(),
    );
    expect(prisma.upserts.at(-1)!.create.phone).toBe("+541155551234");
  });

  it("'+' en el número ignora el hint → E.164 con su país", async () => {
    await ctrl.create(
      body({ phone: "+34 612 345 678", phoneCountryCode: "CL" }),
      req(),
    );
    expect(prisma.upserts.at(-1)!.create.phone).toBe("+34612345678");
  });

  it("teléfono inválido → 400 teléfono inválido sin crear lead", async () => {
    await expect(ctrl.create(body({ phone: "abc" }), req())).rejects.toThrow(
      "teléfono inválido",
    );
    expect(prisma.leads).toHaveLength(0);
  });

  it("la demo hereda el país derivado del E.164 a la Person", async () => {
    const res1 = await ctrl.create(
      body({ phone: "+34612345678" }),
      req(),
    );
    const lead = prisma.leads[0];
    // El demoToken generado viaja en la respuesta del POST /leads.
    await ctrl.demo(lead.id, { token: res1.demoToken }, req(), res());
    expect(prisma.personCreates.at(-1)).toMatchObject({
      phone: "+34612345678",
      phoneCountryCode: "ES",
    });
  });
});

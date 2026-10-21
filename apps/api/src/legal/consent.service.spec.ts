import { describe, it, expect, beforeEach } from "vitest";
import { CONSENT_VERSION } from "@omnidance/shared";
import type { PrismaService } from "../prisma.service";
import { ConsentService } from "./consent.service";
import { LegalController } from "./legal.controller";
import {
  EU_JURISDICTION_COUNTRIES,
  resolveJurisdiction,
} from "./jurisdiction";

// ConsentService + GET /legal/consent (spec consent-por-jurisdiccion):
// resolución de jurisdicción por país, texto vigente por jurisdicción
// con fallback CL, y ConsentRecord auditable por aceptación.

interface FakeLegalText {
  jurisdiction: string;
  version: string;
  body: string;
  requiredScopes: string[];
  granular: boolean;
  active: boolean;
  publishedAt: Date;
}

interface FakePerson {
  id: string;
  jurisdiction: string | null;
  consentVersion: string | null;
  consentAcceptedAt: Date | null;
}

interface FakeRecord {
  personId: string;
  jurisdiction: string;
  version: string;
  scopes: unknown;
}

class FakePrisma {
  people = new Map<string, FakePerson>();
  legalTexts: FakeLegalText[] = [];
  records: FakeRecord[] = [];

  person = {
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const p = this.people.get(where.id);
      if (!p) throw new Error("not found");
      return p;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const p = this.people.get(where.id)!;
      Object.assign(p, data);
      return p;
    },
  };

  legalText = {
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { jurisdiction: string; active: boolean };
      orderBy: { publishedAt: "desc" };
    }) => {
      const rows = this.legalTexts
        .filter(
          (t) =>
            t.jurisdiction === where.jurisdiction && t.active === where.active,
        )
        .sort(
          (a, b) =>
            b.publishedAt.getTime() - a.publishedAt.getTime() ||
            b.version.localeCompare(a.version),
        );
      void orderBy;
      return rows[0] ?? null;
    },
  };

  consentRecord = {
    create: async ({ data }: { data: FakeRecord }) => {
      this.records.push(data);
      return data;
    },
  };

  $transaction = async (ops: Promise<unknown>[]) => Promise.all(ops);
}

const mkText = (
  partial: Partial<FakeLegalText> & { jurisdiction: string; version: string },
): FakeLegalText => ({
  body: `cuerpo ${partial.version}`,
  requiredScopes: ["essential"],
  granular: false,
  active: true,
  publishedAt: new Date("2026-10-01"),
  ...partial,
});

const mkPerson = (id: string, jurisdiction: string | null): FakePerson => ({
  id,
  jurisdiction,
  consentVersion: null,
  consentAcceptedAt: null,
});

describe("resolveJurisdiction", () => {
  it("UE/EEE/GB → EU; resto y ausencia → CL", () => {
    for (const code of EU_JURISDICTION_COUNTRIES) {
      expect(resolveJurisdiction(code)).toBe("EU");
    }
    expect(resolveJurisdiction("es")).toBe("EU"); // case-insensitive
    expect(resolveJurisdiction("CL")).toBe("CL");
    expect(resolveJurisdiction("AR")).toBe("CL");
    expect(resolveJurisdiction("US")).toBe("CL");
    expect(resolveJurisdiction(null)).toBe("CL");
    expect(resolveJurisdiction(undefined)).toBe("CL");
    expect(resolveJurisdiction("")).toBe("CL");
    expect(resolveJurisdiction("  ")).toBe("CL");
  });
});

describe("GET /legal/consent (LegalController)", () => {
  let prisma: FakePrisma;
  let ctrl: LegalController;

  beforeEach(() => {
    prisma = new FakePrisma();
    const service = new ConsentService(prisma as unknown as PrismaService);
    ctrl = new LegalController(service);
    prisma.legalTexts.push(
      mkText({ jurisdiction: "CL", version: "cl-v1.0", body: "texto CL" }),
      mkText({
        jurisdiction: "EU",
        version: "eu-v1.0",
        body: "texto EU",
        granular: true,
        requiredScopes: ["essential", "marketing", "analytics"],
      }),
    );
  });

  it("country EU → texto EU granular con los tres scopes", async () => {
    const res = await ctrl.current({ country: "DE" });
    expect(res).toEqual({
      version: "eu-v1.0",
      body: "texto EU",
      requiredScopes: ["essential", "marketing", "analytics"],
      granular: true,
      jurisdiction: "EU",
    });
  });

  it("country no-EU y sin country → texto CL único scope", async () => {
    for (const query of [{ country: "CL" }, { country: "JP" }, {}]) {
      const res = await ctrl.current(query);
      expect(res.version).toBe("cl-v1.0");
      expect(res.granular).toBe(false);
      expect(res.requiredScopes).toEqual(["essential"]);
      expect(res.jurisdiction).toBe("CL");
    }
  });

  it("jurisdiction explícita gana sobre country", async () => {
    const res = await ctrl.current({ jurisdiction: "EU", country: "CL" });
    expect(res.jurisdiction).toBe("EU");
    expect(res.version).toBe("eu-v1.0");
  });

  it("sin LegalText activo de la jurisdicción → fallback al CL (nunca 404)", async () => {
    prisma.legalTexts = prisma.legalTexts.filter((t) => t.jurisdiction !== "EU");
    const res = await ctrl.current({ country: "ES" });
    // La ley aplicable sigue siendo EU pero el texto servido es el baseline CL.
    expect(res.jurisdiction).toBe("EU");
    expect(res.version).toBe("cl-v1.0");
    expect(res.granular).toBe(false);
  });

  it("sin ningún texto sembrado → baseline legacy (CONSENT_VERSION, essential)", async () => {
    prisma.legalTexts = [];
    const res = await ctrl.current({ country: "CL" });
    expect(res).toEqual({
      version: CONSENT_VERSION,
      body: "",
      requiredScopes: ["essential"],
      granular: false,
      jurisdiction: "CL",
    });
  });

  it("varios activos de una jurisdicción → el publicado más reciente", async () => {
    prisma.legalTexts.push(
      mkText({
        jurisdiction: "CL",
        version: "cl-v2.0",
        publishedAt: new Date("2026-11-01"),
      }),
    );
    const res = await ctrl.current({ country: "CL" });
    expect(res.version).toBe("cl-v2.0");
  });
});

describe("ConsentService.recordAcceptance", () => {
  let prisma: FakePrisma;
  let service: ConsentService;

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new ConsentService(prisma as unknown as PrismaService);
    prisma.legalTexts.push(
      mkText({ jurisdiction: "CL", version: "cl-v1.0" }),
      mkText({
        jurisdiction: "EU",
        version: "eu-v1.0",
        granular: true,
        requiredScopes: ["essential", "marketing", "analytics"],
      }),
    );
  });

  it("persona EU con opt-ins → record con scopes persistidos y snapshot eu-v1.0", async () => {
    prisma.people.set("p1", mkPerson("p1", "EU"));
    const res = await service.recordAcceptance("p1", {
      essential: true,
      marketing: true,
    });
    expect(res.version).toBe("eu-v1.0");
    expect(res.jurisdiction).toBe("EU");
    expect(prisma.records).toEqual([
      {
        personId: "p1",
        jurisdiction: "EU",
        version: "eu-v1.0",
        scopes: { essential: true, marketing: true, analytics: false },
      },
    ]);
    const p = prisma.people.get("p1")!;
    expect(p.consentVersion).toBe("eu-v1.0");
    expect(p.consentAcceptedAt).toBeInstanceOf(Date);
  });

  it("persona CL con scope extra → solo persiste essential (lo ignora)", async () => {
    prisma.people.set("p1", mkPerson("p1", "CL"));
    const res = await service.recordAcceptance("p1", {
      essential: true,
      marketing: true,
      analytics: true,
    });
    expect(res.version).toBe("cl-v1.0");
    expect(prisma.records[0].jurisdiction).toBe("CL");
    expect(prisma.records[0].scopes).toEqual({ essential: true });
  });

  it("jurisdiction null → CL por default", async () => {
    prisma.people.set("p1", mkPerson("p1", null));
    const res = await service.recordAcceptance("p1");
    expect(res.jurisdiction).toBe("CL");
    expect(prisma.records[0].scopes).toEqual({ essential: true });
  });

  it("essential declarado false por el cliente → se persiste true (requerido)", async () => {
    prisma.people.set("p1", mkPerson("p1", "EU"));
    await service.recordAcceptance("p1", { essential: false });
    expect(prisma.records[0].scopes).toEqual({
      essential: true,
      marketing: false,
      analytics: false,
    });
  });

  it("sin LegalText de la jurisdicción → record con versión del fallback", async () => {
    prisma.legalTexts = prisma.legalTexts.filter((t) => t.jurisdiction !== "EU");
    prisma.people.set("p1", mkPerson("p1", "EU"));
    const res = await service.recordAcceptance("p1", { marketing: true });
    // Jurisdiction del record = la de la persona; versión/scopes = texto servido (CL).
    expect(res.version).toBe("cl-v1.0");
    expect(prisma.records[0]).toMatchObject({
      jurisdiction: "EU",
      version: "cl-v1.0",
      scopes: { essential: true },
    });
  });

  it("sin ningún texto → baseline CONSENT_VERSION + essential", async () => {
    prisma.legalTexts = [];
    prisma.people.set("p1", mkPerson("p1", "CL"));
    const res = await service.recordAcceptance("p1");
    expect(res.version).toBe(CONSENT_VERSION);
    expect(prisma.records[0].scopes).toEqual({ essential: true });
  });
});

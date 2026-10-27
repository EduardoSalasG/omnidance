import { BadRequestException } from "@nestjs/common";
import { describe, it, expect } from "vitest";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver classes.controller.spec)
import { AcademiesController, cleanWhatsapp } from "./academies.controller";

// Academy.whatsapp (spec platform-multicountry): se normaliza con
// normalizePhone(raw, país de la academia) y persiste E.164 sin "+"
// (formato wa.me); inválido → 400 "whatsapp inválido".

describe("cleanWhatsapp", () => {
  it("número nacional → E.164 sin '+' con el país de la academia", () => {
    expect(cleanWhatsapp("9 1234 5678", "CL")).toBe("56912345678");
    // Otro país: mismo formato nacional interpretado contra su país.
    expect(cleanWhatsapp("612 34 56 78", "ES")).toBe("34612345678");
  });

  it("con '+' inicial el país se deriva del número (defaultCountry no aplica)", () => {
    expect(cleanWhatsapp("+56 9 1234 5678", "ES")).toBe("56912345678");
  });

  it("inválido → 400 whatsapp inválido", () => {
    expect(() => cleanWhatsapp("123", "CL")).toThrow(BadRequestException);
    expect(() => cleanWhatsapp("no-es-numero", "CL")).toThrow(
      /whatsapp inválido/,
    );
  });

  it("undefined no toca; vacío/null limpia a null", () => {
    expect(cleanWhatsapp(undefined, "CL")).toBeUndefined();
    expect(cleanWhatsapp("", "CL")).toBeNull();
    expect(cleanWhatsapp(null, "CL")).toBeNull();
  });
});

// updateSettings: el defaultCountry sale de academia → ciudad → país;
// sin ciudad → CL. El fake resuelve la cadena por academyId.
class FakePrisma {
  academies = new Map<
    string,
    { id: string; city?: { country?: { code?: string } | null } | null }
  >();
  lastUpdate: Record<string, unknown> | null = null;

  academy = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.academies.get(where.id) ?? null,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      this.lastUpdate = data;
      return data;
    },
  };
}

const reqAs = (personId: string) =>
  ({ person: { id: personId, roles: [] } }) as unknown as Request;

function mkCtrl(prisma: FakePrisma) {
  return new AcademiesController(
    prisma as unknown as PrismaService,
    { requireCapabilityWrite: async () => ({}) } as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe("AcademiesController.updateSettings - whatsapp", () => {
  it("academia ES → número nacional se interpreta como español", async () => {
    const prisma = new FakePrisma();
    prisma.academies.set("ac-es", {
      id: "ac-es",
      city: { country: { code: "ES" } },
    });
    const ctrl = mkCtrl(prisma);
    await ctrl.updateSettings(
      "ac-es",
      { whatsapp: "612 34 56 78" },
      reqAs("owner"),
    );
    expect(prisma.lastUpdate?.whatsapp).toBe("34612345678");
  });

  it("academia sin ciudad → nacional se interpreta como CL", async () => {
    const prisma = new FakePrisma();
    prisma.academies.set("ac-1", { id: "ac-1", city: null });
    const ctrl = mkCtrl(prisma);
    await ctrl.updateSettings(
      "ac-1",
      { whatsapp: "9 1234 5678" },
      reqAs("owner"),
    );
    expect(prisma.lastUpdate?.whatsapp).toBe("56912345678");
  });

  it("whatsapp inválido → 400 y no persiste", async () => {
    const prisma = new FakePrisma();
    prisma.academies.set("ac-1", {
      id: "ac-1",
      city: { country: { code: "CL" } },
    });
    const ctrl = mkCtrl(prisma);
    await expect(
      ctrl.updateSettings("ac-1", { whatsapp: "123" }, reqAs("owner")),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.lastUpdate).toBeNull();
  });
});

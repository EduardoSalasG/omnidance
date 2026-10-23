import { describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import {
  assertAcademyFeature,
  featuresForTier,
  requiredTierFor,
  tierMeets,
} from "./academy-tiers";

// Matriz de entitlements por tier (spec academy-tier-cobros): COBROS =
// cobranza pura; STUDIO = operación completa; PRO = +analítica/CRM/
// marketing/multi-academia. STARTER legado → nivel STUDIO; null
// (trial/gracia) → STUDIO; ENTERPRISE → PRO.

describe("featuresForTier", () => {
  it("COBROS solo habilita cobranza + alumnos", () => {
    const f = featuresForTier("COBROS");
    expect(f).toContain("billing");
    expect(f).toContain("students");
    expect(f).not.toContain("classes");
    expect(f).not.toContain("staff");
    expect(f).not.toContain("exports");
    expect(f).not.toContain("crm");
  });

  it("STUDIO agrega operación completa sin features PRO", () => {
    const f = featuresForTier("STUDIO");
    for (const feat of ["classes", "attendance", "staff", "exports", "presales"]) {
      expect(f).toContain(feat);
    }
    for (const feat of ["analytics", "crm", "videos", "insights", "multiAcademy"]) {
      expect(f).not.toContain(feat);
    }
  });

  it("PRO y ENTERPRISE habilitan todo", () => {
    for (const tier of ["PRO", "ENTERPRISE"]) {
      const f = featuresForTier(tier);
      for (const feat of ["classes", "exports", "crm", "videos", "insights", "multiAcademy"]) {
        expect(f).toContain(feat);
      }
    }
  });

  it("transición: STARTER legado y null resuelven a STUDIO (nadie baja a COBROS)", () => {
    expect(featuresForTier("STARTER")).toEqual(featuresForTier("STUDIO"));
    expect(featuresForTier(null)).toEqual(featuresForTier("STUDIO"));
    expect(featuresForTier("DESCONOCIDO")).toEqual(featuresForTier("STUDIO"));
  });
});

describe("tierMeets / requiredTierFor", () => {
  it("COBROS no alcanza clases ni CRM", () => {
    expect(tierMeets("COBROS", "classes")).toBe(false);
    expect(tierMeets("COBROS", "attendance")).toBe(false);
    expect(tierMeets("COBROS", "crm")).toBe(false);
    expect(tierMeets("COBROS", "billing")).toBe(true);
    expect(tierMeets("COBROS", "students")).toBe(true);
  });

  it("STUDIO alcanza clases pero no CRM", () => {
    expect(tierMeets("STUDIO", "classes")).toBe(true);
    expect(tierMeets("STUDIO", "exports")).toBe(true);
    expect(tierMeets("STUDIO", "crm")).toBe(false);
  });

  it("requiredTierFor reporta el tier mínimo", () => {
    expect(requiredTierFor("billing")).toBe("COBROS");
    expect(requiredTierFor("classes")).toBe("STUDIO");
    expect(requiredTierFor("crm")).toBe("PRO");
    expect(requiredTierFor("multiAcademy")).toBe("PRO");
  });
});

describe("assertAcademyFeature", () => {
  it("pasa cuando el tier cubre la feature", () => {
    expect(() =>
      assertAcademyFeature({ tier: "STUDIO" }, "classes"),
    ).not.toThrow();
    expect(() =>
      assertAcademyFeature({ tier: "PRO" }, "crm"),
    ).not.toThrow();
    expect(() =>
      assertAcademyFeature({ tier: "COBROS" }, "billing"),
    ).not.toThrow();
  });

  it("403 tier.required con requiredTier cuando no cubre", () => {
    const err = (() => {
      try {
        assertAcademyFeature({ tier: "COBROS" }, "classes");
        return null;
      } catch (e) {
        return e as ForbiddenException;
      }
    })();
    expect(err).toBeInstanceOf(ForbiddenException);
    const body = err!.getResponse() as Record<string, unknown>;
    expect(body.error).toBe("tier.required");
    expect(body.upgrade).toBe(true);
    expect(body.requiredTier).toBe("STUDIO");
    expect(body.feature).toBe("classes");
  });

  it("requiredTier PRO para features PRO", () => {
    const err = (() => {
      try {
        assertAcademyFeature({ tier: "STUDIO" }, "crm");
        return null;
      } catch (e) {
        return e as ForbiddenException;
      }
    })();
    const body = err!.getResponse() as Record<string, unknown>;
    expect(body.requiredTier).toBe("PRO");
  });
});

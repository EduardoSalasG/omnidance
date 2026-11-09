/**
 * Grilla del hub /academia (spec academy-tier-gates-refine): las cards
 * se filtran por capability del miembro Y por feature del tier de la
 * academia seleccionada - un staff de COBROS no ve módulos que solo
 * llevarían a paywall. Además los módulos con `flag` se ocultan cuando
 * el flag de funcionalidad está OFF (spec academy-videos-flag).
 */
import { describe, expect, it } from "vitest";
import { visibleHubModules } from "./academy-modules";
import type { AcademyAccessInfo } from "@/components/academy/use-academy-access";

const ALL_CAPS = {
  students: true,
  payments: true,
  plans: true,
  schedule: true,
  profile: true,
  team: true,
  billing: true,
};

const staff = (
  caps: Partial<typeof ALL_CAPS> = ALL_CAPS,
): AcademyAccessInfo => ({
  isOwner: false,
  isAdmin: false,
  isInstructor: false,
  isStaff: true,
  caps: { ...ALL_CAPS, ...caps },
});

// Flags del escenario base: todo ON - conserva el comportamiento de
// los tests de tier; el flag OFF se ejercita en su propio describe.
const FLAGS_ON = { academy_videos: true };

const hrefs = (
  tier: string | null,
  access: AcademyAccessInfo,
  flags: Record<string, boolean> = FLAGS_ON,
) =>
  visibleHubModules({
    access,
    academy: { tier },
    flags,
    academyOwnerId: "owner-1",
    viewerId: "staff-1",
    viewerRoles: [],
  }).map((m) => m.href);

describe("visibleHubModules - filtro por tier", () => {
  it("COBROS: solo módulos del piso aunque el staff tenga todos los caps", () => {
    const result = hrefs("COBROS", staff());
    expect(result).toContain("/academia/alumnos");
    expect(result).toContain("/academia/planes");
    expect(result).toContain("/academia/promos");
    expect(result).toContain("/academia/cobros");
    expect(result).toContain("/academia/configuracion");
    expect(result).toContain("/academia/configuracion/suscripcion");
    // Gated por tier: no se listan.
    expect(result).not.toContain("/academia/series");
    expect(result).not.toContain("/academia/particulares");
    expect(result).not.toContain("/academia/videos");
    expect(result).not.toContain("/academia/preventas");
    expect(result).not.toContain("/academia/equipo");
    expect(result).not.toContain("/crm");
  });

  it("STUDIO: suma operación completa sin módulos PRO", () => {
    const result = hrefs("STUDIO", staff());
    expect(result).toContain("/academia/series");
    expect(result).toContain("/academia/particulares");
    expect(result).toContain("/academia/preventas");
    expect(result).toContain("/academia/equipo");
    expect(result).not.toContain("/academia/videos");
    expect(result).not.toContain("/crm");
  });

  it("PRO: ve todos los módulos que su cap cubre", () => {
    const result = hrefs("PRO", staff());
    expect(result).toContain("/academia/videos");
    expect(result).toContain("/academia/series");
  });

  it("trial vigente (null + trialEndsAt futuro) resuelve a nivel STUDIO", () => {
    const result = visibleHubModules({
      access: staff(),
      academy: {
        tier: null,
        trialEndsAt: new Date(Date.now() + 86400_000).toISOString(),
      },
      flags: FLAGS_ON,
      academyOwnerId: "owner-1",
      viewerId: "staff-1",
      viewerRoles: [],
    }).map((m) => m.href);
    expect(result).toContain("/academia/series");
    expect(result).not.toContain("/academia/videos");
  });

  it("trial vencido (null + trialEndsAt pasado) corta los módulos gated", () => {
    const result = visibleHubModules({
      access: staff(),
      academy: {
        tier: null,
        trialEndsAt: new Date(Date.now() - 86400_000).toISOString(),
      },
      flags: FLAGS_ON,
      academyOwnerId: "owner-1",
      viewerId: "staff-1",
      viewerRoles: [],
    }).map((m) => m.href);
    // El piso (cobros/perfil/suscripción) sigue - no lleva feature gate.
    expect(result).toContain("/academia/cobros");
    expect(result).toContain("/academia/configuracion/suscripcion");
    expect(result).not.toContain("/academia/series");
    expect(result).not.toContain("/academia/equipo");
    expect(result).not.toContain("/academia/videos");
  });

  it("sin el cap la card no sale aunque el tier cubra la feature", () => {
    const result = hrefs(
      "PRO",
      staff({ schedule: false, team: false }),
    );
    expect(result).not.toContain("/academia/series");
    expect(result).not.toContain("/academia/videos");
    expect(result).not.toContain("/academia/equipo");
  });
});

describe("visibleHubModules - reglas previas intactas", () => {
  it("crm es ownerOnly: staff de PRO no la ve", () => {
    const result = hrefs("PRO", staff());
    expect(result).not.toContain("/crm");
  });

  it("crm sí sale para el owner de una academia PRO", () => {
    const result = visibleHubModules({
      access: { ...staff(), isOwner: true },
      academy: { tier: "PRO" },
      flags: FLAGS_ON,
      academyOwnerId: "owner-1",
      viewerId: "owner-1",
      viewerRoles: [],
    }).map((m) => m.href);
    expect(result).toContain("/crm");
  });

  it("instructor puro no ve particulares aunque el tier las cubra", () => {
    const result = visibleHubModules({
      access: {
        isOwner: false,
        isAdmin: false,
        isInstructor: true,
        isStaff: false,
        caps: { ...ALL_CAPS, schedule: false },
      },
      academy: { tier: "PRO" },
      flags: FLAGS_ON,
      academyOwnerId: "owner-1",
      viewerId: "inst-1",
      viewerRoles: [],
    }).map((m) => m.href);
    expect(result).not.toContain("/academia/particulares");
    // Su consola cross-academia no se gatea por tier.
    expect(result).toContain("/academia/clases");
  });
});

describe("visibleHubModules - filtro por flag (spec academy-videos-flag)", () => {
  it("flag OFF oculta videos aunque el tier sea PRO y el cap cubra", () => {
    const result = hrefs("PRO", staff(), { academy_videos: false });
    expect(result).not.toContain("/academia/videos");
    // El resto de módulos PRO/tier sigue igual.
    expect(result).toContain("/academia/series");
    expect(result).toContain("/academia/equipo");
  });

  it("flag ausente del mapa es fail-closed (superficie oculta)", () => {
    const result = hrefs("PRO", staff(), {});
    expect(result).not.toContain("/academia/videos");
  });

  it("flag ON conserva el gate de tier: COBROS sigue sin videos", () => {
    const result = hrefs("COBROS", staff(), { academy_videos: true });
    expect(result).not.toContain("/academia/videos");
  });
});

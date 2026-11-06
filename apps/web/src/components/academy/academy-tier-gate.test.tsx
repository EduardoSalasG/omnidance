// @vitest-environment happy-dom
/**
 * Gate de consola por tier para TODO el equipo (change
 * academy-tier-gate-staff): la feature se deriva de `academy.tier`
 * (viaja en /academies/mine para owner, staff e instructor). Un staff
 * sin academias propias en /me/entitlements NO debe ver paywall cuando
 * el tier de su academia cubre la feature.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";

// Staff/instructor: /me/entitlements no devuelve academias propias -
// la fuente correcta del gate es academy.tier, no los entitlements.
vi.mock("@/lib/entitlements-context", () => ({
  useActorEntitlements: () => ({
    tier: null,
    features: [],
    loading: false,
    has: () => false,
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { AcademyTierGate } from "./academy-tier-gate";
import type { Academy } from "./shared";

function renderGate(tier: string | null, feature: string) {
  const academy = { id: "ac-1", name: "Academia X", tier } as Academy;
  return render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <AcademyTierGate academy={academy} feature={feature}>
        <p>contenido del módulo</p>
      </AcademyTierGate>
    </NextIntlClientProvider>,
  );
}

describe("AcademyTierGate", () => {
  it("staff/instructor sin entitlements propios pasa si academy.tier cubre la feature", () => {
    renderGate("STUDIO", "classes");
    expect(screen.getByText("contenido del módulo")).toBeTruthy();
  });

  it("muestra paywall cuando academy.tier no cubre la feature", () => {
    renderGate("COBROS", "classes");
    expect(screen.queryByText("contenido del módulo")).toBeNull();
  });
});

// @vitest-environment happy-dom
/**
 * Importar por tier (change academy-tier-gates-refine): la card de
 * horario semanal exige feature `classes` del tier además del cap
 * `schedule` - en COBROS el owner tiene todos los caps pero la card no
 * debe renderizarse (el endpoint responde 403 tier.required). La de
 * alumnos queda igual (cap students, piso COBROS).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";
import type { Academy } from "@/components/academy/shared";

const state = vi.hoisted(() => ({
  tier: "COBROS" as string | null,
}));

vi.mock("@/lib/api", () => ({
  apiFetch: async (path: string) => {
    if (path.endsWith("/access")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          isOwner: true,
          isAdmin: false,
          isInstructor: false,
          isStaff: false,
          caps: {
            students: true,
            payments: true,
            plans: true,
            schedule: true,
            profile: true,
            team: true,
            billing: true,
          },
        }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  },
}));

vi.mock("@/components/academy/academy-gate", () => ({
  AcademyGate: ({
    children,
  }: {
    children: (ctx: { academy: Academy; academies: Academy[] }) => React.ReactNode;
  }) => {
    const academy = {
      id: "ac-1",
      name: "Academia X",
      ownerId: "me",
      tier: state.tier,
    } as Academy;
    return <>{children({ academy, academies: [academy] })}</>;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/academia/configuracion/importar",
}));
vi.mock("@/components/onboarding/OnboardingRunner", () => ({
  OnboardingRunner: () => null,
}));

import ConfigImportarPage from "./page";

const scheduleTitle = (messages.academyImport as Record<string, unknown>)
  .scheduleTitle as string;
const studentsTitle = (messages.academyImport as Record<string, unknown>)
  .studentsTitle as string;

function renderPage() {
  return render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <ConfigImportarPage />
    </NextIntlClientProvider>,
  );
}

describe("/academia/configuracion/importar - gate por tier", () => {
  beforeEach(() => {
    state.tier = "COBROS";
  });

  it("COBROS: solo la card de alumnos (schedule gateado por classes)", async () => {
    renderPage();
    await screen.findByText(studentsTitle);
    expect(screen.queryByText(scheduleTitle)).toBeNull();
  });

  it("STUDIO: ambas cards visibles", async () => {
    state.tier = "STUDIO";
    renderPage();
    await screen.findByText(scheduleTitle);
    expect(screen.getByText(studentsTitle)).toBeTruthy();
  });

  it("card de alumnos acepta csv/xls/xlsx y anuncia solo email+nombre obligatorios", async () => {
    renderPage();
    await screen.findByText(studentsTitle);
    const cols = (messages.academyImport as Record<string, unknown>)
      .studentsCols as string;
    expect(screen.getByText(cols)).toBeTruthy();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toContain(".csv");
    expect(input.accept).toContain(".xls");
    expect(input.accept).toContain(".xlsx");
  });
});

// @vitest-environment happy-dom
/**
 * Gate del scope explorar por flag academy_explore (change
 * academy-explore-flag): OFF → `?s=explorar` normaliza a `mias`, sin
 * pill Explorar ni CTA que apunte al directorio. ON → el scope sigue
 * alcanzable. Las fichas /academias/:id no se tocan (link directo).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";

const state = vi.hoisted(() => ({
  params: "s=explorar",
  flags: {} as Record<string, boolean>,
}));

const apiFetchMock = vi.fn(async (path: string) => {
  const json = (body: unknown) =>
    ({ ok: true, json: async () => body }) as Response;
  if (path === "/academies") return json([]);
  if (path === "/academies/enrolled") return json([]);
  return json({});
});

vi.mock("@/lib/api", () => ({
  apiFetch: (path: string) => apiFetchMock(path),
}));
vi.mock("@/lib/features-context", () => ({
  useFeatures: () => ({ flags: state.flags, loading: false }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string | { pathname?: string };
    children?: React.ReactNode;
  }) => (
    <a href={typeof href === "string" ? href : (href.pathname ?? "#")} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/academias",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.params),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/academias",
}));
// Mapa y tour: fuera del alcance del test (jsdom no monta maplibre;
// el runner solo lee data-tour).
vi.mock("@/components/events/EventsMap", () => ({ default: () => null }));
vi.mock("@/components/onboarding/OnboardingRunner", () => ({
  OnboardingRunner: () => null,
}));

import AcademiasPage from "./page";

const myAcademiesEmpty = (messages.academy as Record<string, unknown>)
  .myAcademiesEmpty as string;

function renderPage() {
  return render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <AcademiasPage />
    </NextIntlClientProvider>,
  );
}

describe("/academias - flag academy_explore", () => {
  beforeEach(() => apiFetchMock.mockClear());

  it("flag OFF normaliza ?s=explorar a mias sin pill ni CTA a explorar", async () => {
    state.flags = { academy_explore: false };
    state.params = "s=explorar";
    renderPage();

    // Sin enrollments el scope mias muestra su empty state - prueba
    // de que el deep link cayó a mias, no al directorio.
    await screen.findByText(myAcademiesEmpty);
    expect(
      screen.queryByRole("link", { name: "Explorar" }),
    ).toBeNull();
  });

  it("flag ON mantiene el scope explorar alcanzable", async () => {
    state.flags = { academy_explore: true };
    state.params = "s=explorar";
    renderPage();

    await screen.findAllByRole("link", { name: "Explorar" });
    expect(
      screen.getAllByRole("link", { name: "Explorar" }).length,
    ).toBeGreaterThan(0);
  });
});

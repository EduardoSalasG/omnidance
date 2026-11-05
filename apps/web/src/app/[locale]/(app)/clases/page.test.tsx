// @vitest-environment happy-dom
/**
 * Gate del scope explorar por flag academy_explore (change
 * academy-explore-flag): OFF → `?s=explorar` normaliza a `mias`, el
 * browse sale con scope=enrolled y no hay pill ni CTA a explorar.
 * ON → browse sin scope (todas las academias).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";

const state = vi.hoisted(() => ({
  params: "s=explorar",
  flags: {} as Record<string, boolean>,
}));

const apiFetchMock = vi.fn(async (path: string) => {
  const json = (body: unknown) =>
    ({ ok: true, json: async () => body }) as Response;
  if (typeof path === "string" && path.startsWith("/classes/"))
    return json([]);
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
  usePathname: () => "/clases",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.params),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/clases",
}));
vi.mock("@/components/onboarding/OnboardingRunner", () => ({
  OnboardingRunner: () => null,
}));

import ClasesPage from "./page";

function renderPage() {
  return render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <ClasesPage />
    </NextIntlClientProvider>,
  );
}

const browseCalls = () =>
  apiFetchMock.mock.calls
    .map(([path]) => String(path))
    .filter((p) => p.startsWith("/classes/browse"));

describe("/clases - flag academy_explore", () => {
  beforeEach(() => apiFetchMock.mockClear());

  it("flag OFF normaliza ?s=explorar a mias: browse con scope=enrolled y sin pill Explorar", async () => {
    state.flags = { academy_explore: false };
    state.params = "s=explorar";
    renderPage();

    await waitFor(() => expect(browseCalls().length).toBeGreaterThan(0));
    for (const path of browseCalls())
      expect(path).toContain("scope=enrolled");
    expect(screen.queryByRole("link", { name: "Explorar" })).toBeNull();
  });

  it("flag ON deja el browse de todas las academias sin scope", async () => {
    state.flags = { academy_explore: true };
    state.params = "s=explorar";
    renderPage();

    await waitFor(() => expect(browseCalls().length).toBeGreaterThan(0));
    expect(browseCalls()[0]).not.toContain("scope=enrolled");
    expect(
      screen.getAllByRole("link", { name: "Explorar" }).length,
    ).toBeGreaterThan(0);
  });
});

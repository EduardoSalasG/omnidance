// @vitest-environment happy-dom
/**
 * Lista unificada de métodos de pago (change gateway-in-methods-form):
 * la cuenta de pasarela BYO aparece como un método más (badge + mask +
 * status + webhookUrl) junto a los métodos manuales, y navega a la
 * ficha /pasarela. Ya no existe una sección de pasarela aparte.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";
import type { Academy } from "@/components/academy/shared";

const state = vi.hoisted(() => ({
  gatewayAccount: null as {
    id: string;
    provider: string;
    keyMask: string;
    status: string;
    webhookUrl: string;
    lastError: string | null;
    verifiedAt: string | null;
  } | null,
}));

vi.mock("@/lib/api", () => ({
  apiFetch: async (path: string) => {
    if (path.endsWith("/payment-methods/admin")) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "m-1",
            type: "TRANSFER",
            label: "Cuenta RUT",
            details: {},
            order: 0,
            active: true,
          },
        ],
      } as Response;
    }
    if (path.endsWith("/gateway-account")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ account: state.gatewayAccount }),
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
    } as Academy;
    return <>{children({ academy, academies: [academy] })}</>;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/academia/configuracion/metodos-de-pago",
}));

import ConfigPagosPage from "./page";

const academyPay = messages.academyPay as Record<string, unknown>;
const gatewayNs = academyPay.gateway as Record<string, string>;

function renderPage() {
  return render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <ConfigPagosPage />
    </NextIntlClientProvider>,
  );
}

describe("metodos-de-pago (lista unificada)", () => {
  it("lista la cuenta de pasarela junto al método manual", async () => {
    state.gatewayAccount = {
      id: "gw-1",
      provider: "MERCADOPAGO",
      keyMask: "••••9f3a",
      status: "ACTIVE",
      webhookUrl: "https://api.omnidance.cl/webhooks/mp?account=gw-1",
      lastError: null,
      verifiedAt: null,
    };
    renderPage();

    // Método manual y pasarela en la misma colección.
    expect(await screen.findByText("Cuenta RUT")).toBeTruthy();
    expect(await screen.findByText("MERCADOPAGO")).toBeTruthy();
    expect(
      screen.getByText(academyPay.fieldGateway as string),
    ).toBeTruthy();
    expect(screen.getByText("••••9f3a")).toBeTruthy();
    expect(
      screen.getByText("https://api.omnidance.cl/webhooks/mp?account=gw-1"),
    ).toBeTruthy();
    expect(screen.getByText(gatewayNs.active)).toBeTruthy();

    // El card de pasarela navega a su ficha /pasarela.
    const link = screen
      .getByText("MERCADOPAGO")
      .closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/academia/configuracion/metodos-de-pago/pasarela",
    );
  });

  it("sin cuenta de pasarela solo lista los métodos manuales", async () => {
    state.gatewayAccount = null;
    renderPage();
    expect(await screen.findByText("Cuenta RUT")).toBeTruthy();
    expect(screen.queryByText("MERCADOPAGO")).toBeNull();
  });
});

// @vitest-environment happy-dom
/**
 * Alta unificada (change gateway-in-methods-form): el selector de tipo
 * al inicio elige entre método manual (form intacto) y pasarela BYO
 * (provider + credenciales → PUT gateway-account + ActionNotice).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";
import type { Academy } from "@/components/academy/shared";

const state = vi.hoisted(() => ({
  calls: [] as { path: string; init?: RequestInit }[],
  pushed: [] as string[],
}));

vi.mock("@/lib/api", () => ({
  apiFetch: async (path: string, init?: RequestInit) => {
    state.calls.push({ path, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        account: {
          id: "gw-1",
          provider: "MERCADOPAGO",
          keyMask: "••••9f3a",
          status: "ACTIVE",
          webhookUrl: "https://api.omnidance.cl/webhooks/mp?account=gw-1",
          lastError: null,
          verifiedAt: null,
        },
      }),
    } as Response;
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
  Link: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({
    push: (href: string) => state.pushed.push(href),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/academia/configuracion/metodos-de-pago/nuevo",
}));

import PaymentMethodNewPage from "./page";

const academyPay = messages.academyPay as Record<string, unknown>;
const gatewayNs = academyPay.gateway as Record<string, string>;

function renderPage() {
  return render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <PaymentMethodNewPage />
    </NextIntlClientProvider>,
  );
}

describe("metodos-de-pago/nuevo (alta unificada)", () => {
  beforeEach(() => {
    state.calls.length = 0;
    state.pushed.length = 0;
  });

  it("parte con el selector de tipo y el form manual por defecto", () => {
    const { container } = renderPage();
    const selects = container.querySelectorAll("select");
    // kind + tipo de método manual + tipo de cuenta (TRANSFER).
    expect(selects.length).toBe(3);
    const kind = selects[0];
    const options = [...kind.querySelectorAll("option")].map(
      (o) => o.textContent,
    );
    expect(options).toContain(academyPay.kindManual as string);
    expect(options).toContain(gatewayNs.title);
    // Rama manual intacta: campo nombre visible presente.
    expect(screen.getByText(academyPay.fLabel as string)).toBeTruthy();
  });

  it("rama pasarela envía PUT gateway-account con credenciales MP", async () => {
    const { container } = renderPage();
    const kind = container.querySelectorAll("select")[0];
    fireEvent.change(kind, { target: { value: "gateway" } });

    // Rama pasarela: select de provider + credencial (MERCADOPAGO sin
    // secret - solo accessToken).
    const provider = container.querySelectorAll("select")[1];
    fireEvent.change(provider, { target: { value: "MERCADOPAGO" } });
    const secretFields = container.querySelectorAll("input[type=password]");
    expect(secretFields.length).toBe(1);

    fireEvent.change(secretFields[0], {
      target: { value: "APP_USR-test-token" },
    });
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        state.calls.some(
          (c) =>
            c.path === "/academies/ac-1/gateway-account" &&
            c.init?.method === "PUT" &&
            JSON.parse(String(c.init.body)).provider === "MERCADOPAGO" &&
            JSON.parse(String(c.init.body)).apiKey ===
              "APP_USR-test-token" &&
            !("secret" in JSON.parse(String(c.init.body))),
        ),
      ).toBe(true);
    });
    // Vuelve al listado tras el aviso de éxito.
    await waitFor(() => {
      expect(state.pushed).toContain(
        "/academia/configuracion/metodos-de-pago",
      );
    });
  });

  it("FLOW exige apiKey + secret", () => {
    const { container } = renderPage();
    const kind = container.querySelectorAll("select")[0];
    fireEvent.change(kind, { target: { value: "gateway" } });
    // FLOW default: dos campos password (apiKey + secret).
    const secrets = container.querySelectorAll("input[type=password]");
    expect(secrets.length).toBe(2);
    // Sin credenciales el submit queda deshabilitado.
    const submit = container.querySelector(
      "button[type=submit]",
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});

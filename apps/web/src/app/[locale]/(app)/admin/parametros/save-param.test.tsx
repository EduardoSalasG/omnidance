// @vitest-environment happy-dom
/**
 * Regresión del 400 "value requerido" de PUT /admin/params/:key
 * (params.controller): el saveParam salía sin Content-Type → fetch
 * mandaba text/plain → el body-parser de Nest no parseaba el JSON →
 * body.value llegaba undefined. El test monta el panel real, edita un
 * valor y guarda: el PUT debe ir con header application/json.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const apiFetchMock = vi.fn(async (path: string, init?: RequestInit) => {
  const json = (body: unknown) =>
    ({ ok: true, json: async () => body }) as Response;
  if (path === "/admin/params")
    return json([
      { key: "qr.rotation_seconds", value: 15, description: null },
    ]);
  if (path === "/admin/producers") return json([]);
  return json({});
});
void apiFetchMock;

vi.mock("@/lib/api", () => ({
  apiFetch: (path: string, init?: RequestInit) => apiFetchMock(path, init),
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
  usePathname: () => "/admin/parametros",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/parametros",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/components/admin/admin-gate", () => ({
  AdminGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/console/console-header", () => ({
  ConsoleHeader: () => null,
}));

import ParametrosPage from "./page";

const messages = {
  admin: {
    params: { hint: "" },
    saved: "Guardado",
    modules: { backHome: "Inicio" },
  },
  producerParams: { adminSection: "", adminHint: "" },
  common: { error: "error", save: "Guardar", loading: "cargando" },
};

describe("/admin/parametros - guardar valor", () => {
  beforeEach(() => apiFetchMock.mockClear());

  it("el PUT de un param va con Content-Type application/json", async () => {
    render(
      <NextIntlClientProvider locale="es-CL" messages={messages}>
        <ParametrosPage />
      </NextIntlClientProvider>,
    );

    const input = await screen.findByLabelText("qr.rotation_seconds");
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.click(screen.getByText("Guardar"));

    await waitFor(() =>
      expect(
        apiFetchMock.mock.calls.some(
          ([path, init]) =>
            path === "/admin/params/qr.rotation_seconds" &&
            init?.method === "PUT",
        ),
      ).toBe(true),
    );

    const call = apiFetchMock.mock.calls.find(
      ([path]) => path === "/admin/params/qr.rotation_seconds",
    );
    const init = call?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ value: 20 });
  });
});

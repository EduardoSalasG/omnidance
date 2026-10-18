// @vitest-environment happy-dom
/**
 * Regresión del RangeError "Invalid time value" de /admin/datos
 * (2026-10-18): al cambiar de píldora de entidad con filas cargadas,
 * un frame intermedio renderizaba rows de la entidad anterior bajo el
 * renderRow de la nueva → new Date(undefined) → crash.
 * Fix: filas etiquetadas con la entidad que las produjo.
 * Este test monta el panel real con fetch mockeado y conmuta entidades.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string) => {
    const json = (body: unknown) =>
      ({ ok: true, json: async () => body }) as Response;
    if (path.startsWith("/query/catalog"))
      return json({
        entities: [
          { entity: "tickets", filters: [] },
          { entity: "membership-subscriptions", filters: [] },
        ],
        options: {},
      });
    if (path.startsWith("/query/saved")) return json({ saved: [] });
    if (path.startsWith("/admin/browse/tickets"))
      // Filas tickets: NO tienen createdAt - el renderRow viejo
      // crasheaba al formatearlas como subscription.
      return json([
        {
          id: "t1",
          status: "ACTIVE",
          listPrice: 5000,
          event: null,
          owner: null,
        },
      ]);
    if (path.startsWith("/admin/browse/membership-subscriptions"))
      return json([
        {
          id: "s1",
          status: "ACTIVE",
          flowSubscriptionId: null,
          nextInvoiceAt: null,
          lastInvoiceId: null,
          canceledAt: null,
          createdAt: "2026-10-04T18:21:12.535Z",
          plan: null,
          person: { id: "p1", name: "Ana" },
          academy: null,
        },
      ]);
    return json([]);
  }),
}));

// Navigation: las internals de next/next-intl no resuelven en vitest -
// se stuban el adapter propio y next/navigation (Link → <a> inline:
// vi.mock se hoista y no puede referenciar consts externas).
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
  usePathname: () => "/admin/datos",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/datos",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({
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
}));

// DatosPanel vive dentro de AdminGate - se importa la page y se mockea
// el gate para renderizar el panel directo.
vi.mock("@/components/admin/admin-gate", () => ({
  AdminGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/console/console-header", () => ({
  ConsoleHeader: () => null,
}));

import AdminDatosPage from "./page";

const messages = {
  admin: { datos: { title: "Datos", subtitle: "", empty: "vacío", cols: { sold: "vendidas", students: "alumnos", series: "series", rentals: "arriendos", net: "neto" }, verifyChain: "verificar", convertLead: "convertir", audit: {} }, users: { searchHint: "" }, title: "Admin" },
  analytics: {},
  profile: {},
  common: { error: "error", retry: "reintentar", loading: "cargando" },
  query: { entities: { tickets: "Tickets", "membership-subscriptions": "Suscripciones" }, savePlaceholder: "nombre", save: "guardar", saved: {} },
};

function mount() {
  return render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <AdminDatosPage />
    </NextIntlClientProvider>,
  );
}

describe("/admin/datos - conmutación de entidad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cargar tickets y cambiar a suscripciones no crashea", async () => {
    mount();
    // Primera entidad del catálogo = tickets → esperar filas.
    await waitFor(() =>
      expect(document.querySelectorAll("li").length).toBeGreaterThan(0),
    );
    // Cambiar a membership-subscriptions: el frame intermedio era el
    // que crasheaba. Si renderRow recibe filas tickets, lanza RangeError.
    const tab = screen.getByText(/suscripciones/i);
    expect(() => fireEvent.click(tab)).not.toThrow();
    await waitFor(() =>
      expect(screen.getByText("Ana")).toBeTruthy(),
    );
  });
});

// @vitest-environment happy-dom
/**
 * Ficha de campaña admin (change admin-campaign-detail): detalle +
 * historial de corridas (GET :id/runs) + acciones test/run/cancel con
 * ConfirmSheet para las destructivas; 404 → estado "no encontrada".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";

const state = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: state.apiFetchMock,
}));
vi.mock("@/components/admin/admin-gate", () => ({
  AdminGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/campanas/c-1",
}));

import { CampaignDetail } from "./campaign-detail";

const CAMPAIGN = {
  id: "c-1",
  name: "Reactivación noviembre",
  subject: "Vuelve a la pista",
  htmlBody: "<p>hola {{name}}</p>",
  audience: { kind: "ALL" },
  scheduleKind: "ONCE",
  runAt: "2026-11-20T21:00:00.000Z",
  cronExpr: null,
  timezone: "America/Santiago",
  status: "SCHEDULED",
  nextRunAt: "2026-11-20T21:00:00.000Z",
  lastRunAt: null,
  sentCount: 3,
  failCount: 1,
  createdAt: "2026-11-10T12:00:00.000Z",
};

const RUNS = [
  {
    id: "r-2",
    trigger: "MANUAL",
    status: "OK",
    sentCount: 3,
    failCount: 1,
    startedAt: "2026-11-10T13:00:00.000Z",
    finishedAt: "2026-11-10T13:01:00.000Z",
    _count: { recipients: 4 },
  },
  {
    id: "r-1",
    trigger: "CRON",
    status: "ERROR",
    sentCount: 0,
    failCount: 2,
    startedAt: "2026-11-09T13:00:00.000Z",
    finishedAt: "2026-11-09T13:00:10.000Z",
    _count: { recipients: 2 },
  },
];

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function mockGet(campaign: unknown = CAMPAIGN, runs: unknown = RUNS) {
  state.apiFetchMock.mockImplementation((path: string) => {
    if (path === "/admin/mail-campaigns/c-1/runs") {
      return Promise.resolve(okJson(runs));
    }
    if (path === "/admin/mail-campaigns/c-1") {
      return Promise.resolve(okJson(campaign));
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);
  });
}

function renderDetail() {
  return render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <CampaignDetail id="c-1" />
    </NextIntlClientProvider>,
  );
}

describe("/admin/campanas/[id] - ficha de campaña", () => {
  beforeEach(() => {
    state.apiFetchMock.mockReset();
  });

  it("muestra detalle de la campaña e historial de corridas", async () => {
    mockGet();
    renderDetail();

    await screen.findByText("Reactivación noviembre");
    expect(screen.getByText("Vuelve a la pista")).toBeTruthy();
    // Historial: 2 runs con conteo de destinatarios.
    await screen.findByText(/4 destinatarios/);
    expect(screen.getByText(/2 destinatarios/)).toBeTruthy();
    expect(state.apiFetchMock).toHaveBeenCalledWith(
      "/admin/mail-campaigns/c-1",
    );
    expect(state.apiFetchMock).toHaveBeenCalledWith(
      "/admin/mail-campaigns/c-1/runs",
    );
  });

  it("la identidad enlaza a editar cuando la campaña es editable", async () => {
    mockGet();
    renderDetail();

    await screen.findByText("Reactivación noviembre");
    const link = screen.getByRole("link", {
      name: /Reactivación noviembre/,
    });
    expect(link.getAttribute("href")).toBe("/admin/campanas/nueva?edit=c-1");
  });

  it("la identidad no enlaza a editar cuando la campaña es inmutable", async () => {
    mockGet({ ...CAMPAIGN, status: "DONE" });
    renderDetail();

    await screen.findByText("Reactivación noviembre");
    expect(
      screen.queryByRole("link", { name: /Reactivación noviembre/ }),
    ).toBeNull();
  });

  it("Prueba dispara POST :id/test sin confirmación", async () => {
    mockGet();
    renderDetail();
    await screen.findByText("Reactivación noviembre");

    state.apiFetchMock.mockResolvedValueOnce(okJson({ ok: true }));
    fireEvent.click(screen.getByRole("button", { name: /prueba/i }));

    await waitFor(() =>
      expect(state.apiFetchMock).toHaveBeenCalledWith(
        "/admin/mail-campaigns/c-1/test",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("Enviar ahora pide confirmación y dispara POST :id/run", async () => {
    mockGet();
    renderDetail();
    await screen.findByText("Reactivación noviembre");

    fireEvent.click(screen.getByRole("button", { name: /enviar ahora/i }));
    // ConfirmSheet abierto: aún no se posteó.
    expect(
      state.apiFetchMock.mock.calls.some((c) =>
        String(c[0]).endsWith("/run"),
      ),
    ).toBe(false);

    state.apiFetchMock.mockResolvedValueOnce(okJson({ ok: true }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(
      within(sheet).getByRole("button", { name: /enviar ahora/i }),
    );

    await waitFor(() =>
      expect(state.apiFetchMock).toHaveBeenCalledWith(
        "/admin/mail-campaigns/c-1/run",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("Cancelar pide confirmación y dispara POST :id/cancel", async () => {
    mockGet();
    renderDetail();
    await screen.findByText("Reactivación noviembre");

    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));
    const sheet = await screen.findByRole("dialog");

    state.apiFetchMock.mockResolvedValueOnce(okJson({ ok: true }));
    // El sheet tiene dos "Cancelar": el confirm (primero) y el cierre.
    fireEvent.click(
      within(sheet).getAllByRole("button", { name: /^cancelar$/i })[0]!,
    );

    await waitFor(() =>
      expect(state.apiFetchMock).toHaveBeenCalledWith(
        "/admin/mail-campaigns/c-1/cancel",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("oculta Cancelar cuando la campaña ya terminó", async () => {
    mockGet({ ...CAMPAIGN, status: "DONE" });
    renderDetail();
    await screen.findByText("Reactivación noviembre");

    expect(
      screen.queryByRole("button", { name: /^cancelar$/i }),
    ).toBeNull();
  });

  it("404 renderiza estado no encontrada", async () => {
    state.apiFetchMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/runs")
          ? okJson([])
          : ({ ok: false, status: 404, json: async () => ({}) } as Response),
      ),
    );
    renderDetail();

    await screen.findByText(/no encontrada|no existe/i);
    expect(screen.queryByText("Reactivación noviembre")).toBeNull();
  });
});

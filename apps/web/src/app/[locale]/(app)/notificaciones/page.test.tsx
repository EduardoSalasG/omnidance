// @vitest-environment happy-dom
/**
 * Deep link de academy.invite (change academy-invite-push-consume):
 * la cuenta existente que recibe el push "te invitó" toca la card y
 * consume la invitación (POST consume), entra con lente academy y
 * aterriza en la ficha pública - mismo desenlace que el magic link.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";

const state = vi.hoisted(() => ({
  notifications: [] as Record<string, unknown>[],
  push: vi.fn(),
  apiFetchMock: vi.fn(async (path: string) => {
    const json = (body: unknown) =>
      ({ ok: true, status: 200, json: async () => body }) as Response;
    if (path.startsWith("/notifications?"))
      return json(state.notifications);
    return json({});
  }),
}));

const apiFetchMock = state.apiFetchMock;

vi.mock("@/lib/api", () => ({
  apiFetch: state.apiFetchMock,
}));
vi.mock("@/lib/me-context", () => ({
  useMe: () => ({ me: { roles: ["DANCER"] }, loading: false }),
}));
vi.mock("@/lib/active-role", () => ({
  useActiveRole: () => "DANCER",
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: state.push }),
}));

import NotificacionesPage from "./page";

const renderPage = () =>
  render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <NotificacionesPage />
    </NextIntlClientProvider>,
  );

const INVITE_NOTIF = {
  id: "n-1",
  category: "TRANSACTIONAL",
  type: "academy.invite",
  title: "La Casa del Mambo te invitó a Omnidance",
  body: "Revisa tu correo para entrar y encontrarla.",
  readAt: null,
  createdAt: new Date("2026-11-10").toISOString(),
  data: { academyId: "acad-1", inviteId: "inv-1" },
};

describe("/notificaciones - tap en academy.invite", () => {
  beforeEach(() => {
    state.notifications = [INVITE_NOTIF];
    state.push.mockClear();
    apiFetchMock.mockClear();
    window.localStorage.clear();
  });

  it("consume la invitación, persiste lente academy y navega a la ficha", async () => {
    renderPage();
    const card = await screen.findByText(INVITE_NOTIF.title);
    fireEvent.click(card);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/academies/invites/inv-1/consume",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(state.push).toHaveBeenCalledWith("/academias/acad-1");
    expect(window.localStorage.getItem("omnidance:view-mode")).toBe("academy");
  });

  it("una notificación sin inviteId navega a la ficha igual (consumo best-effort)", async () => {
    state.notifications = [
      { ...INVITE_NOTIF, data: { academyId: "acad-1" } },
    ];
    renderPage();
    const card = await screen.findByText(INVITE_NOTIF.title);
    fireEvent.click(card);

    await waitFor(() => {
      expect(state.push).toHaveBeenCalledWith("/academias/acad-1");
    });
    expect(
      apiFetchMock.mock.calls.some((c) =>
        String(c[0]).includes("/consume"),
      ),
    ).toBe(false);
    expect(window.localStorage.getItem("omnidance:view-mode")).toBe("academy");
  });
});

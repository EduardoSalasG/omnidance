// @vitest-environment happy-dom
/**
 * Deep link del toast (change notification-toast-deeplink): el tap en
 * el cuerpo navega al mismo destino que la card del centro (fuente
 * compartida notification-nav); tipos sin destino caen a
 * /notificaciones; academy.invite consume + lente academy.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";
import type { RealtimeNotification } from "@/lib/realtime";

const state = vi.hoisted(() => ({
  notif: null as RealtimeNotification | null,
  push: vi.fn(),
  apiFetchMock: vi.fn(async () =>
    ({ ok: true, status: 200, json: async () => ({}) }) as Response,
  ),
}));

const apiFetchMock = state.apiFetchMock;

vi.mock("@/lib/api", () => ({
  apiFetch: state.apiFetchMock,
}));
vi.mock("@/components/realtime/RealtimeProvider", () => ({
  useRealtime: () => ({ latestNotification: state.notif, connected: true }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: state.push }),
}));

import { NotificationToast } from "./NotificationToast";

const renderToast = () =>
  render(
    <NextIntlClientProvider locale="es-CL" messages={messages}>
      <NotificationToast />
    </NextIntlClientProvider>,
  );

const notif = (over: Partial<RealtimeNotification>): RealtimeNotification => ({
  id: "n-1",
  personId: "p-1",
  category: "TRANSACTIONAL",
  type: "account.notice",
  title: "Aviso",
  readAt: null,
  createdAt: new Date("2026-11-10").toISOString(),
  ...over,
});

describe("NotificationToast - deep link por tipo", () => {
  beforeEach(() => {
    state.push.mockClear();
    apiFetchMock.mockClear();
    window.localStorage.clear();
  });

  it("tipo con destino navega al deep link (ticket.claimed → evento)", async () => {
    state.notif = notif({
      type: "ticket.claimed",
      title: "Ticket reclamado",
      data: { eventId: "ev-1" },
    });
    renderToast();
    fireEvent.click(await screen.findByText("Ticket reclamado"));
    expect(state.push).toHaveBeenCalledWith("/eventos/ev-1");
  });

  it("tipo sin destino cae a /notificaciones", async () => {
    state.notif = notif({ type: "account.notice", title: "Aviso" });
    renderToast();
    fireEvent.click(await screen.findByText("Aviso"));
    expect(state.push).toHaveBeenCalledWith("/notificaciones");
  });

  it("academy.invite: consume, lente academy y ficha", async () => {
    state.notif = notif({
      type: "academy.invite",
      title: "La Casa del Mambo te invitó a Omnidance",
      data: { academyId: "acad-1", inviteId: "inv-1" },
    });
    renderToast();
    fireEvent.click(
      await screen.findByText("La Casa del Mambo te invitó a Omnidance"),
    );
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/academies/invites/inv-1/consume",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(state.push).toHaveBeenCalledWith("/academias/acad-1");
    expect(window.localStorage.getItem("omnidance:view-mode")).toBe("academy");
  });
});

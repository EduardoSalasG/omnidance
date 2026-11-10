// @vitest-environment happy-dom
/**
 * Bridge del push de dispositivo (change invite-device-push-bridge):
 * el SW abre /i/<inviteId>; la página consume la invite
 * (channel=device), persiste la lente academy y reemplaza hacia la
 * ficha; ante 404/401 cae a /notificaciones.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  replace: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: state.apiFetchMock,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));

import { InviteBridge } from "./invite-bridge";

describe("/i/[inviteId] - bridge del push de dispositivo", () => {
  beforeEach(() => {
    state.replace.mockClear();
    state.apiFetchMock.mockReset();
    window.localStorage.clear();
  });

  it("consume con channel device, lente academy y replace a la ficha", async () => {
    state.apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ consumed: true, academyId: "acad-1" }),
    });

    render(<InviteBridge inviteId="inv-1" />);

    await waitFor(() =>
      expect(state.replace).toHaveBeenCalledWith("/academias/acad-1"),
    );
    expect(state.apiFetchMock).toHaveBeenCalledWith(
      "/academies/invites/inv-1/consume",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("device"),
      }),
    );
    expect(window.localStorage.getItem("omnidance:view-mode")).toBe(
      "academy",
    );
  });

  it("respuesta no ok (404 invite ajena) cae a /notificaciones", async () => {
    state.apiFetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    render(<InviteBridge inviteId="inv-x" />);

    await waitFor(() =>
      expect(state.replace).toHaveBeenCalledWith("/notificaciones"),
    );
    expect(window.localStorage.getItem("omnidance:view-mode")).toBeNull();
  });

  it("consume ok sin academyId en la respuesta cae a /notificaciones", async () => {
    state.apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ consumed: false }),
    });

    render(<InviteBridge inviteId="inv-1" />);

    await waitFor(() =>
      expect(state.replace).toHaveBeenCalledWith("/notificaciones"),
    );
  });
});

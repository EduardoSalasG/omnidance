import { describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import type { Request } from "express";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver events.controller.spec)
import { ProducerGatewayAccountsController } from "./producer-gateway.controller";
import type { PrismaService } from "../../prisma.service";
import type { GatewayAccountsService } from "../application/gateway-accounts.service";

// Endpoints del productor para su pasarela propia (spec
// producer-gateway-accounts): solo PRODUCER APPROVED o admin.access
// pueden ver/configurar/bajar la cuenta; el service valida providers y
// cifra - acá probamos el gate y la delegación.

const req = (id: string, roles: string[] = []) =>
  ({ person: { id, roles } }) as unknown as Request;

function mk(over: {
  producer?: boolean;
  admin?: boolean;
  view?: unknown;
}) {
  const prisma = {
    personRole: {
      findUnique: vi.fn(async () =>
        over.producer ? { status: "APPROVED" } : null,
      ),
    },
    role: {
      findMany: vi.fn(async () =>
        over.admin
          ? [
              {
                key: "ADMIN",
                isSuperuser: false,
                permissions: [{ permissionKey: "admin.access" }],
              },
            ]
          : [],
      ),
    },
  };
  const accounts = {
    viewForProducer: vi.fn(async () => over.view ?? null),
    upsert: vi.fn(async (_id: string, _dto: unknown) => ({
      id: "acct-1",
      provider: "FLOW",
      keyMask: "••••1234",
      status: "ACTIVE",
    })),
    disable: vi.fn(async () => undefined),
  };
  const ctrl = new ProducerGatewayAccountsController(
    prisma as unknown as PrismaService,
    accounts as unknown as GatewayAccountsService,
  );
  return { ctrl, prisma, accounts };
}

describe("ProducerGatewayAccountsController", () => {
  it("productor APPROVED ve su cuenta (masked)", async () => {
    const { ctrl, accounts } = mk({
      producer: true,
      view: { id: "a1", keyMask: "••••9999" },
    });
    const out = await ctrl.view(req("me"));
    expect(out.account).toEqual({ id: "a1", keyMask: "••••9999" });
    expect(accounts.viewForProducer).toHaveBeenCalledWith("me");
  });

  it("sin rol de productor ni admin → 403", async () => {
    const { ctrl } = mk({});
    await expect(ctrl.view(req("me"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      ctrl.upsert(req("me"), { provider: "FLOW", apiKey: "k" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.disable(req("me"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("admin.access pasa el gate aunque no sea productor", async () => {
    const { ctrl } = mk({ admin: true });
    const out = await ctrl.view(req("admin-1", ["ADMIN"]));
    expect(out.account).toBeNull();
  });

  it("upsert rechaza apiKey vacío y delega al service", async () => {
    const { ctrl, accounts } = mk({ producer: true });
    await expect(
      ctrl.upsert(req("me"), { provider: "FLOW", apiKey: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const out = await ctrl.upsert(req("me"), {
      provider: "FLOW",
      apiKey: "k",
      secret: "s",
    });
    expect(accounts.upsert).toHaveBeenCalledWith("me", {
      provider: "FLOW",
      apiKey: "k",
      secret: "s",
    });
    expect(out.account.keyMask).toBe("••••1234");
  });

  it("disable baja la cuenta activa (no-op si no hay)", async () => {
    const { ctrl, accounts } = mk({
      producer: true,
      view: { id: "a1" },
    });
    await ctrl.disable(req("me"));
    expect(accounts.disable).toHaveBeenCalledWith("a1", "me");

    const empty = mk({ producer: true });
    await empty.ctrl.disable(req("me"));
    expect(empty.accounts.disable).not.toHaveBeenCalled();
  });
});

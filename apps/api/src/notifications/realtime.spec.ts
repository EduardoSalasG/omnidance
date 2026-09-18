import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Notification, PushToken } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import type { AuthService } from "../auth/domain/auth.service";
import type { PrismaService } from "../prisma.service";
import { NotificationsService } from "./domain/notifications.service";
import type {
  NotificationsRepo,
  PushPort,
  RealtimePort,
} from "./domain/ports";
import { NotificationsGateway } from "./infrastructure/notifications.gateway";
import { WebPushSender } from "./infrastructure/web-push.sender";

// ─── Mock de web-push (hoisted por vitest) ───
vi.mock("web-push", () => {
  const sendNotification = vi.fn();
  const setVapidDetails = vi.fn();
  return {
    default: { sendNotification, setVapidDetails },
    sendNotification,
    setVapidDetails,
  };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { sendNotification, setVapidDetails } from "web-push";
const mockSend = vi.mocked(sendNotification);
const mockVapid = vi.mocked(setVapidDetails);

// ─── Helpers ───
function fakeSocket(cookie?: string) {
  return {
    handshake: { headers: cookie ? { cookie } : {} },
    data: {} as Record<string, unknown>,
    join: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  } as unknown as Socket & {
    join: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
}

function fakeNotification(personId: string): Notification {
  return {
    id: "ntf-1",
    personId,
    category: "SOCIAL",
    type: "session_invite",
    title: "Te invitaron a bailar",
    body: "Ana quiere bailar contigo",
    data: { sessionId: "ses-1" },
    channel: "IN_APP",
    readAt: null,
    createdAt: new Date(),
  };
}

function fakePushToken(personId: string, id = "pt-1"): PushToken {
  return {
    id,
    personId,
    token: "https://push.example.com/sub/abc",
    payload: { platform: "WEB", p256dh: "P256DH", auth: "AUTH" },
    createdAt: new Date(),
  };
}

// ─── Gateway ───
describe("NotificationsGateway", () => {
  const personId = "per-1";
  let verifySession: ReturnType<typeof vi.fn>;
  let gateway: NotificationsGateway;

  beforeEach(() => {
    verifySession = vi.fn().mockResolvedValue({ personId });
    gateway = new NotificationsGateway({
      verifySession,
    } as unknown as AuthService);
  });

  it("cookie de sesión válida → verifica el JWT y une el socket a person:{id}", async () => {
    const socket = fakeSocket(
      "otra=x; omnidance_session=tok-abc; foo=bar",
    );
    await gateway.handleConnection(socket);
    expect(verifySession).toHaveBeenCalledWith("tok-abc");
    expect(socket.data.personId).toBe(personId);
    expect(socket.join).toHaveBeenCalledWith(`person:${personId}`);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it("sin cookie → desconecta sin llamar a verifySession", async () => {
    const socket = fakeSocket();
    await gateway.handleConnection(socket);
    expect(verifySession).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("cookie sin omnidance_session → desconecta", async () => {
    const socket = fakeSocket("foo=bar; otra=x");
    await gateway.handleConnection(socket);
    expect(verifySession).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it("verifySession rechaza (token inválido/expirado) → desconecta", async () => {
    verifySession.mockRejectedValue(new Error("invalid session token"));
    const socket = fakeSocket("omnidance_session=tok-malo");
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("emitToPerson emite el evento a la room person:{id}", () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as unknown as Server;
    const notif = fakeNotification(personId);
    gateway.emitToPerson(personId, "notification", notif);
    expect(to).toHaveBeenCalledWith(`person:${personId}`);
    expect(emit).toHaveBeenCalledWith("notification", notif);
  });
});

// ─── WebPushSender ───
describe("WebPushSender", () => {
  const ENV_KEYS = [
    "WEB_PUSH_VAPID_PUBLIC_KEY",
    "WEB_PUSH_VAPID_PRIVATE_KEY",
    "WEB_PUSH_VAPID_SUBJECT",
    "WEB_PUSH_SUBJECT",
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  function fakePrisma(tokens: PushToken[] = []) {
    return {
      pushToken: {
        findMany: vi.fn().mockResolvedValue(tokens),
        delete: vi.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
  }

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    mockSend.mockReset().mockResolvedValue({} as never);
    mockVapid.mockReset();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it("sin VAPID keys → no-op: resuelve sin consultar tokens ni llamar webpush", async () => {
    const prisma = fakePrisma([fakePushToken("per-1")]);
    const sender = new WebPushSender(prisma);
    sender.onModuleInit();
    await expect(
      sender.sendToPerson("per-1", fakeNotification("per-1")),
    ).resolves.toBeUndefined();
    expect(prisma.pushToken.findMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockVapid).not.toHaveBeenCalled();
  });

  it("sin onModuleInit (no inicializado) → tampoco envía", async () => {
    const prisma = fakePrisma([fakePushToken("per-1")]);
    const sender = new WebPushSender(prisma);
    await sender.sendToPerson("per-1", fakeNotification("per-1"));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("con VAPID keys → setVapidDetails con subject por defecto y envía con la subscription correcta", async () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "PUB";
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "PRIV";
    const token = fakePushToken("per-1");
    const prisma = fakePrisma([token]);
    const sender = new WebPushSender(prisma);
    sender.onModuleInit();

    expect(mockVapid).toHaveBeenCalledWith(
      "mailto:admin@omnidance.cl",
      "PUB",
      "PRIV",
    );

    await sender.sendToPerson("per-1", fakeNotification("per-1"));

    expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
      where: { personId: "per-1" },
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [subscription, payload] = mockSend.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: token.token,
      keys: { p256dh: "P256DH", auth: "AUTH" },
    });
    expect(JSON.parse(payload as string)).toMatchObject({
      type: "session_invite",
      title: "Te invitaron a bailar",
      body: "Ana quiere bailar contigo",
      data: { sessionId: "ses-1" },
    });
  });

  it("respeta WEB_PUSH_SUBJECT cuando está definido", () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "PUB";
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "PRIV";
    process.env.WEB_PUSH_SUBJECT = "mailto:ops@omnidance.cl";
    new WebPushSender(fakePrisma()).onModuleInit();
    expect(mockVapid).toHaveBeenCalledWith(
      "mailto:ops@omnidance.cl",
      "PUB",
      "PRIV",
    );
  });

  it("WEB_PUSH_VAPID_SUBJECT tiene precedencia sobre WEB_PUSH_SUBJECT", () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "PUB";
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "PRIV";
    process.env.WEB_PUSH_VAPID_SUBJECT = "mailto:soporte@omnidance.cl";
    process.env.WEB_PUSH_SUBJECT = "mailto:ops@omnidance.cl";
    new WebPushSender(fakePrisma()).onModuleInit();
    expect(mockVapid).toHaveBeenCalledWith(
      "mailto:soporte@omnidance.cl",
      "PUB",
      "PRIV",
    );
  });

  it.each([404, 410])(
    "sendNotification falla con statusCode %i → borra el PushToken muerto",
    async (statusCode) => {
      process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "PUB";
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "PRIV";
      const token = fakePushToken("per-1");
      const prisma = fakePrisma([token]);
      mockSend.mockRejectedValue({ statusCode });
      const sender = new WebPushSender(prisma);
      sender.onModuleInit();

      await expect(
        sender.sendToPerson("per-1", fakeNotification("per-1")),
      ).resolves.toBeUndefined();
      expect(prisma.pushToken.delete).toHaveBeenCalledWith({
        where: { id: token.id },
      });
    },
  );

  it("otro error (500/red) → no borra el token y nunca propaga", async () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "PUB";
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "PRIV";
    const prisma = fakePrisma([fakePushToken("per-1")]);
    mockSend.mockRejectedValue({ statusCode: 500, message: "boom" });
    const sender = new WebPushSender(prisma);
    sender.onModuleInit();

    await expect(
      sender.sendToPerson("per-1", fakeNotification("per-1")),
    ).resolves.toBeUndefined();
    expect(prisma.pushToken.delete).not.toHaveBeenCalled();
  });
});

// ─── Fan-out en NotificationsService.notify ───
describe("NotificationsService fan-out realtime/push", () => {
  const personId = "per-1";
  let repo: NotificationsRepo;
  let created: Notification;

  beforeEach(() => {
    created = fakeNotification(personId);
    repo = {
      createNotification: vi.fn().mockResolvedValue(created),
    } as unknown as NotificationsRepo;
  });

  const input = {
    category: "SOCIAL" as const,
    type: "session_invite",
    title: "Te invitaron a bailar",
  };

  it("con ambos puertos → emite 'notification' por WS y envía web push", async () => {
    const realtime: RealtimePort = { emitToPerson: vi.fn() };
    const push: PushPort = { sendToPerson: vi.fn().mockResolvedValue(undefined) };
    const svc = new NotificationsService(repo, realtime, push);

    const n = await svc.notify(personId, input);

    expect(n).toBe(created);
    expect(realtime.emitToPerson).toHaveBeenCalledWith(
      personId,
      "notification",
      created,
    );
    expect(push.sendToPerson).toHaveBeenCalledWith(personId, created);
  });

  it("sin puertos registrados → notify funciona igual (inyección opcional)", async () => {
    const svc = new NotificationsService(repo);
    await expect(svc.notify(personId, input)).resolves.toBe(created);
  });

  it("realtime que lanza → notify resuelve igual y push igual se intenta", async () => {
    const realtime: RealtimePort = {
      emitToPerson: vi.fn(() => {
        throw new Error("ws caído");
      }),
    };
    const push: PushPort = { sendToPerson: vi.fn().mockResolvedValue(undefined) };
    const svc = new NotificationsService(repo, realtime, push);

    await expect(svc.notify(personId, input)).resolves.toBe(created);
    expect(push.sendToPerson).toHaveBeenCalled();
  });

  it("push que rechaza → notify resuelve igual", async () => {
    const push: PushPort = {
      sendToPerson: vi.fn().mockRejectedValue(new Error("push down")),
    };
    const svc = new NotificationsService(repo, undefined, push);

    await expect(svc.notify(personId, input)).resolves.toBe(created);
  });
});

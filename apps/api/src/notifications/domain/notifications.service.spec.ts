import { describe, it, expect, beforeEach } from "vitest";
import type { Notification, PushToken } from "@prisma/client";
import {
  notificationLens,
  type NotificationLensFilter,
} from "@omnidance/shared";
import {
  NotificationDomainError,
  NotificationsService,
} from "./notifications.service";
import type {
  CreateNotificationData,
  NotificationsRepo,
  ResolvedListOptions,
} from "./ports";

// Mismo criterio que lensWhere del repo Prisma: la lente excluye los
// types de la opuesta; los "any" cuentan en ambas.
function matchesLens(type: string, lens?: NotificationLensFilter) {
  const l = notificationLens(type);
  return !lens || l === "any" || l === lens;
}

// ─── Fake repo in-memory ───
class FakeNotificationsRepo implements NotificationsRepo {
  notifications: Notification[] = [];
  pushTokens: PushToken[] = [];
  private seq = 0;

  async createNotification(data: CreateNotificationData) {
    const n: Notification = {
      id: `ntf-${++this.seq}`,
      personId: data.personId,
      category: data.category,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      data: (data.data ?? null) as Notification["data"],
      channel: "IN_APP",
      readAt: null,
      createdAt: new Date(Date.now() + this.seq), // orden estable desc
    };
    this.notifications.push(n);
    return n;
  }

  async findNotificationById(id: string) {
    return this.notifications.find((n) => n.id === id) ?? null;
  }

  async listNotifications(
    personId: string,
    opts: ResolvedListOptions,
  ) {
    return this.notifications
      .filter(
        (n) =>
          n.personId === personId &&
          (!opts.unread || n.readAt === null) &&
          matchesLens(n.type, opts.lens),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, opts.limit);
  }

  async countUnread(personId: string, lens?: NotificationLensFilter) {
    return this.notifications.filter(
      (n) =>
        n.personId === personId &&
        n.readAt === null &&
        matchesLens(n.type, lens),
    ).length;
  }

  async markRead(id: string, readAt: Date) {
    const n = this.notifications.find((x) => x.id === id)!;
    n.readAt = readAt;
    return n;
  }

  async markAllRead(personId: string, readAt: Date) {
    let count = 0;
    for (const n of this.notifications) {
      if (n.personId === personId && n.readAt === null) {
        n.readAt = readAt;
        count++;
      }
    }
    return count;
  }

  async upsertPushToken(personId: string, token: string, payload: unknown) {
    const existing = this.pushTokens.find((t) => t.token === token);
    if (existing) {
      existing.personId = personId;
      existing.payload = payload as PushToken["payload"];
      return existing;
    }
    const t: PushToken = {
      id: `pt-${this.pushTokens.length + 1}`,
      personId,
      token,
      payload: payload as PushToken["payload"],
      createdAt: new Date(),
    };
    this.pushTokens.push(t);
    return t;
  }

  async findPushTokenByToken(token: string) {
    return this.pushTokens.find((t) => t.token === token) ?? null;
  }

  async deletePushToken(id: string) {
    this.pushTokens = this.pushTokens.filter((t) => t.id !== id);
  }
}

describe("NotificationsService.notify", () => {
  let repo: FakeNotificationsRepo;
  let svc: NotificationsService;

  beforeEach(() => {
    repo = new FakeNotificationsRepo();
    svc = new NotificationsService(repo);
  });

  it("crea la notificación con category/type/title/body/data", async () => {
    const n = await svc.notify("per-1", {
      category: "SOCIAL",
      type: "session_invite",
      title: "Te invitaron a bailar",
      body: "Ana quiere bailar contigo",
      data: { sessionId: "ses-1" },
    });
    expect(n.personId).toBe("per-1");
    expect(n.category).toBe("SOCIAL");
    expect(n.type).toBe("session_invite");
    expect(n.title).toBe("Te invitaron a bailar");
    expect(n.body).toBe("Ana quiere bailar contigo");
    expect(n.data).toEqual({ sessionId: "ses-1" });
    expect(n.channel).toBe("IN_APP");
    expect(n.readAt).toBeNull();
  });

  it("acepta las 4 categorías válidas", async () => {
    for (const category of [
      "SOCIAL",
      "TRANSACTIONAL",
      "MARKETING",
      "OPERATIONAL",
    ] as const) {
      const n = await svc.notify("per-1", {
        category,
        type: "t",
        title: "t",
      });
      expect(n.category).toBe(category);
    }
  });

  it("category inválida → NotificationDomainError INVALID_CATEGORY", async () => {
    await expect(
      svc.notify("per-1", {
        category: "URGENT" as "SOCIAL",
        type: "t",
        title: "t",
      }),
    ).rejects.toMatchObject({
      name: "NotificationDomainError",
      code: "INVALID_CATEGORY",
    });
    expect(repo.notifications).toHaveLength(0);
  });

  it("body/data son opcionales → null en persistencia", async () => {
    const n = await svc.notify("per-1", {
      category: "OPERATIONAL",
      type: "prime_unlocked",
      title: "Desbloqueaste Prime Time",
    });
    expect(n.body).toBeNull();
    expect(n.data).toBeNull();
  });
});

describe("NotificationsService.listForPerson", () => {
  let repo: FakeNotificationsRepo;
  let svc: NotificationsService;

  beforeEach(() => {
    repo = new FakeNotificationsRepo();
    svc = new NotificationsService(repo);
  });

  it("devuelve notificaciones del usuario ordenadas createdAt desc + unreadCount", async () => {
    const first = await svc.notify("per-1", {
      category: "SOCIAL",
      type: "a",
      title: "primera",
    });
    const second = await svc.notify("per-1", {
      category: "SOCIAL",
      type: "b",
      title: "segunda",
    });
    await svc.notify("otra-persona", {
      category: "SOCIAL",
      type: "c",
      title: "ajena",
    });

    const res = await svc.listForPerson("per-1", {});
    expect(res.notifications.map((n: Notification) => n.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(res.unreadCount).toBe(2);
  });

  it("unread=true filtra las leídas y unreadCount solo cuenta las del usuario", async () => {
    const a = await svc.notify("per-1", {
      category: "SOCIAL",
      type: "a",
      title: "a",
    });
    await svc.notify("per-1", { category: "SOCIAL", type: "b", title: "b" });
    await svc.notify("otra", { category: "SOCIAL", type: "c", title: "c" });
    await svc.markRead("per-1", a.id);

    const res = await svc.listForPerson("per-1", { unread: true });
    expect(res.notifications).toHaveLength(1);
    expect(res.notifications[0].type).toBe("b");
    expect(res.unreadCount).toBe(1);
  });

  it("limit por defecto es 50 y respeta un limit menor", async () => {
    for (let i = 0; i < 60; i++) {
      await svc.notify("per-1", {
        category: "MARKETING",
        type: "promo",
        title: `n${i}`,
      });
    }
    const def = await svc.listForPerson("per-1", {});
    expect(def.notifications).toHaveLength(50);
    const limited = await svc.listForPerson("per-1", { limit: 10 });
    expect(limited.notifications).toHaveLength(10);
  });

  it("lens=social excluye tipos de academia y unreadCount se acota igual", async () => {
    await svc.notify("per-1", {
      category: "SOCIAL",
      type: "session.invite",
      title: "te invitaron",
    });
    await svc.notify("per-1", {
      category: "TRANSACTIONAL",
      type: "payment.series_pass",
      title: "pase de serie",
    });
    await svc.notify("per-1", {
      category: "OPERATIONAL",
      type: "account.complete_profile",
      title: "completa tu perfil",
    });

    const res = await svc.listForPerson("per-1", { lens: "social" });
    expect(res.notifications.map((n) => n.type)).toEqual([
      "account.complete_profile",
      "session.invite",
    ]);
    expect(res.unreadCount).toBe(2);
  });

  it("lens=academy excluye tipos sociales; los 'any' quedan en ambas", async () => {
    await svc.notify("per-1", {
      category: "SOCIAL",
      type: "ticket.gifted",
      title: "te regalaron",
    });
    await svc.notify("per-1", {
      category: "TRANSACTIONAL",
      type: "payment.paid",
      title: "pago ok",
    });
    await svc.notify("per-1", {
      category: "TRANSACTIONAL",
      type: "class.waitlist.promoted",
      title: "entras a la clase",
    });
    await svc.notify("per-1", {
      category: "OPERATIONAL",
      type: "crm.campaign",
      title: "campaña",
    });

    const res = await svc.listForPerson("per-1", { lens: "academy" });
    expect(res.notifications.map((n) => n.type)).toEqual([
      "crm.campaign",
      "class.waitlist.promoted",
    ]);
    expect(res.unreadCount).toBe(2);
  });
});

describe("NotificationsService.markRead", () => {
  let repo: FakeNotificationsRepo;
  let svc: NotificationsService;

  beforeEach(() => {
    repo = new FakeNotificationsRepo();
    svc = new NotificationsService(repo);
  });

  it("marca readAt en notificación propia", async () => {
    const n = await svc.notify("per-1", {
      category: "SOCIAL",
      type: "a",
      title: "a",
    });
    const updated = await svc.markRead("per-1", n.id);
    expect(updated.readAt).toBeInstanceOf(Date);
  });

  it("notificación inexistente → NOT_FOUND", async () => {
    await expect(svc.markRead("per-1", "no-existe")).rejects.toMatchObject({
      name: "NotificationDomainError",
      code: "NOT_FOUND",
    });
  });

  it("notificación de otra persona → FORBIDDEN y no la marca", async () => {
    const n = await svc.notify("per-2", {
      category: "SOCIAL",
      type: "a",
      title: "a",
    });
    await expect(svc.markRead("per-1", n.id)).rejects.toMatchObject({
      name: "NotificationDomainError",
      code: "FORBIDDEN",
    });
    expect(repo.notifications[0].readAt).toBeNull();
  });

  it("ya leída → idempotente, conserva el primer readAt", async () => {
    const n = await svc.notify("per-1", {
      category: "SOCIAL",
      type: "a",
      title: "a",
    });
    const first = await svc.markRead("per-1", n.id);
    const second = await svc.markRead("per-1", n.id);
    expect(second.readAt).toEqual(first.readAt);
  });
});

describe("NotificationsService.markAllRead", () => {
  it("marca todas las del usuario, deja intactas las ajenas y retorna el count", async () => {
    const repo = new FakeNotificationsRepo();
    const svc = new NotificationsService(repo);
    await svc.notify("per-1", { category: "SOCIAL", type: "a", title: "a" });
    await svc.notify("per-1", { category: "SOCIAL", type: "b", title: "b" });
    const ajena = await svc.notify("per-2", {
      category: "SOCIAL",
      type: "c",
      title: "c",
    });

    const updated = await svc.markAllRead("per-1");
    expect(updated).toBe(2);
    expect((await repo.findNotificationById(ajena.id))!.readAt).toBeNull();
    const res = await svc.listForPerson("per-1", {});
    expect(res.unreadCount).toBe(0);
  });
});

describe("NotificationsService push tokens", () => {
  let repo: FakeNotificationsRepo;
  let svc: NotificationsService;

  beforeEach(() => {
    repo = new FakeNotificationsRepo();
    svc = new NotificationsService(repo);
  });

  it("registerPushToken crea token nuevo con la plataforma en payload", async () => {
    const t = await svc.registerPushToken("per-1", "tok-abc", "WEB");
    expect(t.personId).toBe("per-1");
    expect(t.token).toBe("tok-abc");
    expect(t.payload).toEqual({ platform: "WEB" });
  });

  it("registerPushToken con token existente → upsert (no duplica, actualiza)", async () => {
    const first = await svc.registerPushToken("per-1", "tok-abc", "WEB");
    const second = await svc.registerPushToken("per-1", "tok-abc", "ANDROID");
    expect(repo.pushTokens).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.payload).toEqual({ platform: "ANDROID" });
  });

  it("plataforma inválida → NotificationDomainError INVALID_PLATFORM", async () => {
    await expect(
      svc.registerPushToken("per-1", "tok", "SMART_TV" as "WEB"),
    ).rejects.toMatchObject({
      name: "NotificationDomainError",
      code: "INVALID_PLATFORM",
    });
  });

  it("removePushToken elimina el token propio", async () => {
    await svc.registerPushToken("per-1", "tok-abc", "IOS");
    await svc.removePushToken("per-1", "tok-abc");
    expect(repo.pushTokens).toHaveLength(0);
  });

  it("removePushToken inexistente → NOT_FOUND", async () => {
    await expect(
      svc.removePushToken("per-1", "no-existe"),
    ).rejects.toMatchObject({
      name: "NotificationDomainError",
      code: "NOT_FOUND",
    });
  });

  it("removePushToken de otra persona → FORBIDDEN y no lo borra", async () => {
    await svc.registerPushToken("per-2", "tok-abc", "WEB");
    await expect(
      svc.removePushToken("per-1", "tok-abc"),
    ).rejects.toMatchObject({
      name: "NotificationDomainError",
      code: "FORBIDDEN",
    });
    expect(repo.pushTokens).toHaveLength(1);
  });

  it("errores de dominio son instancias de NotificationDomainError", async () => {
    await expect(svc.markRead("p", "x")).rejects.toBeInstanceOf(
      NotificationDomainError,
    );
  });
});

// Convención push-copy (openspec push-copy-precision): title = outcome
// corto — sin prefijos de categoría ("Pago confirmado —"), sin punto
// final, ≤ 40 chars sin interpolar. Spot-check sobre los literales que
// emiten los call sites cubiertos por la tabla verbatim.
describe("push-copy: convención de titles", () => {
  const titles = [
    "Ticket listo",
    "Cupo reservado",
    "En lista de espera",
    "Pase de serie activo",
    "Plan activo",
    "Clase particular comprada",
    "Pago fallido",
    "Monto distinto al de la orden",
    "Suscripción activa",
    "Suscripción cancelada",
    "Renovación mañana",
    "Cobro fallido",
    "Conseguiste cupo",
    "Cupo liberado",
    "Mesa confirmada",
    "Mesa no confirmada",
    "Nueva solicitud de mesa",
    "Clase particular agendada",
    "Clase particular asignada",
    "Clase particular cancelada",
    "Clase particular vendida",
    "Comisión liquidada",
    "Completa tu perfil",
  ];

  it.each(titles)("title %j tiene ≤ 40 chars y no termina en punto", (t) => {
    expect(t.length).toBeLessThanOrEqual(40);
    expect(t.endsWith(".")).toBe(false);
  });

  it("ningún title usa el prefijo 'Pago confirmado —'", () => {
    for (const t of titles) {
      expect(t.startsWith("Pago confirmado")).toBe(false);
    }
  });
});

// @vitest-environment happy-dom
/**
 * Cobertura del mapa tipo→destino (change
 * notification-deeplink-coverage): familias sin destino previo,
 * payment.paid polimórfico por payload, discriminación por category
 * y fallback data.path→data.url.
 */
import { describe, expect, it } from "vitest";
import { notificationHref, type NavNotification } from "./notification-nav";

const n = (
  type: string,
  data?: Record<string, unknown>,
  category?: string,
): NavNotification => ({ type, data, category });

describe("notificationHref - payment.paid polimórfico", () => {
  it("ticket → /eventos?view=mios", () => {
    expect(n("payment.paid", { eventId: "ev-1" }).type).toBe("payment.paid");
    expect(notificationHref(n("payment.paid", { eventId: "ev-1" }))).toBe(
      "/eventos?view=mios",
    );
  });

  it("clase suelta (classId) → /clases/:id", () => {
    expect(notificationHref(n("payment.paid", { classId: "cl-1" }))).toBe(
      "/clases/cl-1",
    );
  });

  it("clase particular (lessonId) → /clases?scope=reservadas", () => {
    expect(
      notificationHref(n("payment.paid", { lessonId: "ls-1", academyId: "a" })),
    ).toBe("/clases?scope=reservadas");
  });

  it("cobro de plataforma (orderType) → /perfil/pagos", () => {
    expect(
      notificationHref(n("payment.paid", { orderType: "PLATFORM_CHARGE" })),
    ).toBe("/perfil/pagos");
  });
});

describe("notificationHref - private lessons por audiencia", () => {
  it("cancelled_paid (owner) → consola particulares", () => {
    expect(
      notificationHref(n("academy.private_lesson.cancelled_paid")),
    ).toBe("/academia/particulares");
  });

  it("sold (owner) → consola particulares", () => {
    expect(notificationHref(n("academy.private_lesson.sold"))).toBe(
      "/academia/particulares",
    );
  });

  it("commission_paid (instructor) → consola particulares", () => {
    expect(notificationHref(n("private_lesson.commission_paid"))).toBe(
      "/academia/particulares",
    );
  });

  it("assigned OPERATIONAL (instructor) → particulares", () => {
    expect(
      notificationHref(
        n("academy.private_lesson.assigned", undefined, "OPERATIONAL"),
      ),
    ).toBe("/academia/particulares");
  });

  it("assigned TRANSACTIONAL (alumno) → reservadas", () => {
    expect(
      notificationHref(
        n("academy.private_lesson.assigned", undefined, "TRANSACTIONAL"),
      ),
    ).toBe("/clases?scope=reservadas");
  });
});

describe("notificationHref - familias academy/producer", () => {
  it("membership.subscription_started → /perfil/pagos", () => {
    expect(notificationHref(n("membership.subscription_started"))).toBe(
      "/perfil/pagos",
    );
  });

  it("membership.transfer_renewal con academyId → ficha academia", () => {
    expect(
      notificationHref(n("membership.transfer_renewal", { academyId: "ac-1" })),
    ).toBe("/academias/ac-1");
  });

  it("academy.subscription_canceled → suscripción de la consola", () => {
    expect(notificationHref(n("academy.subscription_canceled"))).toBe(
      "/academia/configuracion/suscripcion",
    );
  });

  it("academy.billing_blocked → suscripción de la consola", () => {
    expect(notificationHref(n("academy.billing_blocked"))).toBe(
      "/academia/configuracion/suscripcion",
    );
  });

  it("academy.legacy_subs_migrated → métodos de pago", () => {
    expect(notificationHref(n("academy.legacy_subs_migrated"))).toBe(
      "/academia/configuracion/metodos-de-pago",
    );
  });

  it("producer.pro_upgrade_required → suscripción del productor", () => {
    expect(notificationHref(n("producer.pro_upgrade_required"))).toBe(
      "/productor/suscripcion",
    );
  });

  it("academy.collections_statement con period → liquidación", () => {
    expect(
      notificationHref(
        n("academy.collections_statement", { period: "2026-10" }),
      ),
    ).toBe("/academia/cobros/liquidaciones/2026-10");
  });

  it("academy.collections_blocked → cobros", () => {
    expect(notificationHref(n("academy.collections_blocked"))).toBe(
      "/academia/cobros",
    );
  });

  it("academy.plan_expiring → ficha de la academia", () => {
    expect(
      notificationHref(n("academy.plan_expiring", { academyId: "ac-1" })),
    ).toBe("/academias/ac-1");
  });

  it("academy.sale_deal.invited → ficha del acuerdo", () => {
    expect(
      notificationHref(n("academy.sale_deal.invited", { agreementId: "ag-9" })),
    ).toBe("/academia/preventas/ag-9");
  });

  it("payment.membership.received → cobros de la consola", () => {
    expect(notificationHref(n("payment.membership.received"))).toBe(
      "/academia/cobros",
    );
  });

  it("payment.membership → /perfil/pagos", () => {
    expect(notificationHref(n("payment.membership"))).toBe("/perfil/pagos");
  });

  it("payment.series_pass → /clases", () => {
    expect(notificationHref(n("payment.series_pass"))).toBe("/clases");
  });
});

describe("notificationHref - mesas, CRM y admin", () => {
  it("table.confirmed → evento", () => {
    expect(notificationHref(n("table.confirmed", { eventId: "ev-1" }))).toBe(
      "/eventos/ev-1",
    );
  });

  it("crm.digest → /crm", () => {
    expect(notificationHref(n("crm.digest"))).toBe("/crm");
  });

  it("crm.segment.enter OPERATIONAL → ficha del segmento", () => {
    expect(
      notificationHref(
        n("crm.segment.enter", { segmentId: "sg-1" }, "OPERATIONAL"),
      ),
    ).toBe("/crm/segmentos/sg-1");
  });

  it("crm.segment.exit MARKETING → sin destino (centro)", () => {
    expect(
      notificationHref(n("crm.segment.exit", { segmentId: "sg-1" }, "MARKETING")),
    ).toBeNull();
  });

  it("crm.winback con actorType ACADEMY → ficha de la academia", () => {
    expect(
      notificationHref(
        n("crm.winback", { actorType: "ACADEMY", actorId: "ac-1" }),
      ),
    ).toBe("/academias/ac-1");
  });

  it("user.registered → ficha admin de la persona", () => {
    expect(notificationHref(n("user.registered", { personId: "p-1" }))).toBe(
      "/admin/usuarios/p-1",
    );
  });

  it("payment.confirmed → transacciones admin", () => {
    expect(notificationHref(n("payment.confirmed"))).toBe(
      "/admin/facturacion/transacciones",
    );
  });

  it("class.instructor_assigned → ficha de la serie", () => {
    expect(
      notificationHref(n("class.instructor_assigned", { seriesId: "s-1" })),
    ).toBe("/academia/series/s-1");
  });

  it("lead.new → sin destino (centro por diseño)", () => {
    expect(notificationHref(n("lead.new"))).toBeNull();
  });
});

describe("notificationHref - fallback path/url", () => {
  it("lee data.url cuando no hay path (class.reminder)", () => {
    expect(
      notificationHref(n("class.reminder", { url: "/clases/cl-9" })),
    ).toBe("/clases/cl-9");
  });

  it("data.path tiene precedencia sobre data.url", () => {
    expect(
      notificationHref(n("x", { path: "/a", url: "/b" })),
    ).toBe("/a");
  });

  it("url externa se rechaza (safeInternalPath)", () => {
    expect(
      notificationHref(n("x", { url: "https://evil.com/x" })),
    ).toBeNull();
  });
});

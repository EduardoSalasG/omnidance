"use strict";

// backfill-activity-events.cjs — ONE-SHOT (spec platform-trials, task 5b).
//
//   cd apps/api && node scripts/backfill-activity-events.cjs          # dry-run
//   cd apps/api && node scripts/backfill-activity-events.cjs --apply  # inserta
//
// Siembra la línea de vida admin (ActivityEvent) con la historia
// derivable de las tablas de dominio - lo que ocurrió antes de que el
// runtime emitiera en caliente:
//   person.registered  ← Person.createdAt
//   role.requested     ← PersonRole PENDING/REJECTED, o APPROVED con
//                        audit de transición (createdAt del PersonRole)
//   role.approved      ← AuditLog ROLE_APPROVE / ROLE_SET(next=APPROVED);
//                        fallback PersonRole.createdAt si APPROVED sin audit
//   trial.started      ← Academy.createdAt / aprobación del rol PRODUCER
//                        (fallback proTrialEndsAt - producer_pro.trial_days)
//   trial.ending       ← trialEndNotifiedAt / proTrialEndNotifiedAt
//   trial.ended        ← endsAt vencida sin conversión (expired) o actor
//                        con tier proyectado (converted, at ≈ primer cobro)
//   trial.adjusted     ← AuditLog TRIAL_SET (target Academy|Person)
//   sub.started        ← subs que llegaron a ACTIVE (at ≈ primer cobro
//                        PAID o createdAt)
//   sub.renewed        ← pagos PLATFORM_SUB PAID posteriores al primero
//   sub.canceled       ← canceledAt (to = status actual)
//   billing.blocked    ← Academy.billingBlockedAt
//   enrollment.started ← Enrollment.startedAt
//   payment.paid       ← Payment PAID (gatewayPaidAt ?? createdAt)
//
// Dedup por llave natural por tipo (dedupKey): los eventos que el
// runtime ya emitió comparten llave y se omiten - re-correr es no-op.
// access.ended no se deriva acá: a los actores con entitlement huérfano
// los cubre backfill-churn-entitlements.cjs y a los cortes nuevos el
// runtime en applyChurnCut.
//
// El núcleo (planActivityBackfill / dedupKey) se exporta para el spec
// src/common/activity-backfill.spec.ts - solo main() toca PrismaClient.

const DAY_MS = 86_400_000;
const CL_TZ = "America/Santiago";
const clFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYYMMDD del día en Santiago - key de la promo diaria trial-conv-*. */
const clDayKey = (d) => clFmt.format(d).replaceAll("-", "");

// Subs que en algún momento activaron (CANCELED lo estuvo antes de salir).
const WAS_LIVE = new Set(["ACTIVE", "CANCEL_PENDING", "CANCELED"]);

const paidAt = (p) => p.gatewayPaidAt ?? p.createdAt;

/**
 * Llave de dedup por tipo - runtime y backfill producen la misma llave
 * para el mismo hecho:
 * - Con ref estable: (type, refType, refId), igual que emitActivityOnce.
 * - trial.started / trial.ending: sin ref en runtime; un episodio
 *   derivable por actor (scope academy|person - notifiedAt es una sola
 *   columna por actor).
 * - trial.ended: episodio = endsAt (un trial re-extendido re-emite; el
 *   mismo criterio de emitTrialEnded con data.endsAt).
 * - trial.adjusted / billing.blocked: refId + valor resultante - cada
 *   ajuste/bloqueo es un hecho distinto sobre el mismo ref.
 */
function dedupKey(e) {
  switch (e.type) {
    case "trial.started":
    case "trial.ending":
      return `${e.type}|${e.academyId ? "A" : "P"}:${e.academyId ?? e.personId}`;
    case "trial.ended":
      return `trial.ended|${e.academyId ? "A" : "P"}:${e.academyId ?? e.personId}|${
        e.data?.endsAt ?? ""
      }`;
    case "trial.adjusted":
      return `trial.adjusted|${e.refId}|${e.data?.next ?? ""}`;
    case "billing.blocked":
      return `billing.blocked|${e.refId}|${e.data?.blockedAt ?? ""}`;
    default:
      return `${e.type}|${e.refType ?? ""}|${e.refId ?? ""}`;
  }
}

/**
 * Deriva los eventos históricos y descarta los ya presentes. Devuelve
 * { events, derived, skipped } - events viene ordenado por `at` asc.
 * No escribe nada; la inserción la hace el caller (dry-run seguro).
 */
async function planActivityBackfill(prisma, { now = new Date() } = {}) {
  const [
    persons,
    roles,
    academies,
    subs,
    payments,
    enrollments,
    audits,
    promos,
    paramRows,
    existing,
  ] = await Promise.all([
    prisma.person.findMany({
      select: {
        id: true,
        createdAt: true,
        proTier: true,
        proTrialEndsAt: true,
        proTrialEndNotifiedAt: true,
      },
    }),
    prisma.personRole.findMany({
      select: { id: true, personId: true, role: true, status: true, createdAt: true },
    }),
    prisma.academy.findMany({
      select: {
        id: true,
        ownerId: true,
        createdAt: true,
        tier: true,
        trialEndsAt: true,
        trialEndNotifiedAt: true,
        billingBlockedAt: true,
      },
    }),
    prisma.platformSubscription.findMany({
      select: {
        id: true,
        kind: true,
        academyId: true,
        producerId: true,
        personId: true,
        tierCode: true,
        billingCycle: true,
        status: true,
        createdAt: true,
        canceledAt: true,
      },
    }),
    prisma.payment.findMany({
      where: { status: "PAID" },
      select: {
        id: true,
        personId: true,
        orderType: true,
        refId: true,
        amount: true,
        currency: true,
        gatewayPaidAt: true,
        createdAt: true,
      },
    }),
    prisma.enrollment.findMany({
      select: { id: true, personId: true, academyId: true, planId: true, startedAt: true },
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ["ROLE_APPROVE", "ROLE_SET", "TRIAL_SET"] } },
      select: { action: true, targetType: true, targetId: true, payload: true, actorId: true, createdAt: true },
    }),
    prisma.platformPromo.findMany({
      where: { name: { startsWith: "trial-conv-" } },
      select: { id: true, name: true },
    }),
    prisma.platformParam.findMany({
      where: { key: { in: ["producer_pro.trial_days", "academy_billing.trial_days"] } },
      select: { key: true, value: true },
    }),
    prisma.activityEvent.findMany({
      select: { type: true, refType: true, refId: true, personId: true, academyId: true, data: true },
    }),
  ]);

  const paramNum = (key, fallback) => {
    const v = paramRows.find((r) => r.key === key)?.value;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const academyTrialDays = paramNum("academy_billing.trial_days", 15);
  const producerTrialDays = paramNum("producer_pro.trial_days", 15);

  const academyById = new Map(academies.map((a) => [a.id, a]));
  const promoByName = new Map(promos.map((p) => [p.name, p]));

  // Pagos PLATFORM_SUB PAID por subId (platsub_<subId>_<invoice>), asc.
  const platsubPaysBySubId = new Map();
  for (const pay of payments) {
    if (pay.orderType !== "PLATFORM_SUB" || !pay.refId?.startsWith("platsub_")) {
      continue;
    }
    const subId = pay.refId.split("_")[1];
    const list = platsubPaysBySubId.get(subId) ?? [];
    list.push(pay);
    platsubPaysBySubId.set(subId, list);
  }
  for (const list of platsubPaysBySubId.values()) {
    list.sort((a, b) => paidAt(a) - paidAt(b));
  }
  /** Instante de conversión del actor: primer cobro PAID de su primera
      sub que llegó a ACTIVE (aprox. del alta real). */
  const conversionAt = (subsOfActor) => {
    let t = null;
    for (const s of subsOfActor) {
      if (!WAS_LIVE.has(s.status)) continue;
      const first = platsubPaysBySubId.get(s.id)?.[0];
      const at = first ? paidAt(first) : s.createdAt;
      if (!t || at < t) t = at;
    }
    return t;
  };

  // Audit de aprobación más antiguo por PersonRole.
  const approveAuditByRole = new Map();
  for (const au of audits) {
    if (au.targetType !== "PersonRole") continue;
    const approves =
      au.action === "ROLE_APPROVE" ||
      (au.action === "ROLE_SET" && au.payload?.next === "APPROVED");
    if (!approves) continue;
    const prev = approveAuditByRole.get(au.targetId);
    if (!prev || au.createdAt < prev.createdAt) {
      approveAuditByRole.set(au.targetId, au);
    }
  }

  const events = [];
  const push = (e) => events.push(e);

  // ── Registro y roles ─────────────────────────────────────────────
  for (const p of persons) {
    push({
      type: "person.registered",
      personId: p.id,
      refType: "Person",
      refId: p.id,
      at: p.createdAt,
      data: { via: "backfill" },
    });
  }
  // Instante de aprobación del rol PRODUCER por persona - ancla del
  // trial.started derivado (el grant corre en la aprobación).
  const producerApprovedAt = new Map();
  for (const r of roles) {
    const audit = approveAuditByRole.get(r.id);
    // requested solo si pasó por la cola: creado PENDING, rechazado, o
    // aprobado en una transición real (queue o setRole desde PENDING).
    const wentThroughQueue =
      r.status === "PENDING" ||
      r.status === "REJECTED" ||
      (audit &&
        (audit.action === "ROLE_APPROVE" || Boolean(audit.payload?.prev)));
    if (wentThroughQueue) {
      push({
        type: "role.requested",
        personId: r.personId,
        refType: "PersonRole",
        refId: r.id,
        at: r.createdAt,
        data: { role: r.role, via: "backfill" },
      });
    }
    if (r.status === "APPROVED") {
      const at = audit?.createdAt ?? r.createdAt;
      push({
        type: "role.approved",
        personId: r.personId,
        refType: "PersonRole",
        refId: r.id,
        at,
        data: { role: r.role, via: "backfill" },
      });
      if (r.role === "PRODUCER") {
        const cur = producerApprovedAt.get(r.personId);
        if (!cur || at < cur) producerApprovedAt.set(r.personId, at);
      }
    }
  }

  // ── Trials ───────────────────────────────────────────────────────
  for (const a of academies) {
    if (!a.trialEndsAt) continue;
    push({
      type: "trial.started",
      personId: a.ownerId,
      academyId: a.id,
      at: a.createdAt,
      data: {
        kind: "ACADEMY",
        via: "backfill",
        days: academyTrialDays,
        endsAt: a.trialEndsAt.toISOString(),
      },
    });
  }
  for (const p of persons) {
    if (!p.proTrialEndsAt) continue;
    push({
      type: "trial.started",
      personId: p.id,
      at:
        producerApprovedAt.get(p.id) ??
        new Date(p.proTrialEndsAt.getTime() - producerTrialDays * DAY_MS),
      data: {
        kind: "PRODUCER",
        via: "backfill",
        days: producerTrialDays,
        endsAt: p.proTrialEndsAt.toISOString(),
      },
    });
  }
  for (const a of academies) {
    if (!a.trialEndNotifiedAt) continue;
    const promoName = `trial-conv-${clDayKey(a.trialEndNotifiedAt)}`;
    const promo = promoByName.get(promoName);
    push({
      type: "trial.ending",
      personId: a.ownerId,
      academyId: a.id,
      refType: "PlatformPromo",
      ...(promo ? { refId: promo.id } : {}),
      at: a.trialEndNotifiedAt,
      data: { kind: "ACADEMY", promo: promoName, via: "backfill" },
    });
  }
  for (const p of persons) {
    if (!p.proTrialEndNotifiedAt) continue;
    const promoName = `trial-conv-${clDayKey(p.proTrialEndNotifiedAt)}`;
    const promo = promoByName.get(promoName);
    push({
      type: "trial.ending",
      personId: p.id,
      refType: "PlatformPromo",
      ...(promo ? { refId: promo.id } : {}),
      at: p.proTrialEndNotifiedAt,
      data: { kind: "PRODUCER", promo: promoName, via: "backfill" },
    });
  }
  // trial.ended: mismas reglas de emitTrialEnded - expired si endsAt ya
  // pasó en el instante de referencia (conversión o ahora), converted si
  // la sub activó antes del vencimiento.
  const pushTrialEnded = ({ kind, personId, academyId, endsAt, convAt }) => {
    const ref = convAt ?? now;
    const expired = endsAt <= ref;
    // !expired && !convAt: sigue en trial (o tier manual sin sub - sin
    // fecha observable de corte, no hay hecho que registrar).
    if (!expired && !convAt) return;
    push({
      type: "trial.ended",
      personId,
      ...(academyId ? { academyId } : {}),
      at: expired ? endsAt : convAt,
      data: {
        kind,
        endsAt: endsAt.toISOString(),
        outcome: expired ? "expired" : "converted",
        via: "backfill",
      },
    });
  };
  for (const a of academies) {
    if (!a.trialEndsAt) continue;
    const subsOf = subs.filter((s) => s.kind === "ACADEMY" && s.academyId === a.id);
    // Sin tier el actor no convirtió: convAt nulo con endsAt vencida da
    // expired (mismo resultado que el barrido sweepTrialEnded).
    pushTrialEnded({
      kind: "ACADEMY",
      personId: a.ownerId,
      academyId: a.id,
      endsAt: a.trialEndsAt,
      convAt: a.tier == null ? null : conversionAt(subsOf),
    });
  }
  for (const p of persons) {
    if (!p.proTrialEndsAt) continue;
    const subsOf = subs.filter((s) => s.kind === "PRODUCER" && s.producerId === p.id);
    const convAt = p.proTier === "FREE" ? null : conversionAt(subsOf);
    pushTrialEnded({
      kind: "PRODUCER",
      personId: p.id,
      endsAt: p.proTrialEndsAt,
      convAt,
    });
  }
  for (const au of audits) {
    if (au.action !== "TRIAL_SET") continue;
    const isAcademy = au.targetType === "Academy";
    const payload = au.payload ?? {};
    push({
      type: "trial.adjusted",
      personId: isAcademy ? academyById.get(au.targetId)?.ownerId : au.targetId,
      ...(isAcademy ? { academyId: au.targetId } : {}),
      refType: au.targetType,
      refId: au.targetId,
      at: au.createdAt,
      data: {
        prev: payload.prev ?? null,
        next: payload.next ?? null,
        by: au.actorId ?? null,
        via: "backfill",
      },
    });
  }

  // ── Suscripciones de plataforma ──────────────────────────────────
  for (const s of subs) {
    if (WAS_LIVE.has(s.status)) {
      const first = platsubPaysBySubId.get(s.id)?.[0];
      push({
        type: "sub.started",
        personId: s.personId,
        ...(s.academyId ? { academyId: s.academyId } : {}),
        refType: "PlatformSubscription",
        refId: s.id,
        at: first ? paidAt(first) : s.createdAt,
        data: {
          kind: s.kind,
          tierCode: s.tierCode,
          cycle: s.billingCycle,
          via: "backfill",
        },
      });
    }
    if (s.canceledAt && (s.status === "CANCEL_PENDING" || s.status === "CANCELED")) {
      push({
        type: "sub.canceled",
        personId: s.personId,
        ...(s.academyId ? { academyId: s.academyId } : {}),
        refType: "PlatformSubscription",
        refId: s.id,
        at: s.canceledAt,
        data: { kind: s.kind, to: s.status, via: "backfill" },
      });
    }
    // Renovaciones: pagos PLATFORM_SUB PAID después del primero (el
    // primero es la activación = sub.started).
    for (const pay of (platsubPaysBySubId.get(s.id) ?? []).slice(1)) {
      push({
        type: "sub.renewed",
        personId: s.personId,
        ...(s.academyId ? { academyId: s.academyId } : {}),
        refType: "Payment",
        refId: pay.id,
        at: paidAt(pay),
        data: {
          kind: s.kind,
          tierCode: s.tierCode,
          cycle: s.billingCycle,
          via: "backfill",
        },
      });
    }
  }

  // ── Mora, inscripciones y pagos ──────────────────────────────────
  for (const a of academies) {
    if (!a.billingBlockedAt) continue;
    push({
      type: "billing.blocked",
      personId: a.ownerId,
      academyId: a.id,
      refType: "Academy",
      refId: a.id,
      at: a.billingBlockedAt,
      data: { blockedAt: a.billingBlockedAt.toISOString(), via: "backfill" },
    });
  }
  for (const e of enrollments) {
    push({
      type: "enrollment.started",
      personId: e.personId,
      academyId: e.academyId,
      refType: "Enrollment",
      refId: e.id,
      at: e.startedAt,
      data: { planId: e.planId ?? null, via: "backfill" },
    });
  }
  for (const p of payments) {
    push({
      type: "payment.paid",
      personId: p.personId,
      refType: "Payment",
      refId: p.id,
      at: paidAt(p),
      data: {
        orderType: p.orderType,
        amount: p.amount,
        currency: p.currency ?? "CLP",
        via: "backfill",
      },
    });
  }

  // Saneo de FKs peladas: personId/academyId huérfanos (p.ej. personas
  // borradas con pagos históricos, audits de academias eliminadas)
  // romperían el insert - ActivityEvent tiene FK real en ambas. El
  // timeline solo se lee por actor, así que un evento sin ninguna
  // referencia válida no aporta y se descarta.
  const personIds = new Set(persons.map((p) => p.id));
  const academyIds = new Set(academies.map((a) => a.id));
  const sanitized = [];
  let dropped = 0;
  for (const e of events) {
    if (e.personId && !personIds.has(e.personId)) e.personId = undefined;
    if (e.academyId && !academyIds.has(e.academyId)) e.academyId = undefined;
    if (e.personId || e.academyId) {
      sanitized.push(e);
    } else {
      dropped++;
    }
  }

  // Dedup contra lo ya registrado (misma llave que emitActivityOnce /
  // emitTrialEnded para los tipos con ref o con episodio por endsAt).
  const seen = new Set(existing.map(dedupKey));
  const fresh = sanitized.filter((e) => !seen.has(dedupKey(e)));
  fresh.sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
  return {
    events: fresh,
    derived: events.length,
    skipped: sanitized.length - fresh.length,
    dropped,
  };
}

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const apply = process.argv.includes("--apply");
  try {
    const plan = await planActivityBackfill(prisma);
    const byType = new Map();
    for (const e of plan.events) {
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    }
    console.log(
      `${apply ? "APLICANDO" : "DRY-RUN"} backfill de ActivityEvent - ${plan.derived} derivados, ${plan.skipped} ya existían, ${plan.dropped} sin actor válido`,
    );
    for (const [type, n] of [...byType.entries()].sort()) {
      console.log(`  ${type.padEnd(20)} ${n}`);
    }
    if (!apply) {
      console.log("\n(dry-run: sin escrituras - re-corre con --apply tras revisar)");
      return;
    }
    if (plan.events.length) {
      await prisma.activityEvent.createMany({
        data: plan.events.map((e) => ({
          type: e.type,
          personId: e.personId ?? null,
          academyId: e.academyId ?? null,
          refType: e.refType ?? null,
          refId: e.refId ?? null,
          ...(e.data ? { data: e.data } : {}),
          createdAt: e.at ?? new Date(),
        })),
      });
    }
    console.log(`\nInsertados: ${plan.events.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

module.exports = { planActivityBackfill, dedupKey, clDayKey };

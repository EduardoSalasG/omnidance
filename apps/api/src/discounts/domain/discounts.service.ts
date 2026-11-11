import type { DiscountCode, DiscountCodeType } from "@prisma/client";
import type {
  DiscountCodeFilter,
  DiscountsRepo,
  ListedDiscountCode,
  ListedRedemption,
  PagedList,
} from "./ports";

/** Tipos cerrados de discount_code (spec omni-dance.md - no libre). */
export const DISCOUNT_CODE_TYPES = [
  "CUMPLEANOS",
  "CORTESIA",
  "CASO_BORDE_PUERTA",
  "CAMPAIGN",
  "WINBACK",
  "STAFF_COMP",
] as const satisfies readonly DiscountCodeType[];

export class InvalidDiscountCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDiscountCodeError";
  }
}

export class DuplicateDiscountCodeError extends Error {
  constructor(public readonly code: string) {
    super(`código de descuento duplicado: ${code}`);
    this.name = "DuplicateDiscountCodeError";
  }
}

export class DiscountCodeNotFoundError extends Error {
  constructor(public readonly codeId: string) {
    super(`código de descuento no encontrado: ${codeId}`);
    this.name = "DiscountCodeNotFoundError";
  }
}

/** El evento/serie del scope no existe (create scoped). */
export class DiscountScopeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscountScopeNotFoundError";
  }
}

/** El recurso scoped pertenece a otro actor (spec event-access-scope). */
export class DiscountForbiddenError extends Error {
  constructor() {
    super("requiere ser dueño del evento/serie o admin");
    this.name = "DiscountForbiddenError";
  }
}

interface CreateDiscountCodeInput {
  code: string;
  /** Validado contra DISCOUNT_CODE_TYPES - string para no acoplar al enum. */
  type: string;
  eventId?: string;
  seriesId?: string;
  percentOff?: number;
  amountOff?: number;
  maxUses?: number;
  expiresAt?: Date;
}

interface ValidatedDiscountCode {
  code: string;
  type: DiscountCodeType;
  eventId: string | null;
  seriesId: string | null;
  percentOff: number | null;
  amountOff: number | null;
  maxUses: number | null;
  expiresAt: Date | null;
}

/**
 * Validación pura de creación (spec omni-dance.md):
 * - `type` es enum cerrado - cualquier otro se rechaza.
 * - percentOff XOR amountOff: exactamente uno, nunca ambos ni ninguno.
 * - percentOff ∈ 1..100, amountOff > 0, maxUses ≥ 1 si viene.
 */
export function validateCreateCode(
  input: CreateDiscountCodeInput,
): ValidatedDiscountCode {
  const code = input.code?.trim() ?? "";
  if (!code) {
    throw new InvalidDiscountCodeError("code es requerido");
  }

  if (!(DISCOUNT_CODE_TYPES as readonly string[]).includes(input.type)) {
    throw new InvalidDiscountCodeError(
      `type inválido: ${input.type} - debe ser uno de ${DISCOUNT_CODE_TYPES.join(", ")}`,
    );
  }

  const hasPercent = input.percentOff !== undefined && input.percentOff !== null;
  const hasAmount = input.amountOff !== undefined && input.amountOff !== null;
  if (hasPercent && hasAmount) {
    throw new InvalidDiscountCodeError(
      "percentOff y amountOff son mutuamente excluyentes",
    );
  }
  if (!hasPercent && !hasAmount) {
    throw new InvalidDiscountCodeError(
      "debe indicar percentOff o amountOff",
    );
  }
  if (hasPercent) {
    const p = input.percentOff!;
    if (!Number.isInteger(p) || p < 1 || p > 100) {
      throw new InvalidDiscountCodeError(
        "percentOff debe ser un entero entre 1 y 100",
      );
    }
  }
  if (hasAmount) {
    const a = input.amountOff!;
    if (!Number.isInteger(a) || a <= 0) {
      throw new InvalidDiscountCodeError(
        "amountOff debe ser un entero positivo (CLP)",
      );
    }
  }
  if (
    input.maxUses !== undefined &&
    input.maxUses !== null &&
    (!Number.isInteger(input.maxUses) || input.maxUses < 1)
  ) {
    throw new InvalidDiscountCodeError("maxUses debe ser un entero ≥ 1");
  }

  return {
    code,
    type: input.type as DiscountCodeType,
    eventId: input.eventId ?? null,
    seriesId: input.seriesId ?? null,
    percentOff: input.percentOff ?? null,
    amountOff: input.amountOff ?? null,
    maxUses: input.maxUses ?? null,
    expiresAt: input.expiresAt ?? null,
  };
}

type RedeemableCheck =
  | { ok: true }
  | { ok: false; reason: "EXPIRED" | "EXHAUSTED" | "SCOPE_MISMATCH" };

type RedeemableCode = Pick<
  DiscountCode,
  "usedCount" | "maxUses" | "expiresAt" | "eventId" | "seriesId"
>;

/**
 * Evaluación pura de si un código puede redimirse en un contexto dado.
 * - expirado si expiresAt <= now
 * - agotado si maxUses definido y usedCount >= maxUses
 * - scoped: si el código tiene eventId/seriesId, el contexto debe coincidir
 */
export function isRedeemable(
  code: RedeemableCode,
  ctx: { now: Date; eventId?: string; seriesId?: string },
): RedeemableCheck {
  if (code.expiresAt && code.expiresAt.getTime() <= ctx.now.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (code.maxUses !== null && code.usedCount >= code.maxUses) {
    return { ok: false, reason: "EXHAUSTED" };
  }
  if (code.eventId !== null && ctx.eventId !== code.eventId) {
    return { ok: false, reason: "SCOPE_MISMATCH" };
  }
  if (code.seriesId !== null && ctx.seriesId !== code.seriesId) {
    return { ok: false, reason: "SCOPE_MISMATCH" };
  }
  return { ok: true };
}

/**
 * Reglas de discount_code (spec omni-dance.md):
 * - Tipos predeterminados por caso de uso - nunca libre.
 * - Tracking completo: quién lo creó (createdById), usos (usedCount),
 *   máximo (maxUses), evento/serie asociado y redemptions auditables.
 */

/** Actor autenticado (SessionGuard) - el id basta: roles se leen en DB. */
interface ActorRef {
  id: string;
}

export class DiscountsService {
  constructor(private readonly repo: DiscountsRepo) {}

  async create(
    input: CreateDiscountCodeInput,
    createdById: string,
  ): Promise<DiscountCode> {
    const validated = validateCreateCode(input);
    // Spec event-access-scope: un código scoped a evento/serie solo lo
    // crea el dueño del recurso (producerId) o un admin; sin scope basta
    // discounts.manage (código global del actor).
    if (validated.eventId !== null || validated.seriesId !== null) {
      await this.assertScopeOwnership(validated, createdById);
    }
    const existing = await this.repo.findByCode(validated.code);
    if (existing) throw new DuplicateDiscountCodeError(validated.code);
    return this.repo.create({ ...validated, createdById });
  }

  /**
   * Spec event-access-scope: cada actor ve solo sus códigos; admin ve
   * todos. El filtro createdById lo inyecta el servicio, no el query.
   */
  async list(
    filter: DiscountCodeFilter,
    actor: ActorRef,
  ): Promise<PagedList<ListedDiscountCode>> {
    const admin = await this.repo.personHasPermission(
      actor.id,
      "admin.access",
    );
    return this.repo.list(
      admin ? filter : { ...filter, createdById: actor.id },
    );
  }

  /** Ficha del código - solo visible para su creador o admin. */
  async detail(codeId: string, actor: ActorRef): Promise<DiscountCode> {
    const code = await this.repo.findById(codeId);
    if (!code || !(await this.isOwnerOrAdmin(code.createdById, actor.id))) {
      throw new DiscountCodeNotFoundError(codeId);
    }
    return code;
  }

  async listRedemptions(
    codeId: string,
    actor: ActorRef,
  ): Promise<ListedRedemption[]> {
    const code = await this.repo.findById(codeId);
    if (!code || !(await this.isOwnerOrAdmin(code.createdById, actor.id))) {
      throw new DiscountCodeNotFoundError(codeId);
    }
    return this.repo.listRedemptions(codeId);
  }

  /** Ownership del scope del código: event.producerId /
   * EventSeries.producerId === actor, o admin (admin.access/superuser). */
  private async assertScopeOwnership(
    scope: { eventId: string | null; seriesId: string | null },
    actorId: string,
  ): Promise<void> {
    if (await this.repo.personHasPermission(actorId, "admin.access")) return;
    if (scope.eventId !== null) {
      const event = await this.repo.findEventById(scope.eventId);
      if (!event) {
        throw new DiscountScopeNotFoundError(
          `evento no encontrado: ${scope.eventId}`,
        );
      }
      if (event.producerId !== actorId) throw new DiscountForbiddenError();
    }
    if (scope.seriesId !== null) {
      const series = await this.repo.findSeriesById(scope.seriesId);
      if (!series) {
        throw new DiscountScopeNotFoundError(
          `serie no encontrada: ${scope.seriesId}`,
        );
      }
      if (series.producerId !== actorId) throw new DiscountForbiddenError();
    }
  }

  private async isOwnerOrAdmin(
    createdById: string,
    actorId: string,
  ): Promise<boolean> {
    if (createdById === actorId) return true;
    return this.repo.personHasPermission(actorId, "admin.access");
  }
}

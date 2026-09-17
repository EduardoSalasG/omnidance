import { describe, it, expect, beforeEach } from "vitest";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { REQUIRED_ROLES_KEY, ALLOW_SANDBOX_KEY } from "./roles.decorator";

// RolesGuard — RBAC global: APPROVED da acceso; SANDBOX solo donde se declara;
// PENDING nunca pasa. Corre DESPUÉS de SessionGuard (lee req.person).
describe("RolesGuard", () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const handler = () => {};
  const cls = class {};

  function ctx(person?: {
    roleStates: { role: string; status: string }[];
  }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ person }),
      }),
      getHandler: () => handler,
      getClass: () => cls,
    } as unknown as ExecutionContext;
  }

  function meta(roles?: string[], sandbox = false) {
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, roles, handler);
    Reflect.defineMetadata(ALLOW_SANDBOX_KEY, sandbox, handler);
  }

  beforeEach(() => {
    Reflect.deleteMetadata(REQUIRED_ROLES_KEY, handler);
    Reflect.deleteMetadata(ALLOW_SANDBOX_KEY, handler);
  });

  it("sin metadata → permite (la ruta no pide rol)", () => {
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it("rol APPROVED requerido y presente → permite", () => {
    meta(["ADMIN"]);
    const person = { roleStates: [{ role: "ADMIN", status: "APPROVED" }] };
    expect(guard.canActivate(ctx(person))).toBe(true);
  });

  it("rol en PENDING → 403 (solicitar el rol no da acceso)", () => {
    meta(["PRODUCER"]);
    const person = { roleStates: [{ role: "PRODUCER", status: "PENDING" }] };
    expect(() => guard.canActivate(ctx(person))).toThrow(ForbiddenException);
  });

  it("rol en SANDBOX → 403 salvo AllowSandbox", () => {
    meta(["ACADEMY_OWNER"]);
    const person = {
      roleStates: [{ role: "ACADEMY_OWNER", status: "SANDBOX" }],
    };
    expect(() => guard.canActivate(ctx(person))).toThrow(ForbiddenException);
    meta(["ACADEMY_OWNER"], true);
    expect(guard.canActivate(ctx(person))).toBe(true);
  });

  it("cualquiera de los roles requeridos basta (OR)", () => {
    meta(["STAFF", "ADMIN"]);
    const person = { roleStates: [{ role: "STAFF", status: "APPROVED" }] };
    expect(guard.canActivate(ctx(person))).toBe(true);
  });

  it("sin person (SessionGuard ausente) → 403 si la ruta exige rol", () => {
    meta(["ADMIN"]);
    expect(() => guard.canActivate(ctx())).toThrow(ForbiddenException);
  });
});

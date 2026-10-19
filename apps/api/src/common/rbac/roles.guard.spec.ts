import { describe, it, expect, beforeEach } from "vitest";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import {
  REQUIRED_ROLES_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from "./roles.decorator";
import type { PrismaService } from "../../prisma.service";

// RolesGuard - RBAC global DB-driven: APPROVED da acceso; PENDING solo
// para roles registrables por landing (ACADEMY_OWNER/PRODUCER - operan
// su consola invisibles al público); otro PENDING/REJECTED nunca pasa.
// Permisos se resuelven en Role/RolePermission (isSuperuser pasa todo).
// Corre DESPUÉS de SessionGuard (lee req.person).
describe("RolesGuard", () => {
  const reflector = new Reflector();

  // Catálogo fake - keys únicos por caso para no chocar con el cache estático.
  const catalog = [
    { key: "R_STAFF", isSuperuser: false, permissions: ["checkins.write"] },
    { key: "R_PROD", isSuperuser: false, permissions: ["discounts.manage"] },
    { key: "R_ADMIN", isSuperuser: true, permissions: [] },
    { key: "R_NONE", isSuperuser: false, permissions: [] },
    // Roles reales registrables por landing (PENDING usable).
    { key: "PRODUCER", isSuperuser: false, permissions: ["discounts.manage"] },
    { key: "ACADEMY_OWNER", isSuperuser: false, permissions: ["academies.create"] },
  ];
  const prisma = {
    role: {
      findMany: async (args: { where: { key: { in: string[] } } }) =>
        catalog
          .filter((r) => args.where.key.in.includes(r.key))
          .map((r) => ({
            key: r.key,
            isSuperuser: r.isSuperuser,
            permissions: r.permissions.map((permissionKey) => ({ permissionKey })),
          })),
    },
  } as unknown as PrismaService;

  const guard = new RolesGuard(reflector, prisma);
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

  function meta(roles?: string[], perms?: string[]) {
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, roles, handler);
    Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, perms, handler);
  }

  beforeEach(() => {
    Reflect.deleteMetadata(REQUIRED_ROLES_KEY, handler);
    Reflect.deleteMetadata(REQUIRED_PERMISSIONS_KEY, handler);
  });

  it("sin metadata → permite (la ruta no pide rol)", async () => {
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
  });

  it("rol APPROVED requerido y presente → permite", async () => {
    meta(["ADMIN"]);
    const person = { roleStates: [{ role: "ADMIN", status: "APPROVED" }] };
    await expect(guard.canActivate(ctx(person))).resolves.toBe(true);
  });

  it("rol PENDING de landing (PRODUCER) → permite su consola", async () => {
    meta(["PRODUCER"]);
    const person = { roleStates: [{ role: "PRODUCER", status: "PENDING" }] };
    await expect(guard.canActivate(ctx(person))).resolves.toBe(true);
  });

  it("rol PENDING no registrable (STAFF) → 403", async () => {
    meta(["STAFF"]);
    const person = { roleStates: [{ role: "STAFF", status: "PENDING" }] };
    await expect(guard.canActivate(ctx(person))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rol REJECTED → 403", async () => {
    meta(["ACADEMY_OWNER"]);
    const person = {
      roleStates: [{ role: "ACADEMY_OWNER", status: "REJECTED" }],
    };
    await expect(guard.canActivate(ctx(person))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("cualquiera de los roles requeridos basta (OR)", async () => {
    meta(["STAFF", "ADMIN"]);
    const person = { roleStates: [{ role: "STAFF", status: "APPROVED" }] };
    await expect(guard.canActivate(ctx(person))).resolves.toBe(true);
  });

  it("sin person (SessionGuard ausente) → 403 si la ruta exige rol", async () => {
    meta(["ADMIN"]);
    await expect(guard.canActivate(ctx())).rejects.toThrow(ForbiddenException);
  });

  // ── Permisos DB-driven ──

  it("permiso otorgado a rol APPROVED → permite", async () => {
    meta(undefined, ["checkins.write"]);
    const person = { roleStates: [{ role: "R_STAFF", status: "APPROVED" }] };
    await expect(guard.canActivate(ctx(person))).resolves.toBe(true);
  });

  it("permiso no otorgado al rol → 403", async () => {
    meta(undefined, ["discounts.manage"]);
    const person = { roleStates: [{ role: "R_STAFF", status: "APPROVED" }] };
    await expect(guard.canActivate(ctx(person))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("isSuperuser pasa cualquier permiso", async () => {
    meta(undefined, ["admin.access"]);
    const person = { roleStates: [{ role: "R_ADMIN", status: "APPROVED" }] };
    await expect(guard.canActivate(ctx(person))).resolves.toBe(true);
  });

  it("permiso sobre rol PENDING usable pasa; sobre otro PENDING no", async () => {
    meta(undefined, ["discounts.manage"]);
    const prod = { roleStates: [{ role: "PRODUCER", status: "PENDING" }] };
    await expect(guard.canActivate(ctx(prod))).resolves.toBe(true);

    meta(undefined, ["checkins.write"]);
    const staff = { roleStates: [{ role: "R_STAFF", status: "PENDING" }] };
    await expect(guard.canActivate(ctx(staff))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rol sin permisos ni grant → 403", async () => {
    meta(undefined, ["checkins.write"]);
    const person = { roleStates: [{ role: "R_NONE", status: "APPROVED" }] };
    await expect(guard.canActivate(ctx(person))).rejects.toThrow(
      ForbiddenException,
    );
  });
});

import { SetMetadata } from "@nestjs/common";

// Metadata de RBAC global. RequireRoles marca los roles que pueden ejecutar
// la ruta; AllowSandbox habilita también PersonRole en status SANDBOX
// (flujo "sandbox → aprobación": p.ej. crear academia demo antes del APPROVED).
export const REQUIRED_ROLES_KEY = "omnidance:required_roles";
export const ALLOW_SANDBOX_KEY = "omnidance:allow_sandbox";

export const RequireRoles = (...roles: string[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);

export const AllowSandbox = () => SetMetadata(ALLOW_SANDBOX_KEY, true);

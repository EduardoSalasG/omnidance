import { SetMetadata } from "@nestjs/common";

// Metadata de RBAC global. RequirePermissions marca los permisos (keys en la
// tabla Permission, otorgados a roles vía RolePermission) que autorizan la
// ruta — OR lógico. RequireRoles queda como escape hatch por rol directo.
// AllowSandbox habilita también PersonRole en status SANDBOX (flujo
// "sandbox → aprobación": p.ej. crear academia demo antes del APPROVED).
export const REQUIRED_ROLES_KEY = "omnidance:required_roles";
export const REQUIRED_PERMISSIONS_KEY = "omnidance:required_permissions";
export const ALLOW_SANDBOX_KEY = "omnidance:allow_sandbox";

export const RequireRoles = (...roles: string[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const AllowSandbox = () => SetMetadata(ALLOW_SANDBOX_KEY, true);

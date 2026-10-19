import { SetMetadata } from "@nestjs/common";

// Metadata de RBAC global. RequirePermissions marca los permisos (keys en la
// tabla Permission, otorgados a roles vía RolePermission) que autorizan la
// ruta - OR lógico. RequireRoles queda como escape hatch por rol directo.
export const REQUIRED_ROLES_KEY = "omnidance:required_roles";
export const REQUIRED_PERMISSIONS_KEY = "omnidance:required_permissions";

export const RequireRoles = (...roles: string[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

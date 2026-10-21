// Tipos compartidos de las vistas del panel /admin - payloads del API admin.
export type Param = {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
};

export type AuditRow = {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  payload: unknown;
  createdAt: string;
};

export type RoleRow = {
  key: string;
  label: string;
  description: string | null;
  requestable: boolean;
  isSuperuser: boolean;
  permissions: { permissionKey: string }[];
  _count: { personRoles: number };
};

export type PermissionRow = { key: string; description: string | null };

// GET /admin/feature-flags (spec feature-flags-admin) - catálogo de
// flags con el último editor resuelto por el API.
export type FeatureFlagRow = {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  updatedAt: string;
  updatedBy: { id: string; name: string; email: string | null } | null;
};

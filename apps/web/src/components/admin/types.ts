// Tipos compartidos de las vistas del panel /admin — payloads del API admin.
export type RoleRequest = {
  id: string;
  personId: string;
  role: string;
  status: string;
  createdAt: string;
  person: { id: string; name: string; email: string | null };
};

export type Param = {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
};

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  roles: { id: string; role: string; status: string; createdAt: string }[];
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

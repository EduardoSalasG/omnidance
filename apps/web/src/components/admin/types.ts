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

// GET /admin/city-guides (spec city-guides) - estado editorial de cada
// ciudad: empty (0 secciones), draft (1-2), complete (las 3).
export type CityGuideStatus = "empty" | "draft" | "complete";

export type CityGuideListItem = {
  id: string;
  slug: string;
  name: string;
  country: { code: string; name: string };
  status: CityGuideStatus;
  updatedAt: string | null;
};

// GET /admin/city-guides/:cityId - contenido editable (las 3 secciones
// viajan siempre, "" cuando no hay texto) + último editor resuelto.
export type CityGuideDetail = {
  city: {
    id: string;
    slug: string;
    name: string;
    country: { code: string; name: string };
  };
  guide: {
    intro: string;
    nightlife: string;
    practical: string;
    updatedAt: string | null;
    updatedBy: { id: string; name: string; email: string | null } | null;
  };
};

// Tipos del hub social de /bailes — shapes según los contratos API
// (POST/GET /availability, /partner-requests, /me).

export type PersonLite = {
  id: string;
  name: string;
  photoUrl: string | null;
};

/** GET /me — necesario para ownership (mostrar "Cerrar" solo en solicitudes propias). */
export type Me = {
  id: string;
  name: string;
  roles: string[];
};

/** GET /availability — entrada del feed público "Disponibles ahora". */
export type AvailabilityEntry = {
  person: PersonLite;
  location: string | null;
  until: string | null;
  updatedAt: string;
};

/** GET /partner-requests — solicitud OPEN del feed. */
export type PartnerRequest = {
  id: string;
  person: PersonLite;
  styleId: string | null;
  style: { name: string } | null;
  role: string | null;
  level: string | null;
  location: string | null;
  note: string | null;
  createdAt: string;
};

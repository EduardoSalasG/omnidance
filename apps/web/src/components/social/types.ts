// Tipos compartidos de la superficie social (shapes según contratos API).

/** GET /me - necesario para ownership (mostrar acciones solo en recursos propios). */
export type Me = {
  id: string;
  name: string;
  roles: string[];
};

import { redirect } from "next/navigation";

// La consola de consultas se consolidó en /analitica (única superficie
// de analítica por lente activa). Link viejo → redirect.
export default function ConsultasRedirect() {
  redirect("/analitica");
}

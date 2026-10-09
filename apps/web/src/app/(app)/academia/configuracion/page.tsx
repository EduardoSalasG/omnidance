import { redirect } from "next/navigation";

// /academia/configuracion se dividió en sub-páginas (una por sección,
// listadas en la sección Configuración del sidebar). Entrada raíz →
// la primera: General.
export default function AcademiaConfiguracionRedirect() {
  redirect("/academia/configuracion/general");
}
